import { obligationsSnapshotSchema, obligationRevisionSchema } from '../contracts/obligations.ts';
import type { ObligationsSnapshot, ObligationRevision, ObligationEvidence, PaymentDecision } from '../contracts/obligations.ts';
import { financialDateSchema, financialMonthSchema } from '../contracts/financial-date.ts';
import { householdIdSchema } from '../contracts/identity.ts';
import type { TransactionRevision } from '../contracts/ledger.ts';
import { moneySchema } from '../contracts/money.ts';
import { currentTransactions, timestampOrder, ledgerBalance } from './money/ledger.ts';
import { compare, decimal, negate } from './money/decimal.ts';
import { recurrenceDate, moveFinancialMonth } from './dates/financial-date.ts';
import { normalizeDescription } from './categorization.ts';
import { validateReportingContext } from './reporting.ts';
import { latestDecisions, decisionIsStale } from './reconciliation.ts';

const order = (a: string,b: string) => a < b ? -1 : a > b ? 1 : 0;
const ownerKey = (o: ObligationRevision['plan']['ownership']) => o.kind === 'HOUSEHOLD' ? 'HOUSEHOLD' : `MEMBER/${o.memberId}`;
const originalDecisionKey = (e: readonly ObligationEvidence[]) => JSON.stringify([...e].sort((a,b) => order(a.transactionId,b.transactionId)));
// Account metadata version is a command precondition, not a new financial occurrence.
export const evidenceKey = (e: readonly ObligationEvidence[]) => JSON.stringify([...e].sort((a,b) => order(a.transactionId,b.transactionId))
  .map(v => [v.accountId,v.transactionId,v.revisionId,v.transactionVersion,v.allocationId]));

/** Validates the complete authorized financial and planning graph, never a paginated subset. */
export function obligationContext(raw: ObligationsSnapshot) {
  const s = obligationsSnapshotSchema.parse(raw), r = s.reporting;
  validateReportingContext(r);
  const current = r.accounts.flatMap(a => currentTransactions(a,r.history.filter(v => v.transaction.accountId === a.account.id)));
  const member = (h: string,id: string) => r.members.some(m => m.householdId === h && m.id === id);
  const evidence = (h: string,e: ObligationEvidence) => {
    const a = r.accounts.find(a => a.account.id === e.accountId && a.account.householdId === h);
    const v = r.history.find(v => v.transaction.householdId === h && v.transaction.accountId === e.accountId && v.transaction.id === e.transactionId && v.revisionId === e.revisionId && v.version === e.transactionVersion);
    if (!a || a.version < e.accountVersion || !v?.transaction.allocations.some(a => a.id === e.allocationId)) throw new RangeError('Evidence context');
  };
  const histories = new Map<string,ObligationRevision[]>();
  const confirmationClaims = new Map<string,string>();
  for (const v of s.revisions) {
    const account = r.accounts.find(a => a.account.id === v.plan.accountId && a.account.householdId === v.householdId);
    if (!account || account.account.currency !== v.plan.money.currency || !member(v.householdId,v.actorMemberId) ||
      v.plan.ownership.kind === 'MEMBER' && !member(v.householdId,v.plan.ownership.memberId)) throw new RangeError('Obligation context');
    for (const e of v.origin) {
      evidence(v.householdId,e);
      const original=r.history.find(r => r.revisionId === e.revisionId)!;
      const a=original.transaction.allocations.find(a => a.id === e.allocationId)!;
      if (e.accountId !== v.plan.accountId || original.entryKind !== 'MOVEMENT' || original.transaction.status !== 'POSTED' || a.effect !== 'EXPENSE' ||
        compare(a.money.amount,decimal('0')) >= 0 || a.money.currency !== v.plan.money.currency || ownerKey(a.ownership) !== ownerKey(v.plan.ownership)) throw new RangeError('Original confirmation evidence');
      const key=`${v.householdId}/${e.transactionId}/${e.revisionId}/${e.allocationId}`;
      if (confirmationClaims.has(key) && confirmationClaims.get(key) !== v.id) throw new RangeError('Duplicate confirmation');
      confirmationClaims.set(key,v.id);
    }
    const rows = histories.get(v.id) ?? []; rows.push(v); histories.set(v.id,rows);
  }
  const heads: ObligationRevision[] = [];
  for (const rows of histories.values()) {
    rows.sort((a,b) => a.version-b.version);
    const first = rows[0]!;
    for (let i=0;i<rows.length;i++) {
      const v=rows[i]!, prior=rows[i-1];
      if (v.version !== i+1 || v.householdId !== first.householdId || v.plan.accountId !== first.plan.accountId ||
        v.plan.money.currency !== first.plan.money.currency || ownerKey(v.plan.ownership) !== ownerKey(first.plan.ownership) || originalDecisionKey(v.origin) !== originalDecisionKey(first.origin) ||
        v.effectiveFrom < v.plan.startDate ||
        !prior && (v.status !== 'ACTIVE' || v.effectiveFrom !== v.plan.startDate) || prior &&
        (prior.status !== 'ACTIVE' || v.effectiveFrom <= prior.effectiveFrom || timestampOrder(v.recordedAt) < timestampOrder(prior.recordedAt) ||
          v.status !== 'ACTIVE' && JSON.stringify(v.plan) !== JSON.stringify(prior.plan))) throw new RangeError('Incomplete obligation history');
    }
    heads.push(rows[rows.length-1]!);
  }
  const links = new Map<string,PaymentDecision[]>();
  for (const d of s.payments) {
    if (!member(d.householdId,d.actorMemberId) || !s.revisions.some(v => v.id === d.obligationId && v.householdId === d.householdId && v.version === d.obligationVersion)) throw new RangeError('Payment context');
    if (d.evidence) evidence(d.householdId,d.evidence);
    const rows=links.get(d.id) ?? []; rows.push(d); links.set(d.id,rows);
  }
  const payments: PaymentDecision[]=[];
  for (const rows of links.values()) {
    rows.sort((a,b) => a.version-b.version); const first=rows[0]!;
    for (let i=0;i<rows.length;i++) {
      const d=rows[i]!;
      if (d.version !== i+1 || d.householdId !== first.householdId || d.obligationId !== first.obligationId || d.obligationVersion !== first.obligationVersion || d.date !== first.date ||
        i===0 && d.action !== 'LINK' || i>0 && (d.action === rows[i-1]!.action || timestampOrder(d.recordedAt) < timestampOrder(rows[i-1]!.recordedAt))) throw new RangeError('Payment history');
      if (d.action === 'LINK') {
        const v=s.revisions.find(v => v.id === d.obligationId && v.version === d.obligationVersion)!;
        const rev=r.history.find(v => v.revisionId === d.evidence!.revisionId)!;
        const a=rev.transaction.allocations.find(a => a.id === d.evidence!.allocationId)!;
        if (rev.entryKind !== 'MOVEMENT' || rev.transaction.status !== 'POSTED' || a.effect !== 'EXPENSE' || compare(a.money.amount,decimal('0')) >= 0 ||
          rev.transaction.accountId !== v.plan.accountId || a.money.currency !== v.plan.money.currency || ownerKey(a.ownership) !== ownerKey(v.plan.ownership) ||
          d.actual?.amount !== negate(a.money.amount) || d.actual.currency !== a.money.currency ||
          d.state !== paymentState(v.plan.money.amount,d.actual.amount)) throw new RangeError('Payment semantics');
      }
    }
    payments.push(rows[rows.length-1]!);
  }
  const active=payments.filter(d => d.action === 'LINK');
  for (const d of active) {
    const v=s.revisions.find(v => v.id === d.obligationId && v.version === d.obligationVersion)!;
    const next=s.revisions.find(n => n.id === v.id && n.version === v.version+1);
    if (expectedDates(v,d.date,d.date).length !== 1 || next && d.date >= next.effectiveFrom) throw new RangeError('Payment occurrence window');
  }
  if (new Set(active.map(d => `${d.householdId}/${d.evidence!.transactionId}`)).size !== active.length ||
    new Set(active.map(d => `${d.obligationId}/${d.obligationVersion}/${d.date}`)).size !== active.length) throw new RangeError('Duplicate payment claim');
  if (new Set(s.rejections.map(d => d.id)).size !== s.rejections.length) throw new RangeError('Duplicate rejection');
  for (const d of s.rejections) { if (!member(d.householdId,d.actorMemberId) || d.evidence.length < 3) throw new RangeError('Rejection context'); for (const e of d.evidence) evidence(d.householdId,e); }
  return { snapshot:s,current,heads:heads.sort((a,b) => order(a.id,b.id)),payments:payments.sort((a,b) => order(a.id,b.id)) };
}

export function paymentState(expected: string, actual: string): 'ASSOCIATED' | 'PARTIAL' | 'AMBIGUOUS' {
  const c=compare(decimal(actual),decimal(expected)); return c === 0 ? 'ASSOCIATED' : c < 0 ? 'PARTIAL' : 'AMBIGUOUS';
}
export function selectionForObligation(r: TransactionRevision, accountVersion: number, allocationId: ObligationEvidence['allocationId']): ObligationEvidence {
  return { accountId:r.transaction.accountId,accountVersion,transactionId:r.transaction.id,revisionId:r.revisionId,transactionVersion:r.version,allocationId };
}
function cardSettlementIds(s: ObligationsSnapshot, h: string) {
  return new Set(latestDecisions(s.reporting.decisions,h).filter(d => d.action !== 'UNLINK' && d.kind === 'CARD').flatMap(d => d.participants.filter(p => p.selection.role !== 'PURCHASE').map(p => p.selection.transactionId)));
}

/** Monthly hypotheses only: never contracts, predictions or automatically confirmed plans. */
export function recurringCandidates(raw: ObligationsSnapshot, household: string) {
  const {snapshot:s,current}=obligationContext(raw), h=householdIdSchema.parse(household);
  if (!s.reporting.households.some(v => v.id === h)) throw new RangeError('Household context');
  const settlements=cardSettlementIds(s,h), diagnostics=new Set<string>(['EXTERNAL_COVERAGE_UNKNOWN']);
  const groups=new Map<string,TransactionRevision[]>();
  for (const r of current.filter(r => r.transaction.householdId === h)) {
    const t=r.transaction;
    if (r.entryKind !== 'MOVEMENT' || t.status !== 'POSTED') continue;
    const a=t.allocations[0]!;
    if (t.allocations.some(a => a.effect === 'UNCLASSIFIED')) diagnostics.add('UNCLASSIFIED');
    if (t.allocations.some(a => a.effect === 'EXPENSE' && compare(a.money.amount,decimal('0')) > 0)) diagnostics.add('REFUNDS_EXCLUDED');
    if (settlements.has(t.id)) { diagnostics.add('CARD_SETTLEMENT_EXCLUDED'); continue; }
    if (t.allocations.length !== 1 || a.effect !== 'EXPENSE' || compare(a.money.amount,decimal('0')) >= 0) continue;
    const account=s.reporting.accounts.find(v => v.account.id === t.accountId)!;
    if (account.account.status !== 'ACTIVE') {diagnostics.add('ARCHIVED_ACCOUNT');continue;}
    const key=JSON.stringify([h,t.accountId,t.money.currency,ownerKey(a.ownership),normalizeDescription(t.description),t.merchant?.id??null,t.merchant?.name??null]);
    const rows=groups.get(key) ?? []; rows.push(r);groups.set(key,rows);
  }
  for (const d of latestDecisions(s.reporting.decisions,h).filter(d => d.action !== 'UNLINK')) if (decisionIsStale(d,current) || d.state !== 'EXACT') diagnostics.add('RECONCILIATION_UNRESOLVED');
  const candidates=[];
  for (const [key,unsorted] of [...groups.entries()].sort((a,b) => order(a[0],b[0]))) {
    if (unsorted.length < 3) continue;
    if (unsorted.length > 100) { diagnostics.add('CANDIDATE_EVIDENCE_BOUND');continue; }
    const rows=[...unsorted].sort((a,b) => order(a.transaction.transactionDate,b.transaction.transactionDate) || order(a.transaction.id,b.transaction.id)), first=rows[0]!;
    const issues=new Set<string>(['DESCRIPTION_IDENTITY_UNVERIFIED','EXTERNAL_COVERAGE_UNKNOWN']);
    const amounts=new Set(rows.map(r => r.transaction.money.amount)); if (amounts.size !== 1) issues.add('VARIABLE_AMOUNT');
    const months=rows.map(r => r.transaction.transactionDate.slice(0,7));
    if (new Set(months).size !== months.length) issues.add('MULTIPLE_IN_MONTH');
    for (let i=1;i<months.length;i++) if (months[i] !== months[i-1] && moveFinancialMonth(financialMonthSchema.parse(months[i-1]),1) !== months[i]) issues.add('MISSING_MONTHS');
    const days=[]; for (let day=1;day<=31;day++) if (rows.every(r => recurrenceDate(financialMonthSchema.parse(r.transaction.transactionDate.slice(0,7)),{dayOfMonth:day,overflow:'CLAMP_TO_MONTH_END'}) === r.transaction.transactionDate)) days.push(day);
    if (days.length !== 1) issues.add(days.length ? 'AMBIGUOUS_DAY' : 'IRREGULAR_DATES');
    const account=s.reporting.accounts.find(a => a.account.id === first.transaction.accountId)!;
    if (account.account.balancePolicy !== 'LEDGER' || ledgerBalance(account,s.reporting.history.filter(r => r.transaction.accountId === account.account.id),first.transaction.transactionDate).state !== 'KNOWN') issues.add('INCOMPLETE_HISTORY');
    const origin=rows.map(r => selectionForObligation(r,account.version,r.transaction.allocations[0]!.id));
    const reviewed=evidenceKey(origin);
    if (s.rejections.some(d => d.householdId === h && evidenceKey(d.evidence) === reviewed) || s.revisions.some(v => v.householdId === h && evidenceKey(v.origin) === reviewed)) continue;
    const ambiguous=[...issues].some(i => !['DESCRIPTION_IDENTITY_UNVERIFIED','EXTERNAL_COVERAGE_UNKNOWN','INCOMPLETE_HISTORY'].includes(i));
    candidates.push({key,confidence:ambiguous?'AMBIGUOUS' as const:'SUPPORTING' as const,issues:[...issues].sort(order),origin,occurrences:rows,
      proposed:{name:first.transaction.description,accountId:first.transaction.accountId,ownership:first.transaction.allocations[0]!.ownership,
        money:moneySchema.parse({currency:first.transaction.money.currency,amount:negate(first.transaction.money.amount)}),effect:'EXPENSE' as const,
        schedule:{frequency:'MONTHLY' as const,day:days.length===1?days[0]!:Number(first.transaction.transactionDate.slice(8,10))},startDate:first.transaction.transactionDate,endDate:null}});
  }
  return {candidates,diagnostics:[...diagnostics].sort(order)};
}

export function expectedDates(raw: ObligationRevision, from: string, to: string) {
  const v=obligationRevisionSchema.parse(raw), start=financialDateSchema.parse(from), end=financialDateSchema.parse(to);
  if (end < start) throw new RangeError('Invalid range');
  const index=(d:string) => Number(d.slice(0,4))*12+Number(d.slice(5,7));
  if (index(end)-index(start) >= 120) throw new RangeError('Recurrence range bound');
  const dates: string[]=[]; if(v.status !== 'ACTIVE') return dates;
  let month=financialMonthSchema.parse(start.slice(0,7));
  for (let i=0;i<=index(end)-index(start);i++) {
    const date=recurrenceDate(month,{dayOfMonth:v.plan.schedule.day,overflow:'CLAMP_TO_MONTH_END'});
    if (date >= start && date <= end && date >= v.plan.startDate && date >= v.effectiveFrom && (v.plan.endDate === null || date <= v.plan.endDate)) dates.push(date);
    if (i<index(end)-index(start)) month=moveFinancialMonth(month,1);
  }
  return dates;
}

/** Version windows are inclusive effectiveFrom and exclusive next effectiveFrom. No financial writes. */
export function expectedObligations(raw: ObligationsSnapshot, household: string, from: string, to: string) {
  const {snapshot:s,current,payments}=obligationContext(raw), h=householdIdSchema.parse(household);
  if (!s.reporting.households.some(v => v.id === h)) throw new RangeError('Household context');
  // Validate even empty households/ranges.
  const start=financialDateSchema.parse(from),end=financialDateSchema.parse(to);
  if (end<start || (Number(end.slice(0,4))-Number(start.slice(0,4)))*12+Number(end.slice(5,7))-Number(start.slice(5,7))>=120) throw new RangeError('Recurrence range bound');
  const settlements=cardSettlementIds(s,h),events=[];
  for (const v of s.revisions.filter(v => v.householdId === h).sort((a,b) => order(a.id,b.id) || a.version-b.version)) {
    const next=s.revisions.find(n => n.id === v.id && n.version === v.version+1);
    for (const date of expectedDates(v,from,to)) {
      if (next && date >= next.effectiveFrom) continue;
      const link=payments.find(d => d.obligationId === v.id && d.obligationVersion === v.version && d.date === date && d.action === 'LINK') ?? null;
      const stale=link !== null && (!current.some(r => r.revisionId === link.evidence!.revisionId && r.transaction.status === 'POSTED') || settlements.has(link.evidence!.transactionId));
      events.push({id:`${v.id}/${v.version}/${date}`,obligation:v,date,money:v.plan.money,link,state:stale?'STALE' as const:link?.state??'UNRESOLVED' as const,coverage:'EXTERNAL_COVERAGE_UNKNOWN' as const,fx:'FUTURE_FX_UNKNOWN' as const});
      if (events.length > 1000) throw new RangeError('Expected event bound');
    }
  }
  return events.sort((a,b) => order(a.date,b.date) || order(a.id,b.id));
}

/** Options for explicit review only. Similar dates/descriptions never resolve an event. */
export function eligibleObligationPayments(raw: ObligationsSnapshot, plan: ObligationRevision['plan'], household: string) {
  const {snapshot:s,current,payments}=obligationContext(raw),h=householdIdSchema.parse(household);
  const settlements=cardSettlementIds(s,h);
  const account=s.reporting.accounts.find(a => a.account.id === plan.accountId && a.account.householdId === h);
  if (!account || account.account.status !== 'ACTIVE') return [];
  return current.filter(r => r.transaction.householdId === h && r.transaction.accountId === plan.accountId && r.entryKind === 'MOVEMENT' && r.transaction.status === 'POSTED' &&
    !settlements.has(r.transaction.id) && !payments.some(d => d.action === 'LINK' && d.evidence!.transactionId === r.transaction.id))
    .sort((a,b) => order(a.transaction.transactionDate,b.transaction.transactionDate) || order(a.transaction.id,b.transaction.id))
    .flatMap(r => r.transaction.allocations.filter(a => a.effect === 'EXPENSE' && compare(a.money.amount,decimal('0')) < 0 && a.money.currency === plan.money.currency && ownerKey(a.ownership) === ownerKey(plan.ownership))
      .sort((a,b) => order(a.id,b.id)).map(a => ({revision:r,allocation:a,evidence:selectionForObligation(r,account.version,a.id),actual:moneySchema.parse({...a.money,amount:negate(a.money.amount)})})));
}
