import { obligationsSnapshotSchema, obligationRevisionSchema, obligationCommandSchema, paymentDecisionSchema } from '@finance/contracts/obligations';
import type { ObligationsSnapshot, ObligationRevision } from '@finance/contracts/obligations';
import { recurringCandidates, expectedDates, expectedObligations, obligationContext, selectionForObligation, eligibleObligationPayments } from '@finance/domain/obligations';
import { accountRecordSchema } from '@finance/contracts/valuation';
import { transactionRevisionSchema } from '@finance/contracts/ledger';
import type { TransactionRevision } from '@finance/contracts/ledger';
import { reportingSnapshotSchema } from '@finance/contracts/reporting';
import { reconciliationDecisionSchema } from '@finance/contracts/reconciliation';

export const obligationCases:{name:string;run:()=>void}[]=[];
const test=(name:string,run:()=>void)=>obligationCases.push({name:`obligations: ${name}`,run});
const eq=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Expected ${JSON.stringify(b)}, received ${JSON.stringify(a)}`);};
const rejects=(fn:()=>unknown)=>{let failed=false;try{fn();}catch{failed=true;}if(!failed)throw new Error('Expected rejection');};
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const stamp='2026-10-01T00:00:00Z';
const account=(n=10,currency='ILS')=>accountRecordSchema.parse({account:{id:id(n),householdId:id(1),name:'Synthetic',type:'BANK',currency,valuationCurrency:currency,balancePolicy:'LEDGER',ownership:{kind:'HOUSEHOLD'},status:'ACTIVE'},version:1,manualSourceId:id(n+100),sources:[{id:id(n+100),householdId:id(1),accountId:id(n),kind:'MANUAL',authoritativeFrom:null}]});
const revision=(n:number,date:string,amount='-10',effect='EXPENSE',opts:{account?:number;currency?:string;status?:string;member?:boolean;opening?:boolean;description?:string}={})=>transactionRevisionSchema.parse({revisionId:id(n+1000),version:1,supersedesRevisionId:null,entryKind:opts.opening?'OPENING':'MOVEMENT',openingCoverage:opts.opening?'COMPLETE':null,reason:'',createdAt:stamp,recordedAt:stamp,transaction:{id:id(n+2000),householdId:id(1),accountId:id(opts.account??10),transactionDate:date,description:opts.description??'Synthetic subscription',status:opts.status??'POSTED',money:{amount,currency:opts.currency??'ILS'},provenance:[{source:{sourceId:id((opts.account??10)+100),kind:'MANUAL'}}],allocations:[{id:id(n+3000),effect,money:{amount,currency:opts.currency??'ILS'},ownership:opts.member?{kind:'MEMBER',memberId:id(2)}:{kind:'HOUSEHOLD'},categorization:{origin:'USER',userLocked:true}}]}});
const opening=()=>revision(1,'2024-01-01','1000','ADJUSTMENT',{opening:true});
const monthly=()=>[revision(2,'2026-07-31'),revision(3,'2026-08-31'),revision(4,'2026-09-30')];
const plan=(extra={})=>obligationRevisionSchema.parse({householdId:id(1),id:id(5),version:1,plan:{name:'Synthetic confirmed',accountId:id(10),ownership:{kind:'HOUSEHOLD'},money:{amount:'10',currency:'ILS'},effect:'EXPENSE',schedule:{frequency:'MONTHLY',day:31},startDate:'2024-01-01',endDate:null},effectiveFrom:'2024-01-01',origin:[],status:'ACTIVE',actorMemberId:id(2),recordedAt:stamp,...extra});
function snapshot(history:readonly TransactionRevision[]=[opening(),...monthly()],revisions:readonly ObligationRevision[]=[],extra:Partial<ObligationsSnapshot>={},accounts=[account()]) {
  const reporting=reportingSnapshotSchema.parse({households:[{id:id(1),name:'Synthetic',createdAt:stamp}],members:[{id:id(2),householdId:id(1),userId:id(3),displayName:'Synthetic',status:'ACTIVE'}],accounts,history,observations:[],decisions:[],rates:[],references:[],size:2+accounts.length+history.length});
  const s={reporting,revisions,payments:[],rejections:[],...extra};return obligationsSnapshotSchema.parse({...s,size:s.revisions.length+s.payments.length+s.rejections.length});
}
const candidates=(s=snapshot())=>recurringCandidates(s,id(1));
test('three exact monthly occurrences support only an uncertain hypothesis',()=>{
  const c=candidates().candidates[0]!;eq([c.confidence,c.proposed.schedule.day,c.proposed.money.amount,c.origin.length],['SUPPORTING',31,'10',3]);eq(c.issues,['DESCRIPTION_IDENTITY_UNVERIFIED','EXTERNAL_COVERAGE_UNKNOWN']);
});
test('two similar charges never form a recurring hypothesis',()=>eq(candidates(snapshot([opening(),...monthly().slice(0,2)])).candidates,[]));
test('input order independent, financial history unchanged, stable references retained',()=>{
  const s=snapshot(),before=JSON.stringify(s);eq(candidates(s),candidates(snapshot([...s.reporting.history].reverse())));eq(JSON.stringify(s),before);eq(candidates(s).candidates[0]!.origin.map(e=>e.revisionId),monthly().map(r=>r.revisionId));
});
test('normalization preserves unrelated descriptions while folding ASCII whitespace/case',()=>{
  const rows=monthly().map((r,i)=>transactionRevisionSchema.parse({...r,transaction:{...r.transaction,description:['  SYNTHETIC subscription ','Synthetic\t subscription','Synthetic subscription'][i]}}));eq(candidates(snapshot([opening(),...rows])).candidates.length,1);
  const unrelated=rows.map((r,i)=>transactionRevisionSchema.parse({...r,transaction:{...r.transaction,description:`merchant ${i}`}}));eq(candidates(snapshot([opening(),...unrelated])).candidates.length,0);
});
for(const effect of ['INCOME','TRANSFER','DEBT_PRINCIPAL','INVESTMENT_TRADE','ADJUSTMENT','UNCLASSIFIED'])test(`${effect} never becomes expense by sign/name/category`,()=>{
  const rows=monthly().map(r=>transactionRevisionSchema.parse({...r,transaction:{...r.transaction,allocations:r.transaction.allocations.map(a=>({...a,effect}))}}));eq(candidates(snapshot([opening(),...rows])).candidates.length,0);
});
test('recurring refunds excluded explicitly',()=>{const r=candidates(snapshot([opening(),revision(2,'2026-07-31','10'),revision(3,'2026-08-31','10'),revision(4,'2026-09-30','10')]));eq(r.candidates,[]);eq(r.diagnostics.includes('REFUNDS_EXCLUDED'),true);});
for(const status of ['PENDING','VOIDED'])test(`${status} is not a posted occurrence`,()=>eq(candidates(snapshot([opening(),...monthly().map(r=>transactionRevisionSchema.parse({...r,transaction:{...r.transaction,status}}))])).candidates,[]));
test('corrected current revisions replace historical amounts; category locks remain',()=>{
  const rows=monthly(),original=rows[2]!,corrected=transactionRevisionSchema.parse({...original,revisionId:id(999),supersedesRevisionId:original.revisionId,version:2,reason:'Synthetic correction',transaction:{...original.transaction,money:{amount:'-12',currency:'ILS'},allocations:original.transaction.allocations.map(a=>({...a,money:{amount:'-12',currency:'ILS'}}))}});
  const s=snapshot([opening(),corrected,...rows]),c=candidates(s).candidates[0]!;eq(c.confidence,'AMBIGUOUS');eq(c.origin[2]!.revisionId,corrected.revisionId);eq(c.occurrences[2]!.transaction.allocations[0]!.categorization.userLocked,true);
});
test('accounts, ownership and currencies never combine',()=>{
  const s=snapshot([opening(),...monthly().slice(0,2),revision(4,'2026-09-30','-10','EXPENSE',{account:11})],[],{},[account(),account(11)]);eq(candidates(s).candidates.length,0);
  eq(candidates(snapshot([opening(),...monthly().slice(0,2),revision(4,'2026-09-30','-10','EXPENSE',{member:true})])).candidates.length,0);
  eq(candidates(snapshot([opening(),...monthly().slice(0,2),revision(4,'2026-09-30','-10','EXPENSE',{account:11,currency:'USD'})],[],{},[account(),account(11,'USD')])).candidates.length,0);
});
test('missing month, equal amounts on irregular dates and duplicate months stay ambiguous',()=>{
  for(const rows of [[revision(2,'2026-06-30'),revision(3,'2026-08-31'),revision(4,'2026-09-30')],[revision(2,'2026-07-04'),revision(3,'2026-08-12'),revision(4,'2026-09-30')],[revision(2,'2026-07-31'),revision(3,'2026-07-30'),revision(4,'2026-09-30')]])eq(candidates(snapshot([opening(),...rows])).candidates[0]!.confidence,'AMBIGUOUS');
});
test('duplicate occurrences in the maximum calendar month remain ambiguous without overflow',()=>{
  eq(candidates(snapshot([opening(),revision(2,'9999-12-31'),revision(3,'9999-12-31'),revision(4,'9999-12-31')])).candidates[0]!.confidence,'AMBIGUOUS');
});
test('partial or missing coverage cannot be hidden',()=>{eq(candidates(snapshot(monthly())).candidates[0]!.issues.includes('INCOMPLETE_HISTORY'),true);const partial=transactionRevisionSchema.parse({...opening(),openingCoverage:'PARTIAL'});eq(candidates(snapshot([partial,...monthly()])).candidates[0]!.issues.includes('INCOMPLETE_HISTORY'),true);});
test('reviewed rejection and confirmed evidence suppress only exact reference set',()=>{
  const s=snapshot(),c=candidates(s).candidates[0]!;
  const rejected=snapshot(undefined,[],{rejections:[{id:id(6),householdId:s.reporting.households[0]!.id,evidence:c.origin,actorMemberId:s.reporting.members[0]!.id,recordedAt:s.reporting.households[0]!.createdAt}]});eq(candidates(rejected).candidates.length,0);
  eq(candidates(snapshot(undefined,[plan({origin:c.origin})])).candidates.length,0);
});
test('one original allocation cannot justify contradictory confirmed obligations',()=>{
  const c=candidates().candidates[0]!;rejects(()=>obligationContext(snapshot(undefined,[plan({origin:c.origin}),plan({id:id(7),origin:c.origin})])));
});
test('account metadata edits do not resurrect accepted or rejected unchanged evidence',()=>{
  const s=snapshot(),origin=candidates(s).candidates[0]!.origin;
  const renamed=accountRecordSchema.parse({...account(),version:2,account:{...account().account,name:'Renamed synthetic account'}});
  eq(candidates(snapshot(undefined,[plan({origin})],{},[renamed])).candidates,[]);
  const rejection={id:id(6),householdId:s.reporting.households[0]!.id,evidence:origin,actorMemberId:s.reporting.members[0]!.id,recordedAt:s.reporting.households[0]!.createdAt};
  eq(candidates(snapshot(undefined,[],{rejections:[rejection]},[renamed])).candidates,[]);
  const first=plan({origin}),changed=plan({version:2,effectiveFrom:'2026-11-01',origin:origin.map(e=>({...e,accountVersion:2}))});
  rejects(()=>obligationContext(snapshot(undefined,[first,changed],{},[renamed])));
});
for(const day of [28,29,30,31])for(const year of [2024,2025])test(`day ${day} February ${year} clamps without drift`,()=>{
  const p=plan(),v=plan({plan:{...p.plan,schedule:{frequency:'MONTHLY',day}}});
  eq(expectedDates(v,`${year}-02-01`,`${year}-03-31`),[`${year}-02-${Math.min(day,year===2024?29:28)}`,`${year}-03-${day}`]);
});
test('year boundaries and inclusive start/end retain exact foreign Money',()=>{
  const p=plan(),v=plan({plan:{...p.plan,money:{amount:'0.00000001',currency:'USD'},startDate:'2024-12-31',endDate:'2025-02-28'},effectiveFrom:'2024-12-31'});
  eq(expectedDates(v,'2024-12-01','2025-03-31'),['2024-12-31','2025-01-31','2025-02-28']);eq(v.plan.money.amount,'0.00000001');
});
test('recurrence computation bounded including empty snapshots and maximum year',()=>{
  rejects(()=>expectedDates(plan(),'2024-01-01','2034-01-01'));rejects(()=>expectedObligations(snapshot(),id(1),'2026-10-31','2026-10-01'));
  eq(expectedDates(plan(),'9999-12-01','9999-12-31'),['9999-12-31']);
  const plans=Array.from({length:1001},(_,n)=>plan({id:id(10000+n)}));rejects(()=>expectedObligations(snapshot([opening()],plans),id(1),'2026-10-01','2026-10-31'));
});
test('edits preserve previous windows and archival stops only future dates',()=>{
  const first=plan(),second=plan({version:2,effectiveFrom:'2026-10-01',plan:{...first.plan,money:{amount:'20',currency:'ILS'},schedule:{frequency:'MONTHLY',day:15}}}),archive=plan({...second,version:3,status:'ARCHIVED',effectiveFrom:'2026-11-01'});
  const events=expectedObligations(snapshot([opening()],[archive,first,second]),id(1),'2026-09-01','2026-12-31');eq(events.map(e=>[e.date,e.obligation.version,e.money.amount]),[['2026-09-30',1,'10'],['2026-10-15',2,'20']]);eq(events.every(e=>e.state==='UNRESOLVED'),true);
});
test('history gaps, wrong context, changed origin and retroactive version boundaries rejected',()=>{
  const first=plan();for(const v of [plan({version:3}),plan({version:2,effectiveFrom:first.effectiveFrom}),plan({version:2,effectiveFrom:'2026-10-01',plan:{...first.plan,accountId:id(11)}})])rejects(()=>obligationContext(snapshot([opening()],[first,v])));
  rejects(()=>obligationContext(snapshot([opening()],[plan({actorMemberId:id(999)})])));
});
const payment=(r:TransactionRevision,extra={})=>paymentDecisionSchema.parse({householdId:id(1),id:id(6),version:1,obligationId:id(5),obligationVersion:1,date:'2026-09-30',action:'LINK',evidence:selectionForObligation(r,1,r.transaction.allocations[0]!.id),actual:{amount:'10',currency:'ILS'},state:'ASSOCIATED',actorMemberId:id(2),recordedAt:stamp,...extra});
test('similar actuals alone unresolved; explicit exact link associated; partial and excess explicit',()=>{
  const r=monthly()[2]!;eq(expectedObligations(snapshot(undefined,[plan()]),id(1),'2026-09-01','2026-09-30')[0]!.state,'UNRESOLVED');
  for(const [amount,state] of [['-10','ASSOCIATED'],['-7','PARTIAL'],['-12','AMBIGUOUS']]){const row=revision(4,'2026-09-30',amount);const d=payment(row,{actual:{amount:amount!.slice(1),currency:'ILS'},state});eq(expectedObligations(snapshot([opening(),row],[plan()],{payments:[d]}),id(1),'2026-09-01','2026-09-30')[0]!.state,state);}
  eq(eligibleObligationPayments(snapshot([opening(),r],[plan()],{payments:[payment(r)]}),plan().plan,id(1)).length,0);
});
test('void/correction stales actual link; unlink retains history and releases evidence',()=>{
  const r=monthly()[2]!,d=payment(r),corrected=transactionRevisionSchema.parse({...r,revisionId:id(999),version:2,supersedesRevisionId:r.revisionId,reason:'Synthetic void',transaction:{...r.transaction,status:'VOIDED'}});
  eq(expectedObligations(snapshot([opening(),r,corrected],[plan()],{payments:[d]}),id(1),'2026-09-01','2026-09-30')[0]!.state,'STALE');
  const unlink=paymentDecisionSchema.parse({...d,version:2,action:'UNLINK',evidence:null,actual:null,state:'UNLINKED'});
  eq(expectedObligations(snapshot([opening(),r],[plan()],{payments:[d,unlink]}),id(1),'2026-09-01','2026-09-30')[0]!.state,'UNRESOLVED');
  eq(eligibleObligationPayments(snapshot([opening(),r],[plan()],{payments:[d,unlink]}),plan().plan,id(1)).length,1);
});
test('duplicate payment claims and forged allocation references fail',()=>{
  const r=monthly()[2]!,d=payment(r);rejects(()=>obligationContext(snapshot([opening(),r],[plan()],{payments:[d,payment(r,{id:id(7),date:'2026-08-31'})]})));
  rejects(()=>obligationContext(snapshot([opening(),r],[plan()],{payments:[payment(r,{evidence:{...d.evidence,allocationId:id(999)}})]})));
});
test('split loan expense can be explicitly reviewed without consuming principal as expense',()=>{
  const r=revision(4,'2026-09-30','-100'),a=r.transaction.allocations[0]!;
  const split=transactionRevisionSchema.parse({...r,transaction:{...r.transaction,allocations:[{...a,money:{amount:'-10',currency:'ILS'}},{...a,id:id(999),effect:'DEBT_PRINCIPAL',money:{amount:'-90',currency:'ILS'}}]}});
  eq(eligibleObligationPayments(snapshot([opening(),split]),plan().plan,id(1)).map(p=>p.actual.amount),['10']);eq(candidates(snapshot([opening(),split])).candidates.length,0);
});
test('card settlement with wrong EXPENSE never duplicates linked card purchase',()=>{
  const rows=monthly(),d=reconciliationDecisionSchema.parse({householdId:id(1),id:id(50),version:1,action:'LINK',kind:'CARD',reason:'Synthetic',actorMemberId:id(2),recordedAt:stamp,participants:rows.map(r=>({selection:{accountId:r.transaction.accountId,accountVersion:1,transactionId:r.transaction.id,revisionId:r.revisionId,expectedVersion:1,role:'PAYMENT',parts:[{allocationId:r.transaction.allocations[0]!.id,meaning:'TRANSFER'}]},revision:r,sourceReference:null,importItemId:null,contentHash:null})),fx:null,state:'NEEDS_CORRECTION',difference:null,purchaseDifference:null});
  const base=snapshot(),s=obligationsSnapshotSchema.parse({...base,reporting:{...base.reporting,decisions:[d],size:base.reporting.size+1}});eq(candidates(s).candidates,[]);eq(candidates(s).diagnostics.includes('CARD_SETTLEMENT_EXCLUDED'),true);eq(eligibleObligationPayments(s,plan().plan,id(1)),[]);
});
test('confirmation must be explicit and rejects unsupported schedules and future FX',()=>{
  const v=plan(),base={householdId:v.householdId,id:v.id,expectedVersion:0,action:'CONFIRM',idempotencyKey:'synthetic-obligation-command',acknowledge:true,plan:v.plan,effectiveFrom:v.effectiveFrom,origin:[]};
  eq(obligationCommandSchema.safeParse(base).success,true);for(const extra of [{acknowledge:false},{plan:{...v.plan,schedule:{frequency:'WEEKLY',day:1}}},{futureFx:'3.7'},{plan:{...v.plan,money:{amount:'-10',currency:'ILS'}}}])eq(obligationCommandSchema.safeParse({...base,...extra}).success,false);
});
