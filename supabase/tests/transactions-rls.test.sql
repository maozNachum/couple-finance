begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
insert into auth.users(id,email) values ('10000000-0000-4000-8000-000000000001','ledger-a@example.test'),('10000000-0000-4000-8000-000000000002','ledger-b@example.test');
insert into auth.sessions(id,user_id) values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');
insert into finance.profiles(id,display_name) select id,'Synthetic' from auth.users where email like 'ledger-%@example.test';
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
create function pg_temp.command(n integer default 1) returns jsonb language sql as $$
select jsonb_build_object('revisionId','80000000-0000-4000-8000-'||lpad(n::text,12,'0'),'supersedesRevisionId',null,'expectedVersion',0,'idempotencyKey','synthetic-ledger-'||n,'entryKind','MOVEMENT','openingCoverage',null,'reason','',
 'transaction',jsonb_build_object('id','60000000-0000-4000-8000-'||lpad(n::text,12,'0'),'householdId','30000000-0000-4000-8000-000000000001','accountId','50000000-0000-4000-8000-000000000001',
 'transactionDate','2026-10-01','description','Synthetic movement','status','POSTED','money',jsonb_build_object('amount','-10.12345678','currency','ILS'),
 'provenance','[{"source":{"sourceId":"70000000-0000-4000-8000-000000000001","kind":"MANUAL"}}]'::jsonb,
 'allocations','[{"id":"90000000-0000-4000-8000-000000000001","effect":"UNCLASSIFIED","money":{"amount":"-10.12345678","currency":"ILS"},"ownership":{"kind":"MEMBER","memberId":"40000000-0000-4000-8000-000000000001"},"categorization":{"origin":"UNCLASSIFIED","userLocked":false}}]'::jsonb));
$$;
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('finance.transactions'::regclass,'finance.transaction_revisions'::regclass,'finance.transaction_allocations'::regclass,'private.transaction_receipts'::regclass,'private.transaction_audit'::regclass)), 'All Task 5 tables have RLS');
select ok((select 'security_invoker=true'=any(reloptions) from pg_class where oid='api.transaction_history'::regclass),'Read view is invoker');
select ok(not (select prosecdef from pg_proc where oid='api.record_transaction(jsonb)'::regprocedure),'API command is invoker');
select ok((select prosecdef and proconfig @> array['search_path=""'] from pg_proc where oid='private.record_transaction(jsonb)'::regprocedure),'Private privileged command has empty search path');
select ok(not has_function_privilege('anon','private.record_transaction(jsonb)','execute'),'No anonymous private command');
select ok(not has_function_privilege('authenticated','private.immutable_transaction()','execute'),'No client trigger invocation');
select ok(not has_table_privilege('authenticated',v,'INSERT,UPDATE,DELETE'),v||' has no client writes') from unnest(array['finance.transactions','finance.transaction_revisions','finance.transaction_allocations','private.transaction_receipts','private.transaction_audit']) v;
set local role anon;
select throws_ok('select * from api.transaction_history','42501',null,'Anonymous view denied');
select throws_ok('select api.transaction_snapshot()','42501',null,'Anonymous snapshot denied');
select throws_ok('select api.record_transaction(''{}'')','42501',null,'Anonymous command denied');
select throws_ok('select private.record_transaction(''{}'')','42501',null,'Anonymous private command denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","role":"authenticated","user_metadata":{"household_id":"30000000-0000-4000-8000-000000000002"}}',true);
select is(api.record_transaction(pg_temp.command())->>'ok','true','Authorized exact movement stored');
select is(api.record_transaction(pg_temp.command())->>'ok','true','Exact receipt replay succeeds');
select is((select count(*) from finance.transactions),1::bigint,'Retry creates one stable movement');
select is((select count(*) from finance.transaction_revisions),1::bigint,'Retry creates one revision');
select is((select count(*) from finance.transaction_allocations),1::bigint,'Atomic allocation persisted');
select is((select amount::text from finance.transaction_revisions),'-10.12345678','Exact decimal persisted');
select is(api.record_transaction(pg_temp.command()||'{"reason":"changed"}')->'error'->>'code','CONFLICT','Mismatched digest conflicts');
select is(api.record_transaction(jsonb_set(pg_temp.command(2),'{transaction,householdId}','"30000000-0000-4000-8000-000000000002"'))->'error'->>'code','NOT_AUTHORIZED','Forged user metadata cannot authorize household');
select is(private.record_transaction(jsonb_set(pg_temp.command(2),'{transaction,householdId}','"30000000-0000-4000-8000-000000000002"'))->'error'->>'code','NOT_AUTHORIZED','Direct private function rechecks authority');
select is(api.record_transaction(jsonb_set(pg_temp.command(2),'{transaction,accountId}','"50000000-0000-4000-8000-000000000002"'))->'error'->>'code','INVALID_INPUT','Cross-household account denied');
select is(api.record_transaction(jsonb_set(pg_temp.command(2),'{transaction,provenance,0,source,sourceId}','"70000000-0000-4000-8000-000000000002"'))->'error'->>'code','INVALID_INPUT','Cross-account source denied');
select is(api.record_transaction(jsonb_set(pg_temp.command(2),'{transaction,allocations,0,ownership,memberId}','"40000000-0000-4000-8000-000000000002"'))->'error'->>'code','INVALID_INPUT','Cross-household member denied');
select is(api.record_transaction(jsonb_set(pg_temp.command(2),'{transaction,money,amount}',v))->'error'->>'code','INVALID_INPUT','Malformed money rejected') from unnest(array['null'::jsonb,'1'::jsonb,'"1e2"'::jsonb,'"1.000000000"'::jsonb,'"01"'::jsonb,'"NaN"'::jsonb,'"10000000000000000"'::jsonb]) v;
select is(api.record_transaction(jsonb_set(pg_temp.command(2),'{transaction,transactionDate}',to_jsonb(v)))->'error'->>'code','INVALID_INPUT','Malformed financial date rejected') from unnest(array['2026-02-30','2026-1-01','0000-01-01','2026-01-01T00:00:00Z']) v;
select is(api.record_transaction(jsonb_set(pg_temp.command(2),'{transaction,allocations,0,money,amount}','"-10"'))->'error'->>'code','INVALID_INPUT','Nonreconciling allocation rejected');
select is(api.record_transaction(jsonb_set(pg_temp.command(2),'{transaction,allocations,0,money,currency}','"USD"'))->'error'->>'code','INVALID_INPUT','Allocation currency mismatch rejected');
select is(api.record_transaction(pg_temp.command(2)||'{"createdAt":"2026-01-01T00:00:00Z"}')->'error'->>'code','INVALID_INPUT','Server timestamp cannot be forged');
select throws_ok('insert into finance.transactions(id) values(gen_random_uuid())','42501',null,'Direct base INSERT denied');
select throws_ok('update finance.transaction_revisions set reason=''rewrite''','42501',null,'History update denied');
select throws_ok('delete from finance.transaction_revisions','42501',null,'History delete denied');
select throws_ok('insert into finance.transaction_allocations(id) values(gen_random_uuid())','42501',null,'Direct allocation insert denied');
select throws_ok('update finance.transaction_allocations set payload=''{}''','42501',null,'Allocation rewrite denied');
select throws_ok('delete from finance.transactions','42501',null,'Stable identity delete denied');
select ok(not has_table_privilege('authenticated','api.transaction_history','INSERT,UPDATE,DELETE'),'Read view has no write grants');
select throws_ok('insert into api.transaction_history(revision_id) values(gen_random_uuid())','55000',null,'Joined history view is non-updatable');
select throws_ok('select * from private.transaction_receipts','42501',null,'Receipts private');
select throws_ok('select * from private.transaction_audit','42501',null,'Audit private');
select is((select count(*) from api.transaction_history),1::bigint,'Failures leave no financial rows');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from finance.transactions),0::bigint,'Other household base rows hidden');
select is((select count(*) from finance.transaction_revisions),0::bigint,'Other household revisions hidden');
select is((select count(*) from finance.transaction_allocations),0::bigint,'Other household allocations hidden');
select is((select count(*) from api.transaction_history),0::bigint,'Other household view hidden');
select is(api.transaction_snapshot()->'history','[]'::jsonb,'Other household snapshot hidden');
select is(api.record_transaction(pg_temp.command())->'error'->>'code','NOT_AUTHORIZED','Other household cannot replay receipt');
reset role;
select is((select count(*) from private.transaction_receipts where household_id='30000000-0000-4000-8000-000000000001'),1::bigint,'Only committed receipt exists');
select is((select count(*) from private.transaction_audit where household_id='30000000-0000-4000-8000-000000000001'),1::bigint,'One atomic audit event, no retry noise');
select ok(not exists(select 1 from information_schema.columns where table_schema='private' and table_name='transaction_audit' and column_name in ('amount','payload','description','reason')),'Audit excludes financial payload');
-- A failure after financial insertion must roll back history, allocations and receipt as well.
create function pg_temp.fail_audit() returns trigger language plpgsql as $$begin raise exception 'Synthetic audit failure'; end;$$;
create trigger synthetic_audit_failure before insert on private.transaction_audit for each row execute function pg_temp.fail_audit();
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(api.record_transaction(pg_temp.command(9))->'error'->>'code','INTERNAL_ERROR','Late failure returns only stable safe error');
select is((select count(*) from finance.transactions),1::bigint,'Late failure rolls back newly inserted identity');
select is((select count(*) from finance.transaction_revisions),1::bigint,'Late failure rolls back revision');
select is((select count(*) from finance.transaction_allocations),1::bigint,'Late failure rolls back allocations');
reset role;
select is((select count(*) from private.transaction_receipts where household_id='30000000-0000-4000-8000-000000000001'),1::bigint,'Late failure rolls back receipt');
drop trigger synthetic_audit_failure on private.transaction_audit;
select throws_ok($$update finance.transaction_revisions set reason='rewrite'$$,'23514',null,'Even privileged ordinary UPDATE cannot rewrite history');
select throws_ok($$delete from finance.household_members where id='40000000-0000-4000-8000-000000000001'$$,'23503',null,'Member history retained by restrictive FK');
select throws_ok($$delete from finance.account_sources where id='70000000-0000-4000-8000-000000000001'$$,'23503',null,'Source retained by restrictive FK');
update finance.household_members set status='REVOKED' where id='40000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*) from api.transaction_history),0::bigint,'Revoked member using unchanged claims sees no rows');
select is(api.record_transaction(pg_temp.command())->'error'->>'code','NOT_AUTHORIZED','Revoked member cannot retry');
reset role;
update finance.household_members set status='ACTIVE' where id='40000000-0000-4000-8000-000000000001';
delete from auth.sessions where id='20000000-0000-4000-8000-000000000001';
set local role authenticated;
select is((select count(*) from api.transaction_history),0::bigint,'Deleted session loses reads');
select is(api.record_transaction(pg_temp.command())->'error'->>'code','NOT_AUTHORIZED','Deleted session loses commands');
reset role;
delete from auth.users where id='10000000-0000-4000-8000-000000000001';
select is((select owner_member_id::text from finance.transaction_allocations where household_id='30000000-0000-4000-8000-000000000001'),'40000000-0000-4000-8000-000000000001','Auth deletion preserves attribution');
set local role authenticated;
select is(api.transaction_snapshot()->'history','[]'::jsonb,'Deleted Auth user loses snapshot');
select is(private.record_transaction(pg_temp.command())->'error'->>'code','NOT_AUTHORIZED','Deleted Auth user loses direct private command');
reset role;
select * from finish();
rollback;
