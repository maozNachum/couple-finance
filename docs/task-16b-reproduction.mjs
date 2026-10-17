// Audit fixture only. No database, network, credentials, or financial writer.
// Run: node --experimental-strip-types docs/task-16b-reproduction.mjs
import assert from 'node:assert/strict';
import { accountRecordSchema, observationSchema } from '../supabase/functions/_shared/core/contracts/valuation.ts';
import { transactionRevisionSchema } from '../supabase/functions/_shared/core/contracts/ledger.ts';
import { fxRateSchema } from '../supabase/functions/_shared/core/contracts/fx.ts';
import { reportingSnapshotSchema, reportingRequestSchema } from '../supabase/functions/_shared/core/contracts/reporting.ts';
import { householdReport, reportingConversion } from '../supabase/functions/_shared/core/domain/reporting.ts';
import { financialDataQuality } from '../supabase/functions/_shared/core/domain/data-quality.ts';
import { valueAccount } from '../supabase/functions/_shared/core/domain/money/valuation.ts';
import { convertMoney } from '../supabase/functions/_shared/core/domain/money/fx.ts';
import { evaluateReconciliation, selectionFor } from '../supabase/functions/_shared/core/domain/reconciliation.ts';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const stamp = '2026-10-16T12:00:00Z';
const day = '2026-10-10';
const householdId = id(1);
const account = (n, policy = 'LEDGER', currency = 'USD') => accountRecordSchema.parse({
  account: { id: id(n), householdId, name: `Synthetic ${n}`, ownership: { kind: 'HOUSEHOLD' },
    type: 'BANK', currency, valuationCurrency: 'ILS', balancePolicy: policy, status: 'ACTIVE' },
  version: 1, manualSourceId: id(n + 100), sources: [{ id: id(n + 100), householdId,
    accountId: id(n), kind: 'MANUAL', authoritativeFrom: '0001-01-01' }],
});
const ledger = account(10), observed = account(11, 'OBSERVED');
const revision = (n, amount, effect, opening = false, accountId = 10, currency = 'USD') => transactionRevisionSchema.parse({
  revisionId: id(n + 1000), supersedesRevisionId: null, version: 1,
  entryKind: opening ? 'OPENING' : 'MOVEMENT', openingCoverage: opening ? 'COMPLETE' : null,
  reason: '', createdAt: stamp, recordedAt: stamp,
  transaction: { id: id(n + 2000), householdId, accountId: id(accountId),
    transactionDate: opening ? '2026-10-01' : day, valueDate: '2026-10-12',
    description: 'Synthetic only', status: 'POSTED', money: { amount, currency },
    provenance: [{ source: { sourceId: id(accountId + 100), kind: 'MANUAL' } }],
    allocations: [{ id: id(n + 3000), effect, money: { amount, currency },
      ownership: { kind: 'HOUSEHOLD' }, categorization: { origin: 'UNCLASSIFIED', userLocked: false } }],
  },
});
// All numerical values below are deliberately synthetic, never market quotes.
const rate = (n, extra = {}) => fxRateSchema.parse({ id: id(n), base: 'USD', quote: 'ILS',
  rate: '3.7', effectiveDate: day, recordedAt: stamp,
  origin: { sourceId: observed.manualSourceId, kind: 'MANUAL' }, ...extra });
const adjacent = rate(800, { effectiveDate: '2026-10-09' });
const reverse = rate(801, { base: 'ILS', quote: 'USD', rate: '0.25' });
const exact = rate(802);
const competing = rate(803, { rate: '3.8' });
const observation = observationSchema.parse({ id: id(900), householdId, accountId: observed.account.id,
  sourceId: observed.manualSourceId, date: '2026-10-09', money: { amount: '250.75', currency: 'USD' },
  coverage: 'PARTIAL', supersedesId: null, note: 'Synthetic measurement', fx: adjacent, recordedAt: stamp });
const expense = revision(2, '-10', 'EXPENSE');
const request = reportingRequestSchema.parse({ householdId, asOf: '2026-10-16', month: '2026-10', currency: 'ILS' });
const wrap = r => ({ householdId, rate: r });
function snapshot(rates, observations = [observation]) {
  const raw = { households: [{ id: householdId, name: 'Synthetic household', createdAt: stamp }],
    members: [{ id: id(2), householdId, userId: id(3), displayName: 'Synthetic member', status: 'ACTIVE' }],
    accounts: [ledger, observed, account(12, 'LEDGER', 'ILS')],
    history: [revision(1, '100', 'ADJUSTMENT', true), expense],
    observations, decisions: [], rates: rates.map(wrap), references: [] };
  return reportingSnapshotSchema.parse({ ...raw, size: Object.values(raw).reduce((sum, rows) => sum + rows.length, 0) });
}
function evaluate(s) {
  const report = householdReport(s, request);
  const quality = financialDataQuality({ version: 1, capturedAt: stamp,
    obligations: { reporting: s, revisions: [], payments: [], rejections: [], size: 0 },
    categories: [], budgets: [], size: 0 }, { reporting: request, forecast: null });
  return { report, quality };
}
const original = JSON.stringify(expense);
const before = evaluate(snapshot([adjacent, reverse]));
assert.equal(before.report.monthly.missingFxCount, 1);
assert.equal(before.report.monthly.consumption, null);
assert.equal(before.report.monthly.conversions[0].amount.reason, 'MISSING_FX');
assert.equal(before.report.monthly.conversions[0].date, day);
assert.equal(valueAccount(observed, [observation], request.asOf).money.amount, '927.775');

// Counterfactual with a genuine same-day observation: the EXISTING observation
// command would retain its FX in the registry. This script performs no command.
const sameDayObservation = observationSchema.parse({ ...observation, id: id(901), date: day, fx: exact });
const after = evaluate(snapshot([adjacent, reverse, exact], [observation, sameDayObservation]));
assert.equal(after.report.monthly.consumption.amount, '37');
assert.equal(after.report.monthly.missingFxCount, 0);
assert.equal(after.report.monthly.conversions[0].amount.fx.id, exact.id);
assert.equal(after.report.monthly.difference, null); // unrelated missing ILS opening remains
assert.equal(after.quality.externalCoverage, 'UNKNOWN');
assert.ok(after.quality.findings.some(f => f.reasons.includes('NO_OPENING')));
assert.ok(after.quality.findings.some(f => f.reasons.includes('PARTIAL_OBSERVATION')));
const finding = r => r.quality.findings.find(f => f.subject.id === `USD/ILS/${day}`);
assert.equal(finding(before).reasons[0], 'MISSING_FX');
assert.equal(finding(after), undefined);
const ambiguous = evaluate(snapshot([adjacent, reverse, exact, competing], [observation, sameDayObservation]));
assert.equal(ambiguous.report.monthly.conversions[0].amount.reason, 'AMBIGUOUS_FX');
assert.equal(ambiguous.report.monthly.consumption, null);
assert.equal(finding(ambiguous).evidence.filter(e => e.kind === 'FX').length, 2);
assert.equal(JSON.stringify(expense), original);
const identicalValues = evaluate(snapshot([adjacent, reverse, exact, rate(807)], [observation, sameDayObservation]));
assert.equal(identicalValues.report.monthly.conversions[0].amount.reason, 'AMBIGUOUS_FX');
// An independent registry rate cannot silently attach to an observation.
const withoutEmbeddedFx = observationSchema.parse({ ...observation, fx: null });
assert.equal(valueAccount(observed, [withoutEmbeddedFx], request.asOf).state, 'MISSING_FX');
assert.throws(() => rate(808, { rate: '1.1234567890123' }));
assert.throws(() => rate(809, { rate: 3.7 }));
assert.throws(() => evaluate(snapshot([adjacent, reverse, exact, rate(802, { rate: '3.8' })])));

// Pure date/direction/household selection, rounding, and canonical precision.
assert.throws(() => convertMoney(expense.transaction.money, 'ILS', day, adjacent), RangeError);
assert.throws(() => convertMoney(expense.transaction.money, 'ILS', day, reverse), RangeError);
assert.equal(reportingConversion(expense.transaction.money, 'ILS', day, householdId,
  [{ householdId: id(99), rate: exact }]).reason, 'MISSING_FX');
assert.equal(convertMoney({ amount: '0.00000001', currency: 'USD' }, 'ILS', day,
  rate(804, { rate: '1.5' }), { scale: 8, mode: 'HALF_UP' }).amount, '0.00000002');
assert.equal(convertMoney({ amount: '9007199254740991.12345678', currency: 'USD' }, 'ILS', day,
  rate(805, { rate: '1' })).amount, '9007199254740991.12345678');

// Existing reconciliation explicitly selects a rate; it does not resolve the
// separate reporting selector's ambiguity or change any stored rate.
const payment = revision(20, '-10', 'TRANSFER');
const counterpart = revision(21, '37', 'TRANSFER', false, 12, 'ILS');
const participants = [selectionFor(payment, 1, 'PAYMENT', 'TRANSFER'), selectionFor(counterpart, 1, 'COUNTERPART', 'TRANSFER')];
assert.equal(evaluateReconciliation('TRANSFER', participants, [payment, counterpart], null).state, 'MISSING_FX');
assert.equal(evaluateReconciliation('TRANSFER', participants, [payment, counterpart], exact).state, 'EXACT');
assert.equal(evaluateReconciliation('TRANSFER', participants, [payment, counterpart], competing).state, 'PARTIAL');
assert.equal(ambiguous.report.monthly.conversions[0].amount.reason, 'AMBIGUOUS_FX');

// A parseable origin is NOT proof of a stored/authorized source. Code audit of
// guard_fx_evidence confirms the same gap; this is not a live DB exploit test.
assert.ok(fxRateSchema.safeParse(rate(806, { origin: { kind: 'LIVE_SYNC', sourceId: id(999) } })).success);
console.log(JSON.stringify({ syntheticOnly: true, persistence: 'NONE',
  sourceValidation: 'Static SQL audit; no database authorization claim',
  dates: { recognition: day, value: expense.transaction.valueDate, report: request.asOf, recorded: stamp },
  before: { original: expense.transaction.money, conversion: before.report.monthly.conversions[0].amount,
    priorObservationValue: valueAccount(observed, [observation], request.asOf).money, finding: finding(before) },
  supportedEvidenceReuse: { consumption: after.report.monthly.consumption,
    selectedRateId: exact.id, fxFindingAbsent: finding(after) === undefined,
    externalCoverage: after.quality.externalCoverage, remainingReasons: after.quality.findings.flatMap(f => f.reasons) },
  competing: { reason: ambiguous.report.monthly.conversions[0].amount.reason,
    eligibleIds: finding(ambiguous).evidence.filter(e => e.kind === 'FX').map(e => e.id) },
  reconciliation: { noSelection: 'MISSING_FX', explicitExact: 'EXACT', explicitOther: 'PARTIAL', reportingStill: 'AMBIGUOUS_FX' },
  assertions: 'PASS' }, null, 2));
