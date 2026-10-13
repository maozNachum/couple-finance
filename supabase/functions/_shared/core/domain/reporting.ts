import { reportingSnapshotSchema, reportingRequestSchema } from '../contracts/reporting.ts';
import type { ReportingSnapshot, ReportingRequest, AccountPosition, PositionTotal, ReportWarning, ConvertedAmount } from '../contracts/reporting.ts';
import type { Money } from '../contracts/money.ts';
import { moneySchema } from '../contracts/money.ts';
import type { CurrencyCode } from '../contracts/currency.ts';
import { currencyCodeSchema } from '../contracts/currency.ts';
import { financialDateSchema } from '../contracts/financial-date.ts';
import { householdIdSchema } from '../contracts/identity.ts';
import { fxRateSchema } from '../contracts/fx.ts';
import type { TransactionRevision } from '../contracts/ledger.ts';
import { currentTransactions, ledgerBalance } from './money/ledger.ts';
import { valueAccount } from './money/valuation.ts';
import { convertMoney } from './money/fx.ts';
import { addMoney, subtractMoney } from './money/money.ts';
import { compare, decimal, negate } from './money/decimal.ts';
import { monthBoundaries } from './dates/financial-date.ts';
import { decisionIsStale, latestDecisions, evaluateReconciliation } from './reconciliation.ts';

const zero = (currency: CurrencyCode) => moneySchema.parse({ amount: '0', currency });
const order = (a: string,b: string) => a < b ? -1 : a > b ? 1 : 0;

/** Explicit direction, exact effective day, unique immutable household evidence. */
export function reportingConversion(original: Money, target: CurrencyCode, date: string, householdId: string, rates: ReportingSnapshot['rates']): ConvertedAmount {
  const money = moneySchema.parse(original), currency = currencyCodeSchema.parse(target);
  const day = financialDateSchema.parse(date), household = householdIdSchema.parse(householdId);
  if (money.currency === currency) return { original: money, money, fx: null, reason: null };
  const validated = rates.map(e => ({householdId:householdIdSchema.parse(e.householdId),rate:fxRateSchema.parse(e.rate)}));
  const eligible = validated.filter(e => e.householdId === household && e.rate.base === money.currency && e.rate.quote === currency && e.rate.effectiveDate === day);
  if (eligible.length !== 1) return { original: money, money: null, fx: null, reason: eligible.length ? 'AMBIGUOUS_FX' : 'MISSING_FX' };
  const fx = eligible[0]!.rate;
  return { original: money, money: convertMoney(money,currency,fx.effectiveDate,fx,{scale:8,mode:'HALF_UP'}), fx, reason: null };
}

/** A signed position belongs to exactly one attribution bucket. Never split shared ownership. */
export function aggregatePositions(positions: readonly AccountPosition[], currency: CurrencyCode): PositionTotal {
  if (new Set(positions.map(p => p.account.id)).size !== positions.length) throw new RangeError('Duplicate account');
  const selected = positions.filter(p => p.amount?.money !== null && p.amount !== null);
  let subtotal = zero(currency), assets = zero(currency), liabilities = zero(currency);
  for (const p of [...selected].sort((a,b) => order(a.account.id,b.account.id))) {
    const m = p.amount!.money!;
    subtotal = addMoney(subtotal,m);
    if (compare(p.amount!.original.amount,decimal('0')) >= 0) assets = addMoney(assets,m);
    else liabilities = addMoney(liabilities,m);
  }
  const complete = positions.length > 0 && selected.length === positions.length && positions.every(p => p.coverage === 'COMPLETE');
  return { coverage: complete ? 'COMPLETE' : selected.length ? 'PARTIAL' : positions.length ? 'UNKNOWN' : 'UNAVAILABLE',
    netWorth: complete ? subtotal : null, availableSubtotal: selected.length ? subtotal : null,
    assets: selected.length ? assets : null, liabilities: selected.length ? liabilities : null,
    included: selected.length, required: positions.length };
}

function validateContext(s: ReportingSnapshot) {
  for (const rows of [s.households,s.members,s.accounts.map(a => a.account),s.observations]) {
    if (new Set(rows.map(r => r.id)).size !== rows.length) throw new RangeError('Duplicate identity');
  }
  const households = new Set(s.households.map(h => h.id));
  const accounts = new Map(s.accounts.map(a => [a.account.id,a]));
  const member = (h: string,id: string) => s.members.some(m => m.householdId === h && m.id === id);
  for (const m of s.members) if (!households.has(m.householdId)) throw new RangeError('Member context');
  for (const a of s.accounts) {
    if (!households.has(a.account.householdId) || a.account.ownership.kind === 'MEMBER' && !member(a.account.householdId,a.account.ownership.memberId)) throw new RangeError('Account context');
  }
  for (const r of s.history) {
    const a = accounts.get(r.transaction.accountId);
    if (!a || a.account.householdId !== r.transaction.householdId || r.transaction.allocations.some(v => v.ownership.kind === 'MEMBER' && !member(r.transaction.householdId,v.ownership.memberId))) throw new RangeError('Transaction context');
  }
  for (const o of s.observations) {
    const a = accounts.get(o.accountId);
    if (!a || a.account.householdId !== o.householdId || !a.sources.some(v => v.id === o.sourceId) || o.money.currency !== a.account.currency) throw new RangeError('Observation context');
    if (o.fx && !s.rates.some(e => e.householdId === o.householdId && e.rate.id === o.fx!.id && JSON.stringify(e.rate) === JSON.stringify(o.fx))) throw new RangeError('Observation FX context');
  }
  const fxIds = new Set<string>();
  for (const e of s.rates) {
    const key = `${e.householdId}/${e.rate.id}`;
    if (!households.has(e.householdId) || fxIds.has(key)) throw new RangeError('FX context');
    fxIds.add(key);
  }
  const decisions = new Set<string>();
  for (const d of s.decisions) {
    const key = `${d.householdId}/${d.id}/${d.version}`;
    if (decisions.has(key) || !member(d.householdId,d.actorMemberId)) throw new RangeError('Decision context');
    decisions.add(key);
    if (d.fx && !s.rates.some(e => e.householdId === d.householdId && e.rate.id === d.fx!.id && JSON.stringify(e.rate) === JSON.stringify(d.fx))) throw new RangeError('Decision FX context');
    for (const p of d.participants) {
      if (p.revision.transaction.householdId !== d.householdId || !s.history.some(r => r.revisionId === p.selection.revisionId && r.transaction.householdId === d.householdId && r.transaction.accountId === p.selection.accountId && r.transaction.id === p.selection.transactionId && JSON.stringify(r) === JSON.stringify(p.revision))) throw new RangeError('Decision revision context');
    }
  }
}

/** Current corrected knowledge, complete authorized graph; no I/O or ambient clock. */
export function householdReport(rawSnapshot: ReportingSnapshot, rawRequest: ReportingRequest) {
  const snapshot = reportingSnapshotSchema.parse(rawSnapshot), request = reportingRequestSchema.parse(rawRequest);
  validateContext(snapshot);
  if (!snapshot.households.some(h => h.id === request.householdId)) throw new RangeError('Unknown household');
  const period = monthBoundaries(request.month);
  const accounts = snapshot.accounts.filter(a => a.account.householdId === request.householdId).sort((a,b) => order(a.account.id,b.account.id));
  const warnings: ReportWarning[] = [];
  const warn = (code: string, accountId: string | null = null, transactionId: string | null = null, relationshipId: string | null = null) => warnings.push({code,accountId,transactionId,relationshipId});
  const current: TransactionRevision[] = [];
  const positions: AccountPosition[] = accounts.map(record => {
    const account = record.account;
    const history = snapshot.history.filter(r => r.transaction.accountId === account.id);
    const revisions = [...currentTransactions(record,history)].sort((a,b) => order(a.transaction.id,b.transaction.id));
    current.push(...revisions);
    if (account.status === 'ARCHIVED') warn('ARCHIVED_HISTORY',account.id);
    let original: Money | null = null, measurementDate: string | null = null, reason: string | null = null;
    let coverage: AccountPosition['coverage'] = 'UNKNOWN';
    if (account.balancePolicy === 'LEDGER') {
      const balance = ledgerBalance(record,history,request.asOf);
      if (balance.state === 'ERROR') throw new RangeError('Invalid ledger');
      if (balance.state === 'KNOWN' || balance.state === 'INCOMPLETE') {
        original = balance.money; measurementDate = request.asOf;
        coverage = balance.state === 'KNOWN' ? 'COMPLETE' : 'PARTIAL';
        reason = balance.state === 'INCOMPLETE' ? 'PARTIAL_OPENING' : null;
      } else if (balance.state === 'UNKNOWN') reason = balance.reason;
    } else {
      const valuation = valueAccount(record,snapshot.observations,request.asOf);
      if ('observation' in valuation) {
        original = valuation.observation.money; measurementDate = valuation.observation.date;
        coverage = valuation.observation.coverage === 'COMPLETE' && measurementDate === request.asOf ? 'COMPLETE' : 'PARTIAL';
        reason = valuation.observation.coverage === 'PARTIAL' ? 'PARTIAL_OBSERVATION' : measurementDate !== request.asOf ? 'CARRIED_OBSERVATION' : null;
      } else reason = 'MISSING_OBSERVATION';
    }
    if (reason) warn(reason,account.id);
    const amount = original ? reportingConversion(original,request.currency,request.asOf,request.householdId,snapshot.rates) : null;
    if (amount?.reason) { warn(amount.reason,account.id); coverage = 'PARTIAL'; }
    return {account,coverage,reason,measurementDate,amount};
  });
  const netWorth = aggregatePositions(positions,request.currency);
  const ownership = [
    {kind:'HOUSEHOLD' as const,memberId:null,name:'משותף',total:aggregatePositions(positions.filter(p => p.account.ownership.kind === 'HOUSEHOLD'),request.currency)},
    ...snapshot.members.filter(m => m.householdId === request.householdId).sort((a,b) => order(a.id,b.id)).map(m => ({kind:'MEMBER' as const,memberId:m.id,name:m.displayName,total:aggregatePositions(positions.filter(p => p.account.ownership.kind === 'MEMBER' && p.account.ownership.memberId === m.id),request.currency)})),
  ];
  const monthlyIssues: string[] = [];
  // Opening coverage is not evidence that an external statement is complete.
  for (const record of accounts.filter(a => a.account.balancePolicy === 'LEDGER')) {
    const start = ledgerBalance(record,snapshot.history.filter(r => r.transaction.accountId === record.account.id),period.start);
    if (start.state !== 'KNOWN') { monthlyIssues.push('INCOMPLETE_LEDGER_PERIOD'); warn('INCOMPLETE_LEDGER_PERIOD',record.account.id); }
  }
  let income = zero(request.currency), consumption = zero(request.currency), recognizedCount = 0, unclassifiedCount = 0, uncategorizedCount = 0, missingFxCount = 0;
  let incomeConverted = 0, expenseConverted = 0, incomeMissing = 0, expenseMissing = 0;
  const conversions: {transactionId: string; allocationId: string; date: string; amount: ConvertedAmount}[] = [];
  const monthly = current.filter(r => r.entryKind === 'MOVEMENT' && r.transaction.status === 'POSTED' && r.transaction.transactionDate >= period.start && r.transaction.transactionDate < period.endExclusive).sort((a,b) => order(a.transaction.id,b.transaction.id));
  for (const r of monthly) for (const a of [...r.transaction.allocations].sort((a,b) => order(a.id,b.id))) {
    if (a.effect === 'UNCLASSIFIED') { unclassifiedCount++; monthlyIssues.push('UNCLASSIFIED'); warn('UNCLASSIFIED',r.transaction.accountId,r.transaction.id); continue; }
    if (a.effect !== 'INCOME' && a.effect !== 'EXPENSE') continue;
    if (a.categoryId === undefined) uncategorizedCount++;
    recognizedCount++;
    const amount = reportingConversion(a.money,request.currency,r.transaction.transactionDate,request.householdId,snapshot.rates);
    conversions.push({transactionId:r.transaction.id,allocationId:a.id,date:r.transaction.transactionDate,amount});
    if (!amount.money) { missingFxCount++; if (a.effect === 'INCOME') incomeMissing++; else expenseMissing++; monthlyIssues.push(amount.reason!); warn(amount.reason!,r.transaction.accountId,r.transaction.id); continue; }
    if (a.effect === 'INCOME') { incomeConverted++; income = addMoney(income,amount.money); }
    else { expenseConverted++; consumption = addMoney(consumption,moneySchema.parse({...amount.money,amount:negate(amount.money.amount)})); }
  }
  const reconciliation = latestDecisions(snapshot.decisions,request.householdId).filter(d => d.action !== 'UNLINK').map(d => {
    const stale = decisionIsStale(d,current);
    const evaluation = stale ? null : evaluateReconciliation(d.kind,d.participants.map(p => p.selection),current,d.fx);
    const state: 'STALE' | 'EXACT' | 'PARTIAL' | 'NEEDS_CORRECTION' | 'MISSING_FX' = stale ? 'STALE' : evaluation!.state;
    const relevant = d.participants.some(p => monthly.some(r => r.transaction.id === p.selection.transactionId));
    if (state !== 'EXACT') {
      warn(`RECONCILIATION_${state}`,null,null,d.id);
      if (relevant) monthlyIssues.push(`RECONCILIATION_${state}`);
    }
    const payment = d.participants.find(p => p.selection.role === 'PAYMENT');
    const revision = current.find(r => r.transaction.id === payment?.selection.transactionId);
    const possibleDuplicateConsumption = d.kind === 'CARD' && revision?.transaction.allocations.some(a => a.effect === 'EXPENSE') === true;
    if (possibleDuplicateConsumption) { warn('CARD_DOUBLE_CONSUMPTION',revision!.transaction.accountId,revision!.transaction.id,d.id); if (relevant) monthlyIssues.push('CARD_DOUBLE_CONSUMPTION'); }
    const components = stale ? [] : d.participants.flatMap(p => p.selection.parts.map(part => {
      const revision = current.find(r => r.revisionId === p.selection.revisionId)!;
      const allocation = revision.transaction.allocations.find(a => a.id === part.allocationId)!;
      return {transactionId:revision.transaction.id,allocationId:allocation.id,role:p.selection.role,meaning:part.meaning,effect:allocation.effect,money:allocation.money};
    })).sort((a,b) => order(a.transactionId,b.transactionId) || order(a.allocationId,b.allocationId));
    return {id:d.id,kind:d.kind,state,possibleDuplicateConsumption,components};
  });
  const claimed = new Set(latestDecisions(snapshot.decisions,request.householdId).filter(d => d.action !== 'UNLINK').flatMap(d => d.participants.map(p => p.selection.transactionId)));
  for (const r of monthly) if (!claimed.has(r.transaction.id) && r.transaction.allocations.some(a => a.effect === 'TRANSFER' || a.effect === 'DEBT_PRINCIPAL')) warn('UNLINKED_EVIDENCE',r.transaction.accountId,r.transaction.id);
  const complete = monthlyIssues.length === 0 && accounts.length > 0;
  return {request,period,positions,netWorth,ownership,
    monthly:{coverage:complete?'COMPLETE' as const:accounts.length?'PARTIAL' as const:'UNAVAILABLE' as const,income:accounts.length && (!incomeMissing || incomeConverted) ? income : null,consumption:accounts.length && (!expenseMissing || expenseConverted) ? consumption : null,difference:complete?subtractMoney(income,consumption):null,recognizedCount,unclassifiedCount,uncategorizedCount,missingFxCount,conversions,issues:[...new Set(monthlyIssues)].sort(order)},
    reconciliation,warnings:warnings.sort((a,b) => order(JSON.stringify(a),JSON.stringify(b))),snapshotSize:snapshot.size};
}
