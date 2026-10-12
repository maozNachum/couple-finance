create function private.write_transaction(payload jsonb, import_creation boolean) returns jsonb language plpgsql security definer set search_path='' as $$
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
 or not private.ledger_object(t->'provenance'->0,array['source'],array['ingestionItemId'])
 or not private.ledger_object(t->'provenance'->0->'source',array['sourceId','kind'])
 or (t->'provenance'->0->'source'->>'kind' in ('MANUAL','FILE_IMPORT')) is not true
 or (t->'provenance'->0->'source'->>'kind'='MANUAL' and t->'provenance'->0 ? 'ingestionItemId')
 or (t->'provenance'->0->'source'->>'kind'='FILE_IMPORT' and (not private.account_uuid(t->'provenance'->0->'ingestionItemId') or payload->>'entryKind'<>'MOVEMENT'))
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
 if not exists(select 1 from finance.account_sources where household_id=h and account_id=acct and id=src and kind=t->'provenance'->0->'source'->>'kind') then return private.account_error('INVALID_INPUT'); end if;
 if expected=0 and t->'provenance'->0->'source'->>'kind'='FILE_IMPORT' and not import_creation then return private.account_error('NOT_AUTHORIZED'); end if;
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
  if previous.body->'provenance' is distinct from t->'provenance' then return private.account_error('CONFLICT'); end if;
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

revoke all on function private.write_transaction(jsonb,boolean) from public,anon,authenticated,service_role;
create or replace function private.write_transaction(payload jsonb) returns jsonb language sql security definer set search_path='' as $$ select private.write_transaction(payload,false); $$;
-- Durable evidence is independent of temporary staging retention.
alter table finance.import_uploads add column cleanup_reserved boolean not null default false;
create table finance.import_jobs (
 id uuid primary key default gen_random_uuid(), household_id uuid not null, account_id uuid not null, source_id uuid not null,
 upload_id uuid not null, uploader_member_id uuid not null, committed_member_id uuid,
 content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'), preview_hash text not null check(preview_hash ~ '^[a-f0-9]{64}$'),
 adapter text not null check(adapter='generic-csv-v1'), options jsonb not null, history_hash text not null,
 counts jsonb not null, created_at timestamptz not null default clock_timestamp(), result jsonb,
 unique(household_id,account_id,source_id,id),
 foreign key(household_id,account_id,source_id) references finance.account_sources(household_id,account_id,id) on delete restrict,
 foreign key(household_id,uploader_member_id) references finance.household_members(household_id,id) on delete restrict,
 foreign key(household_id,committed_member_id) references finance.household_members(household_id,id) on delete restrict
);
create index import_job_uploader_idx on finance.import_jobs(household_id,uploader_member_id);
create index import_job_committer_idx on finance.import_jobs(household_id,committed_member_id);
create table finance.import_rows (
 id uuid primary key default gen_random_uuid(), household_id uuid not null, account_id uuid not null, source_id uuid not null, job_id uuid not null,
 content_hash text not null, row_number integer not null check(row_number between 2 and 2001),
 line_start integer not null check(line_start>=2), line_end integer not null check(line_end>=line_start), row_hash text not null,
 source_reference text, source_description text not null, transaction_id uuid not null, revision_id uuid not null,
 decision jsonb not null,
 unique(household_id,account_id,source_id,content_hash,row_number),
 foreign key(household_id,account_id,source_id,job_id) references finance.import_jobs(household_id,account_id,source_id,id) on delete restrict,
 foreign key(household_id,account_id,transaction_id) references finance.transactions(household_id,account_id,id) on delete restrict,
 foreign key(household_id,account_id,revision_id) references finance.transaction_revisions(household_id,account_id,revision_id) on delete restrict
);
create index import_row_job_idx on finance.import_rows(household_id,account_id,source_id,job_id);
create index import_row_transaction_idx on finance.import_rows(household_id,account_id,transaction_id);
create index import_row_revision_idx on finance.import_rows(household_id,account_id,revision_id);
create table private.import_leases (
 id uuid primary key default gen_random_uuid(), upload_id uuid not null references finance.import_uploads(id) on delete cascade,
 actor_id uuid not null, session_id uuid not null, expires_at timestamptz not null default(clock_timestamp()+interval '45 seconds')
);
create index import_lease_upload_idx on private.import_leases(upload_id,expires_at);
create table private.import_receipts (
 household_id uuid not null, account_id uuid not null, source_id uuid not null, idempotency_key text not null,
 payload_digest bytea not null check(octet_length(payload_digest)=32), job_id uuid not null, result jsonb not null,
 primary key(household_id,account_id,source_id,idempotency_key),
 foreign key(household_id,account_id,source_id,job_id) references finance.import_jobs(household_id,account_id,source_id,id) on delete restrict
);
create index import_receipt_job_idx on private.import_receipts(household_id,account_id,source_id,job_id);
alter table finance.import_jobs enable row level security;
alter table finance.import_rows enable row level security;
alter table private.import_leases enable row level security;
alter table private.import_receipts enable row level security;
revoke all on finance.import_jobs,finance.import_rows,private.import_leases,private.import_receipts from public,anon,authenticated;
grant select on finance.import_jobs,finance.import_rows to authenticated;
create policy import_job_read on finance.import_jobs for select to authenticated using(private.is_household_member(household_id));
create policy import_row_read on finance.import_rows for select to authenticated using(private.is_household_member(household_id));
create trigger import_row_immutable before update on finance.import_rows for each row execute function private.immutable_transaction();

create function private.import_busy(ident uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.import_leases where upload_id=ident and expires_at>clock_timestamp());
$$;
revoke all on function private.import_busy(uuid) from public,anon,authenticated;
create or replace function private.import_object_access(p text, action text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from finance.import_uploads u where u.object_path=p and private.is_household_member(u.household_id)
 and case when action='DELETE' then (u.cancelled or u.expires_at<=clock_timestamp()) and not private.import_busy(u.id)
 else not u.cleanup_reserved and not u.cancelled and (u.expires_at>clock_timestamp() or (action='READ' and exists(select 1 from private.import_leases l where l.upload_id=u.id and l.actor_id=auth.uid() and l.session_id::text=auth.jwt()->>'session_id' and l.expires_at>clock_timestamp()))) end);
$$;
alter function private.import_command(jsonb) rename to import_staging_command;
revoke all on function private.import_staging_command(jsonb) from public,anon,authenticated;
create function private.import_command(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u finance.import_uploads; answer jsonb;
begin
 if not private.has_live_session() then return private.account_error('NOT_AUTHORIZED'); end if;
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
revoke all on function private.import_command(jsonb) from public,anon,authenticated;
grant execute on function private.import_command(jsonb) to authenticated;

-- History generation includes immutable revisions and accepted rows; stale duplicate review never commits.
create function private.import_history_hash(h uuid,a uuid) returns text language sql stable security definer set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_array(
 (select coalesce(jsonb_agg(revision_id order by revision_id),'[]') from finance.transaction_revisions where household_id=h and account_id=a),
 (select coalesce(jsonb_agg(id order by id),'[]') from finance.import_rows where household_id=h and account_id=a))::text,'UTF8')),'hex');
$$;
revoke all on function private.import_history_hash(uuid,uuid) from public,anon,authenticated;

create function private.import_payload_digest(cmd jsonb,j finance.import_jobs) returns bytea language sql immutable set search_path='' as $$
 select sha256(convert_to(jsonb_build_object('command',cmd-'idempotencyKey','household',j.household_id,'account',j.account_id,'source',j.source_id,
 'file',j.content_hash,'preview',j.preview_hash,'adapter',j.adapter,'options',j.options)::text,'UTF8'));
$$;
revoke all on function private.import_payload_digest(jsonb,finance.import_jobs) from public,anon,authenticated;

-- Caller-facing authorization/receipt recovery. Rows and hashes from browsers are never accepted.
create function private.begin_import(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 -- One generic CSV relationship, lazily resolved under the account/household locks.
 select * into src from finance.account_sources where household_id=u.household_id and account_id=u.account_id and kind='FILE_IMPORT' and authoritative_from is null order by id limit 1;
 if not found then
  insert into finance.account_sources(id,household_id,account_id,kind,authoritative_from) values(gen_random_uuid(),u.household_id,u.account_id,'FILE_IMPORT',null) returning * into src;
 end if;
 if j.id is not null and (j.source_id<>src.id or j.history_hash<>private.import_history_hash(j.household_id,j.account_id)) then return private.account_error('CONFLICT'); end if;
 delete from private.import_leases where upload_id=u.id and expires_at<=clock_timestamp();
 if (select count(*) from private.import_leases where upload_id=u.id)>=8 then return private.account_error('CONFLICT'); end if;
 insert into private.import_leases(upload_id,actor_id,session_id) values(u.id,auth.uid(),(auth.jwt()->>'session_id')::uuid) returning id into token;
 return jsonb_build_object('ok',true,'leaseId',token,'upload',private.import_record(u),'currency',acct.currency,'sourceId',src.id,'options',j.options);
exception when others then return private.account_error('INTERNAL_ERROR');
end $$;
create function api.begin_import(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.begin_import(payload);$$;
revoke all on function private.begin_import(jsonb),api.begin_import(jsonb) from public,anon,authenticated;
grant execute on function private.begin_import(jsonb),api.begin_import(jsonb) to authenticated;

create function private.import_duplicates(h uuid,a uuid,s uuid,filehash text,rows jsonb) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('row',(row->>'row')::int,'exact',prior.id is not null,
 'reasons',to_jsonb(array_remove(array[
 case when prior.id is not null then case when prior.row_hash=row->>'rowHash' then 'PRIOR_IMPORT' else 'INTERPRETATION_CHANGED' end end,
 case when matches.same_reference then 'SAME_REFERENCE' end,
 case when matches.same_values then 'SAME_FINANCIAL_VALUES' end,
 case when matches.total>0 and not matches.same_values and not matches.same_reference then 'SAME_DATE_AMOUNT' end,
 case when exists(select 1 from jsonb_array_elements(rows) other where other->>'row'<>row->>'row' and other->>'state'='VALID' and other->'date'=row->'date' and other->'money'=row->'money') then 'REPEATED_IN_FILE' end
 ],null)), 'candidates',coalesce(matches.ids,'[]'), 'candidateCount',matches.total) order by (row->>'row')::int),'[]')
 from jsonb_array_elements(rows) row
 left join finance.import_rows prior on prior.household_id=h and prior.account_id=a and prior.source_id=s and prior.content_hash=filehash and prior.row_number=(row->>'row')::int
 cross join lateral (
 select count(*) total,coalesce(bool_or(x.same_reference),false) same_reference,coalesce(bool_or(x.same_values),false) same_values,
 (select coalesce(jsonb_agg(y.transaction_id),'[]') from (select tr.transaction_id from finance.transaction_revisions tr
 where tr.household_id=h and tr.account_id=a and tr.status<>'VOIDED' and not exists(select 1 from finance.transaction_revisions newer where newer.supersedes_revision_id=tr.revision_id)
 and ((tr.body->>'transactionDate'=row->>'date' and tr.amount=(row->'money'->>'amount')::numeric and tr.currency=row->'money'->>'currency')
 or exists(select 1 from finance.import_rows ir where ir.household_id=h and ir.account_id=a and ir.source_id=s and ir.transaction_id=tr.transaction_id and ir.source_reference is not null and ir.source_reference=row->>'reference')) order by tr.transaction_id limit 10) y) ids
 from (select tr.transaction_id,
 exists(select 1 from finance.import_rows ir where ir.household_id=h and ir.account_id=a and ir.source_id=s and ir.transaction_id=tr.transaction_id and ir.source_reference is not null and ir.source_reference=row->>'reference') same_reference,
 (tr.body->>'transactionDate'=row->>'date' and tr.amount=(row->'money'->>'amount')::numeric and tr.currency=row->'money'->>'currency' and private.normalize_category_text(tr.body->>'description')=private.normalize_category_text(row->>'description')) same_values
 from finance.transaction_revisions tr where tr.household_id=h and tr.account_id=a and tr.status<>'VOIDED' and not exists(select 1 from finance.transaction_revisions newer where newer.supersedes_revision_id=tr.revision_id)
 and ((tr.body->>'transactionDate'=row->>'date' and tr.amount=(row->'money'->>'amount')::numeric and tr.currency=row->'money'->>'currency')
 or exists(select 1 from finance.import_rows ir where ir.household_id=h and ir.account_id=a and ir.source_id=s and ir.transaction_id=tr.transaction_id and ir.source_reference is not null and ir.source_reference=row->>'reference'))) x
 ) matches;
$$;
revoke all on function private.import_duplicates(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;

-- Only the server parser may call this RPC. It cannot take a user/household/path argument.
create function private.finish_import(payload jsonb) returns jsonb language plpgsql security definer set search_path='' set statement_timeout='20s' as $$
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
 if not private.is_household_member(u.household_id) then return private.account_error('NOT_AUTHORIZED'); end if;
 if l.expires_at<=clock_timestamp() or u.cancelled or u.cleanup_reserved or acct.status<>'ACTIVE' then return private.account_error('CONFLICT'); end if;
 -- Serialize a financial commit with session deletion, user deletion/bans and membership revocation.
 perform 1 from auth.sessions se join auth.users usr on usr.id=se.user_id where se.id=l.session_id and se.user_id=l.actor_id for share of se,usr;
 if not found then return private.account_error('NOT_AUTHORIZED'); end if;
 perform 1 from finance.household_members where household_id=u.household_id and user_id=l.actor_id and status='ACTIVE' for share;
 if not found or not private.is_household_member(u.household_id) then return private.account_error('NOT_AUTHORIZED'); end if;
 if not private.ledger_object(payload,array['leaseId','action','contentHash','previewHash','options','counts','rows','command']) or payload->>'action' not in ('REVIEW','COMMIT')
 or payload->>'contentHash' !~ '^[a-f0-9]{64}$' or payload->>'previewHash' !~ '^[a-f0-9]{64}$' or payload->'options'->>'adapter'<>'generic-csv-v1'
 or jsonb_typeof(payload->'rows')<>'array' or jsonb_array_length(payload->'rows')>2000 then return private.account_error('INVALID_INPUT'); end if;
 select id into source from finance.account_sources where household_id=u.household_id and account_id=u.account_id and kind='FILE_IMPORT' and authoritative_from is null order by id limit 1;
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
   body:=jsonb_build_object('id',tx,'householdId',j.household_id,'accountId',j.account_id,'transactionDate',rowdata->'date','money',rowdata->'money','description',btrim(rowdata->>'description'),'status',d->'status',
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
create function api.finish_import(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.finish_import(payload);$$;
revoke all on function private.finish_import(jsonb),api.finish_import(jsonb) from public,anon,authenticated,service_role;
grant usage on schema api,private to service_role;
grant execute on function private.finish_import(jsonb),api.finish_import(jsonb) to service_role;

create function api.import_evidence() returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(result order by created_at desc),'[]') from finance.import_jobs where result is not null;
$$;
revoke all on function api.import_evidence() from public,anon,authenticated;
grant execute on function api.import_evidence() to authenticated;

-- Operator cleanup reservation closes the race with a new lease before bypass-RLS Storage deletion.
create function private.reserve_import_cleanup() returns jsonb language plpgsql security definer set search_path='' as $$
declare u finance.import_uploads; result jsonb:='[]'::jsonb;
begin
 for u in select * from finance.import_uploads where cancelled or expires_at<=clock_timestamp() order by expires_at limit 100 for update skip locked loop
  if not private.import_busy(u.id) then
   update finance.import_uploads set cleanup_reserved=true where id=u.id;
   result:=result||jsonb_build_array(jsonb_build_object('id',u.id,'object_path',u.object_path,'household_id',u.household_id));
  end if;
 end loop;
 return result;
end $$;
revoke all on function private.reserve_import_cleanup() from public,anon,authenticated,service_role;

create function private.release_import(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.has_live_session() or not private.account_uuid(payload->'id') then return private.account_error('NOT_AUTHORIZED'); end if;
 delete from private.import_leases l using finance.import_uploads u where l.id=(payload->>'id')::uuid and l.upload_id=u.id and l.actor_id=auth.uid() and l.session_id::text=auth.jwt()->>'session_id' and private.is_household_member(u.household_id);
 return jsonb_build_object('ok',true);
end $$;
create function api.release_import(payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.release_import(payload);$$;
revoke all on function private.release_import(jsonb),api.release_import(jsonb) from public,anon,authenticated;
grant execute on function private.release_import(jsonb),api.release_import(jsonb) to authenticated;

create index import_candidate_money_idx on finance.transaction_revisions(household_id,account_id,currency,amount,(body->>'transactionDate'));
create index import_candidate_reference_idx on finance.import_rows(household_id,account_id,source_id,source_reference,transaction_id);
