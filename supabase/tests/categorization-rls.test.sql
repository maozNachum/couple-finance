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
create function pg_temp.command(n integer default 1) returns jsonb language sql as $$
select jsonb_build_object('revisionId','80000000-0000-4000-8000-'||lpad(n::text,12,'0'),'supersedesRevisionId',null,'expectedVersion',0,'idempotencyKey','synthetic-ledger-'||n,'entryKind','MOVEMENT','openingCoverage',null,'reason','',
 'transaction',jsonb_build_object('id','60000000-0000-4000-8000-'||lpad(n::text,12,'0'),'householdId','30000000-0000-4000-8000-000000000001','accountId','50000000-0000-4000-8000-000000000001',
 'transactionDate','2026-10-01','description','Synthetic movement','status','POSTED','money',jsonb_build_object('amount','-10.12345678','currency','ILS'),
 'provenance','[{"source":{"sourceId":"70000000-0000-4000-8000-000000000001","kind":"MANUAL"}}]'::jsonb,
 'allocations','[{"id":"90000000-0000-4000-8000-000000000001","effect":"UNCLASSIFIED","money":{"amount":"-10.12345678","currency":"ILS"},"ownership":{"kind":"MEMBER","memberId":"40000000-0000-4000-8000-000000000001"},"categorization":{"origin":"UNCLASSIFIED","userLocked":false}}]'::jsonb));
$$;
create function pg_temp.category_command(h text default '30000000-0000-4000-8000-000000000001', ident text default 'a0000000-0000-4000-8000-000000000001') returns jsonb language sql as $$
 select jsonb_build_object('kind','CATEGORY','idempotencyKey','synthetic-category-'||ident,'record',jsonb_build_object('id',ident,'householdId',h,'name','מזון','kind','EXPENSE','status','ACTIVE','version',1));
$$;
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('finance.categories'::regclass,'finance.category_versions'::regclass,'finance.categorization_rules'::regclass,'finance.rule_versions'::regclass,'finance.categorization_decisions'::regclass,'private.categorization_receipts'::regclass,'finance.categorization_catalog'::regclass)),'All categorization tables use RLS');
select ok(not has_table_privilege('authenticated',v,'INSERT,UPDATE,DELETE'),v||' denies direct writes') from unnest(array['finance.categories','finance.category_versions','finance.categorization_rules','finance.rule_versions','finance.categorization_decisions','private.categorization_receipts','finance.categorization_catalog']) v;
select ok(not has_function_privilege('authenticated','private.write_transaction(jsonb)','execute'),'Internal writer is inaccessible');
select ok(not has_function_privilege('anon',v,'execute'),'Anonymous cannot execute '||v) from unnest(array['api.categorization_snapshot()','api.save_categorization_definition(jsonb)','api.categorize_transaction(jsonb)','private.save_categorization_definition(jsonb)','private.categorize_transaction(jsonb)']) v;
select ok(not prosecdef,'Invoker API '||proname) from pg_proc where oid in ('api.categorization_snapshot()'::regprocedure,'api.save_categorization_definition(jsonb)'::regprocedure,'api.categorize_transaction(jsonb)'::regprocedure);
select ok(proconfig @> array['search_path=""'],'Safe path '||proname) from pg_proc where oid in ('private.write_transaction(jsonb)'::regprocedure,'private.save_categorization_definition(jsonb)'::regprocedure,'private.categorize_transaction(jsonb)'::regprocedure);
select is(private.normalize_category_text(E' \tSHOP\r\nמזון  '),'shop מזון','SQL normalization matches portable v1');
set local role anon;
select throws_ok('select api.categorization_snapshot()','42501',null,'Anonymous snapshot denied');
select throws_ok('select * from finance.categories','42501',null,'Anonymous table denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(api.save_categorization_definition(pg_temp.category_command())->>'ok','true','Create household category');
select is(api.save_categorization_definition(pg_temp.category_command())->>'ok','true','Definition replay');
select is((select count(*) from finance.category_versions),1::bigint,'One category version');
select is(api.save_categorization_definition(pg_temp.category_command('30000000-0000-4000-8000-000000000002'))->'error'->>'code','NOT_AUTHORIZED','Forged household denied');
select throws_ok('select private.write_transaction(''{}'')','42501',null,'Authenticated cannot invoke internal writer');
select throws_ok('update finance.categories set version=2','42501',null,'No direct category mutation');
select throws_ok('delete from finance.category_versions','42501',null,'No history deletion');
select is(api.record_transaction(jsonb_set(pg_temp.command(),'{transaction,allocations,0,effect}','"EXPENSE"'))->>'ok','true','Eligible movement');
select is(api.record_transaction(jsonb_set(jsonb_set(pg_temp.command(2),'{transaction,allocations,0,effect}','"EXPENSE"'),'{transaction,allocations,0,categoryId}','"a0000000-0000-4000-8000-000000000001"'))->'error'->>'code','INVALID_INPUT','Financial creation cannot bypass category command');
reset role;
select is(api.save_categorization_definition(pg_temp.category_command('30000000-0000-4000-8000-000000000002'))->'error'->>'code','NOT_AUTHORIZED','Definer independently checks membership');
select throws_ok($$insert into finance.transaction_allocations(household_id,account_id,revision_id,id,ordinal,payload) select household_id,account_id,revision_id,'90000000-0000-4000-8000-000000000099',99,payload || '{"categoryId":"a0000000-0000-4000-8000-000000000099"}'::jsonb from finance.transaction_allocations limit 1$$,'23503',null,'Database FK independently rejects unknown category');
select throws_ok($$update finance.category_versions set body='{}'$$,'23514','Financial history is immutable.','Definition history immutable even through ordinary privileged UPDATE');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from finance.categories),0::bigint,'Second household sees no foreign categories');
select is((select count(*) from finance.category_versions),0::bigint,'Second household sees no foreign history');
select is(api.save_categorization_definition(pg_temp.category_command('30000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002'))->>'ok','true','Second household independent category');
reset role;
select throws_ok($$insert into finance.transaction_allocations(household_id,account_id,revision_id,id,ordinal,payload) select household_id,account_id,revision_id,'90000000-0000-4000-8000-000000000098',98,payload || '{"categoryId":"a0000000-0000-4000-8000-000000000002"}'::jsonb from finance.transaction_allocations limit 1$$,'23503',null,'Composite FK rejects cross-household category');
update finance.household_members set status='REVOKED' where user_id='10000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*) from finance.categories),0::bigint,'Revoked unchanged JWT cannot read');
select is(api.save_categorization_definition(pg_temp.category_command())->'error'->>'code','NOT_AUTHORIZED','Revoked unchanged JWT cannot replay');
reset role;
update finance.household_members set status='ACTIVE' where user_id='10000000-0000-4000-8000-000000000001';
delete from auth.sessions where id='20000000-0000-4000-8000-000000000001';
set local role authenticated;
select is(api.save_categorization_definition(pg_temp.category_command())->'error'->>'code','NOT_AUTHORIZED','Deleted session denies replay');
select is((select count(*) from finance.categories),0::bigint,'Deleted session denies RLS read');
reset role;
delete from auth.users where id='10000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from finance.categories),0::bigint,'Deleted Auth user denies RLS read');
select * from finish();
rollback;
