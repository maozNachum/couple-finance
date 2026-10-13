import { reconciliationCommandSchema, reconciliationSnapshotSchema } from '../contracts/reconciliation.ts';
import type { ReconciliationKind, ReconciliationParticipant, ReconciliationSnapshot, ReconciliationDecision } from '../contracts/reconciliation.ts';
import type { TransactionRevision } from '../contracts/ledger.ts';
import type { FxRate } from '../contracts/fx.ts';
import { currentTransactions } from './money/ledger.ts';
import { absolute, compare, decimal, negate, subtract, sumDecimals } from './money/decimal.ts';
import { convertMoney } from './money/fx.ts';
import { daysInMonth } from './dates/calendar.ts';

/** Calendar distance is integer-only, independent of ambient timezone/clock. */
function dayNumber(date: string): number {
  const y=Number(date.slice(0,4)),m=Number(date.slice(5,7)),d=Number(date.slice(8,10));
  const prior=y-1;
  let days=prior*365+Math.floor(prior/4)-Math.floor(prior/100)+Math.floor(prior/400)+d;
  for(let month=1;month<m;month++) days+=daysInMonth(y,month);
  return days;
}
export function reconciliationCurrent(snapshot: ReconciliationSnapshot, householdId: string): readonly TransactionRevision[] {
  return snapshot.accounts.filter(a=>a.account.householdId===householdId).flatMap(a=>currentTransactions(a,snapshot.history.filter(r=>r.transaction.householdId===householdId&&r.transaction.accountId===a.account.id)));
}
export function latestDecisions(decisions: readonly ReconciliationDecision[], householdId: string): readonly ReconciliationDecision[] {
  const latest=new Map<string,ReconciliationDecision>();
  for(const d of decisions.filter(d=>d.householdId===householdId)) if((latest.get(d.id)?.version??0)<d.version)latest.set(d.id,d);
  return [...latest.values()].sort((a,b)=>a.id.localeCompare(b.id));
}
export function decisionIsStale(d: ReconciliationDecision, current: readonly TransactionRevision[]): boolean {
  return d.action!=='UNLINK'&&d.participants.some(p=>!current.some(r=>r.revisionId===p.selection.revisionId&&r.transaction.id===p.selection.transactionId));
}
export function selectionFor(r: TransactionRevision, accountVersion: number, role: ReconciliationParticipant['role'], kind: ReconciliationKind): ReconciliationParticipant {
  return {accountId:r.transaction.accountId,accountVersion,transactionId:r.transaction.id,revisionId:r.revisionId,expectedVersion:r.version,role,
    parts:r.transaction.allocations.map(a=>({allocationId:a.id,meaning:kind==='LOAN'?'PRINCIPAL':role==='PURCHASE'?'PURCHASE':'TRANSFER'}))};
}
/** Read-only financial meaning check; selection labels never override stored effects. */
export function evaluateReconciliation(kind: ReconciliationKind, selections: readonly ReconciliationParticipant[], revisions: readonly TransactionRevision[], fx: FxRate|null) {
  let needsCorrection=false;
  const payment=selections.find(p=>p.role==='PAYMENT');
  if(!payment||selections.filter(p=>p.role==='PAYMENT').length!==1||selections.filter(p=>p.role==='COUNTERPART').length>1)throw new RangeError('Invalid roles');
  const values=selections.map(p=>{
    const r=revisions.find(r=>r.revisionId===p.revisionId&&r.transaction.id===p.transactionId&&r.transaction.accountId===p.accountId);
    if(!r||r.entryKind!=='MOVEMENT'||r.transaction.status!=='POSTED'||r.version!==p.expectedVersion||p.parts.length!==r.transaction.allocations.length)throw new RangeError('Ineligible revision');
    const t=r.transaction;
    let principal=decimal('0');
    for(const part of p.parts){
      const a=t.allocations.find(a=>a.id===part.allocationId);if(!a)throw new RangeError('Unknown allocation');
      const meaning=part.meaning;
      if(kind==='LOAN'?(p.role==='PURCHASE'||(p.role==='COUNTERPART'&&meaning!=='PRINCIPAL')||!['PRINCIPAL','INTEREST','FEE'].includes(meaning)):(meaning!==(p.role==='PURCHASE'?'PURCHASE':'TRANSFER')||(kind==='TRANSFER'&&p.role==='PURCHASE')))throw new RangeError('Invalid meaning');
      const effect=meaning==='TRANSFER'?'TRANSFER':meaning==='PRINCIPAL'?'DEBT_PRINCIPAL':'EXPENSE';
      if(a.effect!==effect)needsCorrection=true;
      if(meaning==='PRINCIPAL')principal=sumDecimals([principal,a.money.amount]);
      if((p.role==='PAYMENT'&&compare(a.money.amount,decimal('0'))>=0)||(p.role==='COUNTERPART'&&compare(a.money.amount,decimal('0'))<=0))throw new RangeError('Invalid allocation direction');
    }
    if((p.role==='PAYMENT'&&compare(t.money.amount,decimal('0'))>=0)||(p.role==='COUNTERPART'&&compare(t.money.amount,decimal('0'))<=0)||compare(t.money.amount,decimal('0'))===0)throw new RangeError('Invalid direction');
    return {p,t,amount:kind==='LOAN'?principal:t.money.amount};
  });
  const paid=values.find(v=>v.p.role==='PAYMENT');if(!paid)throw new RangeError('Missing payment');
  if(kind==='LOAN'&&compare(paid.amount,decimal('0'))>=0)throw new RangeError('Missing principal');
  const counterpart=values.find(v=>v.p.role==='COUNTERPART');
  const purchases=values.filter(v=>v.p.role==='PURCHASE');
  let difference: string|null=null, purchaseDifference:string|null=null;
  let missingFx=false;
  if(counterpart){
    let paymentAmount=negate(paid.amount);
    if(paid.t.money.currency!==counterpart.t.money.currency){
      if(!fx)missingFx=true;
      else paymentAmount=convertMoney({amount:paymentAmount,currency:paid.t.money.currency},counterpart.t.money.currency,paid.t.transactionDate,fx,{scale:8,mode:'HALF_UP'}).amount;
    }else if(fx)throw new RangeError('Unneeded FX');
    if(!missingFx)difference=subtract(paymentAmount,counterpart.amount);
  }else if(fx)throw new RangeError('FX requires counterpart');
  if(purchases.length){
    if(kind!=='CARD'||purchases.some(v=>v.t.money.currency!==paid.t.money.currency)||(counterpart&&counterpart.t.money.currency!==paid.t.money.currency))throw new RangeError('Purchase currency');
    purchaseDifference=subtract(negate(paid.amount),negate(sumDecimals(purchases.map(v=>v.amount))));
  }
  const exact=!missingFx&&(kind==='CARD'?(counterpart!==undefined||purchases.length>0)&&[difference,purchaseDifference].every(d=>d===null||compare(decimal(d),decimal('0'))===0):counterpart!==undefined&&difference!==null&&compare(decimal(difference),decimal('0'))===0);
  return {state:missingFx?'MISSING_FX':needsCorrection?'NEEDS_CORRECTION':exact?'EXACT':'PARTIAL',difference,purchaseDifference} as const;
}

export function previewReconciliation(input: unknown, rawSnapshot: unknown) {
  const command=reconciliationCommandSchema.parse(input), snapshot=reconciliationSnapshotSchema.parse(rawSnapshot);
  const current=reconciliationCurrent(snapshot,command.householdId);
  if(command.action==='UNLINK')throw new RangeError('Unlink has no preview');
  const paid=command.participants.find(p=>p.role==='PAYMENT');
  const paymentAccount=snapshot.accounts.find(a=>a.account.id===paid?.accountId&&a.account.householdId===command.householdId);
  if(!paid||!paymentAccount)throw new RangeError('Payment account');
  const counterpartAccounts=new Set<string>();
  for(const p of command.participants){
    const account=snapshot.accounts.find(a=>a.account.id===p.accountId&&a.account.householdId===command.householdId);
    if(!account||account.account.status!=='ACTIVE'||account.version!==p.accountVersion)throw new RangeError('Account version');
    if(p.role!=='PAYMENT'){
      if(p.accountId===paid.accountId)throw new RangeError('Same account');
      counterpartAccounts.add(p.accountId);
      if(command.kind==='CARD'&&account.account.type!=='CREDIT_CARD'||command.kind==='LOAN'&&account.account.type!=='LOAN')throw new RangeError('Target account type');
    }
    if(command.kind==='TRANSFER'&&(account.account.type==='CREDIT_CARD'||account.account.type==='LOAN'))throw new RangeError('Use settlement kind');
  }
  if(counterpartAccounts.size>1||(command.kind!=='TRANSFER'&&paymentAccount.account.type!=='BANK'))throw new RangeError('Settlement accounts');
  const claimed=latestDecisions(snapshot.decisions,command.householdId).filter(d=>d.action!=='UNLINK'&&d.id!==command.id).flatMap(d=>d.participants.map(p=>p.selection.transactionId));
  if(command.participants.some(p=>claimed.includes(p.transactionId)))throw new RangeError('Already linked');
  const fx=command.fxRateId===null?null:snapshot.rates.find(f=>f.householdId===command.householdId&&f.rate.id===command.fxRateId)?.rate;
  if(fx===undefined)throw new RangeError('Unknown FX');
  return evaluateReconciliation(command.kind,command.participants,current,fx);
}

/** Bounded context, deterministic order, no subset-sum or hidden write. */
export function reconciliationCandidates(snapshot: ReconciliationSnapshot, householdId: string, paymentId: string, kind: ReconciliationKind) {
  const current=reconciliationCurrent(snapshot,householdId);
  const active=latestDecisions(snapshot.decisions,householdId).filter(d=>d.action!=='UNLINK').flatMap(d=>d.participants.map(p=>p.selection.transactionId));
  const payment=current.find(r=>r.transaction.id===paymentId);
  if(!payment||payment.entryKind!=='MOVEMENT'||payment.transaction.status!=='POSTED'||compare(payment.transaction.money.amount,decimal('0'))>=0||active.some(id=>id===paymentId))return [];
  const paymentAccount=snapshot.accounts.find(a=>a.account.id===payment.transaction.accountId&&a.account.householdId===householdId);
  if(!paymentAccount||paymentAccount.account.status!=='ACTIVE'||(kind!=='TRANSFER'&&paymentAccount.account.type!=='BANK')||(kind==='TRANSFER'&&['CREDIT_CARD','LOAN'].includes(paymentAccount.account.type)))return [];
  return current.filter(r=>{
    const a=snapshot.accounts.find(a=>a.account.id===r.transaction.accountId&&a.account.householdId===householdId);
    return a?.account.status==='ACTIVE'&&r.entryKind==='MOVEMENT'&&r.transaction.status==='POSTED'&&r.transaction.accountId!==payment.transaction.accountId&&!active.includes(r.transaction.id)&&compare(r.transaction.money.amount,decimal('0'))>0&&Math.abs(dayNumber(r.transaction.transactionDate)-dayNumber(payment.transaction.transactionDate))<=7&&(kind==='CARD'?a.account.type==='CREDIT_CARD':kind==='LOAN'?a.account.type==='LOAN':!['CREDIT_CARD','LOAN'].includes(a.account.type));
  }).map(r=>{
    const sameCurrency=r.transaction.money.currency===payment.transaction.money.currency;
    const exactAmount=sameCurrency&&compare(absolute(r.transaction.money.amount),absolute(payment.transaction.money.amount))===0;
    const effect=kind==='LOAN'?'DEBT_PRINCIPAL':'TRANSFER';
    const typed=r.transaction.allocations.every(a=>a.effect===effect)&&payment.transaction.allocations.some(a=>a.effect===effect);
    const refs=(t:TransactionRevision)=>[...t.transaction.provenance.flatMap(p=>p.externalTransactionId?.trim()?[p.externalTransactionId]:[]),...snapshot.references.filter(p=>p.householdId===householdId&&p.transactionId===t.transaction.id&&p.reference?.trim()).flatMap(p=>p.reference?[p.reference]:[])];
    const reference=refs(r).some(ref=>refs(payment).includes(ref));
    return {revision:r, strength:typed||reference?'SUPPORTING':'WEAK', reasons:[...(typed?['EXPLICIT_EFFECT']:[]),...(reference?['SOURCE_REFERENCE']:[]),...(exactAmount?['EXACT_AMOUNT']:[]),'DATE_WINDOW',...(!sameCurrency?['MISSING_FX']:[])], ambiguous:false};
  }).sort((a,b)=>(a.strength===b.strength?0:a.strength==='SUPPORTING'?-1:1)||a.revision.transaction.id.localeCompare(b.revision.transaction.id)).map((c,_,all)=>({...c,ambiguous:all.filter(x=>x.strength===c.strength).length>1}));
}
