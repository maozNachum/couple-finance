import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { localStatus, localSql, uuid } from './local-supabase.mjs';
import { createFixture } from '../tests/integration/local-fixtures.mjs';

const status = localStatus();
const fixture = await createFixture();
const client = () => createClient(status.API_URL, status.ANON_KEY, { db: { schema: 'api' }, auth: { persistSession: false, autoRefreshToken: false } });
const a = client(), b = client(), anon = client();
let checks = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
async function call(c, name, payload) {
  const result = await c.rpc(name, { payload });
  assert.equal(result.error, null, 'RPC transport failed');
  return result.data;
}
try {
  for (const [c, user] of [[a, fixture.users[0]], [b, fixture.users[1]]]) {
    const login = await c.auth.verifyOtp({ token_hash: user.hash, type: 'invite' });
    assert.equal(login.error, null, 'Synthetic sign-in failed');
  }
  const account = { id: randomUUID(), householdId: fixture.households[0], name: 'Synthetic account', ownership: { kind: 'HOUSEHOLD' }, type: 'LOAN', currency: 'USD', valuationCurrency: 'ILS', balancePolicy: 'OBSERVED', status: 'ACTIVE' };
  const record = { account, version: 1, manualSourceId: randomUUID() };
  equal((await anon.from('accounts').select('*')).error !== null, true);
  equal((await call(a,'create_account',record)).ok,true);
  equal((await call(a,'create_account',record)).ok,true);
  equal((await b.from('accounts').select('*')).data,[]);
  equal((await call(b,'create_account',{...record,account:{...account,id:randomUUID()}})).error.code,'NOT_AUTHORIZED');
  const row = { id: randomUUID(), householdId: account.householdId, accountId: account.id, sourceId: record.manualSourceId, date: '2026-10-01', money: { amount: '-9007199254740991.12345678', currency: 'USD' }, coverage: 'PARTIAL', supersedesId: null, note: 'Synthetic precision', fx: null };
  equal((await call(a,'record_balance',row)).ok,true);
  equal((await call(a,'record_balance',row)).ok,true);
  const reads = await a.from('balance_observations').select('payload');
  equal(reads.data[0].payload.money,row.money);
  equal((await b.from('balance_observations').select('*')).data,[]);
  equal((await call(b,'record_balance',{...row,id:randomUUID(),date:'2026-10-02'})).error.code,'NOT_AUTHORIZED');
  // Two actual concurrent HTTP requests: exactly one successor can win.
  const corrections = [1,2].map(n=>({...row,id:randomUUID(),supersedesId:row.id,note:`Synthetic correction ${n}`,money:{amount:String(-n),currency:'USD'}}));
  const results = await Promise.all(corrections.map(value=>call(a,'record_balance',value)));
  equal(results.filter(result=>result.ok).length,1);
  equal(results.filter(result=>result.error?.code==='CONFLICT').length,1);
  equal((await a.from('balance_observations').select('id')).data.length,2);
  const updates = await Promise.all(['First','Second'].map(name=>call(a,'update_account',{householdId:account.householdId,accountId:account.id,name,status:'ACTIVE',expectedVersion:1})));
  equal(updates.filter(result=>result.ok).length,1);
  equal(updates.filter(result=>result.error?.code==='CONFLICT').length,1);
  const latest = (await a.from('accounts').select('payload')).data[0].payload;
  equal(latest.version,2);
  equal(latest.account.id,account.id);
  equal((await call(a,'record_balance',{...row,id:randomUUID(),date:'2026-10-02',money:{amount:'1.000000000',currency:'USD'}})).error.code,'INVALID_INPUT');
  const fx = { id: randomUUID(),base:'USD',quote:'ILS',rate:'3.72',effectiveDate:'2026-10-02',recordedAt:'2026-10-01T00:00:00Z',origin:{kind:'MANUAL',sourceId:record.manualSourceId} };
  equal((await call(a,'record_balance',{...row,id:randomUUID(),date:'2026-10-02',money:{amount:'-100',currency:'USD'},fx})).ok,true);
  const foreign = await a.schema('finance').from('accounts').select('*');
  equal(foreign.error !== null,true);
  // A scalar snapshot must not inherit PostgREST's default 1,000-row cap.
  localSql(`insert into finance.balance_observations(id,household_id,account_id,source_id,observation_date,amount,currency,coverage,note)
    select gen_random_uuid(),'${uuid(account.householdId)}','${uuid(account.id)}','${uuid(record.manualSourceId)}',date '2020-01-01'+n,1,'USD','COMPLETE','Synthetic pagination regression'
    from generate_series(0,1000) n;`);
  const snapshot = await a.rpc('account_snapshot');
  equal(snapshot.error,null);
  equal(snapshot.data.observations.length,1004);
  equal((await b.rpc('account_snapshot')).data,{accounts:[],observations:[]});
  const before = (await a.auth.getSession()).data.session.access_token;
  localSql(`update finance.household_members set status='REVOKED' where household_id='${uuid(account.householdId)}' and user_id='${uuid(fixture.users[0].id)}';`);
  equal((await a.from('accounts').select('*')).data,[]);
  equal((await a.from('balance_observations').select('*')).data,[]);
  equal((await a.rpc('account_snapshot')).data,{accounts:[],observations:[]});
  equal((await call(a,'record_balance',{...row,id:randomUUID(),date:'2026-10-03'})).error.code,'NOT_AUTHORIZED');
  equal((await a.auth.getSession()).data.session.access_token,before);
  console.log(`Accounts integration: ${checks} assertions passed (real Auth/PostgREST, concurrent commands and revoked membership).`);
} finally {
  await Promise.all([a.auth.signOut(),b.auth.signOut()]);
  await fixture.cleanup();
}
