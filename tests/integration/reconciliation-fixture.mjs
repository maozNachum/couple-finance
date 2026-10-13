import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createFixture } from './local-fixtures.mjs';
import { localStatus } from '../../scripts/local-supabase.mjs';
export async function reconciliationFixture(){
 const fixture=await createFixture(),status=localStatus();
 const client=()=>createClient(status.API_URL,status.ANON_KEY,{db:{schema:'api'},auth:{persistSession:false,autoRefreshToken:false}});
 const a=client(),b=client(),anon=client();
 for(const [c,u] of [[a,fixture.users[0]],[b,fixture.users[1]]])assert.equal((await c.auth.verifyOtp({token_hash:u.hash,type:'invite'})).error,null);
 async function rpc(c,name,payload){const r=await c.rpc(name,payload===undefined?undefined:{payload});assert.equal(r.error,null,'RPC transport');return r.data;}
 async function account(type='BANK',currency='ILS',c=a,h=fixture.households[0]){
  const record={account:{id:randomUUID(),householdId:h,name:`Synthetic ${type} ${currency}`,ownership:{kind:'HOUSEHOLD'},type,currency,valuationCurrency:currency,balancePolicy:'LEDGER',status:'ACTIVE'},version:1,manualSourceId:randomUUID()};
  assert.equal((await rpc(c,'create_account',record)).ok,true);return record;
 }
 /** @param {Array<{id:string,effect:string,money:{amount:string,currency:string},ownership:{kind:string},categorization:{origin:string,userLocked:boolean}}>|null} parts */
 function movement(record,amount,effect='TRANSFER',parts=null,options={}){
  return {revisionId:randomUUID(),supersedesRevisionId:null,expectedVersion:0,idempotencyKey:randomUUID(),entryKind:'MOVEMENT',openingCoverage:null,reason:'',transaction:{id:randomUUID(),householdId:record.account.householdId,accountId:record.account.id,transactionDate:'2026-10-02',money:{amount,currency:record.account.currency},description:'Synthetic movement',status:'POSTED',provenance:[{source:{sourceId:record.manualSourceId,kind:'MANUAL'}}],allocations:parts??[{id:randomUUID(),effect,money:{amount,currency:record.account.currency},ownership:{kind:'HOUSEHOLD'},categorization:{origin:'USER',userLocked:true}}],...options}};
 }
 /** @param {Array<{id:string,effect:string,money:{amount:string,currency:string},ownership:{kind:string},categorization:{origin:string,userLocked:boolean}}>|null} parts */
 async function save(record,amount,effect='TRANSFER',parts=null,options={}){const cmd=movement(record,amount,effect,parts,options);assert.equal((await rpc(a,'record_transaction',cmd)).ok,true);return cmd;}
 function participant(cmd,record,role='COUNTERPART',kind='TRANSFER',meanings=null){return {accountId:cmd.transaction.accountId,accountVersion:record.version,transactionId:cmd.transaction.id,revisionId:cmd.revisionId,expectedVersion:cmd.expectedVersion+1,role,parts:cmd.transaction.allocations.map((p,i)=>({allocationId:p.id,meaning:meanings?.[i]??(kind==='LOAN'?'PRINCIPAL':role==='PURCHASE'?'PURCHASE':'TRANSFER')}))};}
 function link(participants,kind='TRANSFER',extra={}){return {householdId:fixture.households[0],id:randomUUID(),expectedVersion:0,idempotencyKey:randomUUID(),action:'LINK',kind,participants,fxRateId:null,reason:'Synthetic explicit supporting evidence',acknowledge:true,...extra};}
 return {...fixture,a,b,anon,rpc,account,movement,save,participant,link};
}
