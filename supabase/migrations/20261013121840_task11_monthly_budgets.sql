-- Explicit planning only. No command below writes any financial evidence.
create table finance.budgets (
 household_id uuid not null references finance.households(id) on delete restrict, id uuid primary key,
 month date not null check(month between date '0001-01-01' and date '9999-11-01' and extract(day from month)=1),
 scope_kind text not null check(scope_kind in ('TOTAL','ALL','SHARED','MEMBER')), member_id uuid, category_id uuid,
 currency text not null check(currency in ('ILS','USD','EUR','JPY','KWD')),
 version integer not null check(version between 1 and 2147483646), status text not null check(status in ('ACTIVE','ARCHIVED')),
 unique(household_id,id),
 check((scope_kind='MEMBER')=(member_id is not null)),
 check(scope_kind<>'TOTAL' or category_id is null), check(scope_kind<>'ALL' or category_id is not null),
 foreign key(household_id,member_id) references finance.household_members(household_id,id) on delete restrict,
 foreign key(household_id,category_id) references finance.categories(household_id,id) on delete restrict
);
create index budget_member_idx on finance.budgets(household_id,member_id);
create index budget_category_idx on finance.budgets(household_id,category_id);
create index budget_month_idx on finance.budgets(household_id,month,status);
create table finance.budget_revisions (
 household_id uuid not null, id uuid not null, version integer not null check(version between 1 and 2147483646),
 actor_member_id uuid not null, category_id uuid, category_version integer, body jsonb not null,
 recorded_at timestamptz not null default clock_timestamp(),
 primary key(household_id,id,version),
 check(private.ledger_money(body->'planned') and (body->'planned'->>'amount')::numeric>=0),
 check((category_id is null)=(category_version is null)),
 foreign key(household_id,id) references finance.budgets(household_id,id) on delete restrict,
 foreign key(household_id,actor_member_id) references finance.household_members(household_id,id) on delete restrict,
 foreign key(household_id,category_id,category_version) references finance.category_versions(household_id,id,version) on delete restrict
);
create index budget_revision_actor_idx on finance.budget_revisions(household_id,actor_member_id);
create index budget_revision_category_idx on finance.budget_revisions(household_id,category_id,category_version);
create trigger budget_revision_immutable before update on finance.budget_revisions for each row execute function private.immutable_transaction();
create table private.budget_receipts (
 household_id uuid not null, idempotency_key text not null, digest bytea not null check(octet_length(digest)=32),
 budget_id uuid not null, version integer not null, result jsonb not null,
 primary key(household_id,idempotency_key),
 foreign key(household_id,budget_id,version) references finance.budget_revisions(household_id,id,version) on delete restrict
);
create index budget_receipt_revision_idx on private.budget_receipts(household_id,budget_id,version);
create table private.budget_audit (
 id bigint generated always as identity primary key, household_id uuid not null, budget_id uuid not null,
 version integer not null, actor_member_id uuid not null, operation text not null check(operation in ('CREATE','EDIT','ARCHIVE')),
 occurred_at timestamptz not null default clock_timestamp(),
 foreign key(household_id,budget_id,version) references finance.budget_revisions(household_id,id,version) on delete restrict,
 foreign key(household_id,actor_member_id) references finance.household_members(household_id,id) on delete restrict
);
create index budget_audit_revision_idx on private.budget_audit(household_id,budget_id,version);
create index budget_audit_actor_idx on private.budget_audit(household_id,actor_member_id);
alter table finance.budgets enable row level security;
alter table finance.budget_revisions enable row level security;
alter table private.budget_receipts enable row level security;
alter table private.budget_audit enable row level security;
create policy budget_read on finance.budgets for select to authenticated using(private.is_household_member(household_id));
create policy budget_revision_read on finance.budget_revisions for select to authenticated using(private.is_household_member(household_id));
revoke all on finance.budgets,finance.budget_revisions,private.budget_receipts,private.budget_audit from public,anon,authenticated;
grant select on finance.budgets,finance.budget_revisions to authenticated;

create function api.budget_snapshot() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare reporting jsonb; s jsonb;
begin
 reporting:=api.reporting_snapshot();
 if reporting->>'ok'<>'true' then return reporting; end if;
 if (select count(*) from finance.budget_revisions)>10000 or (select count(*) from finance.categories)>10000 then return private.account_error('INVALID_INPUT'); end if;
 select jsonb_build_object('reporting',reporting->'snapshot',
 'categories',coalesce((select jsonb_agg(body order by id) from finance.categories),'[]'::jsonb),
 'revisions',coalesce((select jsonb_agg(body order by id,version) from finance.budget_revisions),'[]'::jsonb)) into s;
 s:=s||jsonb_build_object('size',jsonb_array_length(s->'categories')+jsonb_array_length(s->'revisions'));
 if octet_length(s::text)>16777216 then return private.account_error('INVALID_INPUT'); end if;
 return jsonb_build_object('ok',true,'snapshot',s);
end;
$$;

create function private.save_budget(payload jsonb) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='10s' as $$
declare h uuid; ident uuid; actor uuid; owner_id uuid; cat_id uuid; expected integer; action_value text;
 month_value date; kind_value text; currency_value text; planned_value numeric(24,8);
 head finance.budgets; receipt private.budget_receipts; previous jsonb; cat jsonb; dig bytea; result jsonb; stamp timestamptz;
begin
 if not private.has_live_session() then return private.account_error('NOT_AUTHORIZED'); end if;
 if octet_length(payload::text)>4096 or not private.ledger_object(payload,array['id','householdId','month','scope','planned','action','expectedVersion','idempotencyKey'])
 or not private.account_uuid(payload->'id') or not private.account_uuid(payload->'householdId')
 or not private.ledger_money(payload->'planned')
 or not private.ledger_object(payload->'scope',array['kind','memberId','categoryId'])
 or (payload->'scope'->>'kind' in ('TOTAL','ALL','SHARED','MEMBER')) is not true
 or (payload->'scope'->'memberId'<>'null'::jsonb and not private.account_uuid(payload->'scope'->'memberId'))
 or (payload->'scope'->'categoryId'<>'null'::jsonb and not private.account_uuid(payload->'scope'->'categoryId'))
 or jsonb_typeof(payload->'month') is distinct from 'string' or length(payload->>'month')<>7 or (payload->>'month') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
 or (payload->>'action' in ('CREATE','EDIT','ARCHIVE')) is not true
 or jsonb_typeof(payload->'expectedVersion') is distinct from 'number' or (payload->>'expectedVersion') !~ '^(0|[1-9][0-9]{0,9})$'
 or jsonb_typeof(payload->'idempotencyKey') is distinct from 'string' or (payload->>'idempotencyKey') !~ '^[A-Za-z0-9_-]{16,128}$' or (payload->>'idempotencyKey') ~ '[^A-Za-z0-9_-]' then return private.account_error('INVALID_INPUT'); end if;
 h:=(payload->>'householdId')::uuid; ident:=(payload->>'id')::uuid; expected:=(payload->>'expectedVersion')::integer;
 action_value:=payload->>'action'; kind_value:=payload->'scope'->>'kind'; month_value:=((payload->>'month')||'-01')::date;
 currency_value:=payload->'planned'->>'currency'; planned_value:=(payload->'planned'->>'amount')::numeric;
 owner_id:=(payload->'scope'->>'memberId')::uuid; cat_id:=(payload->'scope'->>'categoryId')::uuid;
 if expected not between 0 and 2147483645 or ((action_value='CREATE')<>(expected=0)) or planned_value<0
 or month_value not between date '0001-01-01' and date '9999-11-01'
 or ((kind_value='MEMBER')<>(owner_id is not null)) or (kind_value='TOTAL' and cat_id is not null) or (kind_value='ALL' and cat_id is null) then return private.account_error('INVALID_INPUT'); end if;
 if not private.is_household_member(h) then return private.account_error('NOT_AUTHORIZED'); end if;
 perform 1 from finance.households where id=h for update;
 perform 1 from auth.users where id=auth.uid() for share;
 if not found then return private.account_error('NOT_AUTHORIZED'); end if;
 perform 1 from auth.sessions where id::text=auth.jwt()->>'session_id' and user_id=auth.uid() for share;
 if not found then return private.account_error('NOT_AUTHORIZED'); end if;
 select id into actor from finance.household_members where household_id=h and user_id=auth.uid() and status='ACTIVE' for share;
 if not found or not private.is_household_member(h) then return private.account_error('NOT_AUTHORIZED'); end if;
 dig:=sha256(convert_to(payload::text,'UTF8'));
 select * into receipt from private.budget_receipts where household_id=h and idempotency_key=payload->>'idempotencyKey';
 if found then
  if receipt.digest<>dig then return private.account_error('CONFLICT'); end if;
  return receipt.result;
 end if;
 select * into head from finance.budgets where household_id=h and id=ident;
 if (expected=0 and head.id is not null) or (expected>0 and (head.id is null or head.version<>expected or head.status<>'ACTIVE')) then return private.account_error('CONFLICT'); end if;
 if expected>0 and (head.month<>month_value or head.scope_kind<>kind_value or head.member_id is distinct from owner_id or head.category_id is distinct from cat_id or head.currency<>currency_value) then return private.account_error('INVALID_INPUT'); end if;
 if owner_id is not null and not exists(select 1 from finance.household_members where household_id=h and id=owner_id and (expected>0 or status='ACTIVE')) then return private.account_error('INVALID_INPUT'); end if;
 if cat_id is not null then
  select body into cat from finance.categories where household_id=h and id=cat_id;
  if not found or cat->>'kind'<>'EXPENSE' or (expected=0 and cat->>'status'<>'ACTIVE') then return private.account_error('INVALID_INPUT'); end if;
 end if;
 if action_value='ARCHIVE' then
  select body into previous from finance.budget_revisions where household_id=h and id=ident and version=expected;
  if (previous->'planned'->>'amount')::numeric<>planned_value then return private.account_error('INVALID_INPUT'); end if;
 else
  if exists(select 1 from finance.budgets b where b.household_id=h and b.month=month_value and b.status='ACTIVE' and b.id<>ident and (
   b.currency<>currency_value or
   (kind_value='TOTAL' and b.scope_kind='TOTAL') or
   (kind_value<>'TOTAL' and b.scope_kind<>'TOTAL' and
    (kind_value='ALL' or b.scope_kind='ALL' or (kind_value=b.scope_kind and b.member_id is not distinct from owner_id)) and
    (cat_id is null or b.category_id is null or cat_id=b.category_id)))) then return private.account_error('CONFLICT'); end if;
 end if;
 stamp:=clock_timestamp();
 if expected=0 then insert into finance.budgets values(h,ident,month_value,kind_value,owner_id,cat_id,currency_value,1,'ACTIVE');
 else update finance.budgets set version=expected+1,status=case when action_value='ARCHIVE' then 'ARCHIVED' else 'ACTIVE' end where household_id=h and id=ident; end if;
 insert into finance.budget_revisions values(h,ident,expected+1,actor,cat_id,(cat->>'version')::integer,
 jsonb_build_object('householdId',h,'id',ident,'month',payload->>'month','scope',payload->'scope','planned',jsonb_build_object('amount',trim_scale(planned_value)::text,'currency',currency_value),
 'version',expected+1,'status',case when action_value='ARCHIVE' then 'ARCHIVED' else 'ACTIVE' end,'actorMemberId',actor,
 'recordedAt',to_char(stamp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'category',cat),stamp);
 result:=jsonb_build_object('ok',true,'id',ident,'version',expected+1);
 insert into private.budget_receipts values(h,payload->>'idempotencyKey',dig,ident,expected+1,result);
 insert into private.budget_audit(household_id,budget_id,version,actor_member_id,operation) values(h,ident,expected+1,actor,action_value);
 return result;
exception when unique_violation or lock_not_available or deadlock_detected then return private.account_error('CONFLICT');
 when check_violation or foreign_key_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value or datetime_field_overflow then return private.account_error('INVALID_INPUT');
 when insufficient_privilege then return private.account_error('NOT_AUTHORIZED');
 when others then return private.account_error('INTERNAL_ERROR');
end;
$$;
create function api.save_budget(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.save_budget(payload);$$;
revoke all on function private.save_budget(jsonb),api.save_budget(jsonb),api.budget_snapshot() from public,anon,authenticated;
grant execute on function private.save_budget(jsonb),api.save_budget(jsonb),api.budget_snapshot() to authenticated;
notify pgrst,'reload schema';
