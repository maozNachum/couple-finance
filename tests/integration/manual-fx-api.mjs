import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { manualFxFixture } from './manual-fx-fixture.mjs';
import { localSql,uuid } from '../../scripts/local-supabase.mjs';

export async function manualFxApiCases() {
  const f=await manualFxFixture();let checks=0;
  const eq=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
  const write=c=>f.rpc(f.a,'record_manual_fx',c);
  async function hold(query) {
    const child=spawn('docker',['exec','-i','supabase_db_couple-finance','psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('Synthetic lock holder failed')));});
    const ready=new Promise((resolve,reject)=>{child.stdout.on('data',chunk=>{if(chunk.toString().includes('fx_lock_ready'))resolve();});child.on('close',code=>{if(code!==0)reject(new Error('Synthetic lock holder failed'));});});
    child.stdin.end(`begin; ${query}; select 'fx_lock_ready'; select pg_sleep(2); commit;`);
    await ready;return {done};
  }
  try {
    const cmd=f.command();
    for(const extra of [{sourceAccountId:f.foreign.account.id},{sourceAccountId:randomUUID()},{origin:{kind:'LIVE_SYNC',sourceId:f.source.manualSourceId}},{sourceId:randomUUID()},{base:'ILS',quote:'USD'},{base:'USD',quote:'USD'},{effectiveDate:'2026-02-30'},{rate:3.7},{rate:'0'},{rate:'-1'},{rate:'1e2'},{rate:'1.1234567890123'},{rate:'1000000000000000000'}])
      eq((await write({...cmd,...extra})).error.code,'INVALID_INPUT','strict command/source/direction/date/decimal validation');
    eq((await f.rpc(f.b,'record_manual_fx',cmd)).error.code,'NOT_AUTHORIZED','foreign actor');
    eq((await f.anon.rpc('record_manual_fx',{payload:cmd})).error.code,'42501','anonymous entry denied');
    const first=await write(cmd);eq(first.ok,true,'missing exact pair created');
    eq(first.evidence.rate.origin,{kind:'MANUAL',sourceId:f.source.manualSourceId},'origin derived from stored source');
    eq(await write(cmd),first,'lost-response exact replay retains original identity and server timestamp');
    eq((await write({...cmd,rate:'3.8'})).error.code,'CONFLICT','changed payload same key');
    eq((await write(f.command({id:cmd.id,effectiveDate:'2026-10-11'}))).error.code,'CONFLICT','immutable ID cannot be reused');
    eq((await write(f.command())).error.code,'CONFLICT','existing exact evidence refuses competing create');
    const raced=await Promise.all([write(f.command({effectiveDate:'2026-10-12'})),write(f.command({effectiveDate:'2026-10-12',rate:'3.8'}))]);
    eq(raced.filter(r=>r.ok).length,1,'concurrent pair/day has one winner');eq(raced.filter(r=>r.error?.code==='CONFLICT').length,1,'concurrent loser explicitly conflicts');
    const other=await f.fxAccount();
    const obs=f.observation(first.evidence.rate,other);
    eq((await f.rpc(f.a,'record_balance',obs)).ok,true,'inline observation reuses independently sourced household evidence');
    eq((await f.rpc(f.a,'record_balance',{...obs,id:randomUUID(),supersedesId:obs.id,note:'Synthetic exact reuse'})).ok,true,'correction reuses identical snapshot');
    eq((await f.rpc(f.a,'record_balance',{...obs,id:randomUUID(),supersedesId:obs.id,note:'Synthetic conflict',fx:{...obs.fx,rate:'4'}})).error.code,'INVALID_INPUT','conflicting ID cannot replace snapshot');
    for(const origin of [{kind:'MANUAL',sourceId:randomUUID()},{kind:'MANUAL',sourceId:f.foreign.manualSourceId},{kind:'LIVE_SYNC',sourceId:f.source.manualSourceId},{kind:'FILE_IMPORT',sourceId:f.source.manualSourceId}])
      eq((await f.rpc(f.a,'record_balance',f.observation(f.fx({effectiveDate:'2026-10-13',origin})))).error.code,'INVALID_INPUT','new inline FX rejects invented/foreign/mismatched source');
    const inline=f.observation(f.fx({effectiveDate:'2026-10-14'}));
    eq((await f.rpc(f.a,'record_balance',inline)).ok,true,'new observation plus FX commits after INSERT revocation');
    eq((await write(f.command({effectiveDate:'2026-10-14'}))).error.code,'CONFLICT','inline rate participates in missing check');
    const competing=f.observation(f.fx({rate:'3.8'}),await f.fxAccount());
    eq((await f.rpc(f.a,'record_balance',competing)).ok,true,'explicit independent observation retains competing evidence');
    eq((await write(f.command())).error.code,'CONFLICT','ambiguous evidence blocks standalone writer');
    const before=await f.rpc(f.a,'reporting_snapshot');
    eq(before.snapshot.rates.filter(e=>e.rate.effectiveDate==='2026-10-10').length,2,'both immutable competing records retained');
    eq(before.snapshot.observations.length,4,'all original/corrected observations retained');
    eq(before.snapshot.accounts.find(a=>a.account.id===other.account.id).sources[0].id,other.manualSourceId,'balance source unchanged');
    const holder=await hold(`update finance.household_members set status='REVOKED' where household_id='${uuid(f.households[0])}' and user_id='${uuid(f.users[0].id)}'`);
    eq((await write(f.command({effectiveDate:'2026-10-16'}))).error.code,'NOT_AUTHORIZED','concurrent membership revocation serializes before mutation');await holder.done;
    localSql(`update finance.household_members set status='ACTIVE' where household_id='${uuid(f.households[0])}' and user_id='${uuid(f.users[0].id)}';`);
    localSql(`update finance.household_members set status='REVOKED' where household_id='${uuid(f.households[0])}' and user_id='${uuid(f.users[0].id)}';`);
    eq((await write(cmd)).error.code,'NOT_AUTHORIZED','revocation rechecked before receipt replay');
    eq((await f.rpc(f.a,'record_balance',f.observation(f.fx({effectiveDate:'2026-10-15'})))).error.code,'NOT_AUTHORIZED','revoked inline intake');
    eq((await f.rpc(f.a,'reporting_snapshot')).snapshot.rates,[],'revoked evidence hidden');
    localSql(`update finance.household_members set status='ACTIVE' where household_id='${uuid(f.households[0])}' and user_id='${uuid(f.users[0].id)}';`);
    const {data:{session}}=await f.a.auth.getSession();const claims=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url').toString());
    const expiry=await hold(`select 1 from finance.households where id='${uuid(f.households[0])}' for update; update auth.sessions set not_after=clock_timestamp()+interval '1 second' where id='${uuid(claims.session_id)}'`);
    eq((await write(f.command({effectiveDate:'2026-10-17'}))).error.code,'NOT_AUTHORIZED','session expiry during lock wait cannot authorize evidence');await expiry.done;
    localSql(`update auth.sessions set not_after=now()-interval '1 second' where id='${uuid(claims.session_id)}';`);
    eq((await write(cmd)).error.code,'NOT_AUTHORIZED','expired live session denied including replay');
    console.log(`Historical FX API: ${checks} assertions passed.`);
  } finally {await f.cleanup();}
}
