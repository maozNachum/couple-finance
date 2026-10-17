-- Goals are planning declarations only. No financial writer is called.
create table finance.goals (
 household_id uuid not null references finance.households(id) on delete restrict,
 id uuid primary key, ownership_kind text not null check(ownership_kind in ('HOUSEHOLD','MEMBER')),
 member_id uuid, currency text not null check(currency in ('ILS','USD','EUR','JPY','KWD')),
 version integer not null check(version between 1 and 2147483646),
 status text not null check(status in ('ACTIVE','ARCHIVED')), unique(household_id,id),
 check((ownership_kind='MEMBER')=(member_id is not null)),
 foreign key(household_id,member_id) references finance.household_members(household_id,id) on delete restrict
);
create index goal_member_idx on finance.goals(household_id,member_id);
create table finance.goal_revisions (
 household_id uuid not null, id uuid not null, version integer not null check(version between 1 and 2147483646),
 actor_member_id uuid not null, body jsonb not null, recorded_at timestamptz not null default clock_timestamp(),
 primary key(household_id,id,version),
 foreign key(household_id,id) references finance.goals(household_id,id) on delete restrict,
 foreign key(household_id,actor_member_id) references finance.household_members(household_id,id) on delete restrict,
 check(private.ledger_money(body->'target') and (body->'target'->>'amount')::numeric>0),
 check(private.ledger_money(body->'declared') and (body->'declared'->>'amount')::numeric>=0)
);
create index goal_revision_actor_idx on finance.goal_revisions(household_id,actor_member_id);
create table private.goal_receipts (
 household_id uuid not null, idempotency_key text not null, digest bytea not null check(octet_length(digest)=32),
 goal_id uuid not null, version integer not null, result jsonb not null, primary key(household_id,idempotency_key),
 foreign key(household_id,goal_id,version) references finance.goal_revisions(household_id,id,version) on delete restrict
);
create index goal_receipt_revision_idx on private.goal_receipts(household_id,goal_id,version);
create table private.goal_audit (
 id bigint generated always as identity primary key, household_id uuid not null, goal_id uuid not null,
 version integer not null, actor_member_id uuid not null, operation text not null check(operation in ('CREATE','EDIT','ARCHIVE')),
 recorded_at timestamptz not null default clock_timestamp(),
 foreign key(household_id,goal_id,version) references finance.goal_revisions(household_id,id,version) on delete restrict,
 foreign key(household_id,actor_member_id) references finance.household_members(household_id,id) on delete restrict
);
create index goal_audit_revision_idx on private.goal_audit(household_id,goal_id,version);
create index goal_audit_actor_idx on private.goal_audit(household_id,actor_member_id);
alter table finance.goals enable row level security;
alter table finance.goal_revisions enable row level security;
alter table private.goal_receipts enable row level security;
alter table private.goal_audit enable row level security;
create policy goal_read on finance.goals for select to authenticated using(private.is_household_member(household_id));
create policy goal_revision_read on finance.goal_revisions for select to authenticated using(private.is_household_member(household_id));
revoke all on finance.goals,finance.goal_revisions,private.goal_receipts,private.goal_audit from public,anon,authenticated;
grant select on finance.goals,finance.goal_revisions to authenticated;
create trigger goal_revision_immutable before update on finance.goal_revisions for each row execute function private.immutable_transaction();
create trigger goal_receipt_immutable before update on private.goal_receipts for each row execute function private.immutable_transaction();
create trigger goal_audit_immutable before update on private.goal_audit for each row execute function private.immutable_transaction();

create function api.goals_snapshot() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare s jsonb;
begin
 if not private.has_live_session() then return private.account_error('NOT_AUTHORIZED'); end if;
 if (select count(*) from finance.households)>1000 or (select count(*) from finance.household_members)>10000
 or (select count(*) from finance.goal_revisions)>10000 then return private.account_error('INVALID_INPUT'); end if;
 select jsonb_build_object(
 'households',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'createdAt',to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) order by id) from finance.households),'[]'::jsonb),
 'members',coalesce((select jsonb_agg(jsonb_build_object('id',id,'householdId',household_id,'userId',user_id,'displayName',display_name,'status',status) order by id) from finance.household_members),'[]'::jsonb),
 'revisions',coalesce((select jsonb_agg(body order by id,version) from finance.goal_revisions),'[]'::jsonb)) into s;
 s:=s||jsonb_build_object('size',jsonb_array_length(s->'households')+jsonb_array_length(s->'members')+jsonb_array_length(s->'revisions'));
 if octet_length(s::text)>16777216 then return private.account_error('INVALID_INPUT'); end if;
 return jsonb_build_object('ok',true,'snapshot',s);
end;
$$;

create function private.save_goal(payload jsonb) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='10s' as $$
declare h uuid; ident uuid; actor uuid; owner_id uuid; expected integer; action_value text; kind text; currency_value text;
 head finance.goals; receipt private.goal_receipts; previous jsonb; body_value jsonb; result jsonb; stamp timestamptz; dig bytea;
begin
 if not private.has_live_session() then return private.account_error('NOT_AUTHORIZED'); end if;
 if payload is null or octet_length(payload::text)>4096
 or not private.ledger_object(payload,array['id','householdId','ownership','name','target','declared','monthly','targetDate','action','expectedVersion','acknowledge','idempotencyKey'])
 or not private.account_uuid(payload->'id') or not private.account_uuid(payload->'householdId')
 or payload->'acknowledge' is distinct from 'true'::jsonb
 or jsonb_typeof(payload->'name') is distinct from 'string' or length(btrim(payload->>'name')) not between 1 and 100
 or payload->>'name'<>btrim(payload->>'name',U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
 or not private.ledger_money(payload->'target') or (payload->'target'->>'amount')::numeric<=0
 or not private.ledger_money(payload->'declared') or (payload->'declared'->>'amount')::numeric<0
 or payload->'target'->>'currency' is distinct from payload->'declared'->>'currency'
 or (payload->'monthly'<>'null'::jsonb and (not private.ledger_money(payload->'monthly') or (payload->'monthly'->>'amount')::numeric<0 or payload->'monthly'->>'currency' is distinct from payload->'target'->>'currency'))
 or (payload->'targetDate'<>'null'::jsonb and not private.ledger_date(payload->'targetDate'))
 or (payload->>'action' in ('CREATE','EDIT','ARCHIVE')) is not true
 or jsonb_typeof(payload->'expectedVersion') is distinct from 'number' or (payload->>'expectedVersion') !~ '^(0|[1-9][0-9]{0,9})$'
 or jsonb_typeof(payload->'idempotencyKey') is distinct from 'string' or (payload->>'idempotencyKey') !~ '^[A-Za-z0-9_-]{16,128}$' or (payload->>'idempotencyKey') ~ '[^A-Za-z0-9_-]'
 then return private.account_error('INVALID_INPUT'); end if;
 kind:=payload->'ownership'->>'kind';
 if kind='HOUSEHOLD' then
  if not private.ledger_object(payload->'ownership',array['kind']) then return private.account_error('INVALID_INPUT'); end if;
 elsif kind='MEMBER' then
  if not private.ledger_object(payload->'ownership',array['kind','memberId']) or not private.account_uuid(payload->'ownership'->'memberId') then return private.account_error('INVALID_INPUT'); end if;
  owner_id:=(payload->'ownership'->>'memberId')::uuid;
 else return private.account_error('INVALID_INPUT'); end if;
 h:=(payload->>'householdId')::uuid; ident:=(payload->>'id')::uuid; expected:=(payload->>'expectedVersion')::integer;
 action_value:=payload->>'action'; currency_value:=payload->'target'->>'currency';
 if expected not between 0 and 2147483645 or ((action_value='CREATE')<>(expected=0)) then return private.account_error('INVALID_INPUT'); end if;
 if not private.is_household_member(h) then return private.account_error('NOT_AUTHORIZED'); end if;
 -- Same order as existing commands, including Auth deletion order. No financial locks.
 perform 1 from finance.households where id=h for update;
 perform 1 from auth.users where id=auth.uid() for share;
 if not found then return private.account_error('NOT_AUTHORIZED'); end if;
 perform 1 from auth.sessions where id::text=auth.jwt()->>'session_id' and user_id=auth.uid() for share;
 if not found then return private.account_error('NOT_AUTHORIZED'); end if;
 select id into actor from finance.household_members where household_id=h and user_id=auth.uid() and status='ACTIVE' for share;
 -- Existing wall-clock helper rechecks session expiry/ban after lock waits.
 if actor is null or not private.fx_actor_live(h,actor) then return private.account_error('NOT_AUTHORIZED'); end if;
 dig:=sha256(convert_to(payload::text,'UTF8'));
 select * into receipt from private.goal_receipts where household_id=h and idempotency_key=payload->>'idempotencyKey';
 if found then
  if receipt.digest<>dig then return private.account_error('CONFLICT'); end if;
  return receipt.result;
 end if;
 select * into head from finance.goals where household_id=h and id=ident;
 if (expected=0 and head.id is not null) or (expected>0 and (head.id is null or head.version<>expected or head.status<>'ACTIVE')) then return private.account_error('CONFLICT'); end if;
 if expected>0 and (head.ownership_kind<>kind or head.member_id is distinct from owner_id or head.currency<>currency_value) then return private.account_error('INVALID_INPUT'); end if;
 if owner_id is not null then
  perform 1 from finance.household_members where household_id=h and id=owner_id and (expected>0 or status='ACTIVE' and user_id is not null) for share;
  if not found then return private.account_error('INVALID_INPUT'); end if;
 end if;
 if not private.fx_actor_live(h,actor) then return private.account_error('NOT_AUTHORIZED'); end if;
 if (select count(*) from finance.goal_revisions where household_id=h)>=10000 then return private.account_error('INVALID_INPUT'); end if;
 body_value:=jsonb_build_object('id',ident,'householdId',h,'ownership',case when kind='MEMBER' then jsonb_build_object('kind',kind,'memberId',owner_id) else jsonb_build_object('kind',kind) end,
 'name',payload->>'name','targetDate',payload->'targetDate',
 'target',jsonb_build_object('amount',trim_scale((payload->'target'->>'amount')::numeric)::text,'currency',currency_value),
 'declared',jsonb_build_object('amount',trim_scale((payload->'declared'->>'amount')::numeric)::text,'currency',currency_value),
 'monthly',case when payload->'monthly'='null'::jsonb then 'null'::jsonb else jsonb_build_object('amount',trim_scale((payload->'monthly'->>'amount')::numeric)::text,'currency',currency_value) end);
 if action_value='ARCHIVE' then
  select body into previous from finance.goal_revisions where household_id=h and id=ident and version=expected;
  if (previous-array['version','status','actorMemberId','recordedAt']) is distinct from body_value then return private.account_error('INVALID_INPUT'); end if;
 end if;
 stamp:=clock_timestamp();
 body_value:=body_value||jsonb_build_object('version',expected+1,
 'status',case when action_value='ARCHIVE' then 'ARCHIVED' else 'ACTIVE' end,'actorMemberId',actor,
 'recordedAt',to_char(stamp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'));
 if expected=0 then insert into finance.goals values(h,ident,kind,owner_id,currency_value,1,'ACTIVE');
 else update finance.goals set version=expected+1,status=body_value->>'status' where household_id=h and id=ident; end if;
 insert into finance.goal_revisions values(h,ident,expected+1,actor,body_value,stamp);
 result:=jsonb_build_object('ok',true,'id',ident,'version',expected+1);
 insert into private.goal_receipts values(h,payload->>'idempotencyKey',dig,ident,expected+1,result);
 insert into private.goal_audit(household_id,goal_id,version,actor_member_id,operation) values(h,ident,expected+1,actor,action_value);
 return result;
exception when unique_violation or lock_not_available or deadlock_detected then return private.account_error('CONFLICT');
 when check_violation or foreign_key_violation or not_null_violation or invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value or datetime_field_overflow then return private.account_error('INVALID_INPUT');
 when insufficient_privilege then return private.account_error('NOT_AUTHORIZED');
 when others then return private.account_error('INTERNAL_ERROR');
end;
$$;
create function api.save_goal(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.save_goal(payload);$$;
revoke all on function private.save_goal(jsonb),api.save_goal(jsonb),api.goals_snapshot() from public,anon,authenticated;
grant execute on function private.save_goal(jsonb),api.save_goal(jsonb),api.goals_snapshot() to authenticated;
notify pgrst,'reload schema';
