-- Planning decisions only; no financial writer, balance or budget mutation.
create table finance.obligations (
 household_id uuid not null references finance.households(id) on delete restrict, id uuid primary key,
 account_id uuid not null, member_id uuid, currency text not null,
 version integer not null check(version between 1 and 2147483646), status text not null check(status in ('ACTIVE','ARCHIVED','CANCELLED')),
 unique(household_id,id),
 foreign key(household_id,account_id,currency) references finance.accounts(household_id,id,currency) on delete restrict,
 foreign key(household_id,member_id) references finance.household_members(household_id,id) on delete restrict
);
create index obligation_account_idx on finance.obligations(household_id,account_id,currency);
create index obligation_member_idx on finance.obligations(household_id,member_id);
create table finance.obligation_revisions (
 household_id uuid not null, id uuid not null, version integer not null check(version between 1 and 2147483646),
 actor_member_id uuid not null, effective_from date not null check(effective_from between date '0001-01-01' and date '9999-12-31'), body jsonb not null,
 primary key(household_id,id,version),
 foreign key(household_id,id) references finance.obligations(household_id,id) on delete restrict,
 foreign key(household_id,actor_member_id) references finance.household_members(household_id,id) on delete restrict
);
create index obligation_actor_idx on finance.obligation_revisions(household_id,actor_member_id);
create table finance.candidate_rejections (
 household_id uuid not null references finance.households(id) on delete restrict, id uuid primary key, actor_member_id uuid not null, body jsonb not null,
 unique(household_id,id), foreign key(household_id,actor_member_id) references finance.household_members(household_id,id) on delete restrict
);
create index candidate_rejection_actor_idx on finance.candidate_rejections(household_id,actor_member_id);
create table finance.obligation_origins (
 household_id uuid not null, obligation_id uuid, rejection_id uuid, account_id uuid not null, transaction_id uuid not null, revision_id uuid not null, allocation_id uuid not null,
 check((obligation_id is null)<>(rejection_id is null)),
 foreign key(household_id,obligation_id) references finance.obligations(household_id,id) on delete restrict,
 foreign key(household_id,rejection_id) references finance.candidate_rejections(household_id,id) on delete restrict,
 foreign key(household_id,account_id,transaction_id,revision_id) references finance.transaction_revisions(household_id,account_id,transaction_id,revision_id) on delete restrict,
 foreign key(revision_id,allocation_id) references finance.transaction_allocations(revision_id,id) on delete restrict
);
create unique index obligation_origin_unique_idx on finance.obligation_origins(household_id,obligation_id,transaction_id) where obligation_id is not null;
create unique index obligation_confirmation_evidence_idx on finance.obligation_origins(household_id,transaction_id,revision_id,allocation_id) where obligation_id is not null;
create unique index rejection_origin_unique_idx on finance.obligation_origins(household_id,rejection_id,transaction_id) where rejection_id is not null;
create index obligation_origin_revision_idx on finance.obligation_origins(household_id,account_id,transaction_id,revision_id);
create index obligation_origin_allocation_idx on finance.obligation_origins(revision_id,allocation_id);
create table finance.obligation_payment_heads (
 household_id uuid not null, id uuid primary key, obligation_id uuid not null, obligation_version integer not null, occurrence_date date not null,
 version integer not null check(version between 1 and 2147483646), active boolean not null,
 unique(household_id,id), unique(household_id,obligation_id,obligation_version,occurrence_date),
 foreign key(household_id,obligation_id,obligation_version) references finance.obligation_revisions(household_id,id,version) on delete restrict
);
create table finance.obligation_payment_decisions (
 household_id uuid not null, id uuid not null, version integer not null check(version between 1 and 2147483646), actor_member_id uuid not null,
 account_id uuid, transaction_id uuid, revision_id uuid, allocation_id uuid, body jsonb not null,
 primary key(household_id,id,version), check((account_id is null)=(transaction_id is null) and (account_id is null)=(revision_id is null) and (account_id is null)=(allocation_id is null)),
 foreign key(household_id,id) references finance.obligation_payment_heads(household_id,id) on delete restrict,
 foreign key(household_id,actor_member_id) references finance.household_members(household_id,id) on delete restrict,
 foreign key(household_id,account_id,transaction_id,revision_id) references finance.transaction_revisions(household_id,account_id,transaction_id,revision_id) on delete restrict,
 foreign key(revision_id,allocation_id) references finance.transaction_allocations(revision_id,id) on delete restrict
);
create index obligation_payment_actor_idx on finance.obligation_payment_decisions(household_id,actor_member_id);
create index obligation_payment_revision_idx on finance.obligation_payment_decisions(household_id,account_id,transaction_id,revision_id);
create index obligation_payment_allocation_idx on finance.obligation_payment_decisions(revision_id,allocation_id);
create table finance.obligation_payment_claims (
 household_id uuid not null, account_id uuid not null, transaction_id uuid not null, payment_id uuid not null, payment_version integer not null,
 primary key(household_id,transaction_id),
 foreign key(household_id,account_id,transaction_id) references finance.transactions(household_id,account_id,id) on delete restrict,
 foreign key(household_id,payment_id,payment_version) references finance.obligation_payment_decisions(household_id,id,version) on delete restrict
);
create index obligation_claim_account_idx on finance.obligation_payment_claims(household_id,account_id,transaction_id);
create index obligation_claim_decision_idx on finance.obligation_payment_claims(household_id,payment_id,payment_version);
create table private.obligation_receipts (
 household_id uuid not null references finance.households(id) on delete restrict, idempotency_key text not null, digest bytea not null check(octet_length(digest)=32), result jsonb not null,
 primary key(household_id,idempotency_key)
);
create table private.obligation_audit (
 id bigint generated always as identity primary key, household_id uuid not null references finance.households(id) on delete restrict,
 decision_id uuid not null, version integer not null, actor_member_id uuid not null, operation text not null check(operation in ('CONFIRM','EDIT','ARCHIVE','CANCEL','LINK','UNLINK','REJECT')),
 occurred_at timestamptz not null default clock_timestamp(),
 foreign key(household_id,actor_member_id) references finance.household_members(household_id,id) on delete restrict
);
create index obligation_audit_actor_idx on private.obligation_audit(household_id,actor_member_id);

alter table finance.obligations enable row level security;
alter table finance.obligation_revisions enable row level security;
alter table finance.candidate_rejections enable row level security;
alter table finance.obligation_origins enable row level security;
alter table finance.obligation_payment_heads enable row level security;
alter table finance.obligation_payment_decisions enable row level security;
alter table finance.obligation_payment_claims enable row level security;
alter table private.obligation_receipts enable row level security;
alter table private.obligation_audit enable row level security;
create policy obligation_read on finance.obligations for select to authenticated using(private.is_household_member(household_id));
create policy obligation_revision_read on finance.obligation_revisions for select to authenticated using(private.is_household_member(household_id));
create policy rejection_read on finance.candidate_rejections for select to authenticated using(private.is_household_member(household_id));
create policy obligation_origin_read on finance.obligation_origins for select to authenticated using(private.is_household_member(household_id));
create policy obligation_payment_head_read on finance.obligation_payment_heads for select to authenticated using(private.is_household_member(household_id));
create policy obligation_payment_read on finance.obligation_payment_decisions for select to authenticated using(private.is_household_member(household_id));
create policy obligation_claim_read on finance.obligation_payment_claims for select to authenticated using(private.is_household_member(household_id));
revoke all on finance.obligations,finance.obligation_revisions,finance.candidate_rejections,finance.obligation_origins,finance.obligation_payment_heads,finance.obligation_payment_decisions,finance.obligation_payment_claims,private.obligation_receipts,private.obligation_audit from public,anon,authenticated;
grant select on finance.obligations,finance.obligation_revisions,finance.candidate_rejections,finance.obligation_origins,finance.obligation_payment_heads,finance.obligation_payment_decisions,finance.obligation_payment_claims to authenticated;
create trigger obligation_revision_immutable before update on finance.obligation_revisions for each row execute function private.immutable_transaction();
create trigger rejection_immutable before update on finance.candidate_rejections for each row execute function private.immutable_transaction();
create trigger obligation_origin_immutable before update on finance.obligation_origins for each row execute function private.immutable_transaction();
create trigger obligation_payment_immutable before update on finance.obligation_payment_decisions for each row execute function private.immutable_transaction();

create function api.obligations_snapshot() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare report jsonb; s jsonb; n bigint;
begin
 report:=api.reporting_snapshot(); if report->>'ok'<>'true' then return report; end if;
 select (select count(*) from finance.obligation_revisions)+(select count(*) from finance.obligation_payment_decisions)+(select count(*) from finance.candidate_rejections) into n;
 if n>10000 or (select count(*) from finance.obligation_origins)>100000 then return private.account_error('INVALID_INPUT'); end if;
 select jsonb_build_object('reporting',report->'snapshot','size',n,
 'revisions',coalesce((select jsonb_agg(body order by id,version) from finance.obligation_revisions),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(body order by id,version) from finance.obligation_payment_decisions),'[]'::jsonb),
 'rejections',coalesce((select jsonb_agg(body order by id) from finance.candidate_rejections),'[]'::jsonb)) into s;
 if octet_length(s::text)>16777216 then return private.account_error('INVALID_INPUT'); end if;
 return jsonb_build_object('ok',true,'snapshot',s);
end;
$$;

-- Internal validators do not grant a read or write surface. Caller holds household/Auth/account locks.
create function private.obligation_plan_valid(p jsonb) returns boolean language plpgsql stable set search_path='' as $$
begin
 return private.ledger_object(p,array['name','accountId','ownership','money','effect','schedule','startDate','endDate'])
 and jsonb_typeof(p->'name')='string' and length(btrim(p->>'name')) between 1 and 120 and private.account_uuid(p->'accountId')
 and private.ledger_owner(p->'ownership') and private.ledger_money(p->'money') and (p->'money'->>'amount')::numeric>0
 and p->>'effect'='EXPENSE' and private.ledger_object(p->'schedule',array['frequency','day']) and p->'schedule'->>'frequency'='MONTHLY'
 and jsonb_typeof(p->'schedule'->'day')='number' and (p->'schedule'->>'day') ~ '^[1-9][0-9]?$' and (p->'schedule'->>'day')::integer between 1 and 31
 and private.ledger_date(p->'startDate') and (p->'endDate'='null'::jsonb or private.ledger_date(p->'endDate') and p->>'endDate'>=p->>'startDate');
exception when others then return false;
end;
$$;
create function private.obligation_evidence(h uuid,e jsonb) returns jsonb language plpgsql stable set search_path='' as $$
declare a finance.accounts; r finance.transaction_revisions; part jsonb;
begin
 if not private.ledger_object(e,array['accountId','accountVersion','transactionId','revisionId','transactionVersion','allocationId'])
 or not private.account_uuid(e->'accountId') or not private.account_uuid(e->'transactionId') or not private.account_uuid(e->'revisionId') or not private.account_uuid(e->'allocationId')
 or jsonb_typeof(e->'accountVersion') is distinct from 'number' or (e->>'accountVersion') !~ '^[1-9][0-9]{0,9}$'
 or jsonb_typeof(e->'transactionVersion') is distinct from 'number' or (e->>'transactionVersion') !~ '^[1-9][0-9]{0,9}$' then return null; end if;
 select * into a from finance.accounts where household_id=h and id=(e->>'accountId')::uuid;
 select * into r from finance.transaction_revisions where household_id=h and account_id=a.id and transaction_id=(e->>'transactionId')::uuid order by version desc limit 1;
 if a.id is null or a.version<>(e->>'accountVersion')::integer or a.status<>'ACTIVE' or r.revision_id is distinct from (e->>'revisionId')::uuid or r.version<>(e->>'transactionVersion')::integer or r.status<>'POSTED'
 or not exists(select 1 from finance.transactions where household_id=h and id=r.transaction_id and entry_kind='MOVEMENT') then return null; end if;
 select payload into part from finance.transaction_allocations where household_id=h and account_id=a.id and revision_id=r.revision_id and id=(e->>'allocationId')::uuid;
 if part is null or part->>'effect'<>'EXPENSE' or (part->'money'->>'amount')::numeric>=0 then return null; end if;
 if exists(select 1 from finance.reconciliations root join finance.reconciliation_decisions d on d.household_id=root.household_id and d.id=root.id and d.version=root.version,
 lateral jsonb_array_elements(d.body->'participants') p where root.household_id=h and root.active and root.kind='CARD' and p->'selection'->>'transactionId'=r.transaction_id::text and p->'selection'->>'role'<>'PURCHASE') then return null; end if;
 return part;
exception when others then return null;
end;
$$;
revoke all on function private.obligation_plan_valid(jsonb),private.obligation_evidence(uuid,jsonb) from public,anon,authenticated;

create function private.obligation_command(payload jsonb) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='10s' as $$
declare h uuid; ident uuid; actor uuid; expected integer; action_value text; dig bytea; receipt private.obligation_receipts; stamp text;
 p jsonb; previous jsonb; e jsonb; part jsonb; origin jsonb; account_value uuid; owner_id uuid;
 head finance.obligations; link finance.obligation_payment_heads; target finance.obligation_revisions;
 result jsonb; body_value jsonb; effective date; occurrence date; last_day integer; state_value text; amount_value numeric; account_row finance.accounts;
begin
 if not private.has_live_session() then return private.account_error('NOT_AUTHORIZED'); end if;
 if octet_length(payload::text)>65536 or jsonb_typeof(payload) is distinct from 'object' or not private.account_uuid(payload->'householdId') or not private.account_uuid(payload->'id')
 or payload->'acknowledge' is distinct from 'true'::jsonb or jsonb_typeof(payload->'expectedVersion') is distinct from 'number' or (payload->>'expectedVersion') !~ '^(0|[1-9][0-9]{0,9})$'
 or jsonb_typeof(payload->'idempotencyKey') is distinct from 'string' or (payload->>'idempotencyKey') !~ '^[A-Za-z0-9_-]{16,128}$' or (payload->>'idempotencyKey') ~ '[^A-Za-z0-9_-]'
 or (payload->>'action' in ('CONFIRM','EDIT','ARCHIVE','CANCEL','LINK','UNLINK','REJECT')) is not true then return private.account_error('INVALID_INPUT'); end if;
 h:=(payload->>'householdId')::uuid; ident:=(payload->>'id')::uuid; expected:=(payload->>'expectedVersion')::integer; action_value:=payload->>'action';
 if expected not between 0 and 2147483645 then return private.account_error('INVALID_INPUT'); end if;
 if not private.is_household_member(h) then return private.account_error('NOT_AUTHORIZED'); end if;
 perform 1 from finance.households where id=h for update;
 perform 1 from auth.users where id=auth.uid() for share; if not found then return private.account_error('NOT_AUTHORIZED'); end if;
 perform 1 from auth.sessions where id::text=auth.jwt()->>'session_id' and user_id=auth.uid() for share; if not found then return private.account_error('NOT_AUTHORIZED'); end if;
 select id into actor from finance.household_members where household_id=h and user_id=auth.uid() and status='ACTIVE' for share;
 if not found or not private.is_household_member(h) then return private.account_error('NOT_AUTHORIZED'); end if;
 dig:=sha256(convert_to(payload::text,'UTF8'));
 select * into receipt from private.obligation_receipts where household_id=h and idempotency_key=payload->>'idempotencyKey';
 if found then if receipt.digest<>dig then return private.account_error('CONFLICT'); end if; return receipt.result; end if;
 stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
 if action_value in ('CONFIRM','EDIT','ARCHIVE','CANCEL') then
  if not private.ledger_object(payload,array['householdId','id','expectedVersion','idempotencyKey','acknowledge','action','plan','effectiveFrom','origin'])
  or private.obligation_plan_valid(payload->'plan') is not true or not private.ledger_date(payload->'effectiveFrom') or jsonb_typeof(payload->'origin') is distinct from 'array' or jsonb_array_length(payload->'origin')>100
  or ((action_value='CONFIRM')<>(expected=0)) then return private.account_error('INVALID_INPUT'); end if;
  p:=payload->'plan'; origin:=payload->'origin'; effective:=(payload->>'effectiveFrom')::date; account_value:=(p->>'accountId')::uuid; owner_id:=(p->'ownership'->>'memberId')::uuid;
  if effective<(p->>'startDate')::date or action_value='CONFIRM' and effective<>(p->>'startDate')::date then return private.account_error('INVALID_INPUT'); end if;
  select * into account_row from finance.accounts where household_id=h and id=account_value for update;
  if not found or (account_row.status<>'ACTIVE' and action_value not in ('ARCHIVE','CANCEL')) or account_row.currency<>p->'money'->>'currency' then return private.account_error('INVALID_INPUT'); end if;
  select * into head from finance.obligations where household_id=h and id=ident;
  if expected=0 and head.id is not null or expected>0 and (head.id is null or head.version<>expected or head.status<>'ACTIVE') then return private.account_error('CONFLICT'); end if;
  if expected>0 then
   select body into previous from finance.obligation_revisions where household_id=h and id=ident and version=expected;
   if head.account_id<>account_value or head.currency<>p->'money'->>'currency' or previous->'plan'->'ownership'<>p->'ownership' or previous->'origin'<>origin
   or effective<=(previous->>'effectiveFrom')::date or action_value in ('ARCHIVE','CANCEL') and previous->'plan'<>p then return private.account_error('INVALID_INPUT'); end if;
   -- A schedule edit cannot silently orphan a previously reviewed active actual-payment link.
   if exists(select 1 from finance.obligation_payment_heads where household_id=h and obligation_id=ident and active and occurrence_date>=effective) then return private.account_error('CONFLICT'); end if;
  end if;
  if owner_id is not null and not exists(select 1 from finance.household_members where household_id=h and id=owner_id and (expected>0 or status='ACTIVE')) then return private.account_error('INVALID_INPUT'); end if;
  if expected=0 then
   if jsonb_array_length(origin) in (1,2) or (select count(distinct v->>'transactionId') from jsonb_array_elements(origin) v)<>jsonb_array_length(origin) then return private.account_error('INVALID_INPUT'); end if;
   for e in select value from jsonb_array_elements(origin) loop
    part:=private.obligation_evidence(h,e);
    if part is null or e->>'accountId'<>p->>'accountId' or part->'ownership'<>p->'ownership' or part->'money'->>'currency'<>p->'money'->>'currency' then return private.account_error('CONFLICT'); end if;
   end loop;
   insert into finance.obligations values(h,ident,account_value,owner_id,p->'money'->>'currency',1,'ACTIVE');
   for e in select value from jsonb_array_elements(origin) loop
    insert into finance.obligation_origins values(h,ident,null,(e->>'accountId')::uuid,(e->>'transactionId')::uuid,(e->>'revisionId')::uuid,(e->>'allocationId')::uuid);
   end loop;
  else update finance.obligations set version=expected+1,status=case action_value when 'ARCHIVE' then 'ARCHIVED' when 'CANCEL' then 'CANCELLED' else 'ACTIVE' end where household_id=h and id=ident; end if;
  p:=jsonb_set(p,'{money,amount}',to_jsonb(trim_scale((p->'money'->>'amount')::numeric)::text));
  body_value:=jsonb_build_object('householdId',h,'id',ident,'version',expected+1,'plan',p,'origin',origin,'effectiveFrom',payload->>'effectiveFrom','status',case action_value when 'ARCHIVE' then 'ARCHIVED' when 'CANCEL' then 'CANCELLED' else 'ACTIVE' end,'actorMemberId',actor,'recordedAt',stamp);
  insert into finance.obligation_revisions values(h,ident,expected+1,actor,effective,body_value);
 elsif action_value in ('LINK','UNLINK') then
  if not private.ledger_object(payload,array['householdId','id','expectedVersion','idempotencyKey','acknowledge','action','obligationId','obligationVersion','expectedObligationVersion','date','evidence'])
  or not private.account_uuid(payload->'obligationId') or not private.ledger_date(payload->'date')
  or jsonb_typeof(payload->'obligationVersion') is distinct from 'number' or (payload->>'obligationVersion') !~ '^[1-9][0-9]{0,9}$'
  or jsonb_typeof(payload->'expectedObligationVersion') is distinct from 'number' or (payload->>'expectedObligationVersion') !~ '^[1-9][0-9]{0,9}$' then return private.account_error('INVALID_INPUT'); end if;
  select * into head from finance.obligations where household_id=h and id=(payload->>'obligationId')::uuid;
  if not found or head.version<>(payload->>'expectedObligationVersion')::integer then return private.account_error('CONFLICT'); end if;
  select * into target from finance.obligation_revisions where household_id=h and id=head.id and version=(payload->>'obligationVersion')::integer;
  if not found then return private.account_error('INVALID_INPUT'); end if;
  p:=target.body->'plan'; occurrence:=(payload->>'date')::date;
  select * into link from finance.obligation_payment_heads where household_id=h and id=ident;
  if expected=0 and link.id is not null or expected>0 and (link.id is null or link.version<>expected or link.obligation_id<>head.id or link.obligation_version<>target.version or link.occurrence_date<>occurrence or link.active<>(action_value='UNLINK')) then return private.account_error('CONFLICT'); end if;
  if action_value='UNLINK' then
   if expected=0 or payload->'evidence'<>'null'::jsonb then return private.account_error('INVALID_INPUT'); end if;
   delete from finance.obligation_payment_claims where household_id=h and payment_id=ident;
   state_value:='UNLINKED';
  else
   account_value:=head.account_id; perform 1 from finance.accounts where household_id=h and id=account_value for update;
   e:=payload->'evidence'; part:=private.obligation_evidence(h,e);
   if part is null then return private.account_error('CONFLICT'); end if;
   if e->>'accountId'<>account_value::text or part->'ownership'<>p->'ownership' or part->'money'->>'currency'<>head.currency then return private.account_error('INVALID_INPUT'); end if;
   last_day:=extract(day from (date_trunc('month',occurrence::timestamp)+interval '1 month - 1 day'));
   if target.body->>'status'<>'ACTIVE' or occurrence<target.effective_from or occurrence<(p->>'startDate')::date or p->'endDate'<>'null'::jsonb and occurrence>(p->>'endDate')::date
   or extract(day from occurrence)<>least((p->'schedule'->>'day')::integer,last_day)
   or exists(select 1 from finance.obligation_revisions where household_id=h and id=head.id and version=target.version+1 and effective_from<=occurrence) then return private.account_error('INVALID_INPUT'); end if;
   if exists(select 1 from finance.obligation_payment_claims where household_id=h and transaction_id=(e->>'transactionId')::uuid) then return private.account_error('CONFLICT'); end if;
   amount_value:=-(part->'money'->>'amount')::numeric;
   state_value:=case when amount_value=(p->'money'->>'amount')::numeric then 'ASSOCIATED' when amount_value<(p->'money'->>'amount')::numeric then 'PARTIAL' else 'AMBIGUOUS' end;
  end if;
  if expected=0 then insert into finance.obligation_payment_heads values(h,ident,head.id,target.version,occurrence,1,true);
  else update finance.obligation_payment_heads set version=expected+1,active=action_value='LINK' where household_id=h and id=ident; end if;
  body_value:=jsonb_build_object('householdId',h,'id',ident,'version',expected+1,'obligationId',head.id,'obligationVersion',target.version,'date',payload->>'date','action',action_value,'evidence',case when action_value='LINK' then e else 'null'::jsonb end,
   'actual',case when action_value='LINK' then jsonb_build_object('amount',trim_scale(amount_value)::text,'currency',head.currency) else 'null'::jsonb end,'state',state_value,'actorMemberId',actor,'recordedAt',stamp);
  insert into finance.obligation_payment_decisions values(h,ident,expected+1,actor,case when action_value='LINK' then account_value end,case when action_value='LINK' then (e->>'transactionId')::uuid end,case when action_value='LINK' then (e->>'revisionId')::uuid end,case when action_value='LINK' then (e->>'allocationId')::uuid end,body_value);
  if action_value='LINK' then insert into finance.obligation_payment_claims values(h,account_value,(e->>'transactionId')::uuid,ident,expected+1); end if;
 else
  if not private.ledger_object(payload,array['householdId','id','expectedVersion','idempotencyKey','acknowledge','action','evidence']) or expected<>0
  or jsonb_typeof(payload->'evidence') is distinct from 'array' or jsonb_array_length(payload->'evidence') not between 3 and 100
  or (select count(distinct v->>'transactionId') from jsonb_array_elements(payload->'evidence') v)<>jsonb_array_length(payload->'evidence') then return private.account_error('INVALID_INPUT'); end if;
  perform 1 from finance.accounts where household_id=h and id in (select (v->>'accountId')::uuid from jsonb_array_elements(payload->'evidence') v) order by id for update;
  for e in select value from jsonb_array_elements(payload->'evidence') loop
   if private.obligation_evidence(h,e) is null then return private.account_error('CONFLICT'); end if;
  end loop;
  insert into finance.candidate_rejections values(h,ident,actor,jsonb_build_object('householdId',h,'id',ident,'evidence',payload->'evidence','actorMemberId',actor,'recordedAt',stamp));
  for e in select value from jsonb_array_elements(payload->'evidence') loop
   insert into finance.obligation_origins values(h,null,ident,(e->>'accountId')::uuid,(e->>'transactionId')::uuid,(e->>'revisionId')::uuid,(e->>'allocationId')::uuid);
  end loop;
 end if;
 result:=jsonb_build_object('ok',true,'id',ident,'version',expected+1);
 insert into private.obligation_receipts values(h,payload->>'idempotencyKey',dig,result);
 insert into private.obligation_audit(household_id,decision_id,version,actor_member_id,operation) values(h,ident,expected+1,actor,action_value);
 return result;
exception when unique_violation or lock_not_available or deadlock_detected then return private.account_error('CONFLICT');
 when check_violation or foreign_key_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value or datetime_field_overflow then return private.account_error('INVALID_INPUT');
 when insufficient_privilege then return private.account_error('NOT_AUTHORIZED');
 when others then return private.account_error('INTERNAL_ERROR');
end;
$$;
create function api.obligation_command(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.obligation_command(payload);$$;
revoke all on function private.obligation_command(jsonb),api.obligation_command(jsonb),api.obligations_snapshot() from public,anon,authenticated;
grant execute on function private.obligation_command(jsonb),api.obligation_command(jsonb),api.obligations_snapshot() to authenticated;
notify pgrst,'reload schema';
