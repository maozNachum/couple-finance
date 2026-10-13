-- Relationship decisions only. The Task 5/6/8 financial writer is unchanged.
create table finance.reconciliations (
 household_id uuid not null, id uuid not null, version integer not null check(version>0),
 kind text not null check(kind in ('TRANSFER','CARD','LOAN')), active boolean not null,
 primary key(household_id,id), unique(id),
 foreign key(household_id) references finance.households(id) on delete restrict
);
create table finance.reconciliation_decisions (
 household_id uuid not null, id uuid not null, version integer not null check(version>0),
 actor_member_id uuid not null, body jsonb not null, fx_rate_id uuid,
 primary key(household_id,id,version),
 foreign key(household_id,id) references finance.reconciliations(household_id,id) on delete restrict,
 foreign key(household_id,actor_member_id) references finance.household_members(household_id,id) on delete restrict,
 foreign key(household_id,fx_rate_id) references finance.fx_evidence(household_id,id) on delete restrict
);
create index reconciliation_actor_idx on finance.reconciliation_decisions(household_id,actor_member_id);
create index reconciliation_fx_idx on finance.reconciliation_decisions(household_id,fx_rate_id) where fx_rate_id is not null;
create table finance.reconciliation_participants (
 household_id uuid not null, relationship_id uuid not null, decision_version integer not null,
 account_id uuid not null, transaction_id uuid not null, revision_id uuid not null,
 primary key(household_id,relationship_id,decision_version,transaction_id),
 foreign key(household_id,relationship_id,decision_version) references finance.reconciliation_decisions(household_id,id,version) on delete restrict,
 foreign key(household_id,account_id,transaction_id,revision_id) references finance.transaction_revisions(household_id,account_id,transaction_id,revision_id) on delete restrict
);
create index reconciliation_revision_idx on finance.reconciliation_participants(household_id,account_id,transaction_id,revision_id);
create table finance.reconciliation_claims (
 household_id uuid not null, transaction_id uuid not null, account_id uuid not null,
 relationship_id uuid not null, decision_version integer not null,
 primary key(household_id,transaction_id),
 foreign key(household_id,account_id,transaction_id) references finance.transactions(household_id,account_id,id) on delete restrict,
 foreign key(household_id,relationship_id,decision_version) references finance.reconciliation_decisions(household_id,id,version) on delete restrict
);
create index reconciliation_claim_account_idx on finance.reconciliation_claims(household_id,account_id,transaction_id);
create index reconciliation_claim_decision_idx on finance.reconciliation_claims(household_id,relationship_id,decision_version);
create table private.reconciliation_receipts (
 household_id uuid not null, idempotency_key text not null, digest bytea not null check(octet_length(digest)=32),
 relationship_id uuid not null, decision_version integer not null, result jsonb not null,
 primary key(household_id,idempotency_key),
 foreign key(household_id,relationship_id,decision_version) references finance.reconciliation_decisions(household_id,id,version) on delete restrict
);
create index reconciliation_receipt_decision_idx on private.reconciliation_receipts(household_id,relationship_id,decision_version);
create table private.reconciliation_audit (
 id bigint generated always as identity primary key, household_id uuid not null,
 actor_member_id uuid not null, relationship_id uuid not null, decision_version integer not null,
 operation text not null check(operation in ('LINK','REPLACE','UNLINK')), occurred_at timestamptz not null default clock_timestamp()
);
alter table finance.reconciliations enable row level security;
alter table finance.reconciliation_decisions enable row level security;
alter table finance.reconciliation_participants enable row level security;
alter table finance.reconciliation_claims enable row level security;
alter table private.reconciliation_receipts enable row level security;
alter table private.reconciliation_audit enable row level security;
create policy reconciliation_read on finance.reconciliations for select to authenticated using(private.is_household_member(household_id));
create policy reconciliation_decision_read on finance.reconciliation_decisions for select to authenticated using(private.is_household_member(household_id));
create policy reconciliation_participant_read on finance.reconciliation_participants for select to authenticated using(private.is_household_member(household_id));
create policy reconciliation_claim_read on finance.reconciliation_claims for select to authenticated using(private.is_household_member(household_id));
revoke all on finance.reconciliations,finance.reconciliation_decisions,finance.reconciliation_participants,finance.reconciliation_claims,private.reconciliation_receipts,private.reconciliation_audit from public,anon,authenticated;
grant select on finance.reconciliations,finance.reconciliation_decisions,finance.reconciliation_participants,finance.reconciliation_claims to authenticated;
create trigger reconciliation_decision_immutable before update on finance.reconciliation_decisions for each row execute function private.immutable_transaction();
create trigger reconciliation_participant_immutable before update on finance.reconciliation_participants for each row execute function private.immutable_transaction();

create function api.reconciliation_snapshot() returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
 'households',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'createdAt',to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) order by id) from finance.households),'[]'::jsonb),
 'members',coalesce((select jsonb_agg(jsonb_build_object('id',id,'householdId',household_id,'userId',user_id,'displayName',display_name,'status',status) order by id) from finance.household_members),'[]'::jsonb),
 'accounts',coalesce((select jsonb_agg(payload order by id) from api.accounts),'[]'::jsonb),
 'history',coalesce((select jsonb_agg(payload order by revision_id) from api.transaction_history),'[]'::jsonb),
 'decisions',coalesce((select jsonb_agg(body order by id,version) from finance.reconciliation_decisions),'[]'::jsonb),
 'rates',coalesce((select jsonb_agg(jsonb_build_object('householdId',household_id,'rate',snapshot) order by household_id,id) from finance.fx_evidence),'[]'::jsonb),
 'references',coalesce((select jsonb_agg(jsonb_build_object('householdId',household_id,'transactionId',transaction_id,'reference',source_reference) order by id) from finance.import_rows),'[]'::jsonb));
$$;

-- Narrow private definer: direct history DML stays unavailable to clients.
create function private.reconcile(payload jsonb) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='10s' as $$
declare h uuid; ident uuid; expected integer; kind_value text; action_value text; member uuid;
 head finance.reconciliations; receipt private.reconciliation_receipts; dig bytea; result jsonb;
 p jsonb; part jsonb; a jsonb; r finance.transaction_revisions; acct finance.accounts; root finance.transactions;
 evidence jsonb:='[]'::jsonb; rev jsonb; fx jsonb; paid jsonb; counter jsonb;
 payment_account uuid; target_account uuid; amount_value numeric; principal numeric;
 payment_amount numeric; counterpart_amount numeric; purchases_amount numeric:=0; payment_currency text; counterpart_currency text;
 payment_date date; payment_count integer:=0; counterpart_count integer:=0; purchase_count integer:=0;
 wrong_effect boolean:=false; diff numeric; purchase_diff numeric; state_value text; total_parts integer:=0; expected_effect text;
begin
 if not private.has_live_session() then return private.account_error('NOT_AUTHORIZED'); end if;
 if octet_length(payload::text)>131072 or not private.ledger_object(payload,array['householdId','id','expectedVersion','idempotencyKey','action','kind','participants','fxRateId','reason','acknowledge'])
 or not private.account_uuid(payload->'householdId') or not private.account_uuid(payload->'id')
 or jsonb_typeof(payload->'expectedVersion') is distinct from 'number' or (payload->>'expectedVersion') !~ '^(0|[1-9][0-9]{0,9})$'
 or jsonb_typeof(payload->'idempotencyKey') is distinct from 'string' or (payload->>'idempotencyKey') !~ '^[A-Za-z0-9_-]{16,128}$' or (payload->>'idempotencyKey') ~ '[^A-Za-z0-9_-]'
 or (payload->>'action' in ('LINK','REPLACE','UNLINK')) is not true or (payload->>'kind' in ('TRANSFER','CARD','LOAN')) is not true
 or payload->'acknowledge' is distinct from 'true'::jsonb or jsonb_typeof(payload->'reason') is distinct from 'string' or length(btrim(payload->>'reason')) not between 1 and 500
 or jsonb_typeof(payload->'participants') is distinct from 'array' or jsonb_array_length(payload->'participants')>100
 or (payload->'fxRateId'<>'null'::jsonb and not private.account_uuid(payload->'fxRateId')) then return private.account_error('INVALID_INPUT'); end if;
 h:=(payload->>'householdId')::uuid; ident:=(payload->>'id')::uuid; expected:=(payload->>'expectedVersion')::integer;
 kind_value:=payload->>'kind'; action_value:=payload->>'action';
 if expected not between 0 and 2147483646 or ((action_value='LINK')<>(expected=0))
 or (action_value='UNLINK' and (jsonb_array_length(payload->'participants')<>0 or payload->'fxRateId'<>'null'::jsonb))
 or (action_value<>'UNLINK' and jsonb_array_length(payload->'participants')=0) then return private.account_error('INVALID_INPUT'); end if;
 if not private.is_household_member(h) then return private.account_error('NOT_AUTHORIZED'); end if;
 -- Same household-before-account order as financial/category/import commands.
 perform 1 from finance.households where id=h for update;
 perform 1 from auth.users where id=auth.uid() for share;
 if not found then return private.account_error('NOT_AUTHORIZED'); end if;
 perform 1 from auth.sessions where id::text=auth.jwt()->>'session_id' and user_id=auth.uid() for share;
 if not found then return private.account_error('NOT_AUTHORIZED'); end if;
 select id into member from finance.household_members where household_id=h and user_id=auth.uid() and status='ACTIVE' for share;
 if not found or not private.is_household_member(h) then return private.account_error('NOT_AUTHORIZED'); end if;
 dig:=sha256(convert_to(payload::text,'UTF8'));
 select * into receipt from private.reconciliation_receipts where household_id=h and idempotency_key=payload->>'idempotencyKey';
 if found then
  if receipt.digest<>dig then return private.account_error('CONFLICT'); end if;
  return receipt.result;
 end if;
 select * into head from finance.reconciliations where household_id=h and id=ident;
 if (expected=0 and head.id is not null) or (expected>0 and (head.id is null or head.version<>expected or not head.active or head.kind<>kind_value)) then return private.account_error('CONFLICT'); end if;
 if action_value<>'UNLINK' then
  if (select count(distinct v->>'transactionId') from jsonb_array_elements(payload->'participants') v)<>jsonb_array_length(payload->'participants') then return private.account_error('INVALID_INPUT'); end if;
  for p in select value from jsonb_array_elements(payload->'participants') loop
   if not private.ledger_object(p,array['accountId','accountVersion','transactionId','revisionId','expectedVersion','role','parts'])
   or not private.account_uuid(p->'accountId') or not private.account_uuid(p->'transactionId') or not private.account_uuid(p->'revisionId')
   or jsonb_typeof(p->'accountVersion') is distinct from 'number' or (p->>'accountVersion') !~ '^[1-9][0-9]{0,9}$'
   or jsonb_typeof(p->'expectedVersion') is distinct from 'number' or (p->>'expectedVersion') !~ '^[1-9][0-9]{0,9}$'
   or (p->>'role' in ('PAYMENT','COUNTERPART','PURCHASE')) is not true
   or jsonb_typeof(p->'parts') is distinct from 'array' or jsonb_array_length(p->'parts') not between 1 and 1000 then return private.account_error('INVALID_INPUT'); end if;
   total_parts:=total_parts+jsonb_array_length(p->'parts');
  end loop;
  if total_parts>1000 then return private.account_error('INVALID_INPUT'); end if;
  perform 1 from finance.accounts where household_id=h and id in(select (v->>'accountId')::uuid from jsonb_array_elements(payload->'participants') v) order by id for update;
  for p in select value from jsonb_array_elements(payload->'participants') order by value->>'transactionId' loop
   select * into acct from finance.accounts where household_id=h and id=(p->>'accountId')::uuid;
   if not found then return private.account_error('INVALID_INPUT'); end if;
   if acct.status<>'ACTIVE' or acct.version<>(p->>'accountVersion')::integer then return private.account_error('CONFLICT'); end if;
   select * into root from finance.transactions where household_id=h and account_id=acct.id and id=(p->>'transactionId')::uuid;
   if not found or root.entry_kind<>'MOVEMENT' then return private.account_error('INVALID_INPUT'); end if;
   select * into r from finance.transaction_revisions where household_id=h and account_id=acct.id and transaction_id=root.id order by version desc limit 1;
   if r.revision_id<>(p->>'revisionId')::uuid or r.version<>(p->>'expectedVersion')::integer or r.status<>'POSTED' then return private.account_error('CONFLICT'); end if;
   if exists(select 1 from finance.reconciliation_claims where household_id=h and transaction_id=root.id and relationship_id<>ident) then return private.account_error('CONFLICT'); end if;
   if jsonb_array_length(p->'parts')<>(select count(*) from finance.transaction_allocations where household_id=h and account_id=acct.id and revision_id=r.revision_id)
   or (select count(distinct v->>'allocationId') from jsonb_array_elements(p->'parts') v)<>jsonb_array_length(p->'parts') then return private.account_error('INVALID_INPUT'); end if;
   principal:=0;
   for part in select value from jsonb_array_elements(p->'parts') loop
    if not private.ledger_object(part,array['allocationId','meaning']) or not private.account_uuid(part->'allocationId')
    or (part->>'meaning' in ('TRANSFER','PURCHASE','PRINCIPAL','INTEREST','FEE')) is not true then return private.account_error('INVALID_INPUT'); end if;
    select ta.payload into a from finance.transaction_allocations ta where household_id=h and account_id=acct.id and revision_id=r.revision_id and id=(part->>'allocationId')::uuid;
    if not found then return private.account_error('INVALID_INPUT'); end if;
    if kind_value='LOAN' then
     if p->>'role'='PURCHASE' or part->>'meaning' not in ('PRINCIPAL','INTEREST','FEE') or (p->>'role'='COUNTERPART' and part->>'meaning'<>'PRINCIPAL') then return private.account_error('INVALID_INPUT'); end if;
    elsif part->>'meaning'<>(case when p->>'role'='PURCHASE' then 'PURCHASE' else 'TRANSFER' end) or (kind_value='TRANSFER' and p->>'role'='PURCHASE') then return private.account_error('INVALID_INPUT'); end if;
    expected_effect:=case part->>'meaning' when 'TRANSFER' then 'TRANSFER' when 'PRINCIPAL' then 'DEBT_PRINCIPAL' else 'EXPENSE' end;
    wrong_effect:=wrong_effect or a->>'effect'<>expected_effect;
    amount_value:=(a->'money'->>'amount')::numeric;
    if (p->>'role'='PAYMENT' and amount_value>=0) or (p->>'role'='COUNTERPART' and amount_value<=0) then return private.account_error('INVALID_INPUT'); end if;
    if part->>'meaning'='PRINCIPAL' then principal:=principal+amount_value; end if;
   end loop;
   if r.amount=0 then return private.account_error('INVALID_INPUT'); end if;
   if kind_value='TRANSFER' and acct.type in ('CREDIT_CARD','LOAN') then return private.account_error('INVALID_INPUT'); end if;
   if p->>'role'='PAYMENT' then
    payment_count:=payment_count+1; payment_account:=acct.id; paid:=r.body;
    if r.amount>=0 or (kind_value<>'TRANSFER' and acct.type<>'BANK') then return private.account_error('INVALID_INPUT'); end if;
    payment_amount:=case when kind_value='LOAN' then -principal else -r.amount end; payment_currency:=r.currency; payment_date:=root.transaction_date;
   else
    if target_account is not null and target_account<>acct.id then return private.account_error('INVALID_INPUT'); end if;
    target_account:=acct.id;
    if (kind_value='CARD' and acct.type<>'CREDIT_CARD') or (kind_value='LOAN' and acct.type<>'LOAN') then return private.account_error('INVALID_INPUT'); end if;
    if p->>'role'='COUNTERPART' then
     counterpart_count:=counterpart_count+1; counter:=r.body;
     if r.amount<=0 then return private.account_error('INVALID_INPUT'); end if;
     counterpart_amount:=case when kind_value='LOAN' then principal else r.amount end; counterpart_currency:=r.currency;
    else purchase_count:=purchase_count+1; purchases_amount:=purchases_amount-r.amount; end if;
   end if;
   select th.payload into rev from api.transaction_history th where household_id=h and account_id=acct.id and revision_id=r.revision_id;
   evidence:=evidence||jsonb_build_array(jsonb_build_object('selection',p,'revision',rev,
    'sourceReference',(select source_reference from finance.import_rows where household_id=h and account_id=acct.id and transaction_id=root.id),
    'importItemId',(select id from finance.import_rows where household_id=h and account_id=acct.id and transaction_id=root.id),
    'contentHash',(select content_hash from finance.import_rows where household_id=h and account_id=acct.id and transaction_id=root.id)));
  end loop;
  if payment_count<>1 or counterpart_count>1 or payment_account=target_account or (kind_value<>'CARD' and purchase_count>0) then return private.account_error('INVALID_INPUT'); end if;
  if kind_value='LOAN' and payment_amount<=0 then return private.account_error('INVALID_INPUT'); end if;
  if purchase_count>0 and exists(select 1 from jsonb_array_elements(evidence) v where v->'selection'->>'role'='PURCHASE' and v->'revision'->'transaction'->'money'->>'currency'<>payment_currency) then return private.account_error('INVALID_INPUT'); end if;
  if counterpart_count>0 then
   if payment_currency<>counterpart_currency then
    select snapshot into fx from finance.fx_evidence where household_id=h and id=(payload->>'fxRateId')::uuid;
    if not found or fx->>'base'<>payment_currency or fx->>'quote'<>counterpart_currency or (fx->>'effectiveDate')::date<>payment_date then return private.account_error('INVALID_INPUT'); end if;
    payment_amount:=round(payment_amount*(fx->>'rate')::numeric,8);
    if abs(payment_amount)>=10000000000000000 then return private.account_error('INVALID_INPUT'); end if;
   elsif payload->'fxRateId'<>'null'::jsonb then return private.account_error('INVALID_INPUT'); end if;
   diff:=payment_amount-counterpart_amount;
  elsif payload->'fxRateId'<>'null'::jsonb then return private.account_error('INVALID_INPUT'); end if;
  -- Purchases cannot be compared to a converted bank amount; require same currency.
  if purchase_count>0 then
   if counterpart_count>0 and counterpart_currency<>payment_currency then return private.account_error('INVALID_INPUT'); end if;
   purchase_diff:=(-(paid->'money'->>'amount')::numeric)-purchases_amount;
  end if;
  if abs(purchases_amount)>=1000000000000000000 or abs(diff)>=1000000000000000000 or abs(purchase_diff)>=1000000000000000000 then return private.account_error('INVALID_INPUT'); end if;
  state_value:=case when wrong_effect then 'NEEDS_CORRECTION'
   when ((kind_value='CARD' and (counterpart_count>0 or purchase_count>0)) or (kind_value<>'CARD' and counterpart_count=1)) and coalesce(diff,0)=0 and coalesce(purchase_diff,0)=0 then 'EXACT' else 'PARTIAL' end;
 else
  -- Unlink works after archival/revision changes; immutable original evidence stays intact.
  state_value:='PARTIAL';
 end if;
 if not private.is_household_member(h) then return private.account_error('NOT_AUTHORIZED'); end if;
 if expected=0 then insert into finance.reconciliations values(h,ident,1,kind_value,true);
 else update finance.reconciliations set version=expected+1,active=action_value<>'UNLINK' where household_id=h and id=ident; end if;
 insert into finance.reconciliation_decisions values(h,ident,expected+1,member,jsonb_build_object(
  'householdId',h,'id',ident,'version',expected+1,'action',action_value,'kind',kind_value,'reason',btrim(payload->>'reason'),
  'actorMemberId',member,'recordedAt',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'participants',evidence,'fx',fx,'state',state_value,'difference',diff::text,'purchaseDifference',purchase_diff::text),(fx->>'id')::uuid);
 delete from finance.reconciliation_claims where household_id=h and relationship_id=ident;
 for p in select value from jsonb_array_elements(payload->'participants') loop
  insert into finance.reconciliation_participants values(h,ident,expected+1,(p->>'accountId')::uuid,(p->>'transactionId')::uuid,(p->>'revisionId')::uuid);
  insert into finance.reconciliation_claims values(h,(p->>'transactionId')::uuid,(p->>'accountId')::uuid,ident,expected+1);
 end loop;
 result:=jsonb_build_object('ok',true,'id',ident,'version',expected+1);
 insert into private.reconciliation_receipts values(h,payload->>'idempotencyKey',dig,ident,expected+1,result);
 insert into private.reconciliation_audit(household_id,actor_member_id,relationship_id,decision_version,operation) values(h,member,ident,expected+1,action_value);
 return result;
exception when unique_violation then return private.account_error('CONFLICT');
 when lock_not_available or deadlock_detected then return private.account_error('CONFLICT');
 when check_violation or foreign_key_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then return private.account_error('INVALID_INPUT');
 when insufficient_privilege then return private.account_error('NOT_AUTHORIZED');
 when others then return private.account_error('INTERNAL_ERROR');
end;
$$;
create function api.reconcile(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.reconcile(payload);$$;
revoke all on function private.reconcile(jsonb),api.reconcile(jsonb),api.reconciliation_snapshot() from public,anon,authenticated;
grant execute on function private.reconcile(jsonb),api.reconcile(jsonb),api.reconciliation_snapshot() to authenticated;
notify pgrst,'reload schema';
