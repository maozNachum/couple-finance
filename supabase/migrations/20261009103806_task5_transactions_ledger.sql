-- Task 5: command-only immutable financial revisions. Existing migrations stay intact.
create function private.ledger_object(v jsonb, required text[], optional text[] default '{}') returns boolean
language sql immutable set search_path = '' as $$
 select coalesce(jsonb_typeof(v)='object' and v ?& required and (v-required-optional)='{}'::jsonb,false);
$$;
create function private.ledger_money(v jsonb) returns boolean language sql immutable set search_path = '' as $$
 select coalesce(private.ledger_object(v,array['amount','currency']) and jsonb_typeof(v->'amount')='string'
 and (v->>'amount') ~ '^-?(0|[1-9][0-9]{0,15})(\.[0-9]{1,8})?$' and (v->>'amount') !~ '[^0-9.\-]'
 and v->>'currency' in ('ILS','USD','EUR','JPY','KWD'),false);
$$;
create function private.ledger_date(v jsonb) returns boolean language plpgsql stable set search_path = '' as $$
begin
 return coalesce(jsonb_typeof(v)='string' and length(v #>> '{}')=10 and (v #>> '{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
 and (v #>> '{}')::date between date '0001-01-01' and date '9999-12-31'
 and to_char((v #>> '{}')::date,'YYYY-MM-DD')=(v #>> '{}'),false);
exception when others then return false;
end;
$$;
create function private.ledger_owner(v jsonb) returns boolean language sql immutable set search_path = '' as $$
 select coalesce(v='{"kind":"HOUSEHOLD"}'::jsonb or (private.ledger_object(v,array['kind','memberId']) and v->>'kind'='MEMBER' and private.account_uuid(v->'memberId')),false);
$$;

create table finance.transactions (
 id uuid primary key, household_id uuid not null, account_id uuid not null, source_id uuid not null,
 transaction_date date not null check(transaction_date between date '0001-01-01' and date '9999-12-31'),
 value_date date check(value_date between date '0001-01-01' and date '9999-12-31'),
 entry_kind text not null check(entry_kind in ('OPENING','MOVEMENT')),
 created_at timestamptz not null default clock_timestamp(),
 unique(household_id,account_id,id),
 foreign key(household_id,account_id,source_id) references finance.account_sources(household_id,account_id,id) on delete restrict
);
create unique index ledger_opening_idx on finance.transactions(household_id,account_id) where entry_kind='OPENING';
create index transaction_source_idx on finance.transactions(household_id,account_id,source_id);
create table finance.transaction_revisions (
 revision_id uuid primary key, household_id uuid not null, account_id uuid not null, transaction_id uuid not null,
 version integer not null check(version>0), supersedes_revision_id uuid,
 body jsonb not null, -- canonical Transaction except allocations, reconstructed from relational rows
 currency text generated always as (body->'money'->>'currency') stored,
 amount numeric(24,8) generated always as ((body->'money'->>'amount')::numeric) stored,
 status text generated always as (body->>'status') stored,
 opening_coverage text check(opening_coverage in ('COMPLETE','PARTIAL')),
 reason text not null check(length(reason)<=500), recorded_at timestamptz not null default clock_timestamp(),
 unique(household_id,account_id,transaction_id,revision_id), unique(household_id,account_id,revision_id),
 unique(transaction_id,version), unique(supersedes_revision_id),
 check((version=1)=(supersedes_revision_id is null)),
 check(supersedes_revision_id is null or (supersedes_revision_id<>revision_id and length(btrim(reason))>0)),
 check(private.ledger_money(body->'money')),
 check(status in ('PENDING','POSTED','VOIDED')),
 foreign key(household_id,account_id,transaction_id) references finance.transactions(household_id,account_id,id) on delete restrict,
 foreign key(household_id,account_id,currency) references finance.accounts(household_id,id,currency) on delete restrict,
 foreign key(household_id,account_id,transaction_id,supersedes_revision_id) references finance.transaction_revisions(household_id,account_id,transaction_id,revision_id) on delete restrict
);
create index transaction_predecessor_idx on finance.transaction_revisions(household_id,account_id,transaction_id,supersedes_revision_id);
create index transaction_currency_idx on finance.transaction_revisions(household_id,account_id,currency);
create table finance.transaction_allocations (
 household_id uuid not null, account_id uuid not null, revision_id uuid not null, id uuid not null,
 ordinal integer not null check(ordinal between 1 and 1000), payload jsonb not null,
 owner_member_id uuid generated always as ((payload->'ownership'->>'memberId')::uuid) stored,
 amount numeric(24,8) generated always as ((payload->'money'->>'amount')::numeric) stored,
 currency text generated always as (payload->'money'->>'currency') stored,
 primary key(revision_id,id), unique(revision_id,ordinal),
 check(private.ledger_money(payload->'money') and private.ledger_owner(payload->'ownership')),
 foreign key(household_id,account_id,revision_id) references finance.transaction_revisions(household_id,account_id,revision_id) on delete restrict,
 foreign key(household_id,owner_member_id) references finance.household_members(household_id,id) on delete restrict,
 foreign key(household_id,account_id,currency) references finance.accounts(household_id,id,currency) on delete restrict
);
create index allocation_revision_idx on finance.transaction_allocations(household_id,account_id,revision_id);
create index allocation_member_idx on finance.transaction_allocations(household_id,owner_member_id);
create index allocation_currency_idx on finance.transaction_allocations(household_id,account_id,currency);
create table private.transaction_receipts (
 household_id uuid not null, account_id uuid not null, source_id uuid not null, idempotency_key text not null,
 payload_digest bytea not null check(octet_length(payload_digest)=32), revision_id uuid not null,
 primary key(household_id,account_id,source_id,idempotency_key),
 foreign key(household_id,account_id,source_id) references finance.account_sources(household_id,account_id,id) on delete restrict,
 foreign key(household_id,account_id,revision_id) references finance.transaction_revisions(household_id,account_id,revision_id) on delete restrict
);
create index receipt_revision_idx on private.transaction_receipts(household_id,account_id,revision_id);
create table private.transaction_audit (
 id bigint generated always as identity primary key, occurred_at timestamptz not null default clock_timestamp(),
 actor_id uuid not null, household_id uuid not null, account_id uuid not null, transaction_id uuid not null,
 revision_id uuid not null, operation text not null check(operation in ('CREATE','CORRECT','VOID'))
);
alter table finance.transactions enable row level security;
alter table finance.transaction_revisions enable row level security;
alter table finance.transaction_allocations enable row level security;
alter table private.transaction_receipts enable row level security;
alter table private.transaction_audit enable row level security;
create policy transactions_read on finance.transactions for select to authenticated using(private.is_household_member(household_id));
create policy revisions_read on finance.transaction_revisions for select to authenticated using(private.is_household_member(household_id));
create policy allocations_read on finance.transaction_allocations for select to authenticated using(private.is_household_member(household_id));
revoke all on finance.transactions,finance.transaction_revisions,finance.transaction_allocations,private.transaction_receipts,private.transaction_audit from public,anon,authenticated;
grant select on finance.transactions,finance.transaction_revisions,finance.transaction_allocations to authenticated;

create function private.immutable_transaction() returns trigger language plpgsql set search_path='' as $$
begin raise exception using errcode='23514',message='Financial history is immutable.'; end;
$$;
create trigger transaction_immutable before update on finance.transactions for each row execute function private.immutable_transaction();
create trigger revision_immutable before update on finance.transaction_revisions for each row execute function private.immutable_transaction();
create trigger allocation_immutable before update on finance.transaction_allocations for each row execute function private.immutable_transaction();

create view api.transaction_history with(security_invoker=true) as
select r.household_id,r.account_id,r.transaction_id,r.revision_id,
 jsonb_build_object('transaction',r.body || jsonb_build_object('allocations',coalesce((select jsonb_agg(a.payload order by a.ordinal) from finance.transaction_allocations a where a.household_id=r.household_id and a.account_id=r.account_id and a.revision_id=r.revision_id),'[]'::jsonb)),
 'revisionId',r.revision_id,'supersedesRevisionId',r.supersedes_revision_id,'version',r.version,
 'entryKind',t.entry_kind,'openingCoverage',r.opening_coverage,'reason',r.reason,
 'createdAt',to_char(t.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
 'recordedAt',to_char(r.recorded_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) payload
from finance.transaction_revisions r join finance.transactions t on (t.household_id,t.account_id,t.id)=(r.household_id,r.account_id,r.transaction_id);
grant select on api.transaction_history to authenticated;
create function api.transaction_snapshot() returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object('accounts',coalesce((select jsonb_agg(payload order by id) from api.accounts),'[]'::jsonb),
 'observations',coalesce((select jsonb_agg(payload order by id) from api.balance_observations),'[]'::jsonb),
 'history',coalesce((select jsonb_agg(payload order by revision_id) from api.transaction_history),'[]'::jsonb));
$$;

-- Definer is necessary to withhold direct table writes. Caller identity is never an argument.
create function private.record_transaction(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare t jsonb; a jsonb; h uuid; acct uuid; src uuid; tid uuid; rid uuid; expected integer; p uuid;
 account_row finance.accounts; root finance.transactions; previous finance.transaction_revisions;
 receipt private.transaction_receipts; digest_value bytea; total numeric := 0; ordinal_value integer := 0;
 stamp timestamptz; opening_date date;
begin
 if not private.has_live_session() then return private.account_error('NOT_AUTHORIZED'); end if;
 if not private.ledger_object(payload,array['transaction','revisionId','supersedesRevisionId','entryKind','openingCoverage','reason','idempotencyKey','expectedVersion'])
 or not private.account_uuid(payload->'revisionId')
 or jsonb_typeof(payload->'idempotencyKey') is distinct from 'string'
 or (payload->>'idempotencyKey') !~ '^[A-Za-z0-9_-]{16,128}$' or (payload->>'idempotencyKey') ~ '[^A-Za-z0-9_-]'
 or jsonb_typeof(payload->'expectedVersion') is distinct from 'number' or (payload->>'expectedVersion') !~ '^(0|[1-9][0-9]{0,9})$'
 or jsonb_typeof(payload->'reason') is distinct from 'string' or length(btrim(payload->>'reason'))>500
 or (payload->>'entryKind' in ('MOVEMENT','OPENING')) is not true
 or (payload->'supersedesRevisionId'<>'null'::jsonb and not private.account_uuid(payload->'supersedesRevisionId')) then return private.account_error('INVALID_INPUT'); end if;
 t := payload->'transaction';
 if not private.ledger_object(t,array['id','householdId','accountId','transactionDate','money','description','status','provenance','allocations'],array['valueDate'])
 or not private.account_uuid(t->'id') or not private.account_uuid(t->'householdId') or not private.account_uuid(t->'accountId')
 or not private.ledger_date(t->'transactionDate') or (t ? 'valueDate' and not private.ledger_date(t->'valueDate'))
 or not private.ledger_money(t->'money') or jsonb_typeof(t->'description') is distinct from 'string' or length(btrim(t->>'description')) not between 1 and 2000
 or (t->>'status' in ('PENDING','POSTED','VOIDED')) is not true
 or jsonb_typeof(t->'provenance') is distinct from 'array' or jsonb_array_length(t->'provenance')<>1
 or not private.ledger_object(t->'provenance'->0,array['source'])
 or not private.ledger_object(t->'provenance'->0->'source',array['sourceId','kind'])
 or (t->'provenance'->0->'source'->>'kind'='MANUAL') is not true
 or not private.account_uuid(t->'provenance'->0->'source'->'sourceId')
 or jsonb_typeof(t->'allocations') is distinct from 'array' or jsonb_array_length(t->'allocations') not between 1 and 1000 then return private.account_error('INVALID_INPUT'); end if;
 h := (t->>'householdId')::uuid; acct := (t->>'accountId')::uuid; tid := (t->>'id')::uuid;
 src := (t->'provenance'->0->'source'->>'sourceId')::uuid; rid := (payload->>'revisionId')::uuid;
 expected := (payload->>'expectedVersion')::integer; p := (payload->>'supersedesRevisionId')::uuid;
 if expected not between 0 and 2147483646 or ((expected=0)<>(p is null)) or p=rid or (p is not null and length(btrim(payload->>'reason'))=0)
 or (payload->>'entryKind'='OPENING' and ((payload->>'openingCoverage' in ('COMPLETE','PARTIAL')) is not true or t->>'status'='PENDING'))
 or (payload->>'entryKind'='MOVEMENT' and payload->'openingCoverage'<>'null'::jsonb) then return private.account_error('INVALID_INPUT'); end if;
 if not private.is_household_member(h) then return private.account_error('NOT_AUTHORIZED'); end if;
 -- Account lock orders all financial commands against archival and other writes.
 select * into account_row from finance.accounts where household_id=h and id=acct for update;
 if not found then return private.account_error('INVALID_INPUT'); end if;
 if not private.is_household_member(h) then return private.account_error('NOT_AUTHORIZED'); end if;
 if not exists(select 1 from finance.account_sources where household_id=h and account_id=acct and id=src and kind='MANUAL') then return private.account_error('INVALID_INPUT'); end if;
 digest_value := sha256(convert_to((payload-'idempotencyKey')::text,'UTF8'));
 select * into receipt from private.transaction_receipts where household_id=h and account_id=acct and source_id=src and idempotency_key=payload->>'idempotencyKey';
 if found then
  if receipt.payload_digest<>digest_value then return private.account_error('CONFLICT'); end if;
  return jsonb_build_object('ok',true,'revisionId',receipt.revision_id,'version',expected+1);
 end if;
 if account_row.status<>'ACTIVE' then return private.account_error('CONFLICT'); end if;
 if account_row.currency<>t->'money'->>'currency' or (payload->>'entryKind'='OPENING' and account_row.balance_policy<>'LEDGER') then return private.account_error('INVALID_INPUT'); end if;
 for a in select value from jsonb_array_elements(t->'allocations') loop
  if not private.ledger_object(a,array['id','effect','ownership','money','categorization'],array['costBehavior','necessity'])
  or not private.account_uuid(a->'id') or not private.ledger_owner(a->'ownership') or not private.ledger_money(a->'money')
  or a->'money'->>'currency'<>account_row.currency
  or (a->>'effect' in ('INCOME','EXPENSE','TRANSFER','INVESTMENT_TRADE','DEBT_PRINCIPAL','ADJUSTMENT','UNCLASSIFIED')) is not true
  or (payload->>'entryKind'='OPENING' and a->>'effect'<>'ADJUSTMENT')
  or not private.ledger_object(a->'categorization',array['origin','userLocked'])
  or (a->'categorization'->>'origin' in ('USER','UNCLASSIFIED')) is not true or jsonb_typeof(a->'categorization'->'userLocked') is distinct from 'boolean'
  or (a ? 'costBehavior' and (a->>'costBehavior' in ('FIXED','VARIABLE')) is not true)
  or (a ? 'necessity' and (a->>'necessity' in ('ESSENTIAL','DISCRETIONARY')) is not true)
  then return private.account_error('INVALID_INPUT'); end if;
  -- Durable attribution may retain revoked/unlinked members, but never foreign identities.
  if a->'ownership'->>'kind'='MEMBER' and not exists(select 1 from finance.household_members where household_id=h and id=(a->'ownership'->>'memberId')::uuid) then return private.account_error('INVALID_INPUT'); end if;
  total := total+(a->'money'->>'amount')::numeric;
 end loop;
 if total<>(t->'money'->>'amount')::numeric or (select count(distinct value->>'id') from jsonb_array_elements(t->'allocations'))<>jsonb_array_length(t->'allocations') then return private.account_error('INVALID_INPUT'); end if;
 select * into root from finance.transactions where id=tid;
 if found then
  if (root.household_id,root.account_id,root.source_id,root.transaction_date,root.value_date,root.entry_kind) is distinct from (h,acct,src,(t->>'transactionDate')::date,(t->>'valueDate')::date,payload->>'entryKind') then return private.account_error('CONFLICT'); end if;
  select * into previous from finance.transaction_revisions where household_id=h and account_id=acct and transaction_id=tid order by version desc limit 1;
  if previous.version<>expected or previous.revision_id is distinct from p or (previous.status='VOIDED' and root.entry_kind<>'OPENING') or (previous.status='POSTED' and t->>'status'='PENDING') then return private.account_error('CONFLICT'); end if;
 elsif expected<>0 then return private.account_error('CONFLICT'); end if;
 select transaction_date into opening_date from finance.transactions where household_id=h and account_id=acct and entry_kind='OPENING';
 if payload->>'entryKind'='OPENING' and opening_date is not null and expected=0 then return private.account_error('CONFLICT'); end if;
 if opening_date is not null and (t->>'transactionDate')::date<opening_date then return private.account_error('INVALID_INPUT'); end if;
 if payload->>'entryKind'='OPENING' and exists(select 1 from finance.transactions where household_id=h and account_id=acct and transaction_date<(t->>'transactionDate')::date) then return private.account_error('INVALID_INPUT'); end if;
 stamp := clock_timestamp();
 if expected=0 then
  insert into finance.transactions(id,household_id,account_id,source_id,transaction_date,value_date,entry_kind,created_at)
  values(tid,h,acct,src,(t->>'transactionDate')::date,(t->>'valueDate')::date,payload->>'entryKind',stamp);
 end if;
 insert into finance.transaction_revisions(revision_id,household_id,account_id,transaction_id,version,supersedes_revision_id,body,opening_coverage,reason,recorded_at)
 values(rid,h,acct,tid,expected+1,p,t-'allocations',payload->>'openingCoverage',btrim(payload->>'reason'),stamp);
 for a in select value from jsonb_array_elements(t->'allocations') loop
  ordinal_value := ordinal_value+1;
  insert into finance.transaction_allocations(household_id,account_id,revision_id,id,ordinal,payload) values(h,acct,rid,(a->>'id')::uuid,ordinal_value,a);
 end loop;
 insert into private.transaction_receipts values(h,acct,src,payload->>'idempotencyKey',digest_value,rid);
 insert into private.transaction_audit(actor_id,household_id,account_id,transaction_id,revision_id,operation)
 values(auth.uid(),h,acct,tid,rid,case when expected=0 then 'CREATE' when t->>'status'='VOIDED' then 'VOID' else 'CORRECT' end);
 return jsonb_build_object('ok',true,'revisionId',rid,'version',expected+1);
exception when unique_violation then return private.account_error('CONFLICT');
 when check_violation or foreign_key_violation or not_null_violation or invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range or invalid_parameter_value then return private.account_error('INVALID_INPUT');
 when insufficient_privilege then return private.account_error('NOT_AUTHORIZED');
 when others then return private.account_error('INTERNAL_ERROR');
end;
$$;
create function api.record_transaction(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$
 select private.record_transaction(payload);
$$;
revoke all on function private.ledger_object(jsonb,text[],text[]),private.ledger_money(jsonb),private.ledger_date(jsonb),private.ledger_owner(jsonb),private.immutable_transaction(),private.record_transaction(jsonb),api.record_transaction(jsonb),api.transaction_snapshot() from public,anon,authenticated;
grant execute on function private.record_transaction(jsonb),api.record_transaction(jsonb),api.transaction_snapshot() to authenticated;
