-- Task 4: manual accounts and immutable observations. No transaction ledger.
-- Match the canonical UUID contract before PostgreSQL's more permissive UUID cast.
create function private.account_uuid(value jsonb) returns boolean language sql immutable set search_path = '' as $$
 select coalesce(jsonb_typeof(value)='string' and length(value #>> '{}')=36 and
  (value #>> '{}') ~ '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$',false);
$$;
revoke all on function private.account_uuid(jsonb) from public,anon,authenticated;
grant execute on function private.account_uuid(jsonb) to authenticated;
create table finance.accounts (
 id uuid primary key,
 household_id uuid not null references finance.households(id) on delete restrict,
 name text not null check (length(btrim(name)) between 1 and 200),
 owner_member_id uuid,
 type text not null check (type in ('BANK','CREDIT_CARD','CASH','SAVINGS','INVESTMENT','PENSION','PROVIDENT_FUND','DEPOSIT','LOAN','OTHER_ASSET','OTHER_LIABILITY')),
 currency text not null check (currency in ('ILS','USD','EUR','JPY','KWD')),
 valuation_currency text not null check (valuation_currency in ('ILS','USD','EUR','JPY','KWD')),
 balance_policy text not null check (balance_policy in ('LEDGER','OBSERVED')),
 status text not null default 'ACTIVE' check (status in ('ACTIVE','ARCHIVED')),
 version integer not null default 1 check (version > 0),
 -- Manual source identity is independent of account identity; never exposed inside Account.
 manual_source_id uuid not null unique,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (household_id,id),
 unique (household_id,id,manual_source_id,currency),
 foreign key (household_id,owner_member_id) references finance.household_members(household_id,id) on delete restrict,
 check (type <> 'CASH' or balance_policy = 'LEDGER'),
 check (id <> manual_source_id),
 check (private.account_uuid(to_jsonb(id)) and private.account_uuid(to_jsonb(manual_source_id)))
);
create index accounts_owner_idx on finance.accounts(household_id,owner_member_id);
create table finance.balance_observations (
 id uuid primary key,
 household_id uuid not null,
 account_id uuid not null,
 source_id uuid not null,
 observation_date date not null check (observation_date between date '0001-01-01' and date '9999-12-31'),
 amount numeric(24,8) not null,
 currency text not null,
 coverage text not null check (coverage in ('COMPLETE','PARTIAL')),
 supersedes_id uuid,
 note text not null default '' check (length(note) <= 500),
 -- Immutable canonical FX snapshot, including stable rate ID and origin. No mutable rate lookup.
 fx jsonb,
 recorded_at timestamptz not null default now(),
 unique (household_id,account_id,observation_date,id),
 foreign key (household_id,account_id,source_id,currency) references finance.accounts(household_id,id,manual_source_id,currency) on delete restrict,
 foreign key (household_id,account_id,observation_date,supersedes_id) references finance.balance_observations(household_id,account_id,observation_date,id) on delete restrict,
 check (amount not in ('NaN'::numeric,'Infinity'::numeric,'-Infinity'::numeric)),
 check (supersedes_id is null or (supersedes_id <> id and length(btrim(note)) > 0)),
 check (private.account_uuid(to_jsonb(id)))
);
create unique index observation_root_idx on finance.balance_observations(household_id,account_id,observation_date) where supersedes_id is null;
create unique index observation_successor_idx on finance.balance_observations(supersedes_id) where supersedes_id is not null;
create unique index observation_fx_identity_idx on finance.balance_observations((fx->>'id')) where fx is not null;
create index observation_history_idx on finance.balance_observations(household_id,account_id,observation_date desc);
create table private.account_audit (
 id bigint generated always as identity primary key,
 occurred_at timestamptz not null default now(), actor_id uuid,
 household_id uuid not null, record_id uuid not null,
 relation_name text not null, operation text not null
);
alter table finance.accounts enable row level security;
alter table finance.balance_observations enable row level security;
alter table private.account_audit enable row level security;
create policy accounts_read on finance.accounts for select to authenticated using (private.is_household_member(household_id));
create policy accounts_insert on finance.accounts for insert to authenticated with check (private.is_household_member(household_id));
create policy accounts_update on finance.accounts for update to authenticated using (private.is_household_member(household_id)) with check (private.is_household_member(household_id));
create policy observations_read on finance.balance_observations for select to authenticated using (private.is_household_member(household_id));
create policy observations_insert on finance.balance_observations for insert to authenticated with check (private.is_household_member(household_id));
grant select on finance.accounts, finance.balance_observations to authenticated;
grant insert (id,household_id,name,owner_member_id,type,currency,valuation_currency,balance_policy,manual_source_id) on finance.accounts to authenticated;
grant update (name,status,version) on finance.accounts to authenticated;
grant insert (id,household_id,account_id,source_id,observation_date,amount,currency,coverage,supersedes_id,note,fx) on finance.balance_observations to authenticated;

create function private.guard_account() returns trigger language plpgsql set search_path = '' as $$
begin
 if tg_op = 'UPDATE' then
  if (new.id,new.household_id,new.owner_member_id,new.type,new.currency,new.valuation_currency,new.balance_policy,new.manual_source_id,new.created_at)
    is distinct from (old.id,old.household_id,old.owner_member_id,old.type,old.currency,old.valuation_currency,old.balance_policy,old.manual_source_id,old.created_at)
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
create trigger account_guard before insert or update on finance.accounts for each row execute function private.guard_account();

create function private.guard_observation() returns trigger language plpgsql set search_path = '' as $$
declare a finance.accounts; f jsonb;
begin
 if tg_op <> 'INSERT' then raise exception using errcode='23514', message='Observations are immutable.'; end if;
 -- Serializes observation insertion with archival and other corrections.
 select * into a from finance.accounts where household_id=new.household_id and id=new.account_id for update;
 if not found or a.balance_policy <> 'OBSERVED' or a.status <> 'ACTIVE' then
  raise exception using errcode='23514', message='Account cannot receive observations.';
 end if;
 f := new.fx;
 if f is not null then
  if jsonb_typeof(f) <> 'object' or not (f ?& array['id','base','quote','rate','effectiveDate','recordedAt','origin'])
   or (f - array['id','base','quote','rate','effectiveDate','recordedAt','origin']) <> '{}'::jsonb
   or jsonb_typeof(f->'rate') <> 'string' or (f->>'rate') !~ '^(0|[1-9][0-9]{0,17})(\.[0-9]{1,12})?$'
   or (f->>'rate')::numeric <= 0 or f->>'base' <> a.currency or f->>'quote' <> a.valuation_currency
   or a.currency = a.valuation_currency or f->>'effectiveDate' <> to_char(new.observation_date,'YYYY-MM-DD')
   or jsonb_typeof(f->'origin') <> 'object' or f->'origin' <> jsonb_build_object('kind','MANUAL','sourceId',new.source_id)
   or not private.account_uuid(f->'id')
   or (f->>'recordedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]{1,6})?Z$'
   or (f->>'recordedAt')::timestamptz < timestamptz '0001-01-01 00:00:00Z'
   or (f->>'recordedAt')::timestamptz > now() then
   raise exception using errcode='23514', message='Invalid FX snapshot.';
  end if;
  -- JSON nulls must not turn the boolean validation above into UNKNOWN.
  if exists (select 1 from jsonb_each(f) where value='null'::jsonb) then raise exception using errcode='23514', message='Invalid FX snapshot.'; end if;
 end if;
 return new;
end;
$$;
create trigger observation_guard before insert or update on finance.balance_observations for each row execute function private.guard_observation();
create function private.audit_account() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into private.account_audit(actor_id,household_id,record_id,relation_name,operation)
 values (auth.uid(),new.household_id,new.id,tg_table_name,tg_op);
 return null;
end;
$$;
create trigger account_audit after insert or update on finance.accounts for each row execute function private.audit_account();
create trigger observation_audit after insert on finance.balance_observations for each row execute function private.audit_account();
revoke all on function private.guard_account(), private.guard_observation(), private.audit_account() from public, anon, authenticated;

create view api.accounts with (security_invoker=true) as select household_id, id,
 jsonb_build_object('account',jsonb_build_object('id',id,'householdId',household_id,'name',name,
 'ownership',case when owner_member_id is null then jsonb_build_object('kind','HOUSEHOLD') else jsonb_build_object('kind','MEMBER','memberId',owner_member_id) end,
 'type',type,'currency',currency,'valuationCurrency',valuation_currency,'balancePolicy',balance_policy,'status',status),
 'version',version,'manualSourceId',manual_source_id) as payload from finance.accounts;
create view api.balance_observations with (security_invoker=true) as select household_id,account_id,id,observation_date,
 jsonb_build_object('id',id,'householdId',household_id,'accountId',account_id,'sourceId',source_id,
 'date',to_char(observation_date,'YYYY-MM-DD'),'money',jsonb_build_object('amount',amount::text,'currency',currency),
 'coverage',coverage,'supersedesId',supersedes_id,'note',note,'fx',fx,
 'recordedAt',to_char(recorded_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) as payload from finance.balance_observations;
grant select on api.accounts,api.balance_observations to authenticated;

-- One statement snapshot avoids truncated/paginated or concurrent correction histories.
create function api.account_snapshot() returns jsonb language sql stable security invoker set search_path = '' as $$
 select jsonb_build_object(
  'accounts',coalesce((select jsonb_agg(payload order by id) from api.accounts),'[]'::jsonb),
  'observations',coalesce((select jsonb_agg(payload order by id) from api.balance_observations),'[]'::jsonb));
$$;
revoke all on function api.account_snapshot() from public,anon,authenticated;
grant execute on function api.account_snapshot() to authenticated;

-- Fixed error vocabulary only; never return SQL diagnostics.
create function private.account_error(code text) returns jsonb language sql immutable set search_path = '' as $$
 select jsonb_build_object('ok',false,'error',case code
 when 'INVALID_INPUT' then jsonb_build_object('code',code,'kind','VALIDATION','safeMessage','Some values are invalid.','retryable',false)
 when 'NOT_AUTHORIZED' then jsonb_build_object('code',code,'kind','AUTHORIZATION','safeMessage','This action is not permitted.','retryable',false)
 when 'CONFLICT' then jsonb_build_object('code',code,'kind','CONFLICT','safeMessage','The data has changed. Please reload.','retryable',false)
 else jsonb_build_object('code','INTERNAL_ERROR','kind','INTERNAL','safeMessage','The request could not be completed.','retryable',false) end);
$$;
revoke all on function private.account_error(text) from public,anon,authenticated;
grant execute on function private.account_error(text) to authenticated;

create function api.create_account(payload jsonb) returns jsonb language plpgsql security invoker set search_path = '' as $$
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
  if existing=payload then return jsonb_build_object('ok',true); end if;
  return private.account_error('CONFLICT');
 end if;
 insert into finance.accounts(id,household_id,name,owner_member_id,type,currency,valuation_currency,balance_policy,manual_source_id)
 values ((a->>'id')::uuid,(a->>'householdId')::uuid,btrim(a->>'name'),(a->'ownership'->>'memberId')::uuid,a->>'type',a->>'currency',a->>'valuationCurrency',a->>'balancePolicy',(payload->>'manualSourceId')::uuid);
 return jsonb_build_object('ok',true);
exception when unique_violation then return private.account_error('CONFLICT');
 when check_violation or foreign_key_violation or not_null_violation or invalid_text_representation then return private.account_error('INVALID_INPUT');
 when insufficient_privilege then return private.account_error('NOT_AUTHORIZED');
 when others then return private.account_error('INTERNAL_ERROR');
end;
$$;
create function api.update_account(payload jsonb) returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
 if not private.has_live_session() then return private.account_error('NOT_AUTHORIZED'); end if;
 if jsonb_typeof(payload) is distinct from 'object' or not(payload ?& array['householdId','accountId','expectedVersion','name','status'])
  or (payload-array['householdId','accountId','expectedVersion','name','status']) <> '{}'::jsonb
  or jsonb_typeof(payload->'name') <> 'string' or jsonb_typeof(payload->'expectedVersion') <> 'number'
  or not private.account_uuid(payload->'householdId') or not private.account_uuid(payload->'accountId')
  or exists(select 1 from jsonb_each(payload) where value='null'::jsonb) then return private.account_error('INVALID_INPUT'); end if;
 if not private.is_household_member((payload->>'householdId')::uuid) then return private.account_error('NOT_AUTHORIZED'); end if;
 update finance.accounts set name=btrim(payload->>'name'),status=payload->>'status',version=version+1
 where household_id=(payload->>'householdId')::uuid and id=(payload->>'accountId')::uuid and version=(payload->>'expectedVersion')::integer;
 if not found then return private.account_error('CONFLICT'); end if;
 return jsonb_build_object('ok',true);
exception when check_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then return private.account_error('INVALID_INPUT');
 when insufficient_privilege then return private.account_error('NOT_AUTHORIZED');
 when others then return private.account_error('INTERNAL_ERROR');
end;
$$;
create function api.record_balance(payload jsonb) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare existing jsonb; d date;
begin
 if not private.has_live_session() then return private.account_error('NOT_AUTHORIZED'); end if;
 if jsonb_typeof(payload) is distinct from 'object' or not(payload ?& array['id','householdId','accountId','sourceId','date','money','coverage','supersedesId','note','fx'])
  or (payload-array['id','householdId','accountId','sourceId','date','money','coverage','supersedesId','note','fx']) <> '{}'::jsonb
  or jsonb_typeof(payload->'money') is distinct from 'object' or not(payload->'money' ?& array['amount','currency'])
  or ((payload->'money')-array['amount','currency']) <> '{}'::jsonb or jsonb_typeof(payload->'money'->'amount') <> 'string'
  or (payload->'money'->>'amount') !~ '^-?(0|[1-9][0-9]{0,15})(\.[0-9]{1,8})?$'
  or (payload->>'date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or jsonb_typeof(payload->'note') <> 'string'
  or not private.account_uuid(payload->'id') or not private.account_uuid(payload->'householdId') or not private.account_uuid(payload->'accountId') or not private.account_uuid(payload->'sourceId')
  or (payload->'supersedesId' <> 'null'::jsonb and not private.account_uuid(payload->'supersedesId'))
  or exists(select 1 from jsonb_each(payload-array['supersedesId','fx']) where value='null'::jsonb)
  or exists(select 1 from jsonb_each(payload->'money') where value='null'::jsonb) then return private.account_error('INVALID_INPUT'); end if;
 if not private.is_household_member((payload->>'householdId')::uuid) then return private.account_error('NOT_AUTHORIZED'); end if;
 d := (payload->>'date')::date;
 select v.payload-'recordedAt' into existing from api.balance_observations v where v.id=(record_balance.payload->>'id')::uuid;
 if found then
  -- PostgreSQL renders numeric(24,8) at fixed scale; compare decimal amounts numerically only after raw validation.
  if (existing-'money')=(payload-'money') and existing->'money'->>'currency'=payload->'money'->>'currency'
   and (existing->'money'->>'amount')::numeric=(payload->'money'->>'amount')::numeric then return jsonb_build_object('ok',true); end if;
  return private.account_error('CONFLICT');
 end if;
 insert into finance.balance_observations(id,household_id,account_id,source_id,observation_date,amount,currency,coverage,supersedes_id,note,fx)
 values ((payload->>'id')::uuid,(payload->>'householdId')::uuid,(payload->>'accountId')::uuid,(payload->>'sourceId')::uuid,d,
 (payload->'money'->>'amount')::numeric,payload->'money'->>'currency',payload->>'coverage',(payload->>'supersedesId')::uuid,btrim(payload->>'note'),nullif(payload->'fx','null'::jsonb));
 return jsonb_build_object('ok',true);
exception when unique_violation then return private.account_error('CONFLICT');
 when check_violation or foreign_key_violation or not_null_violation or invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then return private.account_error('INVALID_INPUT');
 when insufficient_privilege then return private.account_error('NOT_AUTHORIZED');
 when others then return private.account_error('INTERNAL_ERROR');
end;
$$;
revoke all on function api.create_account(jsonb),api.update_account(jsonb),api.record_balance(jsonb) from public,anon,authenticated;
grant execute on function api.create_account(jsonb),api.update_account(jsonb),api.record_balance(jsonb) to authenticated;
