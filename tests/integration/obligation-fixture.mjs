import { randomUUID } from 'node:crypto';
import { reconciliationFixture } from './reconciliation-fixture.mjs';
export async function obligationFixture() {
 const f=await reconciliationFixture();
 const bank=await f.account();
 const opening=f.movement(bank,'1000','ADJUSTMENT',null,{transactionDate:'2026-01-01'});
 await f.rpc(f.a,'record_transaction',{...opening,entryKind:'OPENING',openingCoverage:'COMPLETE'});
 function command(extra={}) {return {householdId:f.households[0],id:randomUUID(),expectedVersion:0,idempotencyKey:randomUUID(),acknowledge:true,action:'CONFIRM',
  plan:{name:'התחייבות סינתטית',accountId:bank.account.id,ownership:{kind:'HOUSEHOLD'},money:{amount:'10',currency:'ILS'},effect:'EXPENSE',schedule:{frequency:'MONTHLY',day:31},startDate:'2026-07-01',endDate:null},effectiveFrom:'2026-07-01',origin:[],...extra};}
 const evidence=(c,record=bank)=>({accountId:c.transaction.accountId,accountVersion:record.version,transactionId:c.transaction.id,revisionId:c.revisionId,transactionVersion:c.expectedVersion+1,allocationId:c.transaction.allocations.find(a=>a.effect==='EXPENSE')?.id??c.transaction.allocations[0].id});
 function match(c,actual,date='2026-10-31',extra={}) {return {householdId:c.householdId,id:randomUUID(),expectedVersion:0,idempotencyKey:randomUUID(),acknowledge:true,action:'LINK',obligationId:c.id,obligationVersion:1,expectedObligationVersion:1,date,evidence:evidence(actual),...extra};}
 return {...f,bank,command,evidence,match};
}
