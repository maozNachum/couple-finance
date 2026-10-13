import { forecastRequestSchema } from '../contracts/forecast.ts';
import type { ForecastRequest, ForecastResult, ForecastEvent, ForecastDiagnostic, ForecastAccount, SafeToSpend } from '../contracts/forecast.ts';
import type { ObligationsSnapshot } from '../contracts/obligations.ts';
import { moneySchema } from '../contracts/money.ts';
import type { Money } from '../contracts/money.ts';
import { financialDateSchema } from '../contracts/financial-date.ts';
import { daysInMonth } from './dates/calendar.ts';
import { reportingPosition, aggregatePositions } from './reporting.ts';
import { obligationContext, expectedObligations } from './obligations.ts';
import { latestDecisions, decisionIsStale, evaluateReconciliation } from './reconciliation.ts';
import { addMoney, subtractMoney, compareMoney } from './money/money.ts';
import { negate, compare, decimal } from './money/decimal.ts';

const order = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const unavailable = (): SafeToSpend => ({ state: 'UNAVAILABLE', amount: null, candidate: null, shortfall: null });
const liquidTypes = new Set(['BANK', 'CASH', 'SAVINGS']);

/** Gregorian date-only increment. S is a closing baseline; projected payments are (S, end]. */
export function forecastCalendar(start: string, horizon: number): readonly string[] {
  let date: string = financialDateSchema.parse(start);
  if (!Number.isSafeInteger(horizon) || horizon < 1 || horizon > 90) throw new RangeError('Forecast horizon bound');
  const days = [date];
  for (let i = 0; i < horizon; i++) {
    let year = Number(date.slice(0,4)), month = Number(date.slice(5,7)), day = Number(date.slice(8,10)) + 1;
    if (day > daysInMonth(year,month)) { day = 1; month++; }
    if (month > 12) { month = 1; year++; }
    date = financialDateSchema.parse(`${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`);
    days.push(date);
  }
  return days;
}

function compute(snapshot: ObligationsSnapshot, raw: ForecastRequest): ForecastResult {
  const serialized = JSON.stringify(snapshot);
  let bytes = 0;
  for (let i=0; i<serialized.length; i++) {
    const code=serialized.charCodeAt(i);
    if (code < 128) bytes++;
    else if (code < 2048) bytes+=2;
    else if (code >= 55296 && code <= 56319 && i+1 < serialized.length && serialized.charCodeAt(i+1) >= 56320 && serialized.charCodeAt(i+1) <= 57343) { bytes+=4; i++; }
    else bytes+=3;
    if (bytes > 16*1024*1024) throw new RangeError('Forecast snapshot byte bound');
  }
  const request = forecastRequestSchema.parse(raw), context = obligationContext(snapshot);
  if (request.start > request.evidenceAsOf) return {coverage:'UNAVAILABLE',starting:null,accounts:[],events:[],days:[],minimum:null,safeToSpend:unavailable(),
    diagnostics:[{code:'FUTURE_BASELINE_UNSUPPORTED',accountId:null,evidenceId:null}]};
  const calendar = forecastCalendar(request.start,request.horizon), end = calendar[calendar.length-1]!;
  const currency = request.buffer.currency;
  if (!context.snapshot.reporting.households.some(h => h.id === request.householdId)) throw new RangeError('Unknown forecast household');
  const positions = context.snapshot.reporting.accounts.filter(a => a.account.householdId === request.householdId)
    .sort((a,b) => order(a.account.id,b.account.id)).map(a => reportingPosition(a,context.snapshot.reporting.history.filter(r => r.transaction.accountId === a.account.id).sort((a,b) => order(a.revisionId,b.revisionId)),context.snapshot.reporting.observations,request.start,currency,context.snapshot.reporting.rates));
  const diagnostics: ForecastDiagnostic[] = [];
  const warn = (code: string, accountId: string | null = null, evidenceId: string | null = null) => diagnostics.push({code,accountId,evidenceId});
  const accounts = positions.map((position): ForecastAccount => {
    const a = position.account, choice = request.accounts.find(v => v.accountId === a.id)?.choice;
    if (!liquidTypes.has(a.type)) return {position,eligibility:'EXCLUDED',reason:'NON_LIQUID_TYPE'};
    if (a.status === 'ARCHIVED') { warn('ARCHIVED_LIQUID_POSITION',a.id); return {position,eligibility:'UNRESOLVED',reason:'ARCHIVED_LIQUID_POSITION'}; }
    if (!choice) { warn('ACCESSIBILITY_UNRESOLVED',a.id); return {position,eligibility:'UNRESOLVED',reason:'ACCESSIBILITY_UNRESOLVED'}; }
    if (choice === 'EXCLUDE') return {position,eligibility:'EXCLUDED',reason:'EXPLICITLY_EXCLUDED'};
    if (a.currency !== currency) warn('STARTING_CURRENCY_EXPOSURE',a.id);
    if (position.coverage !== 'COMPLETE') warn(position.amount?.reason ?? position.reason ?? 'UNKNOWN_BALANCE',a.id);
    return {position,eligibility:'INCLUDED',reason:'EXPLICITLY_ACCESSIBLE'};
  });
  for (const choice of request.accounts) {
    const a = accounts.find(a => a.position.account.id === choice.accountId);
    if (!a || choice.choice === 'INCLUDE' && (a.position.account.status !== 'ACTIVE' || !liquidTypes.has(a.position.account.type))) throw new RangeError('Ineligible accessibility context');
  }
  const included = new Set(accounts.filter(a => a.eligibility === 'INCLUDED').map(a => a.position.account.id));
  const total = aggregatePositions(accounts.filter(a => a.eligibility === 'INCLUDED').map(a => a.position),currency);
  const starting = total.availableSubtotal;
  const zero = moneySchema.parse({amount:'0',currency});
  const events: ForecastEvent[] = [];
  const future = context.current.filter(r => r.transaction.householdId === request.householdId && r.entryKind === 'MOVEMENT' &&
    r.transaction.transactionDate > request.start && r.transaction.transactionDate <= end && r.transaction.status === 'POSTED')
    .sort((a,b) => order(a.transaction.transactionDate,b.transaction.transactionDate) || order(a.transaction.id,b.transaction.id));
  if (future.length > 1000) throw new RangeError('Forecast movement bound');
  const expectations = expectedObligations(context.snapshot,request.householdId,request.start,end);
  const linkedMovements = new Set(context.payments.filter(d => d.householdId === request.householdId && d.action === 'LINK' &&
    context.current.some(r => r.revisionId === d.evidence!.revisionId && r.transaction.status === 'POSTED')).map(d => d.evidence!.transactionId));
  const historicalOverlap = new Set(future.filter(r => r.transaction.transactionDate <= request.evidenceAsOf && !linkedMovements.has(r.transaction.id) &&
    r.transaction.allocations.some(a => a.effect === 'EXPENSE' && compare(a.money.amount,decimal('0')) < 0)).map(r => r.transaction.accountId));
  // Card balances and recorded relationships do not establish a future bank settlement date.
  for (const a of accounts.filter(a => a.position.account.type === 'CREDIT_CARD' || a.position.account.type === 'LOAN')) {
    const accountId=a.position.account.id;
    const futureExposure=context.current.some(r => r.transaction.accountId === accountId && r.transaction.transactionDate <= end &&
      (r.transaction.status === 'PENDING' || r.transaction.status === 'POSTED' && r.transaction.transactionDate > request.start));
    if (a.position.coverage !== 'COMPLETE' || !a.position.amount || compare(a.position.amount.original.amount,decimal('0')) !== 0 || futureExposure)
      warn(a.position.account.type === 'CREDIT_CARD'?'CARD_CASH_TIMING_UNKNOWN':'LOAN_CASH_TIMING_UNKNOWN',accountId);
  }
  for (const d of latestDecisions(context.snapshot.reporting.decisions,request.householdId).filter(d => d.action !== 'UNLINK')) {
    if (decisionIsStale(d,context.current) || evaluateReconciliation(d.kind,d.participants.map(p => p.selection),context.current,d.fx).state !== 'EXACT') warn('RECONCILIATION_UNRESOLVED',null,d.id);
  }
  for (const r of context.current.filter(r => r.transaction.householdId === request.householdId && r.entryKind === 'MOVEMENT' && r.transaction.transactionDate <= end)) {
    if (included.has(r.transaction.accountId) && r.transaction.valueDate !== undefined && r.transaction.valueDate !== r.transaction.transactionDate) warn('CASH_VALUE_DATE_CONFLICT',r.transaction.accountId,r.transaction.id);
    if (r.transaction.status === 'POSTED' && r.transaction.allocations.some(a => a.effect === 'UNCLASSIFIED')) warn('UNCLASSIFIED',r.transaction.accountId,r.transaction.id);
    if (r.transaction.status === 'PENDING') warn('PENDING_CASH_TIMING',r.transaction.accountId,r.transaction.id);
  }
  for (const r of future) {
    const t = r.transaction;
    if (!included.has(t.accountId)) continue;
    const record = accounts.find(a => a.position.account.id === t.accountId)!;
    let cash: Money | null = t.money;
    if (record.position.account.balancePolicy === 'OBSERVED') { warn('OBSERVED_FUTURE_MOVEMENT',t.accountId,t.id); cash = null; }
    if (t.money.currency !== currency) { warn('FUTURE_FX_UNKNOWN',t.accountId,t.id); cash = null; }
    if (t.transactionDate > request.evidenceAsOf && compare(t.money.amount,decimal('0')) > 0) {
      warn(t.allocations.some(a => a.effect === 'INCOME')?'FUTURE_INCOME_UNSUPPORTED':'FUTURE_INFLOW_UNCONFIRMED',t.accountId,t.id); cash=null;
    }
    if (!linkedMovements.has(t.id) && t.allocations.some(a => a.effect === 'EXPENSE' && compare(a.money.amount,decimal('0')) < 0)) {
      if (t.transactionDate > request.evidenceAsOf) { warn('UNLINKED_FUTURE_EXPENSE',t.accountId,t.id); cash=null; }
      else if (expectations.some(e => e.obligation.plan.accountId === t.accountId && e.link === null)) warn('OBLIGATION_OVERLAP_UNRESOLVED',t.accountId,t.id);
    }
    events.push({id:`actual/${t.id}/${r.revisionId}`,date:t.transactionDate,accountId:t.accountId,source:'POSTED_MOVEMENT',original:t.money,cash,
      state:cash?'PROJECTED':'UNRESOLVED',obligationId:null,transactionId:t.id});
  }
  for (const e of expectations) {
    const a = accounts.find(a => a.position.account.id === e.obligation.plan.accountId)!;
    const original = moneySchema.parse({...e.money,amount:negate(e.money.amount)});
    let state: ForecastEvent['state'] = 'PROJECTED', cash: Money | null = original;
    if (!included.has(a.position.account.id)) { warn('OBLIGATION_CASH_TIMING_UNKNOWN',a.position.account.id,e.id); cash=null; state='UNRESOLVED'; }
    if (e.money.currency !== currency) { warn('FUTURE_FX_UNKNOWN',a.position.account.id,e.id); cash=null; state='UNRESOLVED'; }
    if (e.link && e.state !== 'ASSOCIATED') { warn(`PAYMENT_${e.state}`,a.position.account.id,e.id); cash=null; state='UNRESOLVED'; }
    if (e.link === null && historicalOverlap.has(a.position.account.id)) { warn('OBLIGATION_OVERLAP_UNRESOLVED',a.position.account.id,e.id); cash=null; state='UNRESOLVED'; }
    if (e.state === 'ASSOCIATED' && e.link) {
      const actual = context.current.find(r => r.revisionId === e.link!.evidence!.revisionId)!;
      if (actual.entryKind !== 'MOVEMENT' || actual.transaction.transactionDate > end) { warn('PAYMENT_OUTSIDE_CASH_WINDOW',a.position.account.id,e.id); cash=null; state='UNRESOLVED'; }
      else if (actual.transaction.transactionDate <= request.start) {
        if (a.position.account.balancePolicy === 'LEDGER' && a.position.coverage === 'COMPLETE' || a.position.account.balancePolicy === 'OBSERVED' && a.position.measurementDate !== null && actual.transaction.transactionDate <= a.position.measurementDate && a.position.coverage === 'COMPLETE') {
          cash=null;state='REFLECTED';
        } else { warn('PAYMENT_BALANCE_UNCERTAIN',a.position.account.id,e.id);cash=null;state='UNRESOLVED'; }
      } else if (future.some(r => r.revisionId === actual.revisionId) && included.has(a.position.account.id) && a.position.account.balancePolicy === 'LEDGER') {
        cash=null;state='ACTUAL_REPLACES_PLAN';
      } else { warn('PAYMENT_CASH_TIMING_UNKNOWN',a.position.account.id,e.id);cash=null;state='UNRESOLVED'; }
    } else if (e.date === request.start) {
      warn('BASELINE_OBLIGATION_UNRESOLVED',a.position.account.id,e.id);cash=null;state='UNRESOLVED';
    }
    events.push({id:e.id,date:e.date,accountId:a.position.account.id,source:'CONFIRMED_OBLIGATION',original,cash,state,
      obligationId:e.obligation.id,transactionId:e.link?.evidence?.transactionId ?? null});
  }
  const sorted = events.sort((a,b) => order(a.date,b.date) || order(a.id,b.id));
  if (new Set(sorted.map(e => e.id)).size !== sorted.length) throw new RangeError('Duplicate cash event');
  const coverage = starting === null ? included.size ? 'UNKNOWN' as const : 'UNAVAILABLE' as const :
    total.coverage === 'COMPLETE' && diagnostics.length === 0 ? 'COMPLETE' as const : 'PARTIAL' as const;
  let current = starting;
  const days = calendar.map(date => {
    if (current !== null && date > request.start) for (const event of sorted.filter(e => e.date === date && e.cash !== null)) current=addMoney(current,event.cash!);
    return {date,ending:current,coverage};
  });
  let minimum: ForecastResult['minimum'] = null;
  for (const d of days) if (d.ending && (!minimum || compareMoney(d.ending,minimum.money) < 0)) minimum={date:d.date,money:d.ending};
  let safeToSpend: SafeToSpend = unavailable();
  if (coverage === 'COMPLETE' && minimum) {
    const candidate = subtractMoney(minimum.money,request.buffer);
    safeToSpend = compareMoney(candidate,zero) >= 0 ? {state:'MODELED_AVAILABLE',amount:candidate,candidate,shortfall:null} :
      {state:'MODELED_SHORTFALL',amount:null,candidate,shortfall:subtractMoney(zero,candidate)};
  }
  const unique = new Map(diagnostics.map(d => [JSON.stringify(d),d]));
  return {coverage,starting,accounts,events:sorted,days,minimum,safeToSpend,diagnostics:[...unique.values()].sort((a,b) => order(JSON.stringify(a),JSON.stringify(b)))};
}

/** Invalid, oversized and overflowing calculations fail closed without exposing exception details. */
export function householdForecast(snapshot: ObligationsSnapshot, request: ForecastRequest): ForecastResult {
  try { return compute(snapshot,request); }
  catch { return {coverage:'UNAVAILABLE',starting:null,accounts:[],events:[],days:[],minimum:null,safeToSpend:unavailable(),
    diagnostics:[{code:'COMPUTATION_UNAVAILABLE',accountId:null,evidenceId:null}]}; }
}
