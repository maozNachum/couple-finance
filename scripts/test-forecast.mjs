import assert from 'node:assert/strict';
import { obligationFixture } from '../tests/integration/obligation-fixture.mjs';
import { localAdmin, localSql, uuid } from './local-supabase.mjs';
const f=await obligationFixture(); let checks=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
try {
  const c=f.command();eq((await f.rpc(f.a,'obligation_command',c)).ok,true,'synthetic future obligation');
  const actual=await f.save(f.bank,'-10','EXPENSE',null,{transactionDate:'2026-09-30'});
  eq((await f.rpc(f.a,'obligation_command',f.match(c,actual))).ok,true,'synthetic explicit association');
  const before=await f.rpc(f.a,'obligations_snapshot');
  const record=()=>localSql(`select json_build_array((select jsonb_agg(to_jsonb(t) order by revision_id) from finance.transaction_revisions t where household_id='${uuid(f.households[0])}'),(select jsonb_agg(to_jsonb(t) order by id,version) from finance.obligation_revisions t where household_id='${uuid(f.households[0])}'),(select jsonb_agg(to_jsonb(t) order by id,version) from finance.obligation_payment_decisions t where household_id='${uuid(f.households[0])}'),(select count(*) from finance.balance_observations where household_id='${uuid(f.households[0])}'),(select count(*) from finance.budget_revisions where household_id='${uuid(f.households[0])}'),(select count(*) from finance.reconciliation_decisions where household_id='${uuid(f.households[0])}'));`);
  const evidence=record();
  for(let i=0;i<3;i++)eq(await f.rpc(f.a,'obligations_snapshot'),before,'forecast reads are repeatable and complete');
  eq(record(),evidence,'reads never mutate balances, revisions, budgets, obligations, links or reconciliation');
  eq(before.snapshot.reporting.history.some(r=>r.revisionId===actual.revisionId),true,'current actual history retained');
  eq(before.snapshot.payments.length,1,'explicit association retained');
  const other=await f.rpc(f.b,'obligations_snapshot');eq(other.snapshot.reporting.households.every(h=>h.id!==f.households[0]),true,'independent household isolation');
  eq(other.snapshot.revisions.length,0,'foreign obligations hidden');
  eq((await f.anon.rpc('obligations_snapshot')).error?.code,'42501','anonymous denial');
  const oldSession=await f.a.auth.getSession(),sid=JSON.parse(Buffer.from(oldSession.data.session.access_token.split('.')[1],'base64url').toString()).session_id;
  localSql(`delete from auth.sessions where id='${uuid(sid)}';`);
  eq((await f.rpc(f.a,'obligations_snapshot')).error.code,'NOT_AUTHORIZED','deleted live session denied with unchanged JWT');
  const link=await localAdmin().auth.admin.generateLink({type:'magiclink',email:f.users[0].email});
  eq((await f.a.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'email'})).error,null,'new synthetic session');
  localSql(`update finance.household_members set status='REVOKED' where household_id='${uuid(f.households[0])}' and user_id='${uuid(f.users[0].id)}';`);
  eq((await f.rpc(f.a,'obligations_snapshot')).snapshot.reporting.households.length,0,'revoked unchanged JWT loses forecast graph');
  eq(record(),evidence,'authorization checks do not mutate financial history');
  console.log(`Forecast read API: ${checks} assertions passed.`);
} finally {await f.cleanup();}

// Task 14 reuses this gate; the established verification command chain stays unchanged.
await import('./test-data-quality.mjs');
