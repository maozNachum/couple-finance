-- Forward-only. Retain every prior rate/source/observation unchanged.
revoke insert on finance.fx_evidence from authenticated;
drop policy fx_evidence_insert on finance.fx_evidence;

create table private.fx_receipts (
 household_id uuid not null references finance.households(id) on delete restrict,
 idempotency_key text not null, digest bytea not null, result jsonb not null,
 primary key(household_id,idempotency_key)
);
create table private.fx_audit (
 id bigint generated always as identity primary key,
 household_id uuid not null, rate_id uuid not null, actor_member_id uuid not null,
 operation text not null check(operation in ('MANUAL_CREATE','OBSERVATION_CREATE')),
 recorded_at timestamptz not null default clock_timestamp(),
 foreign key(household_id,rate_id) references finance.fx_evidence(household_id,id) on delete restrict,
 foreign key(household_id,actor_member_id) references finance.household_members(household_id,id) on delete restrict
);
alter table private.fx_receipts enable row level security;
alter table private.fx_audit enable row level security;
revoke all on private.fx_receipts,private.fx_audit from public,anon,authenticated;
create trigger fx_receipt_immutable before update on private.fx_receipts for each row execute function private.immutable_transaction();
create trigger fx_audit_immutable before update on private.fx_audit for each row execute function private.immutable_transaction();

-- Internal only, invoked by the checked command or trigger under their definer.
-- Serializes standalone AND inline intake before account locks, and revocation
-- before insertion/replay. No browser-controlled actor or authorization metadata.
create function private.lock_fx_actor(h uuid) returns uuid language plpgsql set search_path='' as $$
declare actor uuid;
begin
 if not private.is_household_member(h) then raise insufficient_privilege; end if;
 perform 1 from finance.households where id=h for update;
 perform 1 from auth.users where id=auth.uid() for share;
 if not found then raise insufficient_privilege; end if;
 perform 1 from auth.sessions where id::text=auth.jwt()->>'session_id' and user_id=auth.uid() for share;
 if not found then raise insufficient_privilege; end if;
 select id into actor from finance.household_members where household_id=h and user_id=auth.uid() and status='ACTIVE' for share;
 if actor is null or not private.is_household_member(h) or not exists(
  select 1 from auth.sessions s join auth.users u on u.id=s.user_id
  where s.id::text=auth.jwt()->>'session_id' and s.user_id=auth.uid()
   and (s.not_after is null or s.not_after>clock_timestamp())
   and (u.banned_until is null or u.banned_until<=clock_timestamp())
 ) then raise insufficient_privilege; end if;
 return actor;
end;
$$;

-- Called only after lock_fx_actor. Existing identical snapshots (including legacy
-- origins) are reusable; NEW client-origin records must have a real MANUAL source.
create function private.insert_manual_fx(h uuid,f jsonb,actor uuid,operation text) returns void language plpgsql set search_path='' as $$
declare existing jsonb;
begin
 if not private.is_household_member(h) or not exists(select 1 from finance.household_members where household_id=h and id=actor and user_id=auth.uid() and status='ACTIVE') then raise insufficient_privilege; end if;
 if not private.account_uuid(f->'id') then raise check_violation; end if;
 select snapshot into existing from finance.fx_evidence where household_id=h and id=(f->>'id')::uuid;
 if found then
  if existing is distinct from f then raise check_violation; end if;
  return;
 end if;
 if (f->'origin'->>'kind'='MANUAL' and private.account_uuid(f->'origin'->'sourceId')) is not true then raise check_violation; end if;
 if not exists(select 1 from finance.account_sources s where s.household_id=h and s.id=(f->'origin'->>'sourceId')::uuid and s.kind=f->'origin'->>'kind') then raise check_violation; end if;
 -- guard_fx_evidence independently validates ALL canonical fields/precision/date.
 insert into finance.fx_evidence(household_id,id,snapshot) values(h,(f->>'id')::uuid,f);
 insert into private.fx_audit(household_id,rate_id,actor_member_id,operation) values(h,(f->>'id')::uuid,actor,operation);
end;
$$;
revoke all on function private.lock_fx_actor(uuid),private.insert_manual_fx(uuid,jsonb,uuid,text) from public,anon,authenticated;

-- A trigger is not an RPC. Explicit authorization precedes every privileged read.
create or replace function private.guard_observation() returns trigger language plpgsql security definer set search_path='' set lock_timeout='10s' as $$
declare a finance.accounts; actor uuid;
begin
 if tg_op<>'INSERT' then raise check_violation using message='Observations are immutable.'; end if;
 actor:=private.lock_fx_actor(new.household_id);
 select * into a from finance.accounts where household_id=new.household_id and id=new.account_id for update;
 if not found or a.balance_policy<>'OBSERVED' or a.status<>'ACTIVE' then raise check_violation using message='Account cannot receive observations.'; end if;
 if not exists(select 1 from finance.account_sources where household_id=new.household_id and account_id=new.account_id and id=new.source_id) then raise check_violation; end if;
 if new.fx is not null then
  if (new.fx->>'base'=a.currency and new.fx->>'quote'=a.valuation_currency and a.currency<>a.valuation_currency and new.fx->>'effectiveDate'=to_char(new.observation_date,'YYYY-MM-DD')) is not true then raise check_violation using message='Invalid FX snapshot.'; end if;
  perform private.insert_manual_fx(new.household_id,new.fx,actor,'OBSERVATION_CREATE');
 end if;
 return new;
end;
$$;
revoke all on function private.guard_observation() from public,anon,authenticated;

create function private.record_manual_fx(payload jsonb) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='10s' as $$
declare h uuid; actor uuid; a finance.accounts; source uuid; dig bytea; receipt private.fx_receipts; f jsonb; result jsonb;
begin
 if not private.has_live_session() then return private.account_error('NOT_AUTHORIZED'); end if;
 if octet_length(payload::text)>4096 or not private.ledger_object(payload,array['householdId','sourceAccountId','id','idempotencyKey','base','quote','rate','effectiveDate','acknowledge'])
 or not private.account_uuid(payload->'householdId') or not private.account_uuid(payload->'sourceAccountId') or not private.account_uuid(payload->'id')
 or payload->'acknowledge' is distinct from 'true'::jsonb
 or jsonb_typeof(payload->'idempotencyKey') is distinct from 'string' or (payload->>'idempotencyKey') !~ '^[A-Za-z0-9_-]{16,128}$' or (payload->>'idempotencyKey') ~ '[^A-Za-z0-9_-]'
 or jsonb_typeof(payload->'rate') is distinct from 'string' or (payload->>'rate') !~ '^(0|[1-9][0-9]{0,17})(\.[0-9]{1,12})?$'
 or (payload->>'rate')::numeric<=0 or not private.ledger_date(payload->'effectiveDate')
 or (payload->>'base' in ('ILS','USD','EUR','JPY','KWD') and payload->>'quote' in ('ILS','USD','EUR','JPY','KWD') and payload->>'base'<>payload->>'quote') is not true then return private.account_error('INVALID_INPUT'); end if;
 h:=(payload->>'householdId')::uuid;
 actor:=private.lock_fx_actor(h);
 dig:=sha256(convert_to(payload::text,'UTF8'));
 select * into receipt from private.fx_receipts where household_id=h and idempotency_key=payload->>'idempotencyKey';
 if found then
  if receipt.digest<>dig then return private.account_error('CONFLICT'); end if;
  return receipt.result;
 end if;
 select * into a from finance.accounts where household_id=h and id=(payload->>'sourceAccountId')::uuid for update;
 if not found or a.status<>'ACTIVE' or a.currency<>payload->>'base' or a.valuation_currency<>payload->>'quote' then return private.account_error('INVALID_INPUT'); end if;
 select id into source from finance.account_sources where household_id=h and account_id=a.id and kind='MANUAL';
 if source is null then return private.account_error('INVALID_INPUT'); end if;
 -- Household lock also protects all inline observation FX insertion. A unique
 -- pair index would wrongly invalidate retained competing historical evidence.
 if exists(select 1 from finance.fx_evidence where household_id=h and (id=(payload->>'id')::uuid or snapshot->>'base'=payload->>'base' and snapshot->>'quote'=payload->>'quote' and snapshot->>'effectiveDate'=payload->>'effectiveDate')) then return private.account_error('CONFLICT'); end if;
 f:=jsonb_build_object('id',payload->>'id','base',payload->>'base','quote',payload->>'quote','rate',payload->>'rate','effectiveDate',payload->>'effectiveDate',
  'recordedAt',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'origin',jsonb_build_object('kind','MANUAL','sourceId',source));
 perform private.insert_manual_fx(h,f,actor,'MANUAL_CREATE');
 result:=jsonb_build_object('ok',true,'evidence',jsonb_build_object('householdId',h,'rate',f));
 insert into private.fx_receipts values(h,payload->>'idempotencyKey',dig,result);
 return result;
exception when unique_violation or lock_not_available or deadlock_detected then return private.account_error('CONFLICT');
 when check_violation or foreign_key_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range or datetime_field_overflow or invalid_datetime_format then return private.account_error('INVALID_INPUT');
 when insufficient_privilege then return private.account_error('NOT_AUTHORIZED');
 when others then return private.account_error('INTERNAL_ERROR');
end;
$$;
create function api.record_manual_fx(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.record_manual_fx(payload);$$;
revoke all on function api.record_manual_fx(jsonb),private.record_manual_fx(jsonb) from public,anon,authenticated;
-- Independently authorized command entry, not a generic insertion helper.
grant execute on function api.record_manual_fx(jsonb),private.record_manual_fx(jsonb) to authenticated;
notify pgrst,'reload schema';
