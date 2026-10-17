begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();
-- Privileged fixture setup only. Every access assertion below switches to a real API role.
insert into auth.users(id, email) values
 ('10000000-0000-4000-8000-000000000001','a@example.test'),
 ('10000000-0000-4000-8000-000000000002','b@example.test'),
 ('10000000-0000-4000-8000-000000000003','removed@example.test');
insert into auth.sessions(id, user_id) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002'),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003');
insert into finance.profiles(id, display_name) values
 ('10000000-0000-4000-8000-000000000001','Synthetic A'),
 ('10000000-0000-4000-8000-000000000002','Synthetic B'),
 ('10000000-0000-4000-8000-000000000003','Synthetic removed');
insert into finance.households(id,name) values
 ('30000000-0000-4000-8000-000000000001','Household A'),
 ('30000000-0000-4000-8000-000000000002','Household B');
insert into finance.household_members(id, household_id, user_id, display_name, status) values
 ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Synthetic A','ACTIVE'),
 ('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Synthetic B','ACTIVE'),
 ('40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','Synthetic removed','REVOKED');

create function pg_temp.fx_command(extra jsonb default '{}'::jsonb) returns jsonb language sql as $$
 select jsonb_build_object('householdId','30000000-0000-4000-8000-000000000001','sourceAccountId','50000000-0000-4000-8000-000000000001','id',gen_random_uuid(),'idempotencyKey',gen_random_uuid()::text,'base','USD','quote','ILS','rate','3.7','effectiveDate','2026-10-10','acknowledge',true)||extra;
$$;
create function pg_temp.fx_observation(f jsonb,extra jsonb default '{}'::jsonb) returns jsonb language sql as $$
 select jsonb_build_object('id',gen_random_uuid(),'householdId','30000000-0000-4000-8000-000000000001','accountId','50000000-0000-4000-8000-000000000001','sourceId','70000000-0000-4000-8000-000000000001','date','2026-10-11','money',jsonb_build_object('amount','10','currency','USD'),'coverage','PARTIAL','supersedesId',null,'note','Synthetic FX assertion','fx',f)||extra;
$$;
select ok(not has_table_privilege('authenticated','finance.fx_evidence','INSERT'),'direct FX INSERT revoked');
select ok(not has_function_privilege('authenticated','private.insert_manual_fx(uuid,jsonb,uuid,text)','EXECUTE'),'generic insertion helper private');
select ok(not has_function_privilege('authenticated','private.lock_fx_actor(uuid)','EXECUTE'),'locking helper private');
select ok(not has_function_privilege('authenticated','private.fx_actor_live(uuid,uuid)','EXECUTE'),'post-wait authorization helper private');
select ok(not has_function_privilege('authenticated','private.guard_observation()','EXECUTE'),'trigger not client callable');
select ok(not has_table_privilege('authenticated','private.fx_receipts','SELECT'),'receipts private');
select ok(not has_table_privilege('authenticated','private.fx_audit','INSERT'),'audit private');
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('private.fx_receipts'::regclass,'private.fx_audit'::regclass)),'private tables have RLS');
select ok((select bool_and(proconfig @> array['search_path=""']) from pg_proc where oid in ('private.record_manual_fx(jsonb)'::regprocedure,'private.guard_observation()'::regprocedure,'private.insert_manual_fx(uuid,jsonb,uuid,text)'::regprocedure)),'privileged paths have fixed search path');
set local role authenticated;
select is(api.record_manual_fx(pg_temp.fx_command())->'error'->>'code','NOT_AUTHORIZED','missing live session');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(api.create_account('{"account":{"id":"50000000-0000-4000-8000-000000000001","householdId":"30000000-0000-4000-8000-000000000001","name":"Synthetic FX origin","ownership":{"kind":"HOUSEHOLD"},"type":"SAVINGS","currency":"USD","valuationCurrency":"ILS","balancePolicy":"OBSERVED","status":"ACTIVE"},"version":1,"manualSourceId":"70000000-0000-4000-8000-000000000001"}'::jsonb)->>'ok','true','manual source created atomically');
select throws_ok($sql$insert into finance.fx_evidence values('30000000-0000-4000-8000-000000000001',gen_random_uuid(),'{}')$sql$,'42501',null,'direct insert denied even to member');
select is(api.record_manual_fx(pg_temp.fx_command('{"sourceAccountId":"50000000-0000-4000-8000-000000000099"}'))->'error'->>'code','INVALID_INPUT','nonexistent source account');
select is(api.record_manual_fx(pg_temp.fx_command('{"householdId":"30000000-0000-4000-8000-000000000002"}'))->'error'->>'code','NOT_AUTHORIZED','foreign household');
select is(api.record_manual_fx(pg_temp.fx_command('{"origin":{"kind":"LIVE_SYNC","sourceId":"70000000-0000-4000-8000-000000000001"}}'))->'error'->>'code','INVALID_INPUT','browser cannot invent origin');
select is(api.record_manual_fx(pg_temp.fx_command('{"base":"ILS","quote":"USD"}'))->'error'->>'code','INVALID_INPUT','source account direction checked');
select is(api.record_manual_fx(pg_temp.fx_command('{"effectiveDate":"2026-02-30"}'))->'error'->>'code','INVALID_INPUT','invalid effective date');
select is(api.record_manual_fx(pg_temp.fx_command(jsonb_build_object('rate',v)))->'error'->>'code','INVALID_INPUT','invalid decimal rejected: '||v) from unnest(array['0','-1','1e2','1.1234567890123','1000000000000000000']) v;
select is(api.record_manual_fx(pg_temp.fx_command('{"rate":3.7}'))->'error'->>'code','INVALID_INPUT','JSON number rejected');
reset role;
create temp table fx_intent as select pg_temp.fx_command() command;
grant select on fx_intent to authenticated;
set local role authenticated;
select is(api.record_manual_fx((select command from fx_intent))->>'ok','true','missing historical rate accepted');
select is(api.record_manual_fx((select command from fx_intent)),api.record_manual_fx((select command from fx_intent)),'exact replay identical including server time');
select is(api.record_manual_fx((select command||'{"rate":"3.8"}' from fx_intent))->'error'->>'code','CONFLICT','changed payload under key rejected');
select is(api.record_manual_fx(pg_temp.fx_command())->'error'->>'code','CONFLICT','eligible existing rate blocks create');
select is(api.record_manual_fx((select command||jsonb_build_object('idempotencyKey',gen_random_uuid()::text,'effectiveDate','2026-10-12') from fx_intent))->'error'->>'code','CONFLICT','same immutable ID different content');
reset role;
select is((select count(*)::integer from private.fx_receipts where household_id='30000000-0000-4000-8000-000000000001'),1,'one receipt for exact retries');
select is((select count(*)::integer from private.fx_audit where household_id='30000000-0000-4000-8000-000000000001'),1,'one minimal audit');
select is((select snapshot->'origin' from finance.fx_evidence where household_id='30000000-0000-4000-8000-000000000001'),'{"kind":"MANUAL","sourceId":"70000000-0000-4000-8000-000000000001"}'::jsonb,'server-derived real provenance');
create temp table inline_fx as select jsonb_build_object('id',gen_random_uuid(),'base','USD','quote','ILS','rate','3.75','effectiveDate','2026-10-11','recordedAt','2026-10-01T00:00:00Z','origin',jsonb_build_object('kind','MANUAL','sourceId','70000000-0000-4000-8000-000000000001')) f;
grant select on inline_fx to authenticated;
set local role authenticated;
select is(api.record_balance(pg_temp.fx_observation((select jsonb_set(f,'{origin,sourceId}','"70000000-0000-4000-8000-000000000099"') from inline_fx)))->'error'->>'code','INVALID_INPUT','inline nonexistent origin rejected');
select is(api.record_balance(pg_temp.fx_observation((select jsonb_set(f,'{origin,kind}','"LIVE_SYNC"') from inline_fx)))->'error'->>'code','INVALID_INPUT','stored/manual kind mismatch rejected');
select is(api.record_balance(pg_temp.fx_observation((select jsonb_set(f,'{effectiveDate}','"2026-10-12"') from inline_fx)))->'error'->>'code','INVALID_INPUT','observation wrong effective day rejected');
select is(api.record_balance(pg_temp.fx_observation((select f||'{"base":"ILS","quote":"USD"}' from inline_fx)))->'error'->>'code','INVALID_INPUT','observation reverse pair rejected');
select is(api.record_balance(pg_temp.fx_observation((select f from inline_fx)))->>'ok','true','inline FX works after INSERT revocation');
select is(api.record_manual_fx(pg_temp.fx_command('{"effectiveDate":"2026-10-11"}'))->'error'->>'code','CONFLICT','inline evidence visible to standalone missing check');
reset role;
select is((select count(*)::integer from finance.fx_evidence where household_id='30000000-0000-4000-8000-000000000001'),2,'invalid inline writes left no rates');
select is((select count(*)::integer from finance.balance_observations where household_id='30000000-0000-4000-8000-000000000001'),1,'invalid inline writes left no observations');
select is((select count(*)::integer from finance.account_sources where household_id='30000000-0000-4000-8000-000000000001'),1,'source history unchanged');
select is((select snapshot=f from finance.fx_evidence cross join inline_fx where id=(f->>'id')::uuid),true,'inline snapshot unchanged');
update finance.household_members set status='REVOKED' where id='40000000-0000-4000-8000-000000000001';
set local role authenticated;
select is(api.record_manual_fx((select command from fx_intent))->'error'->>'code','NOT_AUTHORIZED','revoked replay denied');
select is(api.record_balance(pg_temp.fx_observation((select f from inline_fx)))->'error'->>'code','NOT_AUTHORIZED','revoked observation denied');
select is((select count(*)::integer from finance.fx_evidence),0,'RLS hides revoked evidence');
reset role;
update finance.household_members set status='ACTIVE' where id='40000000-0000-4000-8000-000000000001';
update auth.sessions set not_after=now()-interval '1 second' where id='20000000-0000-4000-8000-000000000001';
set local role authenticated;
select is(api.record_manual_fx((select command from fx_intent))->'error'->>'code','NOT_AUTHORIZED','expired session replay denied');
set local role anon;
select throws_ok($sql$select api.record_manual_fx('{}')$sql$,'42501',null,'anonymous execution denied');
reset role;
select * from finish();
rollback;
