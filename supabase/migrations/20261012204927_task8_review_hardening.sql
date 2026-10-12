-- Pin CSV source identities without rewriting existing provenance.
create table private.import_source_bindings (
 household_id uuid not null, account_id uuid not null, source_id uuid not null, enabled boolean not null default true,
 primary key(household_id,account_id), unique(household_id,account_id,source_id),
 foreign key(household_id,account_id,source_id) references finance.account_sources(household_id,account_id,id) on delete restrict
);
alter table private.import_source_bindings enable row level security;
revoke all on private.import_source_bindings from public,anon,authenticated,service_role;
do $$begin
 if exists(select 1 from finance.import_jobs group by household_id,account_id having count(distinct source_id)>1) then
  raise exception 'CSV source identity requires explicit operator resolution before upgrade';
 end if;
 if exists(select 1 from private.import_leases where expires_at>clock_timestamp()) then
  raise exception 'Wait for active import leases before upgrade';
 end if;
end$$;
insert into private.import_source_bindings(household_id,account_id,source_id)
 select household_id,account_id,min(source_id::text)::uuid from finance.import_jobs group by household_id,account_id;
delete from private.import_leases where expires_at<=clock_timestamp();
alter table private.import_leases add column source_id uuid not null;
alter table private.import_leases add constraint import_lease_source_fk foreign key(source_id) references finance.account_sources(id) on delete restrict;

create or replace function private.begin_import(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u finance.import_uploads; j finance.import_jobs; r private.import_receipts; token uuid; acct finance.accounts; src finance.account_sources;
begin
 if not private.has_live_session() then return private.account_error('NOT_AUTHORIZED'); end if;
 if payload->>'action'='REVIEW' and private.ledger_object(payload,array['action','id']) and private.account_uuid(payload->'id') then
  select * into u from finance.import_uploads where id=(payload->>'id')::uuid;
 elsif payload->>'action'='COMMIT' and private.ledger_object(payload,array['action','reviewId','idempotencyKey','decisions']) and private.account_uuid(payload->'reviewId')
 and jsonb_typeof(payload->'idempotencyKey')='string' and payload->>'idempotencyKey' ~ '^[A-Za-z0-9_-]{16,128}$' and jsonb_typeof(payload->'decisions')='array' and jsonb_array_length(payload->'decisions')<=2000 then
  select * into j from finance.import_jobs where id=(payload->>'reviewId')::uuid;
  if not found or not private.is_household_member(j.household_id) then return private.account_error('NOT_AUTHORIZED'); end if;
  perform 1 from finance.households where id=j.household_id for update;
  if not private.is_household_member(j.household_id) then return private.account_error('NOT_AUTHORIZED'); end if;
  select * into r from private.import_receipts where household_id=j.household_id and account_id=j.account_id and source_id=j.source_id and idempotency_key=payload->>'idempotencyKey';
  if found then
   if r.payload_digest<>private.import_payload_digest(payload,j) then return private.account_error('CONFLICT'); end if;
   return jsonb_build_object('ok',true,'result',r.result);
  end if;
  if j.result is not null then return private.account_error('CONFLICT'); end if;
  select * into u from finance.import_uploads where id=j.upload_id;
 else return private.account_error('INVALID_INPUT'); end if;
 if u.id is null or not private.is_household_member(u.household_id) then return private.account_error('NOT_AUTHORIZED'); end if;
 perform 1 from finance.households where id=u.household_id for update;
 select * into acct from finance.accounts where household_id=u.household_id and id=u.account_id for update;
 select * into u from finance.import_uploads where id=u.id for update;
 if not private.is_household_member(u.household_id) then return private.account_error('NOT_AUTHORIZED'); end if;
 if acct.status<>'ACTIVE' or u.cancelled or u.cleanup_reserved or u.expires_at<=clock_timestamp() or not exists(select 1 from storage.objects where bucket_id='import-preview' and name=u.object_path and (metadata->>'size')::bigint=u.bytes)
 or not exists(select 1 from finance.account_sources where household_id=u.household_id and account_id=u.account_id and id=u.source_id and kind in ('MANUAL','FILE_IMPORT')) then return private.account_error('CONFLICT'); end if;
 if u.process_checks>=100 then return private.account_error('CONFLICT'); end if;
 update finance.import_uploads set process_checks=process_checks+1 where id=u.id;
 -- The account lock serializes first binding creation; UUID ordering is never identity.
 select s.* into src from private.import_source_bindings b join finance.account_sources s
 on (s.household_id,s.account_id,s.id)=(b.household_id,b.account_id,b.source_id)
 where b.household_id=u.household_id and b.account_id=u.account_id and b.enabled and s.kind='FILE_IMPORT' and s.authoritative_from is null;
 if not found then
  if exists(select 1 from private.import_source_bindings where household_id=u.household_id and account_id=u.account_id) then return private.account_error('CONFLICT'); end if;
  select * into src from finance.account_sources where household_id=u.household_id and account_id=u.account_id and id=u.source_id and kind='FILE_IMPORT' and authoritative_from is null;
  if not found then
   if exists(select 1 from finance.account_sources where id=u.source_id and kind='FILE_IMPORT') then return private.account_error('CONFLICT'); end if;
   insert into finance.account_sources(id,household_id,account_id,kind,authoritative_from) values(gen_random_uuid(),u.household_id,u.account_id,'FILE_IMPORT',null) returning * into src;
  end if;
  insert into private.import_source_bindings(household_id,account_id,source_id) values(u.household_id,u.account_id,src.id);
 end if;
 if exists(select 1 from finance.account_sources where id=u.source_id and kind='FILE_IMPORT' and id<>src.id) then return private.account_error('CONFLICT'); end if;
 if j.id is not null and (j.options->>'version' is distinct from '1' or j.source_id<>src.id or j.history_hash<>private.import_history_hash(j.household_id,j.account_id)) then return private.account_error('CONFLICT'); end if;
 delete from private.import_leases where upload_id=u.id and expires_at<=clock_timestamp();
 if (select count(*) from private.import_leases where upload_id=u.id)>=8 then return private.account_error('CONFLICT'); end if;
 insert into private.import_leases(upload_id,actor_id,session_id,source_id) values(u.id,auth.uid(),(auth.jwt()->>'session_id')::uuid,src.id) returning id into token;
 return jsonb_build_object('ok',true,'leaseId',token,'upload',private.import_record(u),'currency',acct.currency,'sourceId',src.id,'options',j.options);
exception when others then return private.account_error('INTERNAL_ERROR');
end $$;

create or replace function private.finish_import(payload jsonb) returns jsonb language plpgsql security definer set search_path='' set statement_timeout='20s' as $$
declare l private.import_leases; u finance.import_uploads; j finance.import_jobs; acct finance.accounts; source uuid;
 d jsonb; rowdata jsonb; dup jsonb; duplicates jsonb; command jsonb; digest_value bytea; old_receipt private.import_receipts;
 results jsonb:='[]'::jsonb; body jsonb; tx uuid; rev uuid; item uuid; member uuid; answer jsonb; write_result jsonb;
begin
 if auth.role()<>'service_role' then return private.account_error('NOT_AUTHORIZED'); end if;
 if not private.account_uuid(payload->'leaseId') then return private.account_error('INVALID_INPUT'); end if;
 select * into l from private.import_leases where id=(payload->>'leaseId')::uuid;
 if not found then return private.account_error('NOT_AUTHORIZED'); end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',l.actor_id,'session_id',l.session_id,'role','authenticated')::text,true);
 select * into u from finance.import_uploads where id=l.upload_id;
 if not found or not private.is_household_member(u.household_id) then return private.account_error('NOT_AUTHORIZED'); end if;
 perform 1 from finance.households where id=u.household_id for update;
 select * into acct from finance.accounts where household_id=u.household_id and id=u.account_id for update;
 select * into u from finance.import_uploads where id=l.upload_id for update;
 -- Releasing the lease takes the same upload lock; a cached token cannot outlive release.
 select * into l from private.import_leases where id=(payload->>'leaseId')::uuid for update;
 if not found then return private.account_error('NOT_AUTHORIZED'); end if;
 if not private.is_household_member(u.household_id) then return private.account_error('NOT_AUTHORIZED'); end if;
 if l.expires_at<=clock_timestamp() or u.cancelled or u.cleanup_reserved or acct.status<>'ACTIVE' then return private.account_error('CONFLICT'); end if;
 -- Serialize a financial commit with session deletion, user deletion/bans and membership revocation.
 perform 1 from auth.sessions se join auth.users usr on usr.id=se.user_id where se.id=l.session_id and se.user_id=l.actor_id for share of se,usr;
 if not found then return private.account_error('NOT_AUTHORIZED'); end if;
 perform 1 from finance.household_members where household_id=u.household_id and user_id=l.actor_id and status='ACTIVE' for share;
 if not found or not private.is_household_member(u.household_id) then return private.account_error('NOT_AUTHORIZED'); end if;
 if not private.ledger_object(payload,array['leaseId','action','contentHash','previewHash','options','counts','rows','command']) or payload->>'action' not in ('REVIEW','COMMIT')
 or payload->>'contentHash' !~ '^[a-f0-9]{64}$' or payload->>'previewHash' !~ '^[a-f0-9]{64}$' or payload->'options'->>'adapter'<>'generic-csv-v1' or payload->'options'->>'version' is distinct from '1' or not private.ledger_object(payload->'options',array['adapter','version','format','mapping'])
 or jsonb_typeof(payload->'rows')<>'array' or jsonb_array_length(payload->'rows')>2000 then return private.account_error('INVALID_INPUT'); end if;
 select s.id into source from private.import_source_bindings b join finance.account_sources s
 on (s.household_id,s.account_id,s.id)=(b.household_id,b.account_id,b.source_id)
 where b.household_id=u.household_id and b.account_id=u.account_id and b.source_id=l.source_id and b.enabled
 and s.kind='FILE_IMPORT' and s.authoritative_from is null for share of b,s;
 if source is null then return private.account_error('CONFLICT'); end if;
 duplicates:=private.import_duplicates(u.household_id,u.account_id,source,payload->>'contentHash',payload->'rows');
 if payload->>'action'='REVIEW' then
  insert into finance.import_jobs(household_id,account_id,source_id,upload_id,uploader_member_id,content_hash,preview_hash,adapter,options,history_hash,counts)
  values(u.household_id,u.account_id,source,u.id,u.member_id,payload->>'contentHash',payload->>'previewHash','generic-csv-v1',payload->'options',private.import_history_hash(u.household_id,u.account_id),payload->'counts') returning * into j;
  answer:=jsonb_build_object('ok',true,'review',jsonb_build_object('id',j.id,'householdId',j.household_id,'accountId',j.account_id,'sourceId',source,'uploadId',u.id,'contentHash',j.content_hash,'previewHash',j.preview_hash,'adapter',j.adapter,'duplicates',duplicates));
 else
  command:=payload->'command';
  select * into j from finance.import_jobs where id=(command->>'reviewId')::uuid for update;
  if not found or (j.household_id,j.account_id,j.source_id,j.upload_id,j.content_hash,j.preview_hash,j.options) is distinct from (u.household_id,u.account_id,source,u.id,payload->>'contentHash',payload->>'previewHash',payload->'options') then return private.account_error('CONFLICT'); end if;
  digest_value:=private.import_payload_digest(command,j);
  select * into old_receipt from private.import_receipts where household_id=j.household_id and account_id=j.account_id and source_id=source and idempotency_key=command->>'idempotencyKey';
  if found then
   if old_receipt.payload_digest<>digest_value then return private.account_error('CONFLICT'); end if;
   delete from private.import_leases where id=l.id;
   return jsonb_build_object('ok',true,'result',old_receipt.result);
  end if;
  if j.result is not null or j.history_hash<>private.import_history_hash(j.household_id,j.account_id) then return private.account_error('CONFLICT'); end if;
  if jsonb_array_length(command->'decisions')<>jsonb_array_length(payload->'rows')
  or (select count(*) from jsonb_array_elements(command->'decisions') v where v->>'include'='true') not between 1 and 100
  or (select count(distinct v->>'row') from jsonb_array_elements(command->'decisions') v)<>jsonb_array_length(command->'decisions') then return private.account_error('INVALID_INPUT'); end if;
  select id into member from finance.household_members where household_id=j.household_id and user_id=l.actor_id and status='ACTIVE';
  for d in select value from jsonb_array_elements(command->'decisions') loop
   if not private.ledger_object(d,array['row','include','effect','status','acknowledge']) or jsonb_typeof(d->'row')<>'number' or jsonb_typeof(d->'include')<>'boolean' or jsonb_typeof(d->'acknowledge')<>'boolean'
   or d->>'effect' not in ('INCOME','EXPENSE','TRANSFER','INVESTMENT_TRADE','DEBT_PRINCIPAL','ADJUSTMENT','UNCLASSIFIED') or d->>'status' not in ('POSTED','PENDING') then raise exception using errcode='22023'; end if;
   select value into rowdata from jsonb_array_elements(payload->'rows') where value->>'row'=d->>'row';
   if rowdata is null then raise exception using errcode='22023'; end if;
   if d->>'include'='false' then continue; end if;
   select value into dup from jsonb_array_elements(duplicates) where value->>'row'=d->>'row';
   if rowdata->>'state'<>'VALID' or dup->>'exact'='true' or (jsonb_array_length(dup->'reasons')>0 and d->>'acknowledge'<>'true') then raise exception using errcode='22023'; end if;
   tx:=gen_random_uuid(); rev:=gen_random_uuid(); item:=gen_random_uuid();
   body:=jsonb_build_object('id',tx,'householdId',j.household_id,'accountId',j.account_id,'transactionDate',rowdata->'date','money',rowdata->'money','description',rowdata->>'description','status',d->'status',
    'provenance',jsonb_build_array(jsonb_build_object('source',jsonb_build_object('sourceId',source,'kind','FILE_IMPORT'),'ingestionItemId',item)),
    'allocations',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'effect',d->'effect','money',rowdata->'money','ownership',case when acct.owner_member_id is null then '{"kind":"HOUSEHOLD"}'::jsonb else jsonb_build_object('kind','MEMBER','memberId',acct.owner_member_id) end,'categorization',jsonb_build_object('origin','UNCLASSIFIED','userLocked',false))));
   write_result:=private.write_transaction(jsonb_build_object('transaction',body,'revisionId',rev,'supersedesRevisionId',null,'expectedVersion',0,'idempotencyKey',item::text,'entryKind','MOVEMENT','openingCoverage',null,'reason',''),true);
   if write_result->>'ok'<>'true' then raise exception using errcode='22023'; end if;
   insert into finance.import_rows(id,household_id,account_id,source_id,job_id,content_hash,row_number,line_start,line_end,row_hash,source_reference,source_description,transaction_id,revision_id,decision)
   values(item,j.household_id,j.account_id,source,j.id,j.content_hash,(rowdata->>'row')::int,(rowdata->>'lineStart')::int,(rowdata->>'lineEnd')::int,rowdata->>'rowHash',rowdata->>'reference',rowdata->>'description',tx,rev,d);
   results:=results||jsonb_build_array(jsonb_build_object('row',(rowdata->>'row')::int,'transactionId',tx,'revisionId',rev,'ingestionItemId',item));
  end loop;
  answer:=jsonb_build_object('reviewId',j.id,'householdId',j.household_id,'accountId',j.account_id,'sourceId',source,'contentHash',j.content_hash,'committed',jsonb_array_length(results),'skipped',(j.counts->>'total')::int-jsonb_array_length(results)-(j.counts->>'invalid')::int-(j.counts->>'unresolved')::int,'invalid',j.counts->'invalid','unresolved',j.counts->'unresolved','transactions',results);
  insert into private.import_receipts values(j.household_id,j.account_id,source,command->>'idempotencyKey',digest_value,j.id,answer);
  update finance.import_jobs set result=answer,committed_member_id=member where id=j.id;
  insert into private.import_audit(upload_id,household_id,actor_id,operation) values(u.id,j.household_id,l.actor_id,'COMMITTED');
  answer:=jsonb_build_object('ok',true,'result',answer);
 end if;
 if l.expires_at<=clock_timestamp() then raise exception using errcode='40001'; end if;
 delete from private.import_leases where id=l.id;
 return answer;
exception when serialization_failure or unique_violation then return private.account_error('CONFLICT');
 when invalid_parameter_value or check_violation or foreign_key_violation then return private.account_error('INVALID_INPUT');
 when others then return private.account_error('INTERNAL_ERROR');
end $$;

create or replace function private.release_import(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare ident uuid;
begin
 if not private.has_live_session() or not private.account_uuid(payload->'id') then return private.account_error('NOT_AUTHORIZED'); end if;
 select upload_id into ident from private.import_leases where id=(payload->>'id')::uuid;
 perform 1 from finance.import_uploads where id=ident for update;
 delete from private.import_leases l using finance.import_uploads u where l.id=(payload->>'id')::uuid and l.upload_id=u.id and l.actor_id=auth.uid() and l.session_id::text=auth.jwt()->>'session_id' and private.is_household_member(u.household_id);
 return jsonb_build_object('ok',true);
end $$;

create or replace function private.import_command(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u finance.import_uploads; answer jsonb;
begin
 if not private.has_live_session() then return private.account_error('NOT_AUTHORIZED'); end if;
 if payload->>'action'='AUTHORIZE' and private.account_uuid(payload->'id') and exists(select 1 from finance.import_jobs where upload_id=(payload->>'id')::uuid) and not exists(select 1 from finance.import_uploads where id=(payload->>'id')::uuid) then return private.account_error('CONFLICT'); end if;
 if payload->>'action' in ('CANCEL','FORGET','PROCESS') and private.account_uuid(payload->'id') then
  select * into u from finance.import_uploads where id=(payload->>'id')::uuid for update;
  if not found or not private.is_household_member(u.household_id) then return private.account_error('NOT_AUTHORIZED'); end if;
  if u.cleanup_reserved or (payload->>'action' in ('CANCEL','FORGET') and private.import_busy(u.id)) then return private.account_error('CONFLICT'); end if;
 end if;
 answer:=private.import_staging_command(payload);
 if payload->>'action'='FORGET' and answer->>'ok'='true' then
  delete from finance.import_jobs where upload_id=u.id and result is null;
 end if;
 return answer;
end $$;
