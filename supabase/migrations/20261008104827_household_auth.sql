-- Identity only. No account, transaction or other financial tables.
create schema if not exists finance;
create schema if not exists private;
create schema if not exists api;
revoke all on schema finance, private, api from public, anon, authenticated;
revoke create on schema public from public, anon, authenticated;
alter default privileges in schema finance, private, api revoke execute on functions from public;
alter default privileges in schema finance, private, api revoke all on tables from anon, authenticated;

create table finance.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(btrim(display_name)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table finance.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);
create table finance.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references finance.households(id) on delete restrict,
  user_id uuid references finance.profiles(id) on delete set null,
  -- Durable attribution snapshot; deliberately independent of profile rename/deletion.
  display_name text not null check (length(btrim(display_name)) between 1 and 100),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REVOKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_active_requires_identity check (status <> 'ACTIVE' or user_id is not null),
  unique (household_id, user_id),
  unique (household_id, id)
);
-- Includes revoked members so FK deletion does not scan retained history.
create index household_members_user_idx on finance.household_members(user_id, household_id);
create function private.guard_member_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id or new.household_id is distinct from old.household_id
       or (new.user_id is distinct from old.user_id and new.user_id is not null) then
      raise exception using errcode = '23514', message = 'Member identity cannot be reassigned.';
    end if;
  end if;
  -- Runs for explicit unlinking and the FK's SET NULL, in the same transaction.
  if new.user_id is null then new.status := 'REVOKED'; end if;
  return new;
end;
$$;
revoke all on function private.guard_member_identity() from public, anon, authenticated;
create trigger member_identity_guard before insert or update on finance.household_members
  for each row execute function private.guard_member_identity();
create table private.identity_audit (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  relation_name text not null,
  operation text not null,
  record_id uuid not null
);
alter table finance.profiles enable row level security;
alter table finance.households enable row level security;
alter table finance.household_members enable row level security;
alter table private.identity_audit enable row level security;

-- Narrow definer helpers are unexposed. No caller-supplied user/session identity.
create function private.has_live_session() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from auth.sessions s join auth.users u on u.id = s.user_id
    where s.user_id = auth.uid()
      and s.id::text = (auth.jwt() ->> 'session_id')
      and (s.not_after is null or s.not_after > now())
      and (u.banned_until is null or u.banned_until <= now())
      and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
  );
$$;
create function private.is_household_member(target_household uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_live_session() and exists (
    select 1 from finance.household_members m
    where m.household_id = target_household and m.user_id = auth.uid() and m.status = 'ACTIVE'
  );
$$;
revoke all on function private.has_live_session(), private.is_household_member(uuid) from public, anon, authenticated;
grant usage on schema api, finance, private to authenticated;
grant execute on function private.has_live_session(), private.is_household_member(uuid) to authenticated;

create policy profile_read on finance.profiles for select to authenticated
  using (id = (select auth.uid()) and (select private.has_live_session()));
create policy profile_update on finance.profiles for update to authenticated
  using (id = (select auth.uid()) and (select private.has_live_session()))
  with check (id = (select auth.uid()) and (select private.has_live_session()));
create policy household_read on finance.households for select to authenticated
  using (private.is_household_member(id));
create policy member_read on finance.household_members for select to authenticated
  using (private.is_household_member(household_id));
grant select on finance.profiles, finance.households, finance.household_members to authenticated;
grant update (display_name) on finance.profiles to authenticated;

create function private.touch_identity() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger profile_touch before update on finance.profiles for each row execute function private.touch_identity();
create trigger member_touch before update on finance.household_members for each row execute function private.touch_identity();
create function private.audit_identity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.identity_audit(actor_id, relation_name, operation, record_id)
  values (auth.uid(), tg_table_name, tg_op, case when tg_op = 'DELETE' then old.id else new.id end);
  return null;
end;
$$;
revoke all on function private.touch_identity(), private.audit_identity() from public, anon, authenticated;
create trigger profile_audit after insert or update or delete on finance.profiles for each row execute function private.audit_identity();
create trigger household_audit after insert or update or delete on finance.households for each row execute function private.audit_identity();
create trigger member_audit after insert or update or delete on finance.household_members for each row execute function private.audit_identity();

create view api.my_profile with (security_invoker = true) as
  select id, display_name, created_at, updated_at from finance.profiles;
create view api.households with (security_invoker = true) as
  select id, name, created_at from finance.households;
create view api.household_members with (security_invoker = true) as
  select id, household_id, user_id, display_name, status, created_at, updated_at from finance.household_members;
grant select on api.my_profile, api.households, api.household_members to authenticated;

-- User command is invoker-rights, RLS protected and returns the canonical SafeError shape.
create function api.rename_profile(display_name text) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  if not private.has_live_session() then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code','NOT_AUTHORIZED','kind','AUTHORIZATION','safeMessage','This action is not permitted.','retryable',false));
  end if;
  if display_name is null or length(btrim(display_name)) not between 1 and 100 then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code','INVALID_INPUT','kind','VALIDATION','safeMessage','Some values are invalid.','retryable',false));
  end if;
  update finance.profiles p set display_name = btrim(rename_profile.display_name) where p.id = auth.uid();
  if not found then
    return jsonb_build_object('ok', false, 'error', jsonb_build_object('code','NOT_AUTHORIZED','kind','AUTHORIZATION','safeMessage','This action is not permitted.','retryable',false));
  end if;
  return jsonb_build_object('ok', true);
exception when others then
  return jsonb_build_object('ok', false, 'error', jsonb_build_object('code','INTERNAL_ERROR','kind','INTERNAL','safeMessage','The request could not be completed.','retryable',false));
end;
$$;
revoke all on function api.rename_profile(text) from public, anon, authenticated;
grant execute on function api.rename_profile(text) to authenticated;
