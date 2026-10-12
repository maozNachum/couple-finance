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
create function pg_temp.upload_command() returns jsonb language sql as $$
select '{"action":"AUTHORIZE","id":"80000000-0000-4000-8000-000000000001","householdId":"30000000-0000-4000-8000-000000000001","accountId":"50000000-0000-4000-8000-000000000001","sourceId":"70000000-0000-4000-8000-000000000001","filename":"synthetic.csv","bytes":20}'::jsonb;
$$;
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('finance.import_uploads'::regclass,'private.import_audit'::regclass)),'Staging and audit RLS');
select ok(not has_table_privilege('authenticated',v,'INSERT,UPDATE,DELETE'),'No direct DML '||v) from unnest(array['finance.import_uploads','private.import_audit']) v;
select ok(not has_function_privilege('anon',v,'EXECUTE'),'Anonymous denied '||v) from unnest(array['api.import_command(jsonb)','api.list_imports()','private.import_command(jsonb)','private.list_imports()','private.import_record(finance.import_uploads)']) v;
select ok(not prosecdef,'API invoker '||proname) from pg_proc where oid in ('api.import_command(jsonb)'::regprocedure,'api.list_imports()'::regprocedure);
select ok(not public and file_size_limit=1048576,'Private bucket with server limit') from storage.buckets where id='import-preview';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"20000000-0000-4000-8000-000000000001"}',true);
select is(api.import_command(pg_temp.upload_command())->>'ok','true','authorized upload');
select is(api.import_command(pg_temp.upload_command())->>'ok','true','idempotent authorization');
select is((select count(*)::integer from finance.import_uploads),1,'one record');
select is(api.import_command(pg_temp.upload_command()||'{"filename":"other.csv"}'::jsonb)->'error'->>'code','CONFLICT','payload reuse rejected');
select is(api.import_command(pg_temp.upload_command()||'{"id":"80000000-0000-4000-8000-000000000002","accountId":"50000000-0000-4000-8000-000000000002"}'::jsonb)->'error'->>'code','INVALID_INPUT','foreign account rejected');
select throws_ok($$update finance.import_uploads set member_id='40000000-0000-4000-8000-000000000002'$$,'42501',null,'ownership reassignment denied');
select throws_ok($$delete from finance.import_uploads$$,'42501',null,'direct cleanup denied');
select ok(private.import_object_access('30000000-0000-4000-8000-000000000001/80000000-0000-4000-8000-000000000001.csv','UPLOAD'),'DB generated exact path authorized');
select ok(not private.import_object_access('30000000-0000-4000-8000-000000000001/../80000000-0000-4000-8000-000000000001.csv','UPLOAD'),'traversal denied');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"20000000-0000-4000-8000-000000000002"}',true);
select is(api.list_imports(),'[]'::jsonb,'independent household staging isolation');
select is((select count(*)::integer from finance.import_uploads),0,'base table RLS isolation');
select is(api.import_command(pg_temp.upload_command())->'error'->>'code','NOT_AUTHORIZED','foreign authorize denied');
select ok(not private.import_object_access('30000000-0000-4000-8000-000000000001/80000000-0000-4000-8000-000000000001.csv','READ'),'foreign object denied');
reset role;
select throws_ok($$insert into finance.import_uploads(id,household_id,account_id,source_id,member_id,filename,bytes) values('80000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','x.csv',20)$$,'23503',null,'composite source FK');
select throws_ok($$insert into finance.import_uploads(id,household_id,account_id,source_id,member_id,filename,bytes) values('80000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','x.csv',20)$$,'23503',null,'composite durable member FK');
select is((select count(*)::integer from private.import_audit where operation='AUTHORIZE' and upload_id='80000000-0000-4000-8000-000000000001'),1,'atomic audit single authorization');
update finance.household_members set status='REVOKED' where id='40000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"20000000-0000-4000-8000-000000000001"}',true);
select is(api.list_imports(),'[]'::jsonb,'revoked unchanged JWT');
select is(api.import_command(pg_temp.upload_command())->'error'->>'code','NOT_AUTHORIZED','revoked retry');
reset role;
update finance.household_members set status='ACTIVE' where id='40000000-0000-4000-8000-000000000001';
delete from auth.users where id='10000000-0000-4000-8000-000000000001';
select is((select member_id::text from finance.import_uploads),'40000000-0000-4000-8000-000000000001','durable ownership retained after Auth deletion');
set local role authenticated;
select is(api.list_imports(),'[]'::jsonb,'deleted Auth user denied');
reset role;
select is((select count(*)::integer from finance.transactions),0,'no canonical transaction mutation');
select is((select count(*)::integer from finance.balance_observations),0,'no observation mutation');
select * from finish();
rollback;
