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
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('finance.profiles'::regclass,'finance.households'::regclass,'finance.household_members'::regclass,'private.identity_audit'::regclass)), 'RLS enabled on every application table');
select ok((select bool_and('security_invoker=true'=any(reloptions)) from pg_class where relnamespace='api'::regnamespace and relkind='v'), 'all API views use invoker rights');
select ok(not has_function_privilege('anon','api.rename_profile(text)','execute'), 'anonymous RPC grant denied');
select ok(not has_function_privilege('authenticated','private.audit_identity()','execute'), 'audit helper is not callable');
select ok(not has_schema_privilege('authenticated','api','create'), 'users cannot shadow API objects');
select ok((select bool_and(proconfig @> array['search_path=""']) from pg_proc where pronamespace='private'::regnamespace), 'private helpers have fixed empty search paths');

set local role anon;
select is(current_user::text, 'anon', 'anonymous tests run as anon');
select throws_ok('select * from api.households', '42501', null, 'anon cannot read households');
select throws_ok('select * from finance.household_members', '42501', null, 'anon cannot read base tables');
select throws_ok('select private.has_live_session()', '42501', null, 'anon cannot call private helper');
select throws_ok($$select api.rename_profile('attack')$$, '42501', null, 'anon cannot execute user commands');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","role":"authenticated","user_metadata":{"household_id":"30000000-0000-4000-8000-000000000002","role":"admin"}}',true);
select is(current_user::text,'authenticated','RLS assertions are not service-role tests');
select is((select count(*) from finance.households),1::bigint,'A sees only one base household');
select is((select name from api.households),'Household A','A sees only own household through invoker view');
select is((select count(*) from api.household_members where household_id='30000000-0000-4000-8000-000000000002'),0::bigint,'A cannot enumerate B members');
select is((select count(*) from api.my_profile),1::bigint,'A sees only own profile');
select is(private.is_household_member('30000000-0000-4000-8000-000000000002'),false,'forged metadata cannot grant B membership');
select throws_ok($$insert into finance.households(name) values ('unauthorized')$$,'42501',null,'users cannot create households');
select throws_ok($$update finance.household_members set status='ACTIVE'$$,'42501',null,'users cannot restore or grant membership');
select throws_ok($$insert into finance.household_members(household_id,user_id,display_name) values ('30000000-0000-4000-8000-000000000002',auth.uid(),'attack')$$,'42501',null,'users cannot create membership');
select throws_ok($$delete from finance.household_members$$,'42501',null,'users cannot delete memberships');
select throws_ok($$update finance.profiles set id='10000000-0000-4000-8000-000000000002'$$,'42501',null,'profile identity is immutable to user');
select throws_ok($$update api.my_profile set display_name='bypass'$$,'42501',null,'views have no write grants');
select throws_ok($$select * from private.identity_audit$$,'42501',null,'audit records are private');
select results_eq($$update finance.profiles set display_name='attack' where id='10000000-0000-4000-8000-000000000002' returning id$$,array[]::uuid[],'cross-user profile update filtered by RLS');
select is(api.rename_profile('Updated A')->>'ok','true','authorized invoker command works');
select is((select display_name from api.my_profile),'Updated A','own profile mutation persisted');
select is(api.rename_profile('')->'error'->>'code','INVALID_INPUT','invalid command gives fixed safe error');
select is(api.rename_profile(null)->'error'->>'safeMessage','Some values are invalid.','null input does not expose diagnostics');
reset role;
select ok(exists(select 1 from private.identity_audit where actor_id='10000000-0000-4000-8000-000000000001' and operation='UPDATE'),'user command audited atomically');
-- Prove WITH CHECK independently of the production column-grant restriction.
grant update(id) on finance.profiles to authenticated;
set local role authenticated;
select throws_ok($$update finance.profiles set id='10000000-0000-4000-8000-000000000003' where id=auth.uid()$$,'42501',null,'WITH CHECK independently prevents changing profile owner');
reset role;
revoke update(id) on finance.profiles from authenticated;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select name from api.households),'Household B','B sees only B');
select is((select count(*) from finance.household_members),1::bigint,'B cannot read A base memberships');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","session_id":"20000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from api.households),0::bigint,'revoked member sees no household');
select is((select count(*) from api.household_members),0::bigint,'revoked member sees no members');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from api.households),0::bigint,'session must belong to same user');
select is(api.rename_profile('attack')->'error'->>'code','NOT_AUTHORIZED','wrong session denies command');
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*) from api.my_profile),0::bigint,'missing session denies profile');
reset role;

-- Test the composite membership key using a transaction-local probe, not a financial feature.
create table private.membership_reference_probe(household_id uuid, member_id uuid,
 foreign key(household_id, member_id) references finance.household_members(household_id,id));
select lives_ok($$insert into private.membership_reference_probe values ('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001')$$,'same-household composite reference works');
select throws_ok($$insert into private.membership_reference_probe values ('30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001')$$,'23503',null,'cross-household composite reference rejected');
update finance.household_members set status='REVOKED' where user_id='10000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*) from api.households),0::bigint,'membership removal takes effect with unchanged JWT');
reset role;
delete from auth.sessions where user_id='10000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*) from api.households),0::bigint,'deleted session denies still-valid access token');
select is(api.rename_profile('attack')->'error'->>'code','NOT_AUTHORIZED','deleted session denies mutation');
reset role;
update auth.sessions set not_after=now()-interval '1 minute' where user_id='10000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(private.has_live_session(),false,'expired database session is rejected');
reset role;
update auth.sessions set not_after=null where user_id='10000000-0000-4000-8000-000000000001';
update auth.users set banned_until=now()+interval '1 hour' where id='10000000-0000-4000-8000-000000000001';
set local role authenticated;
select is(private.has_live_session(),false,'banned user cannot reuse a session');
reset role;

-- Delete a currently active identity with an existing historical composite reference.
update auth.users set banned_until=null where id='10000000-0000-4000-8000-000000000001';
update finance.household_members set status='ACTIVE' where id='40000000-0000-4000-8000-000000000001';
select throws_ok($$update finance.household_members set user_id='10000000-0000-4000-8000-000000000003' where id='40000000-0000-4000-8000-000000000001'$$,'23514',null,'even operator writes cannot reassign a member to another identity');
select throws_ok($$update finance.household_members set household_id='30000000-0000-4000-8000-000000000002' where id='40000000-0000-4000-8000-000000000001'$$,'23514',null,'durable member cannot move households');
select throws_ok($$update finance.household_members set id=gen_random_uuid() where id='40000000-0000-4000-8000-000000000002'$$,'23514',null,'unreferenced member ID is also immutable');
select lives_ok($$delete from auth.users where id='10000000-0000-4000-8000-000000000001'$$,'Auth deletion succeeds without deleting referenced membership');
select is((select count(*) from finance.profiles where id='10000000-0000-4000-8000-000000000001'),0::bigint,'ephemeral Auth profile is deleted');
select is((select count(*) from finance.household_members where id='40000000-0000-4000-8000-000000000001'),1::bigint,'durable member survives Auth deletion');
select ok((select user_id is null and status='REVOKED' from finance.household_members where id='40000000-0000-4000-8000-000000000001'),'Auth deletion atomically unlinks and revokes');
select is((select display_name from finance.household_members where id='40000000-0000-4000-8000-000000000001'),'Synthetic A','attribution snapshot survives profile rename and deletion');
select is((select count(*) from private.membership_reference_probe p join finance.household_members m on (p.household_id,p.member_id)=(m.household_id,m.id)),1::bigint,'existing historical reference remains valid');
select lives_ok($$insert into private.membership_reference_probe values ('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001')$$,'future references can use the retained member ID');
select throws_ok($$insert into private.membership_reference_probe values ('30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001')$$,'23503',null,'cross-household references still fail after identity deletion');
select throws_ok($$delete from finance.household_members where id='40000000-0000-4000-8000-000000000001'$$,'23503',null,'historical reference prevents privileged member deletion');
select throws_ok($$delete from finance.households where id='30000000-0000-4000-8000-000000000002'$$,'23503',null,'household deletion cannot cascade through memberships');
select ok(exists(select 1 from private.identity_audit where record_id='40000000-0000-4000-8000-000000000001' and operation='UPDATE'),'unlink is audited');
set local role authenticated;
-- The claims have not changed since the active/expired/banned checks above.
select is((select count(*) from api.households),0::bigint,'deleted identity cannot read with unchanged JWT');
select is((select count(*) from api.household_members),0::bigint,'deleted identity cannot read household membership');
select is(api.rename_profile('attack')->'error'->>'code','NOT_AUTHORIZED','deleted identity cannot mutate with unchanged JWT');
reset role;

-- Explicit unlink must work even while the Auth identity and session still exist.
update finance.household_members set status='ACTIVE' where id='40000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","session_id":"20000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*) from api.households),1::bigint,'linked identity has access before explicit unlink');
select is((select display_name from api.household_members where id='40000000-0000-4000-8000-000000000001'),'Synthetic A','remaining member can read former member attribution via invoker view');
reset role;
update finance.household_members set user_id=null where id='40000000-0000-4000-8000-000000000003';
select is((select status from finance.household_members where id='40000000-0000-4000-8000-000000000003'),'REVOKED','explicit unlink revokes active membership');
update finance.household_members set status='ACTIVE' where id='40000000-0000-4000-8000-000000000003';
select is((select status from finance.household_members where id='40000000-0000-4000-8000-000000000003'),'REVOKED','unlinked member cannot retain ACTIVE status');
set local role authenticated;
select is(private.has_live_session(),true,'unlinked user still has a live Auth session');
select is((select count(*) from api.households),0::bigint,'explicit unlink blocks unchanged JWT despite live session');
select throws_ok($$update finance.household_members set user_id=auth.uid(),status='ACTIVE' where id='40000000-0000-4000-8000-000000000001'$$,'42501',null,'different authenticated user cannot claim orphaned membership');
reset role;
select throws_ok($$update finance.household_members set user_id='10000000-0000-4000-8000-000000000003' where id='40000000-0000-4000-8000-000000000001'$$,'23514',null,'orphan cannot be relinked even through privileged DML');
-- Even recreating the exact deleted UUID does not relink retained history.
insert into auth.users(id,email) values ('10000000-0000-4000-8000-000000000001','a@example.test');
insert into finance.profiles(id,display_name) values ('10000000-0000-4000-8000-000000000001','New identity');
insert into auth.sessions(id,user_id) values ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is(private.has_live_session(),true,'replacement identity has its own live session');
select is((select count(*) from api.households),0::bigint,'recreated identity never implicitly regains historical membership');
reset role;
select * from finish();
rollback;
