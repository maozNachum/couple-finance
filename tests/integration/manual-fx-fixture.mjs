import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { reconciliationFixture } from './reconciliation-fixture.mjs';

export async function manualFxFixture() {
  const f=await reconciliationFixture();
  async function account(c=f.a,h=f.households[0],policy='OBSERVED') {
    const record={account:{id:randomUUID(),householdId:h,name:'Synthetic historical USD',ownership:{kind:'HOUSEHOLD'},type:'SAVINGS',currency:'USD',valuationCurrency:'ILS',balancePolicy:policy,status:'ACTIVE'},version:1,manualSourceId:randomUUID()};
    assert.equal((await f.rpc(c,'create_account',record)).ok,true);return record;
  }
  const source=await account(),foreign=await account(f.b,f.households[1]);
  const command=(extra={})=>({householdId:f.households[0],sourceAccountId:source.account.id,id:randomUUID(),idempotencyKey:randomUUID(),base:'USD',quote:'ILS',rate:'3.7',effectiveDate:'2026-10-10',acknowledge:true,...extra});
  const fx=(extra={})=>({id:randomUUID(),base:'USD',quote:'ILS',rate:'3.7',effectiveDate:'2026-10-10',recordedAt:'2026-10-01T00:00:00Z',origin:{kind:'MANUAL',sourceId:source.manualSourceId},...extra});
  const observation=(rate,record=source,extra={})=>({id:randomUUID(),householdId:record.account.householdId,accountId:record.account.id,sourceId:record.manualSourceId,date:rate?.effectiveDate??'2026-10-10',money:{amount:'250.75',currency:'USD'},coverage:'PARTIAL',supersedesId:null,note:'Synthetic historical measurement',fx:rate,...extra});
  return {...f,source,foreign,fxAccount:account,command,fx,observation};
}
