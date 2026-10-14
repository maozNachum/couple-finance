import { dataQualityRequestSchema, dataQualitySnapshotSchema } from '@finance/contracts/data-quality';
import { financialDataQuality, dataQualityContext, observationAge } from '@finance/domain/data-quality';
import { obligationsSnapshotSchema, obligationRevisionSchema, paymentDecisionSchema } from '@finance/contracts/obligations';
import type { ObligationsSnapshot, ObligationRevision, PaymentDecision } from '@finance/contracts/obligations';
import { accountRecordSchema, observationSchema } from '@finance/contracts/valuation';
import { transactionRevisionSchema } from '@finance/contracts/ledger';
import type { TransactionRevision } from '@finance/contracts/ledger';
import { reportingSnapshotSchema } from '@finance/contracts/reporting';
import { budgetRevisionSchema } from '@finance/contracts/budgets';
import { budgetReport } from '@finance/domain/budgets';
import { categorySchema } from '@finance/contracts/categorization';
import { householdIdSchema } from '@finance/contracts/identity';
import { householdMemberListSchema } from '@finance/contracts/household';
import { fxRateSchema } from '@finance/contracts/fx';
import { reconciliationDecisionSchema } from '@finance/contracts/reconciliation';
import { selectionFor } from '@finance/domain/reconciliation';
import { selectionForObligation } from '@finance/domain/obligations';
export const qualityCases: {name:string;run:()=>void}[]=[];
const test=(name:string,run:()=>void)=>qualityCases.push({name:'data quality: '+name,run});
const eq=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error('Quality mismatch: '+JSON.stringify({expected:b,actual:a}));};
const rejects=(f:()=>unknown)=>{let failed=false;try{f();}catch{failed=true;}eq(failed,true);};
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const stamp='2026-10-01T00:00:00Z';
const account=(n=10,extra={})=>accountRecordSchema.parse({account:{id:id(n),householdId:id(1),name:'Synthetic',type:'BANK',currency:'ILS',valuationCurrency:'ILS',balancePolicy:'LEDGER',ownership:{kind:'HOUSEHOLD'},status:'ACTIVE',...extra},version:1,manualSourceId:id(n+100),sources:[{id:id(n+100),householdId:id(1),accountId:id(n),kind:'MANUAL',authoritativeFrom:'0001-01-01'}]});
const revision=(n:number,amount='-10',effect='EXPENSE',extra:{date?:string;account?:number;opening?:boolean;coverage?:string;currency?:string;status?:string;valueDate?:string}={})=>transactionRevisionSchema.parse({revisionId:id(n+1000),version:1,supersedesRevisionId:null,entryKind:extra.opening?'OPENING':'MOVEMENT',openingCoverage:extra.opening?extra.coverage??'COMPLETE':null,reason:'',createdAt:stamp,recordedAt:stamp,transaction:{id:id(n+2000),householdId:id(1),accountId:id(extra.account??10),transactionDate:extra.date??'2026-10-10',...(extra.valueDate?{valueDate:extra.valueDate}:{}),description:'Synthetic',status:extra.status??'POSTED',money:{amount,currency:extra.currency??'ILS'},provenance:[{source:{sourceId:id((extra.account??10)+100),kind:'MANUAL'}}],allocations:[{id:id(n+3000),effect,money:{amount,currency:extra.currency??'ILS'},ownership:{kind:'HOUSEHOLD'},categorization:{origin:'USER',userLocked:true}}]}});
const opening=(amount='1000',acct=10,n=1,coverage='COMPLETE',currency='ILS')=>revision(n,amount,'ADJUSTMENT',{opening:true,date:'2026-01-01',account:acct,coverage,currency});
const plan=(extra={})=>obligationRevisionSchema.parse({householdId:id(1),id:id(5),version:1,plan:{name:'Synthetic planning',accountId:id(10),ownership:{kind:'HOUSEHOLD'},money:{amount:'100',currency:'ILS'},effect:'EXPENSE',schedule:{frequency:'MONTHLY',day:10},startDate:'2026-01-01',endDate:null},effectiveFrom:'2026-01-01',origin:[],status:'ACTIVE',actorMemberId:id(2),recordedAt:stamp,...extra});
function snapshot(history:readonly TransactionRevision[]=[opening()],revisions:readonly ObligationRevision[]=[],accounts=[account()],extra:Partial<ObligationsSnapshot['reporting']>={},payments:readonly PaymentDecision[]=[]) {
  const raw={households:[{id:id(1),name:'Synthetic',createdAt:stamp}],members:[{id:id(2),householdId:id(1),userId:id(3),displayName:'Synthetic',status:'ACTIVE'}],accounts,history,observations:[],decisions:[],rates:[],references:[],...extra};
  const reporting=reportingSnapshotSchema.parse({...raw,size:raw.households.length+raw.members.length+raw.accounts.length+raw.history.length+raw.observations.length+raw.decisions.length+raw.rates.length});
  return obligationsSnapshotSchema.parse({reporting,revisions,payments,rejections:[],size:revisions.length+payments.length});
}

const quality=(s=snapshot(),extra={})=>dataQualitySnapshotSchema.parse({version:1,capturedAt:stamp,obligations:s,categories:[],budgets:[],size:0,...extra});
const request=(extra={})=>dataQualityRequestSchema.parse({reporting:{householdId:id(1),asOf:'2026-10-01',month:'2026-10',currency:'ILS'},forecast:null,...extra});
const calc=(s=quality(),q=request())=>financialDataQuality(s,q);
const observation=(date='2026-09-01',extra={})=>observationSchema.parse({id:id(900),householdId:id(1),accountId:id(10),sourceId:id(110),date,money:{amount:'100',currency:'ILS'},coverage:'COMPLETE',supersedesId:null,note:'',fx:null,recordedAt:'2026-10-01T00:00:00Z',...extra});
const forecast=()=>({householdId:id(1),start:'2026-10-01',evidenceAsOf:'2026-10-14',horizon:30,buffer:{amount:'0',currency:'ILS'},accounts:[{accountId:id(10),choice:'INCLUDE'}]});

function scopedCategoryQuality(kind:'MEMBER'|'SHARED'|'ALL'|'TOTAL',owners:readonly ('A'|'B'|'SHARED')[]) {
  const category=categorySchema.parse({id:id(50),householdId:id(1),name:'Synthetic',kind:'EXPENSE',status:'ACTIVE',version:1});
  const b=budgetRevisionSchema.parse({id:id(60),householdId:id(1),month:'2026-10',scope:{kind,memberId:kind==='MEMBER'?id(2):null,categoryId:kind==='TOTAL'?null:id(50)},planned:{amount:'100',currency:'ILS'},version:1,status:'ACTIVE',actorMemberId:id(2),recordedAt:stamp,category:kind==='TOTAL'?null:category});
  const expenses=owners.map((owner,i)=>{const v=revision(i+2);return transactionRevisionSchema.parse({...v,transaction:{...v.transaction,allocations:v.transaction.allocations.map(a=>({...a,ownership:owner==='SHARED'?{kind:'HOUSEHOLD'}:{kind:'MEMBER',memberId:id(owner==='A'?2:4)}}))}});});
  return quality(snapshot([opening(),...expenses],[],[account()],{members:householdMemberListSchema.parse([{id:id(2),householdId:id(1),userId:id(3),displayName:'A',status:'ACTIVE'},{id:id(4),householdId:id(1),userId:id(5),displayName:'B',status:'ACTIVE'}])}),{categories:[category],budgets:[b],size:2});
}
test('personal category budget A never attributes exclusively B-owned expenses',()=>{
  const s=scopedCategoryQuality('MEMBER',['B']),r=calc(s);
  eq(r.findings.filter(f=>f.type==='CATEGORY_SCOPE'),[]);
  eq(r.calculations.find(c=>c.module==='BUDGET')?.state,'PARTIAL');
  const canonical=budgetReport({reporting:s.obligations.reporting,categories:s.categories,revisions:s.budgets,size:s.size},request().reporting).comparisons[0]!;
  eq([canonical.coverage,canonical.issues,canonical.remaining],['INCOMPLETE',['UNCATEGORIZED_SCOPE'],null]);
  const f=r.findings[0]!;
  eq([f.type,f.subject,f.reasons,f.action],['CALCULATION_LIMITATION',{kind:'BUDGET',id:id(60)},['BUDGET_CATEGORY_COMPLETENESS'],'BUDGETS']);
  eq(f.evidence,[{kind:'BUDGET',id:id(60),version:1,sourceId:null,measuredOn:null,recordedAt:stamp,currency:'ILS'}]);
  eq(f.impacts,[{module:'BUDGET',resultId:id(60),state:'PARTIAL'}]);
  eq(f.limitation!==null,true);
});
test('personal category budget includes A but excludes B and household allocations',()=>{
  const r=calc(scopedCategoryQuality('MEMBER',['A','B','SHARED']));
  eq(r.findings.map(f=>[f.type,f.subject.id]),[['CATEGORY_SCOPE',id(2002)]]);
  eq(r.findings[0]!.evidence.map(e=>[e.id,e.version]),[[id(1002),1]]);
});
test('shared category budget excludes individually owned expenses',()=>{
  const r=calc(scopedCategoryQuality('SHARED',['A','B']));
  eq(r.findings.map(f=>f.type),['CALCULATION_LIMITATION']);
  eq(r.calculations.find(c=>c.module==='BUDGET')?.state,'PARTIAL');
});
test('shared category budget attributes only household-owned allocations',()=>{
  const r=calc(scopedCategoryQuality('SHARED',['A','SHARED','B']));
  eq(r.findings.map(f=>[f.type,f.subject.id]),[['CATEGORY_SCOPE',id(2003)]]);
});
test('ALL category scope genuinely includes both members and shared expenses',()=>{
  const r=calc(scopedCategoryQuality('ALL',['A','B','SHARED']));
  eq(r.findings.map(f=>[f.type,f.subject.id]),[2002,2003,2004].map(n=>['CATEGORY_SCOPE',id(n)]));
  eq(r.findings.map(f=>f.impacts),Array.from({length:3},()=>[{module:'BUDGET',resultId:id(60),state:'PARTIAL'}]));
});
test('TOTAL has no category uncertainty and retains all ownership actuals',()=>{
  const s=scopedCategoryQuality('TOTAL',['A','B','SHARED']),r=calc(s);
  eq(r.findings,[]);eq(r.calculations.find(c=>c.module==='BUDGET')?.state,'COMPLETE');
  const c=budgetReport({reporting:s.obligations.reporting,categories:s.categories,revisions:s.budgets,size:s.size},request().reporting).comparisons[0]!;
  eq([c.lines.length,c.actual,c.remaining],[3,{amount:'30',currency:'ILS'},{amount:'70',currency:'ILS'}]);
});
test('split ownership groups only relevant budget impacts with deterministic revision evidence',()=>{
  const base=scopedCategoryQuality('MEMBER',['B']),v=base.obligations.reporting.history[1]!,a=v.transaction.allocations[0]!;
  const split=transactionRevisionSchema.parse({...v,transaction:{...v.transaction,money:{amount:'-30',currency:'ILS'},allocations:[a,{...a,id:id(9001),ownership:{kind:'MEMBER',memberId:id(2)}},{...a,id:id(9002),ownership:{kind:'HOUSEHOLD'}}]}});
  const shared=budgetRevisionSchema.parse({...base.budgets[0]!,id:id(61),scope:{kind:'SHARED',memberId:null,categoryId:id(50)}});
  const s=quality(snapshot([opening(),split],[],[account()],{members:base.obligations.reporting.members}),{categories:base.categories,budgets:[...base.budgets,shared],size:3}),before=JSON.stringify(s),r=calc(s);
  eq(r.findings.length,1);eq(r.findings[0]!.type,'CATEGORY_SCOPE');
  eq(r.findings[0]!.impacts.map(i=>i.resultId),[id(60),id(61)]);
  eq(r.findings[0]!.evidence.map(e=>[e.id,e.version]),[[v.revisionId,1]]);
  eq(calc(s),r);eq(JSON.stringify(s),before);
  eq(calc({...s,budgets:[...s.budgets].reverse(),obligations:{...s.obligations,reporting:{...s.obligations.reporting,history:[...s.obligations.reporting.history].reverse(),members:[...s.obligations.reporting.members].reverse()}}}),r);
});
test('ownership-excluded budget limitation is deterministic without transaction attribution',()=>{
  const s=scopedCategoryQuality('MEMBER',['B','SHARED']),r=calc(s);
  eq(calc(s),r);eq(calc({...s,obligations:{...s.obligations,reporting:{...s.obligations.reporting,history:[...s.obligations.reporting.history].reverse()}}}),r);
  eq(r.findings.length,1);eq(r.findings[0]!.evidence.some(e=>e.kind==='REVISION'),false);
});

test('known complete records can have no findings and external coverage remains unknown',()=>{const r=calc();eq(r.findings,[]);eq(r.externalCoverage,'UNKNOWN');eq(r.calculations.find(c=>c.module==='NET_WORTH')?.state,'COMPLETE');});
test('empty valid known set is not a zero valuation or invented missing account',()=>{const r=calc(quality(snapshot([],[],[])));eq(r.findings,[]);eq(r.externalCoverage,'UNKNOWN');eq(r.calculations.find(c=>c.module==='NET_WORTH')?.state,'UNAVAILABLE');});
test('missing opening groups balance, monthly and explicit forecast impacts',()=>{const r=calc(quality(snapshot([])),request({forecast:forecast()}));eq(r.findings.length,1);eq(r.findings[0]?.reasons,['NO_OPENING']);eq(r.findings[0]?.impacts.map(i=>i.module).sort(),['BALANCE','FORECAST','MONTHLY','NET_WORTH']);eq(r.findings[0]?.action,'TRANSACTIONS');});
test('partial opening stays partial',()=>{const f=calc(quality(snapshot([opening('10',10,1,'PARTIAL')]))).findings[0]!;eq(f.reasons,['PARTIAL_OPENING']);eq(f.state,'PARTIAL');});
test('opening after month start does not invalidate later known balance',()=>{const s=snapshot([revision(1,'100','ADJUSTMENT',{opening:true,date:'2026-10-10'})]);const r=calc(quality(s),request({reporting:{householdId:id(1),asOf:'2026-10-14',month:'2026-10',currency:'ILS'}}));eq(r.findings[0]?.impacts.map(i=>i.module),['MONTHLY']);eq(r.findings[0]?.reasons,['BEFORE_OPENING']);});
test('missing observed evidence is not missing ledger opening',()=>{const f=calc(quality(snapshot([],[],[account(10,{balancePolicy:'OBSERVED',type:'PENSION'})]))).findings[0]!;eq(f.reasons,['MISSING_OBSERVATION']);eq(f.action,'ACCOUNTS');eq(f.observationAgeDays,null);});
test('dated pension observation retains measurement and ingestion separately without outage claim',()=>{const f=calc(quality(snapshot([],[],[account(10,{balancePolicy:'OBSERVED',type:'PENSION'})],{observations:[observation()]}))).findings[0]!;eq(f.reasons,['CARRIED_OBSERVATION']);eq(f.observationAgeDays,30);eq(f.evidence.find(e=>e.kind==='OBSERVATION')?.measuredOn,'2026-09-01');eq(f.evidence.find(e=>e.kind==='OBSERVATION')?.recordedAt,stamp);});
test('same day complete observation has no finding',()=>eq(calc(quality(snapshot([],[],[account(10,{balancePolicy:'OBSERVED'})],{observations:[observation('2026-10-01')]}))).findings,[]));
test('partial old observation retains both coverage and exact age',()=>{const f=calc(quality(snapshot([],[],[account(10,{balancePolicy:'OBSERVED'})],{observations:[observation('2026-09-01',{coverage:'PARTIAL'})]}))).findings[0]!;eq(f.reasons,['PARTIAL_OBSERVATION']);eq(f.observationAgeDays,30);});
test('observations never supply a missing LEDGER opening',()=>{const f=calc(quality(snapshot([],[],[account()],{observations:[observation('2026-10-01')]}))).findings[0]!;eq(f.reasons,['NO_OPENING']);eq(f.evidence.some(e=>e.kind==='OBSERVATION'),false);});
test('observation authority cutover cannot silently reuse another source',()=>{const a=accountRecordSchema.parse({...account(10,{balancePolicy:'OBSERVED'}),sources:[...account().sources,{id:id(111),householdId:id(1),accountId:id(10),kind:'FILE_IMPORT',authoritativeFrom:'2026-10-01'}]});eq(calc(quality(snapshot([],[],[a],{observations:[observation()]}))).findings[0]?.reasons,['MISSING_OBSERVATION']);});
test('missing historical FX retains original currency and requested date',()=>{const r=calc(quality(snapshot([opening('100',10,1,'COMPLETE','USD')],[],[account(10,{currency:'USD',valuationCurrency:'USD'})])));eq(r.findings.length,1);eq(r.findings[0]?.subject.id,'USD/ILS/2026-10-01');eq(r.findings[0]?.evidence.some(e=>e.currency==='USD'),true);eq(r.findings[0]?.action,null);});
test('same missing FX pair/date groups multiple affected accounts and monthly results',()=>{const r=calc(quality(snapshot([opening('100',10,1,'COMPLETE','USD'),opening('50',11,2,'COMPLETE','USD'),revision(3,'-5','EXPENSE',{currency:'USD',date:'2026-10-01'})],[],[account(10,{currency:'USD',valuationCurrency:'USD'}),account(11,{currency:'USD',valuationCurrency:'USD'})])));eq(r.findings.length,1);eq(r.findings[0]?.impacts.map(i=>i.module).sort(),['MONTHLY','NET_WORTH']);eq(r.findings[0]?.evidence.filter(e=>e.kind==='ACCOUNT').length,2);});
test('historical FX does not accept a later day',()=>{const rate=fxRateSchema.parse({id:id(980),base:'USD',quote:'ILS',rate:'4',effectiveDate:'2026-10-02',recordedAt:stamp,origin:{sourceId:id(110),kind:'MANUAL'}});const r=calc(quality(snapshot([opening('100',10,1,'COMPLETE','USD')],[],[account(10,{currency:'USD',valuationCurrency:'USD'})],{rates:[{householdId:householdIdSchema.parse(id(1)),rate}]})));eq(r.findings[0]?.reasons,['MISSING_FX']);});
test('uncategorized recognized expense is distinct from unclassified financial meaning',()=>{const a=revision(2);eq(calc(quality(snapshot([opening(),a]))).findings,[]);const b=revision(2,'-10','UNCLASSIFIED');eq(calc(quality(snapshot([opening(),b]))).findings[0]?.type,'UNCLASSIFIED_EFFECT');});
test('unclassified transaction groups reporting and forecast symptoms',()=>{const f=calc(quality(snapshot([opening(),revision(2,'-10','UNCLASSIFIED',{date:'2026-10-01'})])),request({forecast:forecast()})).findings.find(f=>f.type==='UNCLASSIFIED_EFFECT')!;eq(f.impacts.map(i=>i.module).sort(),['FORECAST','MONTHLY']);eq(f.evidence[0]?.kind,'REVISION');});
test('unmatched transfer is not a proven error',()=>eq(calc(quality(snapshot([opening(),revision(2,'-10','TRANSFER')]))).findings,[]));
test('category budget incompleteness has a categorization action without changing effects',()=>{const category=categorySchema.parse({id:id(50),householdId:id(1),name:'Synthetic',kind:'EXPENSE',status:'ACTIVE',version:1});const b=budgetRevisionSchema.parse({id:id(60),householdId:id(1),month:'2026-10',scope:{kind:'ALL',memberId:null,categoryId:id(50)},planned:{amount:'100',currency:'ILS'},version:1,status:'ACTIVE',actorMemberId:id(2),recordedAt:stamp,category});const f=calc(quality(snapshot([opening(),revision(2)]),{categories:[category],budgets:[b],size:2})).findings[0]!;eq([f.type,f.action],['CATEGORY_SCOPE','CATEGORIES']);eq(f.impacts[0]?.resultId,id(60));});
test('repeated evaluation and input ordering are equivalent without writes',()=>{const s=quality(snapshot([opening(),revision(2,'-10','UNCLASSIFIED'),revision(3,'-20','UNCLASSIFIED')])),before=JSON.stringify(s),a=calc(s);eq(calc(s),a);eq(calc({...s,obligations:{...s.obligations,reporting:{...s.obligations.reporting,history:[...s.obligations.reporting.history].reverse()}}}),a);eq(JSON.stringify(s),before);eq(a.findings.map(f=>f.id),[...a.findings.map(f=>f.id)].sort());});
test('account rename does not change root identity',()=>{const s=quality(snapshot([])),before=calc(s).findings[0]!.id;const a=s.obligations.reporting.accounts[0]!;eq(calc({...s,obligations:{...s.obligations,reporting:{...s.obligations.reporting,accounts:[{...a,version:2,account:{...a.account,name:'Renamed'}}]}}}).findings[0]?.id,before);});
test('shared and member ownership each identify an account once',()=>{const s=quality(snapshot([],[],[account(),account(11,{ownership:{kind:'MEMBER',memberId:id(2)}})]));const f=calc(s).findings;eq(f.length,2);eq(new Set(f.map(f=>f.subject.id)).size,2);});
test('foreign account context rejects the full snapshot',()=>{const s=quality();const a=s.obligations.reporting.accounts[0]!;rejects(()=>calc({...s,obligations:{...s.obligations,reporting:{...s.obligations.reporting,accounts:[{...a,account:{...a.account,householdId:householdIdSchema.parse(id(99))}}]}}}));});
test('unknown household cannot inspect any findings',()=>rejects(()=>calc(quality(),request({reporting:{householdId:id(99),asOf:'2026-10-01',month:'2026-10',currency:'ILS'}}))));
test('inconsistent counts fail rather than silent partial success',()=>{const s=quality();rejects(()=>dataQualityContext({...s,size:1}));rejects(()=>calc({...s,obligations:{...s.obligations,reporting:{...s.obligations.reporting,size:0}}}));});
test('forecast cannot use another household/date/currency',()=>{for(const edit of [{householdId:id(99)},{start:'2026-10-02'},{buffer:{amount:'0',currency:'USD'}}])rejects(()=>request({forecast:{...forecast(),...edit}}));});
test('forecast is not evaluated without explicit request',()=>eq(calc().calculations.find(c=>c.module==='FORECAST')?.state,'NOT_EVALUATED'));
test('future baseline remains unavailable under Task 13 policy',()=>{const r=calc(quality(),request({forecast:{...forecast(),evidenceAsOf:'2026-09-30'}}));eq(r.calculations.find(c=>c.module==='FORECAST')?.state,'UNAVAILABLE');eq(r.findings.some(f=>f.reasons.includes('FUTURE_BASELINE_UNSUPPORTED')),true);});
test('unlinked expectation is uncertainty not proven missed payment',()=>{const f=calc(quality(snapshot([opening()],[plan()]))).findings[0]!;eq(f.reasons,['PAYMENT_UNRESOLVED']);eq(f.state,'UNKNOWN');eq(f.action,'OBLIGATIONS');});
test('stale payment preserves actual and planning evidence',()=>{const p=plan(),old=revision(2,'-100','EXPENSE'),updated=transactionRevisionSchema.parse({...old,revisionId:id(800),version:2,supersedesRevisionId:old.revisionId,reason:'Synthetic correction'});const link=paymentDecisionSchema.parse({householdId:id(1),id:id(6),version:1,obligationId:p.id,obligationVersion:1,date:'2026-10-10',action:'LINK',evidence:selectionForObligation(old,1,old.transaction.allocations[0]!.id),actual:{amount:'100',currency:'ILS'},state:'ASSOCIATED',actorMemberId:id(2),recordedAt:stamp});const f=calc(quality(snapshot([opening(),old,updated],[p],[account()],{},[link]))).findings[0]!;eq(f.reasons,['PAYMENT_STALE']);eq(f.evidence.some(e=>e.kind==='PAYMENT'),true);eq(f.evidence.some(e=>e.id===updated.revisionId),true);});
test('stale reconciliation shares its root with forecast and monthly warnings',()=>{const a=revision(2,'-10','TRANSFER',{date:'2026-10-01'}),b=revision(3,'10','TRANSFER',{account:11,date:'2026-10-01'});const selectionA=selectionFor(a,1,'PAYMENT','TRANSFER'),selectionB=selectionFor(b,1,'COUNTERPART','TRANSFER');const d=reconciliationDecisionSchema.parse({id:id(70),householdId:id(1),version:1,kind:'TRANSFER',action:'LINK',state:'EXACT',reason:'Synthetic',difference:'0',purchaseDifference:null,fx:null,actorMemberId:id(2),recordedAt:stamp,participants:[{selection:selectionA,revision:a,sourceReference:null,importItemId:null,contentHash:null},{selection:selectionB,revision:b,sourceReference:null,importItemId:null,contentHash:null}]});const changed=transactionRevisionSchema.parse({...a,revisionId:id(999),version:2,supersedesRevisionId:a.revisionId,reason:'Synthetic'});const s=quality(snapshot([opening(),opening('100',11,4),a,b,changed],[],[account(),account(11)],{decisions:[d]}));const f=calc(s,request({forecast:{...forecast(),accounts:[...forecast().accounts,{accountId:id(11),choice:'EXCLUDE'}]}})).findings.find(f=>f.type==='RECONCILIATION_EVIDENCE')!;eq(f.subject.id,d.id);eq(f.impacts.map(i=>i.module).sort(),['FORECAST','MONTHLY','RECONCILIATION']);});
test('Gregorian ages cross leap days and centuries',()=>{eq(observationAge('2024-02-28','2024-03-01'),2);eq(observationAge('1900-02-28','1900-03-01'),1);eq(observationAge('2000-02-28','2000-03-01'),2);rejects(()=>observationAge('2026-10-02','2026-10-01'));});
test('combined byte bound rejects oversize before presenting data',()=>{const s=quality();rejects(()=>dataQualityContext({...s,extra:'א'.repeat(9*1024*1024)} as typeof s));});
test('observation attached FX is distinct from reporting currency conversion',()=>{const a=account(10,{balancePolicy:'OBSERVED',currency:'USD',valuationCurrency:'ILS'}),o=observation('2026-10-01',{money:{amount:'100',currency:'USD'}});const r=calc(quality(snapshot([],[],[a],{observations:[o]})),request({reporting:{householdId:id(1),asOf:'2026-10-01',month:'2026-10',currency:'USD'}}));eq(r.calculations.find(c=>c.module==='NET_WORTH')?.state,'COMPLETE');eq(r.findings[0]?.reasons,['OBSERVATION_FX_MISSING']);eq(r.findings[0]?.action,'ACCOUNTS');});
test('same missing observation/report FX groups both symptoms',()=>{const a=account(10,{balancePolicy:'OBSERVED',currency:'USD',valuationCurrency:'ILS'}),o=observation('2026-10-01',{money:{amount:'100',currency:'USD'}});const r=calc(quality(snapshot([],[],[a],{observations:[o]})));eq(r.findings.length,1);eq(r.findings[0]?.reasons,['MISSING_FX','OBSERVATION_FX_MISSING']);eq(r.findings[0]?.impacts.map(i=>i.module).sort(),['BALANCE','NET_WORTH']);});
test('collection cap rejects a count-consistent oversized category collection',()=>{const category=categorySchema.parse({id:id(50),householdId:id(1),name:'Synthetic',kind:'EXPENSE',status:'ACTIVE',version:1});const s=quality();rejects(()=>dataQualityContext({...s,categories:Array.from({length:10001},(_,i)=>({...category,id:categorySchema.parse({...category,id:id(10000+i)}).id})),size:10001}));});
test('missing immutable revision ancestry is rejected before any finding',()=>{const v=revision(2),bad=transactionRevisionSchema.parse({...v,revisionId:id(900),version:2,supersedesRevisionId:v.revisionId,reason:'Synthetic'});rejects(()=>calc(quality(snapshot([opening(),bad]))));});
test('a malformed observation chain rejects the complete graph',()=>{const s=quality(snapshot([],[],[account(10,{balancePolicy:'OBSERVED'})],{observations:[observation('2026-10-01',{supersedesId:id(999),note:'Synthetic correction'})]}));rejects(()=>calc(s));});
