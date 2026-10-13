import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { reconciliationFixture } from './reconciliation-fixture.mjs';
export async function budgetFixture(){
 const f=await reconciliationFixture();
 function command(extra={}){return {id:randomUUID(),householdId:f.households[0],month:'2026-10',scope:{kind:'TOTAL',memberId:null,categoryId:null},planned:{amount:'100',currency:'ILS'},action:'CREATE',expectedVersion:0,idempotencyKey:randomUUID(),...extra};}
 async function opening(record,amount='1000'){
  const cmd=f.movement(record,amount,'ADJUSTMENT',null,{transactionDate:'2026-10-01'});
  assert.equal((await f.rpc(f.a,'record_transaction',{...cmd,entryKind:'OPENING',openingCoverage:'COMPLETE'})).ok,true);
 }
 async function category(extra={},client=f.a){
  const c={id:randomUUID(),householdId:f.households[0],name:'מזון סינתטי',version:1,kind:'EXPENSE',status:'ACTIVE',...extra};
  assert.equal((await f.rpc(client,'save_categorization_definition',{kind:'CATEGORY',record:c,idempotencyKey:randomUUID()})).ok,true);return c;
 }
 return {...f,command,opening,category};
}
