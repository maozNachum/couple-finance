-- Task 7 staging only. No canonical financial write grants or commands change.
create table finance.import_uploads (
 id uuid primary key, household_id uuid not null, account_id uuid not null, source_id uuid not null,
 member_id uuid not null, filename text not null check(length(filename) between 1 and 160 and filename ~* '\.csv$'),
 bytes integer not null check(bytes between 1 and 1048576),
 object_path text generated always as (household_id::text||'/'||id::text||'.csv') stored unique,
 created_at timestamptz not null default clock_timestamp(), expires_at timestamptz not null default (clock_timestamp()+interval '24 hours'),
 cancelled boolean not null default false, process_checks integer not null default 0 check(process_checks between 0 and 100),
 foreign key(household_id,account_id,source_id) references finance.account_sources(household_id,account_id,id) on delete restrict,
 foreign key(household_id,member_id) references finance.household_members(household_id,id) on delete restrict
);
create index import_source_idx on finance.import_uploads(household_id,account_id,source_id);
create index import_member_idx on finance.import_uploads(household_id,member_id);
create table private.import_audit (
 id bigint generated always as identity primary key, upload_id uuid not null, household_id uuid not null,
 actor_id uuid, operation text not null, occurred_at timestamptz not null default clock_timestamp()
);
alter table finance.import_uploads enable row level security;
alter table private.import_audit enable row level security;
revoke all on finance.import_uploads,private.import_audit from public,anon,authenticated;
grant select on finance.import_uploads to authenticated;
create policy import_read on finance.import_uploads for select to authenticated using(private.is_household_member(household_id));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('import-preview','import-preview',false,1048576,array['text/csv']);

create function private.import_object_access(p text, action text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from finance.import_uploads u where u.object_path=p and private.is_household_member(u.household_id)
 and case when action='DELETE' then u.cancelled or u.expires_at<=now()
 else not u.cancelled and u.expires_at>now() end);
$$;
revoke all on function private.import_object_access(text,text) from public,anon,authenticated;
grant execute on function private.import_object_access(text,text) to authenticated;
create policy import_object_insert on storage.objects for insert to authenticated
 with check(bucket_id='import-preview' and storage.allow_only_operation('object.upload') and private.import_object_access(name,'UPLOAD'));
create policy import_object_read on storage.objects for select to authenticated
 using(bucket_id='import-preview' and ((storage.allow_any_operation(array['object.list','object.list_v2','object.get_authenticated','object.get_authenticated_info','object.head_authenticated_info']) and private.import_object_access(name,'READ')) or (storage.allow_any_operation(array['object.delete','object.delete_many']) and private.import_object_access(name,'DELETE'))));
-- Cancelled data is selectable only during Storage deletion, never authenticated GET or signing.
-- Signed URLs and signed/resumable upload operations are deliberately excluded.
create policy import_object_delete on storage.objects for delete to authenticated
 using(bucket_id='import-preview' and private.import_object_access(name,'DELETE'));
-- No UPDATE policy: replacement, metadata edits and reassignment are forbidden.

create function private.import_object_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare u finance.import_uploads;
begin
 if (case when tg_op='DELETE' then old.bucket_id else new.bucket_id end)='import-preview' then
  select * into u from finance.import_uploads where object_path=(case when tg_op='DELETE' then old.name else new.name end);
  if found then insert into private.import_audit(upload_id,household_id,actor_id,operation) values(u.id,u.household_id,auth.uid(),case when tg_op='DELETE' then 'OBJECT_DELETED' else 'OBJECT_UPLOADED' end); end if;
 end if;
 return null;
end $$;
revoke all on function private.import_object_audit() from public,anon,authenticated;
create trigger import_object_audit after insert or delete on storage.objects for each row execute function private.import_object_audit();

create function private.import_record(u finance.import_uploads) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',u.id,'householdId',u.household_id,'accountId',u.account_id,'sourceId',u.source_id,'filename',u.filename,'bytes',u.bytes,'path',u.object_path,
 'expiresAt',u.expires_at,'state',case when u.cancelled then 'CANCELLED' when u.expires_at<=now() then 'EXPIRED' when exists(select 1 from storage.objects where bucket_id='import-preview' and name=u.object_path) then 'UPLOADED' else 'AUTHORIZED' end);
$$;
revoke all on function private.import_record(finance.import_uploads) from public,anon,authenticated;
create function private.import_command(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u finance.import_uploads; h uuid; a uuid; s uuid; ident uuid; member uuid; op text; result jsonb;
begin
 if not private.has_live_session() then return private.account_error('NOT_AUTHORIZED'); end if;
 op:=payload->>'action';
 if op not in ('AUTHORIZE','PROCESS','CANCEL','FORGET') or not private.account_uuid(payload->'id') then return private.account_error('INVALID_INPUT'); end if;
 ident:=(payload->>'id')::uuid;
 if op='AUTHORIZE' then
  if not private.ledger_object(payload,array['action','id','householdId','accountId','sourceId','filename','bytes']) or not private.account_uuid(payload->'householdId') or not private.account_uuid(payload->'accountId') or not private.account_uuid(payload->'sourceId')
  or jsonb_typeof(payload->'filename') is distinct from 'string' or length(payload->>'filename') not between 1 and 160 or (payload->>'filename') !~* '\.csv$'
  or jsonb_typeof(payload->'bytes') is distinct from 'number' or (payload->>'bytes') !~ '^[0-9]{1,7}$' or (payload->>'bytes')::integer not between 1 and 1048576 then return private.account_error('INVALID_INPUT'); end if;
  h:=(payload->>'householdId')::uuid; a:=(payload->>'accountId')::uuid; s:=(payload->>'sourceId')::uuid;
  if not private.is_household_member(h) then return private.account_error('NOT_AUTHORIZED'); end if;
  perform 1 from finance.households where id=h for update;
  if not private.is_household_member(h) then return private.account_error('NOT_AUTHORIZED'); end if;
  select * into u from finance.import_uploads where id=ident;
  if found then
   if u.household_id<>h or u.account_id<>a or u.source_id<>s or u.filename<>payload->>'filename' or u.bytes<>(payload->>'bytes')::integer or u.cancelled or u.expires_at<=now() then return private.account_error('CONFLICT'); end if;
   return jsonb_build_object('ok',true,'upload',private.import_record(u));
  end if;
  if not exists(select 1 from finance.accounts ac join finance.account_sources src on src.household_id=ac.household_id and src.account_id=ac.id where ac.household_id=h and ac.id=a and src.id=s and ac.status='ACTIVE') then return private.account_error('INVALID_INPUT'); end if;
  if (select count(*) from finance.import_uploads where household_id=h)>=20 then return private.account_error('CONFLICT'); end if;
  select id into member from finance.household_members where household_id=h and user_id=auth.uid() and status='ACTIVE';
  insert into finance.import_uploads(id,household_id,account_id,source_id,member_id,filename,bytes) values(ident,h,a,s,member,payload->>'filename',(payload->>'bytes')::integer) returning * into u;
 else
  if not private.ledger_object(payload,array['action','id']) then return private.account_error('INVALID_INPUT'); end if;
  select * into u from finance.import_uploads where id=ident for update;
  if not found or not private.is_household_member(u.household_id) then return private.account_error('NOT_AUTHORIZED'); end if;
  if op='CANCEL' then if u.cancelled then return jsonb_build_object('ok',true,'upload',private.import_record(u)); end if; update finance.import_uploads set cancelled=true where id=ident returning * into u;
  elsif op='FORGET' then
   if (not u.cancelled and u.expires_at>now()) or exists(select 1 from storage.objects where bucket_id='import-preview' and name=u.object_path) then return private.account_error('CONFLICT'); end if;
   delete from finance.import_uploads where id=ident;
  elsif u.process_checks>=100 or u.cancelled or u.expires_at<=now() or not exists(select 1 from storage.objects where bucket_id='import-preview' and name=u.object_path and (metadata->>'size')::bigint=u.bytes) then return private.account_error('CONFLICT');
  end if;
 end if;
 if op='PROCESS' then update finance.import_uploads set process_checks=process_checks+1 where id=ident; end if;
 insert into private.import_audit(upload_id,household_id,actor_id,operation) values(u.id,u.household_id,auth.uid(),op);
 result:=jsonb_build_object('ok',true,'upload',private.import_record(u));
 if op='PROCESS' then result:=result||jsonb_build_object('currency',(select currency from finance.accounts where household_id=u.household_id and id=u.account_id)); end if;
 return result;
exception when unique_violation then return private.account_error('CONFLICT'); when others then return private.account_error('INTERNAL_ERROR');
end $$;
create function api.import_command(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.import_command(payload); $$;
create function private.list_imports() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(private.import_record(u) order by u.created_at desc),'[]'::jsonb) from finance.import_uploads u where private.is_household_member(u.household_id);
$$;
create function api.list_imports() returns jsonb language sql stable security invoker set search_path='' as $$ select private.list_imports(); $$;
revoke all on function private.import_command(jsonb),api.import_command(jsonb),private.list_imports(),api.list_imports() from public,anon,authenticated;
grant execute on function private.import_command(jsonb),api.import_command(jsonb),private.list_imports(),api.list_imports() to authenticated;
