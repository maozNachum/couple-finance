-- Forward-only correction: preserve account, source, observation and FX identities.
create table finance.account_sources (
 id uuid primary key check (private.account_uuid(to_jsonb(id))),
 household_id uuid not null,
 account_id uuid not null,
 kind text not null check (kind in ('MANUAL','FILE_IMPORT','LIVE_SYNC')),
 authoritative_from date check (authoritative_from between date '0001-01-01' and date '9999-12-31'),
 created_at timestamptz not null default now(),
 unique (household_id,account_id,id),
 foreign key (household_id,account_id) references finance.accounts(household_id,id) on delete restrict,
 check (id <> account_id)
);
create unique index account_manual_source_idx on finance.account_sources(household_id,account_id) where kind='MANUAL';
create unique index account_source_authority_idx on finance.account_sources(household_id,account_id,authoritative_from) where authoritative_from is not null;
insert into finance.account_sources(id,household_id,account_id,kind,authoritative_from,created_at)
 select manual_source_id,household_id,id,'MANUAL',date '0001-01-01',created_at from finance.accounts;
alter table finance.account_sources enable row level security;
create policy sources_read on finance.account_sources for select to authenticated using (private.is_household_member(household_id));
-- Current clients can only establish the initial manual source, never appoint an import/live authority.
create policy sources_insert on finance.account_sources for insert to authenticated
 with check (private.is_household_member(household_id) and kind='MANUAL' and authoritative_from=date '0001-01-01');
grant select on finance.account_sources to authenticated;
grant insert(id,household_id,account_id,kind,authoritative_from) on finance.account_sources to authenticated;
create function private.guard_account_source() returns trigger language plpgsql set search_path='' as $$
begin
 if (new.id,new.household_id,new.account_id,new.kind,new.created_at) is distinct from
    (old.id,old.household_id,old.account_id,old.kind,old.created_at)
    or old.authoritative_from is not null then
  raise exception using errcode='23514',message='Source identity and activation are immutable.';
 end if;
 return new;
end;
$$;
revoke all on function private.guard_account_source() from public,anon,authenticated;
create trigger source_guard before update on finance.account_sources for each row execute function private.guard_account_source();
create trigger source_audit after insert or update on finance.account_sources for each row execute function private.audit_account();

alter table finance.balance_observations drop constraint balance_observations_household_id_account_id_source_id_cur_fkey;
alter table finance.balance_observations drop constraint balance_observations_household_id_account_id_observation_d_fkey;
alter table finance.accounts add unique(household_id,id,currency);
alter table finance.balance_observations add unique(household_id,account_id,source_id,observation_date,id);
alter table finance.balance_observations add foreign key(household_id,account_id,source_id)
 references finance.account_sources(household_id,account_id,id) on delete restrict;
alter table finance.balance_observations add foreign key(household_id,account_id,currency)
 references finance.accounts(household_id,id,currency) on delete restrict;
alter table finance.balance_observations add foreign key(household_id,account_id,source_id,observation_date,supersedes_id)
 references finance.balance_observations(household_id,account_id,source_id,observation_date,id) on delete restrict;
drop index finance.observation_root_idx;
create unique index observation_root_idx on finance.balance_observations(household_id,account_id,source_id,observation_date) where supersedes_id is null;
-- A rate reference is reusable; its evidence is immutable within its household.
drop index finance.observation_fx_identity_idx;
create table finance.fx_evidence (
 household_id uuid not null references finance.households(id) on delete restrict,
 id uuid not null,
 snapshot jsonb not null,
 primary key(household_id,id),
 check (private.account_uuid(snapshot->'id') and snapshot->>'id'=id::text)
);
insert into finance.fx_evidence(household_id,id,snapshot)
 select household_id,(fx->>'id')::uuid,fx from finance.balance_observations where fx is not null;
alter table finance.fx_evidence enable row level security;
create policy fx_evidence_read on finance.fx_evidence for select to authenticated using(private.is_household_member(household_id));
create policy fx_evidence_insert on finance.fx_evidence for insert to authenticated with check(private.is_household_member(household_id));
grant select,insert on finance.fx_evidence to authenticated;
alter table finance.balance_observations add column fx_rate_id uuid generated always as ((fx->>'id')::uuid) stored;
alter table finance.balance_observations add foreign key(household_id,fx_rate_id) references finance.fx_evidence(household_id,id) on delete restrict;
create index observation_fx_reference_idx on finance.balance_observations(household_id,fx_rate_id) where fx_rate_id is not null;

create function private.guard_fx_evidence() returns trigger language plpgsql set search_path='' as $$
declare f jsonb;
begin
 if tg_op <> 'INSERT' then raise exception using errcode='23514',message='FX evidence is immutable.'; end if;
 f:=new.snapshot;
 if (jsonb_typeof(f)='object' and f ?& array['id','base','quote','rate','effectiveDate','recordedAt','origin']
  and (f-array['id','base','quote','rate','effectiveDate','recordedAt','origin'])='{}'::jsonb
  and private.account_uuid(f->'id') and f->>'id'=new.id::text
  and f->>'base' in ('ILS','USD','EUR','JPY','KWD') and f->>'quote' in ('ILS','USD','EUR','JPY','KWD') and f->>'base'<>f->>'quote'
  and jsonb_typeof(f->'rate')='string' and f->>'rate' ~ '^(0|[1-9][0-9]{0,17})(\.[0-9]{1,12})?$'
  and (f->>'rate')::numeric > 0
  and f->>'effectiveDate' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  and (f->>'effectiveDate')::date between date '0001-01-01' and date '9999-12-31'
  and jsonb_typeof(f->'origin')='object' and (f->'origin') ?& array['kind','sourceId']
  and ((f->'origin')-array['kind','sourceId'])='{}'::jsonb
  and f->'origin'->>'kind' in ('MANUAL','FILE_IMPORT','LIVE_SYNC') and private.account_uuid(f->'origin'->'sourceId')
  and f->>'recordedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?Z$'
  and (f->>'recordedAt')::timestamptz >= timestamptz '0001-01-01 00:00:00Z' and (f->>'recordedAt')::timestamptz <= now()) is not true then
  raise exception using errcode='23514',message='Invalid FX evidence.';
 end if;
 return new;
end;
$$;
revoke all on function private.guard_fx_evidence() from public,anon,authenticated;
create trigger fx_evidence_guard before insert or update on finance.fx_evidence for each row execute function private.guard_fx_evidence();

create or replace function private.guard_observation() returns trigger language plpgsql set search_path='' as $$
declare a finance.accounts; evidence jsonb;
begin
 if tg_op <> 'INSERT' then raise exception using errcode='23514',message='Observations are immutable.'; end if;
 select * into a from finance.accounts where household_id=new.household_id and id=new.account_id for update;
 if not found or a.balance_policy<>'OBSERVED' or a.status<>'ACTIVE' then
  raise exception using errcode='23514',message='Account cannot receive observations.';
 end if;
 if new.fx is not null then
  if (new.fx->>'base'=a.currency and new.fx->>'quote'=a.valuation_currency
   and a.currency<>a.valuation_currency and new.fx->>'effectiveDate'=to_char(new.observation_date,'YYYY-MM-DD')) is not true then
   raise exception using errcode='23514',message='Invalid FX snapshot.';
  end if;
  insert into finance.fx_evidence(household_id,id,snapshot) values(new.household_id,(new.fx->>'id')::uuid,new.fx) on conflict do nothing;
  select snapshot into evidence from finance.fx_evidence where household_id=new.household_id and id=(new.fx->>'id')::uuid;
  if evidence is distinct from new.fx then raise exception using errcode='23514',message='FX reference conflicts with immutable evidence.'; end if;
 end if;
 return new;
end;
$$;

create or replace view api.accounts with (security_invoker=true) as select a.household_id,a.id,
 jsonb_build_object('account',jsonb_build_object('id',a.id,'householdId',a.household_id,'name',a.name,
 'ownership',case when a.owner_member_id is null then jsonb_build_object('kind','HOUSEHOLD') else jsonb_build_object('kind','MEMBER','memberId',a.owner_member_id) end,
 'type',a.type,'currency',a.currency,'valuationCurrency',a.valuation_currency,'balancePolicy',a.balance_policy,'status',a.status),
 'version',a.version,'manualSourceId',(select s.id from finance.account_sources s where s.household_id=a.household_id and s.account_id=a.id and s.kind='MANUAL'),
 'sources',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'householdId',s.household_id,'accountId',s.account_id,'kind',s.kind,
 'authoritativeFrom',to_char(s.authoritative_from,'YYYY-MM-DD')) order by s.id) from finance.account_sources s where s.household_id=a.household_id and s.account_id=a.id),'[]'::jsonb)) as payload
 from finance.accounts a;
alter table finance.accounts drop column manual_source_id;
-- Restore UUID validation previously combined with the removed source column.
alter table finance.accounts add check(private.account_uuid(to_jsonb(id)));

create or replace function private.guard_account() returns trigger language plpgsql set search_path = '' as $$
begin
 if tg_op = 'UPDATE' then
  if (new.id,new.household_id,new.owner_member_id,new.type,new.currency,new.valuation_currency,new.balance_policy,new.created_at)
    is distinct from (old.id,old.household_id,old.owner_member_id,old.type,old.currency,old.valuation_currency,old.balance_policy,old.created_at)
    or new.version <> old.version + 1 or (old.status = 'ARCHIVED' and new.status <> 'ARCHIVED') then
   raise exception using errcode='23514', message='Invalid account change.';
  end if;
  new.updated_at := now();
 elsif new.owner_member_id is not null and not exists (
  select 1 from finance.household_members where household_id=new.household_id and id=new.owner_member_id and status='ACTIVE'
 ) then
  raise exception using errcode='23514', message='Invalid account owner.';
 end if;
 return new;
end;
$$;
create or replace function api.create_account(payload jsonb) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare a jsonb; existing jsonb;
begin
 if not private.has_live_session() then return private.account_error('NOT_AUTHORIZED'); end if;
 a := payload->'account';
 if jsonb_typeof(payload) is distinct from 'object' or not(payload ?& array['account','version','manualSourceId']) or (payload-array['account','version','manualSourceId']) <> '{}'::jsonb
  or payload->'version' <> '1'::jsonb or jsonb_typeof(a) is distinct from 'object'
  or not(a ?& array['id','householdId','name','ownership','type','currency','valuationCurrency','balancePolicy','status'])
  or (a-array['id','householdId','name','ownership','type','currency','valuationCurrency','balancePolicy','status']) <> '{}'::jsonb
  or a->>'status' <> 'ACTIVE' or jsonb_typeof(a->'name') <> 'string'
  or not private.account_uuid(a->'id') or not private.account_uuid(a->'householdId') or not private.account_uuid(payload->'manualSourceId')
  or (a->'ownership' = '{"kind":"HOUSEHOLD"}'::jsonb or (a->'ownership'->>'kind'='MEMBER' and a->'ownership' ? 'memberId' and ((a->'ownership')-array['kind','memberId'])='{}'::jsonb and jsonb_typeof(a->'ownership'->'memberId')='string')) is not true
  or exists(select 1 from jsonb_each(a) where value='null'::jsonb) then return private.account_error('INVALID_INPUT'); end if;
 if a->'ownership'->>'kind'='MEMBER' and not private.account_uuid(a->'ownership'->'memberId') then return private.account_error('INVALID_INPUT'); end if;
 if not private.is_household_member((a->>'householdId')::uuid) then return private.account_error('NOT_AUTHORIZED'); end if;
 select v.payload into existing from api.accounts v where v.id=(a->>'id')::uuid;
 if found then
  if (existing-'sources')=payload then return jsonb_build_object('ok',true); end if;
  return private.account_error('CONFLICT');
 end if;
 insert into finance.accounts(id,household_id,name,owner_member_id,type,currency,valuation_currency,balance_policy)
 values ((a->>'id')::uuid,(a->>'householdId')::uuid,btrim(a->>'name'),(a->'ownership'->>'memberId')::uuid,a->>'type',a->>'currency',a->>'valuationCurrency',a->>'balancePolicy');
 insert into finance.account_sources(id,household_id,account_id,kind,authoritative_from) values((payload->>'manualSourceId')::uuid,(a->>'householdId')::uuid,(a->>'id')::uuid,'MANUAL',date '0001-01-01');
 return jsonb_build_object('ok',true);
exception when unique_violation then return private.account_error('CONFLICT');
 when check_violation or foreign_key_violation or not_null_violation or invalid_text_representation then return private.account_error('INVALID_INPUT');
 when insufficient_privilege then return private.account_error('NOT_AUTHORIZED');
 when others then return private.account_error('INTERNAL_ERROR');
end;
$$;
