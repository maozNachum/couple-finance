import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { goalFixture } from '../tests/integration/goal-fixture.mjs';
import { localAdmin,localSql,uuid,sqlText } from './local-supabase.mjs';
const f=await goalFixture();let checks=0;
const eq=(a,b,label)=>{assert.deepEqual(a,b,label);checks++;};
const h=uuid(f.households[0]),write=c=>f.rpc(f.a,'save_goal',c),read=(c=f.a)=>f.rpc(c,'goals_snapshot');
async function hold(query,seconds=2){
 const child=spawn('docker',['exec','-i','supabase_db_couple-finance','psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',c=>c===0?resolve():reject(new Error('Synthetic goal lock failed')));});
 const ready=new Promise((resolve,reject)=>{child.stdout.on('data',c=>{if(c.toString().includes('goal_lock_ready'))resolve();});child.on('close',c=>{if(c!==0)reject(new Error('Synthetic goal lock failed'));});});
 child.stdin.end(`begin;${query};select 'goal_lock_ready';select pg_sleep(${seconds});commit;`);await ready;return {done};
}
try{
 const c=f.command(),b=await f.account();await f.save(b,'-20','EXPENSE');
 const evidence=()=>localSql(`select jsonb_build_array(${['accounts','account_sources','transaction_revisions','transaction_allocations','balance_observations','fx_evidence','obligation_revisions','budget_revisions'].map(t=>`(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from finance.${t} t where household_id='${h}')`).join(',')});`);
 const before=evidence();
 eq((await f.anon.rpc('goals_snapshot')).error.code,'42501','anonymous read denied');
 eq((await f.anon.rpc('save_goal',{payload:c})).error.code,'42501','anonymous write denied');
 eq((await f.rpc(f.b,'save_goal',c)).error.code,'NOT_AUTHORIZED','foreign household write denied');
 for(const extra of [{acknowledge:false},{target:{amount:'0',currency:'ILS'}},{declared:{amount:'-1',currency:'ILS'}},{monthly:{amount:'1',currency:'USD'}},{targetDate:'2026-02-30'},{target:{amount:1,currency:'ILS'}},{target:{amount:'1.123456789',currency:'ILS'}},{name:''},{name:'\tWhitespace'},{name:'\u00a0Whitespace'},{verified:true},{ownership:{kind:'MEMBER',memberId:randomUUID()}},{ownership:{kind:'HOUSEHOLD',memberId:f.memberId}}])eq((await write({...c,...extra})).error.code,'INVALID_INPUT','strict bounded input');
 const retries=await Promise.all([write(c),write(c),write(c)]);eq(retries.every(r=>r.ok&&r.version===1),true,'parallel exact retries one version');
 eq((await write({...c,name:'Changed'})).error.code,'CONFLICT','complete payload digest');
 eq((await write({...c,idempotencyKey:randomUUID()})).error.code,'CONFLICT','same ID distinct key conflicts');
 const raced=f.command();const creates=await Promise.all([write(raced),write({...raced,idempotencyKey:randomUUID()})]);eq(creates.filter(r=>r.ok).length,1,'same ID create race one winner');
 const edit={...c,action:'EDIT',expectedVersion:1,idempotencyKey:randomUUID(),declared:{amount:'7000',currency:'ILS'}};
 const edits=await Promise.all([write(edit),write({...edit,idempotencyKey:randomUUID(),declared:{amount:'8000',currency:'ILS'}})]);eq(edits.filter(r=>r.ok).length,1,'concurrent versioned edit one winner');
 eq((await write(edit)).version,edits[0].ok?2:undefined,'exact winner or stale loser');
 const snapshot=(await read()).snapshot,head=snapshot.revisions.find(r=>r.id===c.id&&r.version===2);
 eq(snapshot.revisions.filter(r=>r.id===c.id).length,2,'history retained');eq((await read(f.b)).snapshot.revisions,[],'cross household read isolation');
 const personal=f.command({ownership:{kind:'MEMBER',memberId:f.memberId},target:{amount:'200',currency:'USD'},declared:{amount:'0',currency:'USD'},targetDate:null});
 eq((await f.rpc(f.peer,'save_goal',personal)).ok,true,'second member creates personally attributed goal');
 eq((await read()).snapshot.revisions.some(r=>r.id===personal.id),true,'personal goal visible to spouse');
 const foreignMember=JSON.parse(localSql(`select json_agg(id) from finance.household_members where household_id='${uuid(f.households[1])}';`))[0];
 eq((await write(f.command({ownership:{kind:'MEMBER',memberId:foreignMember}}))).error.code,'INVALID_INPUT','same household FK enforced');
 localSql(`update finance.household_members set status='REVOKED' where id='${uuid(f.memberId)}';`);
 eq((await write(f.command({ownership:personal.ownership}))).error.code,'INVALID_INPUT','new revoked attribution denied');
 eq((await write({...personal,action:'EDIT',expectedVersion:1,idempotencyKey:randomUUID(),name:'Retained personal'})).ok,true,'historical revoked attribution remains editable');
 eq((await f.rpc(f.peer,'save_goal',personal)).error.code,'NOT_AUTHORIZED','revoked actor cannot replay');
 eq((await write({...c,action:'EDIT',expectedVersion:2,idempotencyKey:randomUUID(),ownership:{kind:'MEMBER',memberId:f.memberId}})).error.code,'INVALID_INPUT','ownership immutable');
 eq((await write({...c,action:'EDIT',expectedVersion:2,idempotencyKey:randomUUID(),target:{amount:'30000',currency:'EUR'},declared:{amount:'6000',currency:'EUR'}})).error.code,'INVALID_INPUT','currency immutable');
 const archive={...c,name:head.name,declared:head.declared,action:'ARCHIVE',expectedVersion:2,idempotencyKey:randomUUID()};
 eq((await write({...archive,declared:c.declared})).error.code,head.declared.amount==='6000'?undefined:'INVALID_INPUT','archive cannot change declared amount');
 eq((await write(archive)).version,3,'archive retained revision');eq((await write(archive)).version,3,'archive exact replay');
 eq((await write({...archive,action:'EDIT',expectedVersion:3,idempotencyKey:randomUUID()})).error.code,'CONFLICT','archive terminal');eq((await write(c)).version,1,'original receipt unchanged');
 localSql(`create function private.goal_test_failure() returns trigger language plpgsql as $$begin if new.household_id='${h}' then raise exception 'synthetic failure';end if;return new;end$$;create trigger goal_test_failure before insert on private.goal_audit for each row execute function private.goal_test_failure();`);
 const rollback=f.command();
 try{eq((await write(rollback)).error.code,'INTERNAL_ERROR','late audit failure safe');eq(localSql(`select count(*) from finance.goals where id='${uuid(rollback.id)}';`),'0','head rolled back');eq(localSql(`select count(*) from private.goal_receipts where household_id='${h}' and idempotency_key=${sqlText(rollback.idempotencyKey)};`),'0','receipt rolled back');}
 finally{localSql('drop trigger goal_test_failure on private.goal_audit;drop function private.goal_test_failure();');}
 eq((await write(rollback)).ok,true,'same intent after atomic rollback');eq(evidence(),before,'no financial, FX, source, obligation or budget mutation');
 const holder=await hold(`update finance.household_members set status='REVOKED' where household_id='${h}' and user_id='${uuid(f.users[0].id)}'`);
 eq((await write(f.command())).error.code,'NOT_AUTHORIZED','late member revocation while blocked');await holder.done;
 eq((await write(c)).error.code,'NOT_AUTHORIZED','reauthorize before receipt');eq((await read()).snapshot.revisions,[],'revoked read clears goals');
 localSql(`update finance.household_members set status='ACTIVE' where household_id='${h}' and user_id='${uuid(f.users[0].id)}';`);
 const {data:{session}}=await f.a.auth.getSession(),claims=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url').toString());
 const expiry=await hold(`select 1 from finance.households where id='${h}' for update;update auth.sessions set not_after=clock_timestamp()+interval '1 second' where id='${uuid(claims.session_id)}'`);
 eq((await write(c)).error.code,'NOT_AUTHORIZED','expiry during household lock blocks replay');await expiry.done;
 localSql(`update auth.sessions set not_after=null where id='${uuid(claims.session_id)}';`);
 const revoked=await hold(`select 1 from finance.households where id='${h}' for update;delete from auth.sessions where id='${uuid(claims.session_id)}'`);
 eq((await write(f.command())).error.code,'NOT_AUTHORIZED','late deleted session denied');await revoked.done;
 eq((await read()).error.code,'NOT_AUTHORIZED','missing session read denied');
 await localAdmin().auth.admin.deleteUser(f.users[0].id);eq((await write(c)).error.code,'NOT_AUTHORIZED','deleted user denied');
 eq(localSql(`select count(*)>0 from finance.goal_revisions where household_id='${h}';`),'t','durable attribution after user deletion');
 console.log(`Goals API: ${checks} assertions passed.`);
}finally{await f.cleanup();}
