begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
insert into auth.users(id,email) values ('10000000-0000-4000-8000-000000000001','category-a@example.test'),('10000000-0000-4000-8000-000000000002','category-b@example.test');
insert into auth.sessions(id,user_id) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');
insert into finance.profiles(id,display_name) select id,'Synthetic' from auth.users where email like 'category-%@example.test';
insert into finance.households(id,name) values ('30000000-0000-4000-8000-000000000001','Synthetic ledger A'),('30000000-0000-4000-8000-000000000002','Synthetic ledger B');
insert into finance.household_members(id,household_id,user_id,display_name) values
 ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Synthetic A'),
 ('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Synthetic B');
insert into finance.accounts(id,household_id,name,type,currency,valuation_currency,balance_policy) values
 ('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Synthetic cash','CASH','ILS','ILS','LEDGER'),
 ('50000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','Synthetic bank','BANK','ILS','ILS','OBSERVED');
insert into finance.account_sources(id,household_id,account_id,kind,authoritative_from) values
 ('70000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','MANUAL','0001-01-01'),
 ('70000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','MANUAL','0001-01-01');
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('finance.import_jobs'::regclass,'finance.import_rows'::regclass,'private.import_leases'::regclass,'private.import_receipts'::regclass)),'durable import RLS');
select ok(not has_table_privilege('authenticated',v,'INSERT,UPDATE,DELETE'),'no client financial DML '||v) from unnest(array['finance.import_jobs','finance.import_rows','private.import_leases','private.import_receipts']) v;
select ok(not has_function_privilege('authenticated',v,'EXECUTE'),'server only '||v) from unnest(array['api.finish_import(jsonb)','private.finish_import(jsonb)','private.write_transaction(jsonb,boolean)','private.import_duplicates(uuid,uuid,uuid,text,jsonb)','private.import_history_hash(uuid,uuid)','private.reserve_import_cleanup()']) v;
select ok(not has_function_privilege('anon',v,'EXECUTE'),'anonymous denied '||v) from unnest(array['api.begin_import(jsonb)','api.finish_import(jsonb)','api.release_import(jsonb)','api.import_evidence()']) v;
select ok(not prosecdef,'invoker surface '||proname) from pg_proc where oid in ('api.begin_import(jsonb)'::regprocedure,'api.finish_import(jsonb)'::regprocedure,'api.release_import(jsonb)'::regprocedure,'api.import_evidence()'::regprocedure);
select ok(has_function_privilege('service_role','api.finish_import(jsonb)','EXECUTE'),'server parser has narrow RPC');
select ok(not has_function_privilege('service_role','private.write_transaction(jsonb,boolean)','EXECUTE'),'service role cannot directly call internal writer');
select throws_ok($$insert into finance.import_jobs(household_id,account_id,source_id,upload_id,uploader_member_id,content_hash,preview_hash,adapter,options,history_hash,counts) values('30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000002',gen_random_uuid(),'40000000-0000-4000-8000-000000000001',repeat('a',64),repeat('b',64),'generic-csv-v1','{}','hash','{}')$$,'23503',null,'household composite source FK');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"20000000-0000-4000-8000-000000000001"}',true);
select is(api.begin_import('{"action":"REVIEW","id":"80000000-0000-4000-8000-000000000001"}')->'error'->>'code','NOT_AUTHORIZED','forged upload denied');
select is(api.import_evidence(),'[]'::jsonb,'no fabricated evidence');
select throws_ok('select api.finish_import(''{}''::jsonb)','42501',null,'client cannot supply parser results');
select throws_ok('insert into finance.import_rows(id) values(gen_random_uuid())','42501',null,'direct history insertion denied');
reset role;
select * from finish();
rollback;
