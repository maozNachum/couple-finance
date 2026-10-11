-- Task 6: retained category/rule definitions and narrowly authorized category revisions.
create table finance.categorization_catalog (
 household_id uuid primary key references finance.households(id) on delete restrict,
 generation integer not null default 0 check(generation between 0 and 2147483646)
);
create table finance.categories (
 id uuid primary key, household_id uuid not null references finance.households(id) on delete restrict,
 version integer not null check(version between 1 and 2147483646), body jsonb not null,
 kind text generated always as (body->>'kind') stored,
 unique(household_id,id), check(kind in ('EXPENSE','INCOME'))
);
create table finance.category_versions (
 household_id uuid not null, id uuid not null, version integer not null, body jsonb not null,
 recorded_at timestamptz not null default clock_timestamp(), actor_id uuid not null,
 primary key(household_id,id,version),
 foreign key(household_id,id) references finance.categories(household_id,id) on delete restrict
);
create table finance.categorization_rules (
 id uuid primary key, household_id uuid not null references finance.households(id) on delete restrict,
 version integer not null check(version between 1 and 2147483646), body jsonb not null,
 category_id uuid generated always as ((body->>'categoryId')::uuid) stored,
 unique(household_id,id),
 foreign key(household_id,category_id) references finance.categories(household_id,id) on delete restrict
);
create index rule_category_idx on finance.categorization_rules(household_id,category_id);
create table finance.rule_versions (
 household_id uuid not null, id uuid not null, version integer not null, body jsonb not null,
 recorded_at timestamptz not null default clock_timestamp(), actor_id uuid not null,
 primary key(household_id,id,version),
 foreign key(household_id,id) references finance.categorization_rules(household_id,id) on delete restrict
);
alter table finance.transaction_allocations add column category_id uuid generated always as ((payload->>'categoryId')::uuid) stored;
alter table finance.transaction_allocations add constraint allocation_category_fk foreign key(household_id,category_id) references finance.categories(household_id,id) on delete restrict;
create index allocation_category_idx on finance.transaction_allocations(household_id,category_id);
create table finance.categorization_decisions (
 household_id uuid not null, account_id uuid not null, revision_id uuid primary key, allocation_id uuid not null,
 rule_id uuid, rule_version integer, evidence jsonb not null,
 foreign key(household_id,account_id,revision_id) references finance.transaction_revisions(household_id,account_id,revision_id) on delete restrict,
 foreign key(revision_id,allocation_id) references finance.transaction_allocations(revision_id,id) on delete restrict,
 foreign key(household_id,rule_id,rule_version) references finance.rule_versions(household_id,id,version) on delete restrict,
 check((rule_id is null)=(rule_version is null))
);
create index decision_context_idx on finance.categorization_decisions(household_id,account_id,revision_id);
create index decision_allocation_idx on finance.categorization_decisions(revision_id,allocation_id);
create index decision_rule_idx on finance.categorization_decisions(household_id,rule_id,rule_version);
create table private.categorization_receipts (
 household_id uuid not null references finance.households(id) on delete restrict, idempotency_key text not null,
 digest bytea not null check(octet_length(digest)=32), result jsonb not null,
 actor_id uuid not null, recorded_at timestamptz not null default clock_timestamp(),
 primary key(household_id,idempotency_key)
);
-- Definition history, decisions and receipts are all part of the same transaction as the change.
do $$ declare tab text; begin
 foreach tab in array array['categorization_catalog','categories','category_versions','categorization_rules','rule_versions','categorization_decisions'] loop
  execute format('alter table finance.%I enable row level security',tab);
  execute format('revoke all on finance.%I from public,anon,authenticated',tab);
  execute format('grant select on finance.%I to authenticated',tab);
  execute format('create policy household_read on finance.%I for select to authenticated using(private.is_household_member(household_id))',tab);
 end loop;
end $$;
alter table private.categorization_receipts enable row level security;
revoke all on private.categorization_receipts from public,anon,authenticated;
create trigger category_version_immutable before update on finance.category_versions for each row execute function private.immutable_transaction();
create trigger rule_version_immutable before update on finance.rule_versions for each row execute function private.immutable_transaction();
create trigger decision_immutable before update on finance.categorization_decisions for each row execute function private.immutable_transaction();

create function private.normalize_category_text(v text) returns text language sql immutable set search_path='' as $$
 select btrim(regexp_replace(translate(v,'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),E'[ \\t\\r\\n]+',' ','g'),' ');
$$;
create function api.categorization_snapshot() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('catalogs',coalesce((select jsonb_agg(jsonb_build_object('householdId',h.id,'generation',coalesce(g.generation,0),
 'categories',coalesce((select jsonb_agg(c.body order by c.id) from finance.categories c where c.household_id=h.id),'[]'::jsonb),
 'rules',coalesce((select jsonb_agg(r.body order by r.id) from finance.categorization_rules r where r.household_id=h.id),'[]'::jsonb)))
 from finance.households h left join finance.categorization_catalog g on g.household_id=h.id),'[]'::jsonb),
 'decisions',coalesce((select jsonb_agg(jsonb_build_object('revisionId',d.revision_id,'evidence',d.evidence)) from finance.categorization_decisions d),'[]'::jsonb),
 'categoryHistory',coalesce((select jsonb_agg(body order by id,version) from finance.category_versions),'[]'::jsonb),
 'ruleHistory',coalesce((select jsonb_agg(body order by id,version) from finance.rule_versions),'[]'::jsonb));
$$;

create function private.save_categorization_definition(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; old jsonb; h uuid; ident uuid; v integer; gen integer; receipt private.categorization_receipts; dig bytea; result jsonb; cat finance.categories;
begin
 if not private.has_live_session() then return private.account_error('NOT_AUTHORIZED'); end if;
 if not private.ledger_object(payload,array['kind','record','idempotencyKey']) or payload->>'kind' not in ('CATEGORY','RULE')
 or jsonb_typeof(payload->'idempotencyKey') is distinct from 'string' or (payload->>'idempotencyKey') !~ '^[A-Za-z0-9_-]{16,128}$' or (payload->>'idempotencyKey') ~ '[^A-Za-z0-9_-]' then return private.account_error('INVALID_INPUT'); end if;
 r:=payload->'record';
 if not private.account_uuid(r->'id') or not private.account_uuid(r->'householdId')
 or jsonb_typeof(r->'version') is distinct from 'number' or (r->>'version') !~ '^[1-9][0-9]{0,9}$'
 or jsonb_typeof(r->'name') is distinct from 'string' or length(btrim(r->>'name')) not between 1 and 100 then return private.account_error('INVALID_INPUT'); end if;
 h:=(r->>'householdId')::uuid; ident:=(r->>'id')::uuid; v:=(r->>'version')::integer;
 if v not between 1 and 2147483646 then return private.account_error('INVALID_INPUT'); end if;
 if not private.is_household_member(h) then return private.account_error('NOT_AUTHORIZED'); end if;
 perform 1 from finance.households where id=h for update;
 if not private.is_household_member(h) then return private.account_error('NOT_AUTHORIZED'); end if;
 dig:=sha256(convert_to(('DEFINITION:'||payload::text),'UTF8'));
 select * into receipt from private.categorization_receipts where household_id=h and idempotency_key=payload->>'idempotencyKey';
 if found then
  if receipt.digest<>dig then return private.account_error('CONFLICT'); end if;
  return receipt.result;
 end if;
 if payload->>'kind'='CATEGORY' then
  if not private.ledger_object(r,array['id','householdId','version','name','kind','status']) or (r->>'kind' in ('EXPENSE','INCOME')) is not true or (r->>'status' in ('ACTIVE','ARCHIVED')) is not true then return private.account_error('INVALID_INPUT'); end if;
  select body into old from finance.categories where household_id=h and id=ident;
  if (old is null and v<>1) or (old is not null and ((old->>'version')::integer<>v-1 or old->>'kind'<>r->>'kind' or old->>'status'='ARCHIVED')) then return private.account_error('CONFLICT'); end if;
  if old is null then insert into finance.categories values(ident,h,v,r); else update finance.categories set body=r,version=v where household_id=h and id=ident; end if;
  insert into finance.category_versions(household_id,id,version,body,actor_id) values(h,ident,v,r,auth.uid());
 else
  if not private.ledger_object(r,array['id','householdId','version','name','categoryId','effect','operator','pattern','priority','status','normalization'])
  or not private.account_uuid(r->'categoryId') or (r->>'effect' in ('EXPENSE','INCOME')) is not true or (r->>'operator' in ('CONTAINS','EQUALS')) is not true
  or jsonb_typeof(r->'pattern') is distinct from 'string' or length(r->>'pattern') not between 1 and 200 or length(private.normalize_category_text(r->>'pattern'))=0
  or jsonb_typeof(r->'priority') is distinct from 'number' or (r->>'priority') !~ '^(0|[1-9][0-9]{0,6})$' or (r->>'priority')::integer>1000000
  or (r->>'status' in ('ACTIVE','DISABLED','ARCHIVED')) is not true or r->'normalization' is distinct from '1'::jsonb then return private.account_error('INVALID_INPUT'); end if;
  select * into cat from finance.categories where household_id=h and id=(r->>'categoryId')::uuid;
  if not found or cat.kind<>r->>'effect' or (r->>'status'='ACTIVE' and cat.body->>'status'<>'ACTIVE') then return private.account_error('INVALID_INPUT'); end if;
  select body into old from finance.categorization_rules where household_id=h and id=ident;
  if (old is null and v<>1) or (old is not null and ((old->>'version')::integer<>v-1 or old->>'status'='ARCHIVED')) then return private.account_error('CONFLICT'); end if;
  if old is null then insert into finance.categorization_rules(id,household_id,version,body) values(ident,h,v,r); else update finance.categorization_rules set body=r,version=v where household_id=h and id=ident; end if;
  insert into finance.rule_versions(household_id,id,version,body,actor_id) values(h,ident,v,r,auth.uid());
 end if;
 insert into finance.categorization_catalog values(h,1) on conflict(household_id) do update set generation=finance.categorization_catalog.generation+1 returning generation into gen;
 result:=jsonb_build_object('ok',true,'id',ident,'version',v,'generation',gen);
 insert into private.categorization_receipts(household_id,idempotency_key,digest,result,actor_id) values(h,payload->>'idempotencyKey',dig,result,auth.uid());
 return result;
exception when unique_violation then return private.account_error('CONFLICT');
 when check_violation or foreign_key_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range then return private.account_error('INVALID_INPUT');
 when others then return private.account_error('INTERNAL_ERROR');
end;
$$;

-- Internal writer: the original Task 5 validation, now with household category FK.
create function private.write_transaction(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  if not private.ledger_object(a,array['id','effect','ownership','money','categorization'],array['costBehavior','necessity','categoryId'])
  or (a ? 'categoryId' and not private.account_uuid(a->'categoryId'))
  or not private.account_uuid(a->'id') or not private.ledger_owner(a->'ownership') or not private.ledger_money(a->'money')
  or a->'money'->>'currency'<>account_row.currency
  or (a->>'effect' in ('INCOME','EXPENSE','TRANSFER','INVESTMENT_TRADE','DEBT_PRINCIPAL','ADJUSTMENT','UNCLASSIFIED')) is not true
  or (payload->>'entryKind'='OPENING' and a->>'effect'<>'ADJUSTMENT')
  or not private.ledger_object(a->'categorization',array['origin','userLocked'])
  or (a->'categorization'->>'origin' in ('USER','RULE','UNCLASSIFIED')) is not true or jsonb_typeof(a->'categorization'->'userLocked') is distinct from 'boolean'
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
-- Public manual edits cannot fabricate or discard prior categorization decisions.
create or replace function private.record_transaction(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare h uuid; acct uuid; a jsonb; prior jsonb; prev uuid; result jsonb;
begin
 if not private.has_live_session() then return private.account_error('NOT_AUTHORIZED'); end if;
 if not private.account_uuid(payload->'transaction'->'householdId') or not private.account_uuid(payload->'transaction'->'accountId') then return private.account_error('INVALID_INPUT'); end if;
 h:=(payload->'transaction'->>'householdId')::uuid; acct:=(payload->'transaction'->>'accountId')::uuid;
 if not private.is_household_member(h) then return private.account_error('NOT_AUTHORIZED'); end if;
 perform 1 from finance.households where id=h for update;
 perform 1 from finance.accounts where household_id=h and id=acct for update;
 if not private.is_household_member(h) then return private.account_error('NOT_AUTHORIZED'); end if;
 -- Old exact receipts remain valid, even after later corrections or archival.
 if exists(select 1 from private.transaction_receipts where household_id=h and account_id=acct and source_id=(payload->'transaction'->'provenance'->0->'source'->>'sourceId')::uuid and idempotency_key=payload->>'idempotencyKey') then return private.write_transaction(payload); end if;
 prev:=(payload->>'supersedesRevisionId')::uuid;
 for a in select value from jsonb_array_elements(payload->'transaction'->'allocations') loop
  select ta.payload into prior from finance.transaction_allocations ta where household_id=h and account_id=acct and revision_id=prev and id=(a->>'id')::uuid;
  if prior is null then
   if a ? 'categoryId' or (a->'categorization'->>'origin' in ('USER','UNCLASSIFIED')) is not true then return private.account_error('INVALID_INPUT'); end if;
  elsif (a->'categoryId',a->'categorization') is distinct from (prior->'categoryId',prior->'categorization') then return private.account_error('CONFLICT');
  end if;
  -- A financial edit cannot leave a category with an incompatible effect.
  if a ? 'categoryId' and not exists(select 1 from finance.categories where household_id=h and id=(a->>'categoryId')::uuid and kind=a->>'effect') then return private.account_error('INVALID_INPUT'); end if;
 end loop;
 if exists(select 1 from finance.transaction_allocations old where old.household_id=h and old.account_id=acct and old.revision_id=prev and old.category_id is not null and not exists(select 1 from jsonb_array_elements(record_transaction.payload->'transaction'->'allocations') item where item->>'id'=old.id::text)) then return private.account_error('CONFLICT'); end if;
 result:=private.write_transaction(payload); return result;
exception when invalid_text_representation or invalid_parameter_value or numeric_value_out_of_range then return private.account_error('INVALID_INPUT');
 when others then return private.account_error('INTERNAL_ERROR');
end;
$$;

create function private.categorize_transaction(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare h uuid; acct uuid; tid uuid; aid uuid; rid uuid; gen integer; previous finance.transaction_revisions; root finance.transactions;
 receipt private.categorization_receipts; dig bytea; a jsonb; allocations jsonb; cat finance.categories; chosen jsonb; matches jsonb; best integer;
 action text; body jsonb; command jsonb; result jsonb; evidence jsonb; rule_ident uuid; rule_ver integer;
begin
 if not private.has_live_session() then return private.account_error('NOT_AUTHORIZED'); end if;
 if not private.ledger_object(payload,array['householdId','accountId','transactionId','allocationId','expectedVersion','supersedesRevisionId','revisionId','generation','idempotencyKey','action','categoryId','ruleId'])
 or not private.account_uuid(payload->'householdId') or not private.account_uuid(payload->'accountId') or not private.account_uuid(payload->'transactionId') or not private.account_uuid(payload->'allocationId')
 or not private.account_uuid(payload->'supersedesRevisionId') or not private.account_uuid(payload->'revisionId')
 or jsonb_typeof(payload->'expectedVersion') is distinct from 'number' or (payload->>'expectedVersion') !~ '^[1-9][0-9]{0,9}$'
 or jsonb_typeof(payload->'generation') is distinct from 'number' or (payload->>'generation') !~ '^(0|[1-9][0-9]{0,9})$'
 or jsonb_typeof(payload->'idempotencyKey') is distinct from 'string' or (payload->>'idempotencyKey') !~ '^[A-Za-z0-9_-]{16,128}$' or (payload->>'idempotencyKey') ~ '[^A-Za-z0-9_-]'
 or (payload->>'action' in ('RULE','ASSIGN','CLEAR','UNLOCK')) is not true then return private.account_error('INVALID_INPUT'); end if;
 h:=(payload->>'householdId')::uuid; acct:=(payload->>'accountId')::uuid; tid:=(payload->>'transactionId')::uuid; aid:=(payload->>'allocationId')::uuid; rid:=(payload->>'revisionId')::uuid; action:=payload->>'action';
 if not private.is_household_member(h) then return private.account_error('NOT_AUTHORIZED'); end if;
 perform 1 from finance.households where id=h for update;
 perform 1 from finance.accounts where household_id=h and id=acct for update;
 if not private.is_household_member(h) then return private.account_error('NOT_AUTHORIZED'); end if;
 dig:=sha256(convert_to('CATEGORIZE:'||payload::text,'UTF8'));
 select * into receipt from private.categorization_receipts where household_id=h and idempotency_key=payload->>'idempotencyKey';
 if found then
  if receipt.digest<>dig then return private.account_error('CONFLICT'); end if;
  return receipt.result;
 end if;
 if action in ('RULE','ASSIGN') then
  if not private.account_uuid(payload->'categoryId') or (action='RULE' and not private.account_uuid(payload->'ruleId')) or (action='ASSIGN' and payload->'ruleId'<>'null'::jsonb) then return private.account_error('INVALID_INPUT'); end if;
 elsif payload->'categoryId'<>'null'::jsonb or payload->'ruleId'<>'null'::jsonb then return private.account_error('INVALID_INPUT'); end if;
 select coalesce((select generation from finance.categorization_catalog where household_id=h),0) into gen;
 if gen<>(payload->>'generation')::integer then return private.account_error('CONFLICT'); end if;
 select * into root from finance.transactions where household_id=h and account_id=acct and id=tid;
 if not found or root.entry_kind<>'MOVEMENT' then return private.account_error('INVALID_INPUT'); end if;
 select * into previous from finance.transaction_revisions where household_id=h and account_id=acct and transaction_id=tid order by version desc limit 1;
 if previous.version<>(payload->>'expectedVersion')::integer or previous.revision_id<>(payload->>'supersedesRevisionId')::uuid or rid=previous.revision_id or previous.status='VOIDED' then return private.account_error('CONFLICT'); end if;
 select ta.payload into a from finance.transaction_allocations ta where household_id=h and account_id=acct and revision_id=previous.revision_id and id=aid;
 if a is null or (a->>'effect' in ('EXPENSE','INCOME')) is not true then return private.account_error('INVALID_INPUT'); end if;
 if action in ('RULE','ASSIGN') then
  select * into cat from finance.categories where household_id=h and id=(payload->>'categoryId')::uuid;
  if not found or cat.body->>'status'<>'ACTIVE' or cat.kind<>a->>'effect' then return private.account_error('INVALID_INPUT'); end if;
 end if;
 if action='RULE' then
  if (a->'categorization'->>'userLocked')::boolean then return private.account_error('CONFLICT'); end if;
  select coalesce(jsonb_agg(r.body order by (r.body->>'priority')::integer,r.id),'[]'::jsonb) into matches
  from finance.categorization_rules r join finance.categories c on c.household_id=r.household_id and c.id=r.category_id
  where r.household_id=h and r.body->>'status'='ACTIVE' and c.body->>'status'='ACTIVE' and c.kind=a->>'effect' and r.body->>'effect'=a->>'effect'
  and case when r.body->>'operator'='EQUALS' then private.normalize_category_text(previous.body->>'description')=private.normalize_category_text(r.body->>'pattern')
   else strpos(private.normalize_category_text(previous.body->>'description'),private.normalize_category_text(r.body->>'pattern'))>0 end;
  chosen:=matches->0; best:=(chosen->>'priority')::integer;
  if chosen is null or exists(select 1 from jsonb_array_elements(matches) m where (m->>'priority')::integer=best and m->>'categoryId'<>chosen->>'categoryId')
  or chosen->>'id'<>payload->>'ruleId' or chosen->>'categoryId'<>payload->>'categoryId' then return private.account_error('CONFLICT'); end if;
  rule_ident:=(chosen->>'id')::uuid; rule_ver:=(chosen->>'version')::integer;
 end if;
 evidence:=jsonb_build_object('action',action,'generation',gen,'normalization',1,'category',cat.body,'rule',chosen,'matches',coalesce(matches,'[]'::jsonb),'previousCategorization',a->'categorization','previousCategoryId',a->'categoryId');
 if action in ('RULE','ASSIGN') then a:=a || jsonb_build_object('categoryId',cat.id,'categorization',jsonb_build_object('origin',case when action='RULE' then 'RULE' else 'USER' end,'userLocked',action='ASSIGN'));
 elsif action='CLEAR' then a:=(a-'categoryId') || '{"categorization":{"origin":"UNCLASSIFIED","userLocked":false}}'::jsonb;
 else a:=jsonb_set(a,'{categorization,userLocked}','false'::jsonb); end if;
 select jsonb_agg(case when ta.id=aid then a else ta.payload end order by ta.ordinal) into allocations from finance.transaction_allocations ta where household_id=h and account_id=acct and revision_id=previous.revision_id;
 body:=previous.body || jsonb_build_object('allocations',allocations);
 command:=jsonb_build_object('transaction',body,'revisionId',rid,'supersedesRevisionId',previous.revision_id,'expectedVersion',previous.version,
 'entryKind',root.entry_kind,'openingCoverage',previous.opening_coverage,'reason','Categorization: '||action,'idempotencyKey','category-'||rid::text);
 result:=private.write_transaction(command);
 if result->'ok' is distinct from 'true'::jsonb then return result; end if;
 insert into finance.categorization_decisions values(h,acct,rid,aid,rule_ident,rule_ver,evidence);
 insert into private.categorization_receipts(household_id,idempotency_key,digest,result,actor_id) values(h,payload->>'idempotencyKey',dig,result,auth.uid());
 return result;
exception when unique_violation then return private.account_error('CONFLICT');
 when check_violation or foreign_key_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then return private.account_error('INVALID_INPUT');
 when others then return private.account_error('INTERNAL_ERROR');
end;
$$;
create function api.save_categorization_definition(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.save_categorization_definition(payload); $$;
create function api.categorize_transaction(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.categorize_transaction(payload); $$;
revoke all on function private.write_transaction(jsonb),private.normalize_category_text(text),private.save_categorization_definition(jsonb),private.categorize_transaction(jsonb),api.save_categorization_definition(jsonb),api.categorize_transaction(jsonb),api.categorization_snapshot() from public,anon,authenticated;
grant execute on function private.save_categorization_definition(jsonb),private.categorize_transaction(jsonb),api.save_categorization_definition(jsonb),api.categorize_transaction(jsonb),api.categorization_snapshot() to authenticated;
