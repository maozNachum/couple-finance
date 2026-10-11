import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createFixture } from '../tests/integration/local-fixtures.mjs';
import { localStatus, localSql, localAdmin, uuid } from './local-supabase.mjs';
const status=localStatus(), fixture=await createFixture();
const client=()=>createClient(status.API_URL,status.ANON_KEY,{db:{schema:'api'},auth:{persistSession:false,autoRefreshToken:false}});
const a=client(),b=client(),anon=client(); let checks=0;
const equal=(x,y,label)=>{assert.deepEqual(x,y,label);checks++;};
async function rpc(c,name,payload){const r=await c.rpc(name,{payload});assert.equal(r.error,null,`${name} transport`);return r.data;}
const def=(c,record,kind='CATEGORY',key=randomUUID())=>rpc(c,'save_categorization_definition',{kind,record,idempotencyKey:key});
const h=fixture.households[0], account={id:randomUUID(),householdId:h,name:'Synthetic categories cash',ownership:{kind:'HOUSEHOLD'},type:'CASH',currency:'ILS',valuationCurrency:'ILS',balancePolicy:'LEDGER',status:'ACTIVE'},source=randomUUID();
const cat={id:randomUUID(),householdId:h,version:1,name:'מזון',kind:'EXPENSE',status:'ACTIVE'};
const cat2={...cat,id:randomUUID(),name:'חיסכון'};
const rule={id:randomUUID(),householdId:h,version:1,name:'קניות',categoryId:cat.id,effect:'EXPENSE',operator:'CONTAINS',pattern:'shop',priority:10,status:'ACTIVE',normalization:1};
let movement;let gen=0;
function tx(effect='EXPENSE',amount='-10'){return {revisionId:randomUUID(),supersedesRevisionId:null,expectedVersion:0,idempotencyKey:randomUUID(),entryKind:'MOVEMENT',openingCoverage:null,reason:'',transaction:{id:randomUUID(),householdId:h,accountId:account.id,transactionDate:'2026-10-01',description:'  SHOP\tמזון  ',status:'POSTED',money:{amount,currency:'ILS'},provenance:[{source:{sourceId:source,kind:'MANUAL'}}],allocations:[{id:randomUUID(),effect,money:{amount,currency:'ILS'},ownership:{kind:'HOUSEHOLD'},categorization:{origin:'UNCLASSIFIED',userLocked:false}}]}};}
async function current(){const r=await a.rpc('transaction_snapshot');assert.equal(r.error,null);return r.data.history.filter(x=>x.transaction.id===movement.transaction.id).sort((x,y)=>y.version-x.version)[0];}
async function decision(action='RULE',overrides={}){const r=await current();return {householdId:h,accountId:account.id,transactionId:r.transaction.id,allocationId:r.transaction.allocations[0].id,expectedVersion:r.version,supersedesRevisionId:r.revisionId,revisionId:randomUUID(),generation:gen,idempotencyKey:randomUUID(),action,categoryId:action==='RULE'||action==='ASSIGN'?cat.id:null,ruleId:action==='RULE'?rule.id:null,...overrides};}
const apply=p=>rpc(a,'categorize_transaction',p);
const shape=t=>({...t,allocations:t.allocations.map(v=>{const copy={...v};delete copy.categoryId;delete copy.categorization;return copy;})});
try{
 for(const [c,u] of [[a,fixture.users[0]],[b,fixture.users[1]]])equal((await c.auth.verifyOtp({token_hash:u.hash,type:'invite'})).error,null,'login');
 equal((await a.rpc('create_account',{payload:{account,manualSourceId:source,version:1}})).data.ok,true,'account');
 for(const name of ['save_categorization_definition','categorize_transaction','categorization_snapshot'])equal((await anon.rpc(name,name==='categorization_snapshot'?{}:{payload:{}})).error!==null,true,'anonymous denied');
 const definitionKey=randomUUID();const first=await def(a,cat,'CATEGORY',definitionKey);equal(first.ok,true,'category');gen=first.generation;
 equal(await def(a,cat,'CATEGORY',definitionKey),first,'definition replay');
 equal((await def(a,{...cat,name:'different'},'CATEGORY',definitionKey)).error.code,'CONFLICT','changed receipt');
 let result=await def(a,cat2);equal(result.ok,true,'second category');gen=result.generation;
 result=await def(a,rule,'RULE');equal(result.ok,true,'rule');gen=result.generation;
 const foreign={...cat,id:randomUUID(),householdId:fixture.households[1]};equal((await def(b,foreign)).ok,true,'foreign category');
 equal((await def(a,{...rule,id:randomUUID(),categoryId:foreign.id},'RULE')).error.code,'INVALID_INPUT','cross household rule category');
 equal((await def(b,cat)).error.code,'NOT_AUTHORIZED','foreign household definition');
 equal((await b.rpc('categorization_snapshot')).data.catalogs.some(c=>c.householdId===h),false,'catalog isolation');
 movement=tx();equal((await rpc(a,'record_transaction',movement)).ok,true,'movement');
 const initial=await current();const before=localSql(`select count(*) from finance.transaction_revisions where household_id='${uuid(h)}'`);
 await a.rpc('categorization_snapshot');await a.rpc('categorization_snapshot');equal(localSql(`select count(*) from finance.transaction_revisions where household_id='${uuid(h)}'`),before,'preview read only');
 const cmd=await decision();const results=await Promise.all(Array.from({length:5},()=>apply(cmd)));equal(results.every(x=>x.ok&&x.revisionId===cmd.revisionId),true,'concurrent identical retry');
 equal((await current()).version,2,'one revision');equal(shape((await current()).transaction),shape(initial.transaction),'all financial fields and IDs unchanged');
 equal((await current()).transaction.allocations[0].categorization,{origin:'RULE',userLocked:false},'rule metadata');
 equal((await apply({...cmd,action:'ASSIGN',ruleId:null})).error.code,'CONFLICT','changed decision receipt');
 equal((await apply({...cmd,idempotencyKey:randomUUID()})).error.code,'CONFLICT','stale transaction');
 const stale=await decision();result=await def(a,{...cat,name:'מזון חדש',version:2});equal(result.ok,true,'rename');gen=result.generation;
 equal((await apply(stale)).error.code,'CONFLICT','stale catalog');
 const saved=(await a.rpc('categorization_snapshot')).data;equal(saved.decisions[0].evidence.category.name,'מזון','historical name');equal(saved.decisions[0].evidence.rule.version,1,'historical rule');
 equal((await apply(await decision('ASSIGN',{categoryId:foreign.id}))).error.code,'INVALID_INPUT','foreign assignment');
 equal((await rpc(b,'categorize_transaction',await decision())).error.code,'NOT_AUTHORIZED','other household apply');
 equal((await apply(await decision('RULE',{ruleId:randomUUID()}))).error.code,'CONFLICT','forged rule');
 equal((await apply(await decision('ASSIGN'))).ok,true,'manual locks');equal((await current()).transaction.allocations[0].categorization,{origin:'USER',userLocked:true},'user lock');
 equal((await apply(await decision())).error.code,'CONFLICT','locked rule rejected');
 equal((await apply(await decision('UNLOCK'))).ok,true,'explicit unlock');equal((await current()).transaction.allocations[0].categoryId,cat.id,'unlock keeps category');
 const candidates=await Promise.all([decision('ASSIGN'),decision('CLEAR')]);const competing=await Promise.all(candidates.map(apply));equal(competing.filter(x=>x.ok).length,1,'one concurrent category edit');equal(competing.filter(x=>x.error?.code==='CONFLICT').length,1,'stale edit conflicts');
 equal((await apply(await decision('CLEAR'))).ok,true,'clear');equal((await current()).transaction.allocations[0].categorization,{origin:'UNCLASSIFIED',userLocked:false},'clear eligible');
 const tied={...rule,id:randomUUID(),categoryId:cat2.id};result=await def(a,tied,'RULE');equal(result.ok,true,'tie setup');gen=result.generation;
 equal((await apply(await decision())).error.code,'CONFLICT','ambiguous no write');
 result=await def(a,{...tied,version:2,priority:11},'RULE');gen=result.generation;equal((await apply(await decision())).ok,true,'priority winner');
 result=await def(a,{...rule,version:2,status:'DISABLED'},'RULE');gen=result.generation;equal((await apply(await decision())).error.code,'CONFLICT','disabled rule not chosen');
 equal((await apply(await decision('RULE',{ruleId:tied.id,categoryId:cat2.id}))).ok,true,'remaining rule');
 result=await def(a,{...cat2,version:2,status:'ARCHIVED'});gen=result.generation;equal((await apply(await decision('ASSIGN',{categoryId:cat2.id}))).error.code,'INVALID_INPUT','archived assignment');
 equal((await current()).transaction.allocations[0].categoryId,cat2.id,'archived historical reference retained');
 const r=await current();const correction={transaction:r.transaction,revisionId:randomUUID(),expectedVersion:r.version,supersedesRevisionId:r.revisionId,entryKind:r.entryKind,openingCoverage:r.openingCoverage,reason:'Synthetic financial correction',idempotencyKey:randomUUID()};
 equal((await rpc(a,'record_transaction',correction)).ok,true,'manual correction preserves archived rule category');
 const forged={...correction,revisionId:randomUUID(),idempotencyKey:randomUUID(),expectedVersion:correction.expectedVersion+1,supersedesRevisionId:correction.revisionId,transaction:{...correction.transaction,allocations:correction.transaction.allocations.map(v=>({...v,categoryId:cat.id}))}};
 equal((await rpc(a,'record_transaction',forged)).error.code,'CONFLICT','manual cannot forge category');
 equal(shape((await current()).transaction),shape(initial.transaction),'ledger input never changed');
 // A late failure must roll back financial revision, audit, evidence, and receipts together.
 const fault=await decision('CLEAR');const count=localSql(`select count(*) from finance.transaction_revisions where household_id='${uuid(h)}'`);
 localSql(`create function private.synthetic_category_failure() returns trigger language plpgsql as $$ begin if new.household_id='${uuid(h)}'::uuid then raise exception 'synthetic'; end if; return new; end $$; create trigger synthetic_category_failure before insert on finance.categorization_decisions for each row execute function private.synthetic_category_failure();`);
 try{equal((await apply(fault)).error.code,'INTERNAL_ERROR','atomic failure');equal(localSql(`select count(*) from finance.transaction_revisions where household_id='${uuid(h)}'`),count,'revision rollback');equal(localSql(`select count(*) from private.categorization_receipts where household_id='${uuid(h)}' and idempotency_key='${uuid(fault.idempotencyKey)}'`),'0','receipt rollback');}finally{localSql('drop trigger synthetic_category_failure on finance.categorization_decisions; drop function private.synthetic_category_failure();');}
 equal((await apply(fault)).ok,true,'retry after rollback');
 for(const effect of ['ADJUSTMENT','TRANSFER','DEBT_PRINCIPAL','INVESTMENT_TRADE','UNCLASSIFIED']){movement=tx(effect);equal((await rpc(a,'record_transaction',movement)).ok,true,'explicit effect');equal((await apply(await decision('ASSIGN'))).error.code,'INVALID_INPUT','ineligible effect');}
 movement=tx('EXPENSE','10');equal((await rpc(a,'record_transaction',movement)).ok,true,'refund');equal((await apply(await decision('ASSIGN'))).ok,true,'positive expense assignment');
 const sessionA=(await a.auth.getSession()).data.session;assert.ok(sessionA);const unchanged=client();await unchanged.auth.setSession({access_token:sessionA.access_token,refresh_token:sessionA.refresh_token});
 localSql(`update finance.household_members set status='REVOKED' where household_id='${uuid(h)}';`);
 equal((await rpc(unchanged,'categorize_transaction',cmd)).error.code,'NOT_AUTHORIZED','revoked exact retry');equal((await def(unchanged,cat)).error.code,'NOT_AUTHORIZED','revoked definition');equal((await unchanged.rpc('categorization_snapshot')).data.catalogs.length,0,'revoked reads');
 localSql(`update finance.household_members set status='ACTIVE' where household_id='${uuid(h)}'; delete from auth.sessions where user_id='${uuid(fixture.users[0].id)}';`);
 equal((await rpc(unchanged,'categorize_transaction',cmd)).error.code,'NOT_AUTHORIZED','deleted session');
 const sessionB=(await b.auth.getSession()).data.session;assert.ok(sessionB);const tokenB=client();await tokenB.auth.setSession({access_token:sessionB.access_token,refresh_token:sessionB.refresh_token});
 await localAdmin().auth.admin.deleteUser(fixture.users[1].id);equal((await def(tokenB,foreign)).error.code,'NOT_AUTHORIZED','deleted Auth user');
 console.log(`Categorization integration: ${checks} assertions passed.`);
}finally{await fixture.cleanup();}
