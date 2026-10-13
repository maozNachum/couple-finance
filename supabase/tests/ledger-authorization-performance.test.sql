begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
insert into auth.users(id,email) values
 ('11000000-0000-4000-8000-000000000001','bulk-a@example.test'),
 ('11000000-0000-4000-8000-000000000002','bulk-b@example.test');
insert into auth.sessions(id,user_id) values
 ('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001'),
 ('21000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000002');
insert into finance.profiles(id,display_name) values
 ('11000000-0000-4000-8000-000000000001','Synthetic A'),
 ('11000000-0000-4000-8000-000000000002','Synthetic B');
insert into finance.households(id,name) values
 ('31000000-0000-4000-8000-000000000001','Synthetic A'),
 ('31000000-0000-4000-8000-000000000002','Synthetic B');
insert into finance.household_members(household_id,user_id,display_name) values
 ('31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','Synthetic A'),
 ('31000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000002','Synthetic B');
select ok(prosecdef and provolatile='s','narrow private helper is stable definer') from pg_proc where oid='private.live_household_ids()'::regprocedure;
select is((select proconfig[1] from pg_proc where oid='private.live_household_ids()'::regprocedure),'search_path=""','helper fixed empty search path');
select ok(not has_function_privilege('anon','private.live_household_ids()','EXECUTE'),'anonymous helper denied');
select ok(has_function_privilege('authenticated','private.live_household_ids()','EXECUTE'),'authenticated policy helper allowed');
select is((select count(*) from pg_policy where polname in ('transactions_read','revisions_read','allocations_read') and pg_get_expr(polqual,polrelid) like '%live_household_ids%'),3::bigint,'all three ledger policies use statement authorization');
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('finance.transactions'::regclass,'finance.transaction_revisions'::regclass,'finance.transaction_allocations'::regclass)),'RLS remains enabled on all ledger relations');
select ok((select reloptions @> array['security_invoker=true'] from pg_class where oid='api.transaction_history'::regclass),'history remains invoker view');
set local role authenticated;
select is(private.live_household_ids(),'{}'::uuid[],'missing session has no permitted households');
select set_config('request.jwt.claims','{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"21000000-0000-4000-8000-000000000001"}',true);
select is(private.live_household_ids(),array['31000000-0000-4000-8000-000000000001'::uuid],'A receives only A');
select set_config('request.jwt.claims','{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"21000000-0000-4000-8000-000000000002"}',true);
select is(private.live_household_ids(),array['31000000-0000-4000-8000-000000000002'::uuid],'B receives only B');
reset role;
update finance.household_members set status='REVOKED' where user_id='11000000-0000-4000-8000-000000000002';
set local role authenticated;
select is(private.live_household_ids(),'{}'::uuid[],'unchanged revoked JWT denied on next statement');
reset role;
update finance.household_members set status='ACTIVE' where user_id='11000000-0000-4000-8000-000000000002';
delete from auth.sessions where id='21000000-0000-4000-8000-000000000002';
set local role authenticated;
select is(private.live_household_ids(),'{}'::uuid[],'active membership with deleted session denied');
reset role;
update auth.users set banned_until=now()+interval '1 hour' where id='11000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"21000000-0000-4000-8000-000000000001"}',true);
select is(private.live_household_ids(),'{}'::uuid[],'banned user denied');
reset role;
update auth.users set banned_until=null where id='11000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"21000000-0000-4000-8000-000000000001","is_anonymous":true}',true);
select is(private.live_household_ids(),'{}'::uuid[],'anonymous identity with live session denied');
reset role;
delete from auth.users where id='11000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated","session_id":"21000000-0000-4000-8000-000000000001"}',true);
select is(private.live_household_ids(),'{}'::uuid[],'deleted identity denied');
reset role;
select * from finish();
rollback;
