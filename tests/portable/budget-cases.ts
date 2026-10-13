import { budgetSnapshotSchema, budgetRevisionSchema, budgetCommandSchema, budgetScopeSchema } from '@finance/contracts/budgets';
import type { BudgetSnapshot, BudgetRevision } from '@finance/contracts/budgets';
import { budgetReport, currentBudgets, scopesOverlap } from '@finance/domain/budgets';
import { reportingSnapshotSchema, reportingRequestSchema } from '@finance/contracts/reporting';
import { accountRecordSchema } from '@finance/contracts/valuation';
import { transactionRevisionSchema } from '@finance/contracts/ledger';
import type { TransactionRevision } from '@finance/contracts/ledger';
import { reconciliationDecisionSchema } from '@finance/contracts/reconciliation';
import { selectionFor } from '@finance/domain/reconciliation';
import { categorySchema } from '@finance/contracts/categorization';

export const budgetCases:{name:string;run:()=>void}[]=[];
const test=(name:string,run:()=>void)=>budgetCases.push({name:`budgets: ${name}`,run});
const eq=(a:unknown,b:unknown)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Budget expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);};
const rejects=(fn:()=>unknown)=>{let threw=false;try{fn();}catch{threw=true;}eq(threw,true);};
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const stamp='2026-10-13T00:00:00Z';
const category={id:id(8),householdId:id(1),version:1,name:'מזון',kind:'EXPENSE',status:'ACTIVE'};
const account=(n=10,currency='ILS',extra={})=>accountRecordSchema.parse({account:{id:id(n),householdId:id(1),name:'Synthetic',ownership:{kind:'HOUSEHOLD'},type:'BANK',currency,valuationCurrency:currency,balancePolicy:'LEDGER',status:'ACTIVE',...extra},version:1,manualSourceId:id(n+100),sources:[{id:id(n+100),accountId:id(n),householdId:id(1),kind:'MANUAL',authoritativeFrom:'0001-01-01'}]});
const revision=(n:number,amount:string,effect='EXPENSE',opts:{opening?:boolean;date?:string;currency?:string;account?:number;status?:string;category?:boolean;member?:boolean}={})=>transactionRevisionSchema.parse({revisionId:id(n+1000),version:1,supersedesRevisionId:null,entryKind:opts.opening?'OPENING':'MOVEMENT',openingCoverage:opts.opening?'COMPLETE':null,reason:'',createdAt:stamp,recordedAt:stamp,transaction:{id:id(n+2000),householdId:id(1),accountId:id(opts.account??10),transactionDate:opts.date??'2026-10-02',description:'Synthetic',status:opts.status??'POSTED',money:{amount,currency:opts.currency??'ILS'},provenance:[{source:{sourceId:id((opts.account??10)+100),kind:'MANUAL'}}],allocations:[{id:id(n+3000),effect:opts.opening?'ADJUSTMENT':effect,money:{amount,currency:opts.currency??'ILS'},ownership:opts.member?{kind:'MEMBER',memberId:id(2)}:{kind:'HOUSEHOLD'},categorization:{origin:'USER',userLocked:true},...(opts.category?{categoryId:id(8)}:{})}]}});
const opening=()=>revision(1,'1000','ADJUSTMENT',{opening:true,date:'2026-10-01'});
const plan=(extra={})=>budgetRevisionSchema.parse({id:id(5),householdId:id(1),month:'2026-10',scope:{kind:'TOTAL',memberId:null,categoryId:null},planned:{amount:'100',currency:'ILS'},version:1,status:'ACTIVE',actorMemberId:id(2),recordedAt:stamp,category:null,...extra});
function snapshot(history:readonly TransactionRevision[]=[opening()],plans:readonly BudgetRevision[]=[plan()],extra:Partial<BudgetSnapshot>={},accounts=[account()]) {
  const raw={households:[{id:id(1),name:'Synthetic',createdAt:stamp}],members:[{id:id(2),householdId:id(1),userId:id(3),displayName:'Synthetic member',status:'ACTIVE'}],accounts,history,observations:[],decisions:[],rates:[],references:[]};
  const reporting=reportingSnapshotSchema.parse({...raw,size:raw.households.length+raw.members.length+raw.accounts.length+raw.history.length});
  const s={reporting,categories:[category],revisions:plans,...extra};return budgetSnapshotSchema.parse({...s,size:s.categories.length+s.revisions.length});
}
const request=reportingRequestSchema.parse({householdId:id(1),month:'2026-10',asOf:'2026-10-01',currency:'ILS'});
const report=(s=snapshot())=>budgetReport(s,request);
test('no plan differs from explicit zero, and known zero differs from unknown',()=>{
  eq(report(snapshot([opening()],[])).configuration,'NO_PLAN');
  const c=report(snapshot([opening()],[plan({planned:{amount:'0',currency:'ILS'}})])).comparisons[0]!;
  eq([c.actual?.amount,c.remaining?.amount,c.utilization,c.state],['0','0',null,'WITHIN']);
  const missing=report(snapshot([])).comparisons[0]!;eq([missing.actual,missing.remaining,missing.state],[null,null,'INCOMPLETE']);
  eq(report(snapshot([],undefined,{},[])).comparisons[0]!.actual,null);
});
for(const [actual,remaining,over,state,utilization] of [['-30','70','0','WITHIN','30'],['-120','-20','20','OVER','120'],['30','130','0','WITHIN','-30']])test(`exact comparison ${actual}`,()=>{
  const c=report(snapshot([opening(),revision(2,actual!)])).comparisons[0]!;eq([c.remaining?.amount,c.over?.amount,c.state,c.utilization],[remaining,over,state,utilization]);
});
test('refund offsets expense with eight-place exact amounts and rounding',()=>{
  const c=report(snapshot([opening(),revision(2,'-30.12345678'),revision(3,'5.00000001')])).comparisons[0]!;
  eq([c.actual?.amount,c.remaining?.amount,c.utilization],['25.12345677','74.87654323','25.12']);
});
for(const effect of ['INCOME','TRANSFER','DEBT_PRINCIPAL','INVESTMENT_TRADE','ADJUSTMENT','UNCLASSIFIED'])test(`${effect} never inferred as expense`,()=>{
  const c=report(snapshot([opening(),revision(2,'-30',effect)])).comparisons[0]!;eq(c.actual?.amount??null,effect==='UNCLASSIFIED'?null:'0');eq(c.state,effect==='UNCLASSIFIED'?'INCOMPLETE':'WITHIN');
});
for(const status of ['PENDING','VOIDED'])test(`${status} excluded`,()=>eq(report(snapshot([opening(),revision(2,'-30','EXPENSE',{status})])).comparisons[0]!.actual?.amount,'0'));
test('current corrected revision contributes once and preserves USER lock',()=>{
  const original=revision(2,'-30');const corrected=transactionRevisionSchema.parse({...original,revisionId:id(900),version:2,supersedesRevisionId:original.revisionId,reason:'Synthetic correction',transaction:{...original.transaction,money:{amount:'-20',currency:'ILS'},allocations:original.transaction.allocations.map(a=>({...a,money:{amount:'-20',currency:'ILS'}}))}});
  const s=snapshot([opening(),corrected,original]),before=JSON.stringify(s);eq(report(s).comparisons[0]!.actual?.amount,'20');eq(JSON.stringify(s),before);
});
test('half-open financial month includes start, excludes end across portable timezones',()=>eq(report(snapshot([revision(1,'1000','ADJUSTMENT',{opening:true,date:'2026-09-01'}),revision(2,'-7','EXPENSE',{date:'2026-10-01'}),revision(3,'-11','EXPENSE',{date:'2026-10-31'}),revision(4,'-99','EXPENSE',{date:'2026-11-01'}),revision(5,'-88','EXPENSE',{date:'2026-09-30'})])).comparisons[0]!.actual?.amount,'18'));
const child=(kind='ALL',categoryId:string|null=id(8),memberId:string|null=null)=>plan({id:id(kind==='MEMBER'?6:7),scope:{kind,categoryId,memberId},category:categoryId?category:null});
test('category, shared and member spending without copies; TOTAL is a separate parent',()=>{
  const shared=child('SHARED',null),member=child('MEMBER',null,id(2));
  const s=snapshot([opening(),revision(2,'-30','EXPENSE',{category:true}),revision(3,'-10','EXPENSE',{member:true})],[plan(),shared,member]);
  const cs=report(s).comparisons;eq(cs.map(c=>[c.plan.scope.kind,c.actual?.amount]),[['TOTAL','40'],['MEMBER','10'],['SHARED','30']]);eq(report(s).unbudgeted.actual?.amount,'0');
});
test('uncategorized expenses visible in total and unbudgeted; category comparison incomplete',()=>{
  const r=report(snapshot([opening(),revision(2,'-30'),revision(3,'-10','EXPENSE',{category:true})],[plan(),child()]));
  eq([r.comparisons[0]!.actual?.amount,r.comparisons[0]!.state],['40','WITHIN']);
  eq([r.comparisons[1]!.actual?.amount,r.comparisons[1]!.remaining,r.comparisons[1]!.state],['10',null,'INCOMPLETE']);eq(r.unbudgeted.actual?.amount,'30');
});
test('scope intersections rejected; disjoint member/shared and category scopes supported',()=>{
  const scope=(kind:string,c:string|null=null,m:string|null=null)=>budgetScopeSchema.parse({kind,categoryId:c,memberId:m});
  eq(scopesOverlap(scope('TOTAL'),scope('ALL',id(8))),false);eq(scopesOverlap(scope('TOTAL'),scope('TOTAL')),true);
  eq(scopesOverlap(scope('SHARED'),scope('MEMBER',null,id(2))),false);eq(scopesOverlap(scope('ALL',id(8)),scope('SHARED',id(8))),true);
  eq(scopesOverlap(scope('ALL',id(8)),scope('ALL',id(9))),false);eq(scopesOverlap(scope('MEMBER',null,id(2)),scope('MEMBER',id(8),id(2))),true);
  rejects(()=>report(snapshot(undefined,[child(),child('SHARED')])));rejects(()=>report(snapshot(undefined,[plan(),plan({id:id(9)})])));
  rejects(()=>report(snapshot(undefined,[plan(),child('SHARED',null,null),child('MEMBER',null,id(2))].map((p,i)=>i===2?plan({...p,planned:{amount:'10',currency:'USD'}}):p))));
});
test('rename/archive preserve historical category and plan versions',()=>{
  const old=child(),edited=plan({...old,version:2,planned:{amount:'200',currency:'ILS'},category:{...category,version:2,name:'אוכל'}});
  const r=report(snapshot([opening(),revision(2,'-30','EXPENSE',{category:true})],[edited,old],{categories:[categorySchema.parse({...category,version:2,name:'אוכל',status:'ARCHIVED'})]}));
  eq(r.comparisons[0]!.remaining?.amount,'170');eq(r.history.map(b=>b.category!.name),['אוכל','מזון']);eq(r.groups[0]!.name,'אוכל');
});
test('archive retains actual but offers no remaining, and archive cannot mutate plan',()=>{
  const p=plan(),archived=plan({version:2,status:'ARCHIVED'});const r=report(snapshot([opening(),revision(2,'-30')],[p,archived]));
  eq([r.comparisons[0]!.state,r.comparisons[0]!.actual?.amount,r.comparisons[0]!.remaining,r.configuration],['ARCHIVED','30',null,'NO_PLAN']);
  rejects(()=>currentBudgets(snapshot(undefined,[p,plan({version:2,status:'ARCHIVED',planned:{amount:'11',currency:'ILS'}})])));
});
test('missing/gapped/duplicate/changed scope/foreign context budget history rejected',()=>{
  for(const plans of [[plan({version:2})],[plan(),plan()],[plan(),plan({version:2,scope:{kind:'SHARED',memberId:null,categoryId:null}})],[plan({actorMemberId:id(99)})],[plan({householdId:id(99)})]])rejects(()=>report(snapshot(undefined,plans)));
  rejects(()=>report(snapshot([opening(),revision(2,'-2','EXPENSE',{category:true})],undefined,{categories:[]})));
  const s=snapshot();rejects(()=>budgetSnapshotSchema.parse({...s,size:s.size-1}));rejects(()=>budgetSnapshotSchema.parse({...s,revisions:Array(10001).fill(plan()),size:10002}));
});
test('unsupported percentage scopes and raw precision are invalid',()=>{
  const p=plan();const command={id:p.id,householdId:p.householdId,month:p.month,scope:p.scope,planned:p.planned,action:'CREATE',expectedVersion:0,idempotencyKey:'synthetic-budget-command'};
  eq(budgetCommandSchema.safeParse(command).success,true);
  for(const extra of [{planned:{amount:'-1',currency:'ILS'}},{planned:{amount:'1.000000000',currency:'ILS'}},{scope:{kind:'MEMBER',memberId:id(2),categoryId:null,percentage:'50'}},{expectedVersion:1},{planned:{amount:'10000000000000000',currency:'ILS'}}])eq(budgetCommandSchema.safeParse({...command,...extra}).success,false);
});
test('recognized partial values stay incomplete when other expenses lack historical FX',()=>{
  const foreign=account(11,'USD');const rows=[opening(),revision(4,'0','ADJUSTMENT',{opening:true,account:11,currency:'USD',date:'2026-10-01'}),revision(2,'-5'),revision(3,'-10','EXPENSE',{account:11,currency:'USD'})];
  const c=report(snapshot(rows,undefined,{},[account(),foreign])).comparisons[0]!;eq([c.actual?.amount,c.remaining,c.state],['5',null,'INCOMPLETE']);
});
test('recognition-day exact FX, ambiguity, and no inversion or current-day fallback',()=>{
  const rows=[revision(1,'0','ADJUSTMENT',{opening:true,currency:'USD',date:'2026-10-01'}),revision(2,'-10','EXPENSE',{currency:'USD'})];
  const base=snapshot(rows,undefined,{},[account(10,'USD')]);
  const rate={householdId:id(1),rate:{id:id(50),base:'USD',quote:'ILS',rate:'3.7',effectiveDate:'2026-10-02',recordedAt:stamp,origin:{kind:'MANUAL',sourceId:id(110)}}};
  const withRates=(rates:unknown[])=>budgetSnapshotSchema.parse({...base,reporting:{...base.reporting,rates,size:base.reporting.size+rates.length}});
  eq(report(withRates([rate])).comparisons[0]!.actual?.amount,'37');
  for(const rates of [[rate,{...rate,rate:{...rate.rate,id:id(51)}}],[{...rate,rate:{...rate.rate,effectiveDate:'2026-10-13'}}],[{...rate,rate:{...rate.rate,base:'ILS',quote:'USD'}}]]){const c=report(withRates(rates)).comparisons[0]!;eq([c.actual,c.remaining,c.state],[null,null,'INCOMPLETE']);}
});
test('card settlement EXPENSE stays included and NEEDS_CORRECTION remains incomplete',()=>{
  const pay=revision(2,'-50'),purchase=revision(3,'-50','EXPENSE',{account:11});
  const s=snapshot([opening(),revision(4,'0','ADJUSTMENT',{opening:true,account:11,date:'2026-10-01'}),pay,purchase],undefined,{},[account(),account(11,'ILS',{type:'CREDIT_CARD'})]);
  const d=reconciliationDecisionSchema.parse({householdId:id(1),id:id(90),version:1,action:'LINK',kind:'CARD',reason:'Synthetic',actorMemberId:id(2),recordedAt:stamp,participants:[{selection:selectionFor(pay,1,'PAYMENT','CARD'),revision:pay,sourceReference:null,importItemId:null,contentHash:null},{selection:selectionFor(purchase,1,'PURCHASE','CARD'),revision:purchase,sourceReference:null,importItemId:null,contentHash:null}],fx:null,state:'NEEDS_CORRECTION',difference:null,purchaseDifference:'0'});
  const c=report(budgetSnapshotSchema.parse({...s,reporting:{...s.reporting,decisions:[d],size:s.reporting.size+1}})).comparisons[0]!;
  eq([c.actual?.amount,c.remaining,c.state],['100',null,'INCOMPLETE']);eq(c.issues.includes('CARD_DOUBLE_CONSUMPTION'),true);
});
test('plan arithmetic overflow fails instead of truncation',()=>rejects(()=>report(snapshot([opening(),revision(2,'-9999999999999999'),revision(3,'-1')]))));
test('loan principal excluded while explicit interest and fee expenses count once',()=>{
  const r=revision(2,'-111');const split=transactionRevisionSchema.parse({...r,transaction:{...r.transaction,allocations:[
    {...r.transaction.allocations[0],effect:'DEBT_PRINCIPAL',money:{amount:'-100',currency:'ILS'}},
    {...r.transaction.allocations[0],id:id(800),effect:'EXPENSE',money:{amount:'-10',currency:'ILS'}},
    {...r.transaction.allocations[0],id:id(801),effect:'EXPENSE',money:{amount:'-1',currency:'ILS'}},
  ]}});eq(report(snapshot([opening(),split])).comparisons[0]!.actual?.amount,'11');
});
test('account ownership never overrides allocation ownership; revoked member attribution retained',()=>{
  const base=snapshot([opening(),revision(2,'-30','EXPENSE',{member:true}),revision(3,'-20')],[child('SHARED',null),child('MEMBER',null,id(2))],{},[account(10,'ILS',{ownership:{kind:'MEMBER',memberId:id(2)}})]);
  const s=budgetSnapshotSchema.parse({...base,reporting:{...base.reporting,members:base.reporting.members.map(m=>({...m,userId:null,status:'REVOKED'}))}});
  eq(report(s).comparisons.map(c=>[c.plan.scope.kind,c.actual?.amount]),[['MEMBER','30'],['SHARED','20']]);
});
test('partial opening and unclassified evidence never authorize green comparison',()=>{
  const p=transactionRevisionSchema.parse({...opening(),openingCoverage:'PARTIAL'});
  const c=report(snapshot([p,revision(2,'-8'),revision(3,'-100','UNCLASSIFIED')])).comparisons[0]!;
  eq([c.actual?.amount,c.remaining,c.utilization,c.state],['8',null,null,'INCOMPLETE']);
});
test('UTC audit instants compare correctly with optional fractional precision',()=>{
  const p=plan(),later=plan({version:2,recordedAt:'2026-10-13T00:00:00.1Z'});
  eq(currentBudgets(snapshot(undefined,[later,p]))[0]!.version,2);
  rejects(()=>currentBudgets(snapshot(undefined,[plan({recordedAt:'2026-10-13T00:00:00.1Z'}),plan({version:2,recordedAt:stamp})])));
});
test('deterministic ordering and budget edits never affect positions',()=>{
  const s=snapshot([opening(),revision(2,'-30'),revision(3,'5')]);const before=JSON.stringify(s);
  const reversed=budgetSnapshotSchema.parse({...s,reporting:{...s.reporting,history:[...s.reporting.history].reverse()},revisions:[...s.revisions].reverse()});eq(report(s),report(reversed));eq(JSON.stringify(s),before);
  const changed=snapshot(s.reporting.history,[plan(),plan({version:2,planned:{amount:'500',currency:'ILS'}})]);eq(report(s).report.positions,report(changed).report.positions);
});
