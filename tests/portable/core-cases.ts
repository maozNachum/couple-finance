import { decimal, decimalStringSchema, add, subtract, multiply, divide, compare, absolute, negate, isZero, isPositive, isNegative, roundDecimal, sumDecimals } from '@finance/domain/money/decimal';
import { moneySchema } from '@finance/contracts/money';
import { currencyCodeSchema, initialReportingCurrency } from '@finance/contracts/currency';
import { addMoney, subtractMoney, compareMoney, scaleMoney, divideMoney, roundMoney, displayMoney } from '@finance/domain/money/money';
import { fxRateSchema } from '@finance/contracts/fx';
import { convertMoney } from '@finance/domain/money/fx';
import { financialDateSchema, financialMonthSchema, utcTimestampSchema, monthlyRecurrenceSchema, householdTimeZone } from '@finance/contracts/financial-date';
import { compareFinancialDates, monthOf, firstDayOfMonth, lastDayOfMonth, moveFinancialMonth, monthBoundaries, recurrenceDate } from '@finance/domain/dates/financial-date';
import { ownershipSchema } from '@finance/contracts/ownership';
import { accountSchema, balancePolicySchema } from '@finance/contracts/account';
import { allocationSchema, reportingEffectSchema } from '@finance/contracts/allocation';
import { transactionSchema, transactionStatusSchema } from '@finance/contracts/transaction';
import { sourceIdentitySchema, ingestionIdentitySchema, transactionProvenanceSchema } from '@finance/contracts/ingestion';
import { accountIdSchema, householdIdSchema } from '@finance/contracts/identity';
import { safeErrorSchema, internalSafeError } from '@finance/contracts/safe-error';
import { householdSchema, householdMemberSchema } from '@finance/contracts/household';
import { accountRecordSchema, observationSchema, observationInputSchema, createAccountSchema } from '@finance/contracts/valuation';
import { valueAccount } from '@finance/domain/money/valuation';

// One assertion corpus runs unchanged in Vitest/jsdom, permission-free Deno,
// and an actual production-bundled browser under four runtime timezones.
export const coreCases: { name: string; run: () => void }[] = [];
function test(name: string, run: () => void): void { coreCases.push({ name, run }); }
function equal(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}
function rejects(run: () => unknown): void {
  let rejected = false;
  try { run(); } catch { rejected = true; }
  if (!rejected) throw new Error('Expected rejection');
}
const id = '00000000-0000-4000-8000-000000000001';
const secondId = '00000000-0000-4000-8000-000000000002';
const thirdId = '00000000-0000-4000-8000-000000000003';
const date = financialDateSchema.parse('2024-02-29');
const month = financialMonthSchema.parse('2024-02');
const d = decimal;
const money = (amount: string, currency = 'ILS') => moneySchema.parse({ amount, currency });
const source = { sourceId: id, kind: 'MANUAL' };
const account = { id, householdId: secondId, name: 'Synthetic account', ownership: { kind: 'HOUSEHOLD' }, type: 'BANK', currency: 'ILS', valuationCurrency: 'ILS', balancePolicy: 'LEDGER', status: 'ACTIVE' };
function allocation(amount: string, effect = 'UNCLASSIFIED', currency = 'ILS') {
  return { id, effect, money: { amount, currency }, ownership: { kind: 'HOUSEHOLD' }, categorization: { origin: 'USER', userLocked: true } };
}
function transaction(amount = '-10', effect = 'EXPENSE') {
  return { id, householdId: secondId, accountId: thirdId, transactionDate: '2024-02-29', money: { amount, currency: 'ILS' }, description: 'Synthetic movement', status: 'POSTED', provenance: [{ source }], allocations: [allocation(amount, effect)] };
}
const rawFx = { id, base: 'USD', quote: 'ILS', rate: '3.72', effectiveDate: '2024-02-29', recordedAt: '2024-03-01T12:00:00.123456Z', origin: source };

const observedRecord = accountRecordSchema.parse({ account: { ...account, balancePolicy: 'OBSERVED' }, version: 1, manualSourceId: thirdId, sources: [{ id: thirdId, householdId: secondId, accountId: id, kind: 'MANUAL', authoritativeFrom: '0001-01-01' }] });
const observation = observationSchema.parse({ id, householdId: secondId, accountId: id, sourceId: thirdId, date, money: money('-10.125'), coverage: 'COMPLETE', supersedesId: null, note: '', fx: null, recordedAt: '2024-03-01T00:00:00Z' });
test('valuation: ledger is unavailable even when observations are supplied', () => {
  equal(valueAccount(accountRecordSchema.parse({ ...observedRecord, account }), [observation], date).state, 'LEDGER_UNAVAILABLE');
});
test('valuation: missing history is not zero and future observations are excluded', () => {
  equal(valueAccount(observedRecord, [], date).state, 'MISSING');
  equal(valueAccount(observedRecord, [observation], financialDateSchema.parse('2024-02-28')).state, 'MISSING');
});
test('valuation: signed exact money and original measurement date survive as-of selection', () => {
  const result = valueAccount(observedRecord, [observation], financialDateSchema.parse('2024-03-10'));
  if (result.state !== 'VALUED') throw new Error('Expected valued');
  equal(result.money, money('-10.125')); equal(result.observation.date, date);
});
test('valuation: correction replaces rather than adds and partial coverage survives', () => {
  const corrected = observationSchema.parse({ ...observation, id: secondId, supersedesId: id, money: money('-9.5'), coverage: 'PARTIAL', note: 'Synthetic correction' });
  const result = valueAccount(observedRecord, [corrected, observation], date);
  if (result.state !== 'VALUED') throw new Error('Expected valued');
  equal(result.money, money('-9.5')); equal(result.observation.coverage, 'PARTIAL');
});
test('valuation: unrelated household/account histories cannot affect selection', () => {
  equal(valueAccount(observedRecord, [observationSchema.parse({ ...observation, householdId: thirdId })], date).state, 'MISSING');
  equal(valueAccount(observedRecord, [observationSchema.parse({ ...observation, accountId: thirdId })], date).state, 'MISSING');
});
test('valuation: source and currency mismatches fail closed', () => {
  rejects(() => valueAccount(observedRecord, [observationSchema.parse({ ...observation, sourceId: id })], date));
  rejects(() => valueAccount(observedRecord, [observationSchema.parse({ ...observation, money: money('1', 'USD') })], date));
});
test('valuation: ambiguous same-day roots fail closed', () => rejects(() => valueAccount(observedRecord, [observation, observationSchema.parse({ ...observation, id: secondId })], date)));
test('valuation: missing historical FX stays visible', () => {
  const record = accountRecordSchema.parse({ ...observedRecord, account: { ...observedRecord.account, valuationCurrency: 'USD' } });
  equal(valueAccount(record, [observation], date).state, 'MISSING_FX');
});
test('valuation: conversion uses canonical historical FX and preserves rate identity', () => {
  const record = accountRecordSchema.parse({ ...observedRecord, account: { ...observedRecord.account, currency: 'USD' } });
  const row = observationSchema.parse({ ...observation, money: money('-100', 'USD'), fx: { ...rawFx, origin: { sourceId: thirdId, kind: 'MANUAL' } } });
  const result = valueAccount(record, [row], financialDateSchema.parse('2024-03-10'));
  if (result.state !== 'VALUED') throw new Error('Expected valued');
  equal(result.money, money('-372')); equal(result.observation.fx?.id, id);
  rejects(() => valueAccount(record, [observationSchema.parse({ ...row, fx: { ...row.fx, effectiveDate: '2024-02-28' } })], date));
  rejects(() => valueAccount(record, [observationSchema.parse({ ...row, fx: { ...row.fx, base: 'ILS', quote: 'USD' } })], date));
});
test('valuation: correction input requires reason and forbids self replacement', () => {
  const { recordedAt: _recordedAt, ...input } = observation;
  equal(_recordedAt, '2024-03-01T00:00:00Z');
  equal(observationInputSchema.safeParse({ ...input, supersedesId: secondId }).success, false);
  equal(observationInputSchema.safeParse({ ...input, supersedesId: id, note: 'Correction' }).success, false);
  equal(observationInputSchema.safeParse({ ...input, money: { amount: 1, currency: 'ILS' } }).success, false);
});
test('valuation: cash requires ledger at command boundary', () => {
  const input = { account: { ...observedRecord.account, type: 'CASH' }, version: 1, manualSourceId: thirdId };
  equal(createAccountSchema.safeParse(input).success, false);
  equal(createAccountSchema.safeParse({ ...input, account: { ...input.account, balancePolicy: 'LEDGER' } }).success, true);
});
const importedId = '00000000-0000-4000-8000-000000000004';
const importedSource = { id: importedId, householdId: secondId, accountId: id, kind: 'FILE_IMPORT', authoritativeFrom: '2024-03-01' };
test('sources: overlapping sources keep one stable account and deterministic dated authority', () => {
  const record = accountRecordSchema.parse({ ...observedRecord, sources: [...observedRecord.sources, importedSource] });
  const imported = observationSchema.parse({ ...observation, id: secondId, sourceId: importedId, date: '2024-03-01', money: money('20') });
  const manual = observationSchema.parse({ ...observation, id: thirdId, date: '2024-03-01', money: money('30') });
  const result = valueAccount(record, [manual, imported, observation], financialDateSchema.parse('2024-03-02'));
  if (result.state !== 'VALUED') throw new Error('Expected valued');
  equal(result.money, money('20')); equal(result.observation.sourceId, importedId);
  const prior = valueAccount(record, [manual, imported, observation], date);
  if (prior.state !== 'VALUED') throw new Error('Expected prior value');
  equal(prior.observation.id, observation.id); equal(record.account.id, id);
});
test('sources: inactive source does not override manual and activation gaps never fall back', () => {
  const inactive = accountRecordSchema.parse({ ...observedRecord, sources: [...observedRecord.sources, { ...importedSource, authoritativeFrom: null }] });
  equal(valueAccount(inactive, [observation], date).state, 'VALUED');
  const active = accountRecordSchema.parse({ ...inactive, sources: [...observedRecord.sources, importedSource] });
  equal(valueAccount(active, [observation], financialDateSchema.parse('2024-03-01')).state, 'MISSING');
  const earlier = observationSchema.parse({ ...observation, id: secondId, sourceId: importedId });
  equal(valueAccount(active, [earlier, observation], financialDateSchema.parse('2024-03-01')).state, 'MISSING');
});
test('sources: cross-household, cross-account, duplicate IDs and tied activation dates are rejected', () => {
  for (const source of [{ ...importedSource, householdId: thirdId }, { ...importedSource, accountId: secondId }, { ...importedSource, id: thirdId }, { ...importedSource, authoritativeFrom: '0001-01-01' }]) {
    rejects(() => accountRecordSchema.parse({ ...observedRecord, sources: [...observedRecord.sources, source] }));
  }
});
test('sources: corrections cannot cross source or date and cannot compete or cycle', () => {
  const record = accountRecordSchema.parse({ ...observedRecord, sources: [...observedRecord.sources, importedSource] });
  const correction = observationSchema.parse({ ...observation, id: secondId, supersedesId: id, note: 'Correction' });
  rejects(() => valueAccount(record, [observation, observationSchema.parse({ ...correction, sourceId: importedId })], date));
  rejects(() => valueAccount(record, [observation, observationSchema.parse({ ...correction, date: '2024-03-01' })], date));
  rejects(() => valueAccount(record, [observation, correction, observationSchema.parse({ ...correction, id: thirdId })], date));
  rejects(() => valueAccount(record, [correction], date));
  rejects(() => valueAccount(record, [correction, observationSchema.parse({ ...observation, supersedesId: secondId, note: 'Cycle' })], date));
});
test('FX: shared rate evidence is independent of observation source and explicitly historical', () => {
  const record = accountRecordSchema.parse({ ...observedRecord, account: { ...observedRecord.account, currency: 'USD', status: 'ARCHIVED' } });
  const row = observationSchema.parse({ ...observation, money: money('100', 'USD'), fx: rawFx });
  const original = JSON.stringify(row);
  const result = valueAccount(record, [row], financialDateSchema.parse('2024-03-10'));
  if (result.state !== 'VALUED') throw new Error('Expected valued');
  equal(result.money, money('372')); equal(result.basis, 'HISTORICAL_OBSERVATION');
  equal(result.observation.fx?.effectiveDate, date); equal(JSON.stringify(row), original);
  equal(Object.isFrozen(row.fx), true);
});
const fx = fxRateSchema.parse(rawFx);
test('household contract reuses canonical UUID and UTC types', () => {
  equal(householdSchema.parse({ id, name: 'Synthetic household', createdAt: '2024-02-29T12:00:00Z' }).id, id);
  equal(householdSchema.safeParse({ id, name: 'Synthetic', createdAt: '2024-02-29' }).success, false);
  equal(householdSchema.safeParse({ id, name: 'Synthetic', createdAt: '2024-02-29T12:00:00Z', secret: 'rejected' }).success, false);
});
test('household membership is relational and has explicit revocation', () => {
  equal(householdMemberSchema.parse({ id, householdId: secondId, userId: thirdId, displayName: 'Synthetic', status: 'REVOKED' }).status, 'REVOKED');
  equal(householdMemberSchema.safeParse({ id, householdId: 'a-name', userId: thirdId, displayName: 'Synthetic', status: 'ACTIVE' }).success, false);
});
test('durable members retain attribution without an active login identity', () => {
  const member = { id, householdId: secondId, userId: null, displayName: 'Former member', status: 'REVOKED' };
  equal(householdMemberSchema.parse(member).id, id);
  equal(householdMemberSchema.parse(member).displayName, 'Former member');
  equal(householdMemberSchema.safeParse({ ...member, status: 'ACTIVE' }).success, false);
  equal(householdMemberSchema.safeParse({ ...member, displayName: ' ' }).success, false);
});

test('decimal addition is exact: 0.1 + 0.2', () => equal(add(d('0.1'), d('0.2')), '0.3'));
test('decimal subtraction crosses zero exactly', () => equal(subtract(d('0.1'), d('0.3')), '-0.2'));
test('decimal multiplication is exact', () => equal(multiply(d('1.25'), d('0.2')), '0.25'));
test('decimal terminating division is exact', () => equal(divide(d('1'), d('8')), '0.125'));
test('division never silently rounds recurring decimals', () => rejects(() => divide(d('1'), d('3'))));
test('division rounds only with an explicit policy', () => equal(divide(d('2'), d('3'), { scale: 8, mode: 'HALF_UP' }), '0.66666667'));
test('division tie and negative half-up', () => equal(divide(d('-1'), d('8'), { scale: 2, mode: 'HALF_UP' }), '-0.13'));
test('division rejects zero', () => rejects(() => divide(d('1'), d('0'))));
test('large values beyond Number precision remain exact', () => equal(add(d('99999999999999999.999999999999'), d('0.000000000001')), '100000000000000000'));
test('overflow is rejected', () => rejects(() => add(d('999999999999999999'), d('1'))));
test('subtraction overflow is rejected', () => rejects(() => subtract(d('-999999999999999999'), d('1'))));
test('product precision loss is rejected', () => rejects(() => multiply(d('0.000000000001'), d('0.1'))));
test('explicit product rounding permits a deliberate zero', () => equal(multiply(d('0.000000000001'), d('0.1'), { scale: 12, mode: 'HALF_UP' }), '0'));
test('multiplication handles all 30 operand digits', () => equal(multiply(d('999999999999999999.999999999999'), d('1')), '999999999999999999.999999999999'));
for (const value of [1.2, NaN, Infinity, null, undefined, '', ' ', ' 1', '1 ', '+1', '01', '.5', '1.', '1e3', 'NaN', 'Infinity', '1,200', '0x10', '0.0000000000001', '1000000000000000000']) {
  test(`invalid decimal input ${String(value)} (${typeof value})`, () => equal(decimalStringSchema.safeParse(value).success, false));
}
test('decimal canonicalization preserves value and removes negative zero', () => {
  equal(d('-0.000'), '0'); equal(d('12.3400'), '12.34');
});
test('absolute, negation, comparisons and sign checks', () => {
  equal(absolute(d('-12.3')), '12.3'); equal(negate(d('12.3')), '-12.3');
  equal(negate(d('0')), '0'); equal(compare(d('-1'), d('0')), -1);
  equal(compare(d('3.0'), d('3')), 0); equal(compare(d('4'), d('3')), 1);
  equal(isZero(d('-0')), true); equal(isPositive(d('0')), false);
  equal(isNegative(d('0')), false); equal(isNegative(d('-1')), true); equal(isPositive(d('1')), true);
});
test('explicit HALF_UP rounds ties away from zero', () => {
  equal(roundDecimal(d('1.005'), { scale: 2, mode: 'HALF_UP' }), '1.01');
  equal(roundDecimal(d('-1.005'), { scale: 2, mode: 'HALF_UP' }), '-1.01');
  rejects(() => roundDecimal(d('1'), { scale: 13, mode: 'HALF_UP' }));
});
test('bounded sum allows cancellation without intermediate overflow', () => {
  equal(sumDecimals([d('999999999999999999'), d('999999999999999999'), d('-999999999999999999')]), '999999999999999999');
  rejects(() => sumDecimals(Array.from({ length: 1001 }, () => d('0'))));
});
test('supported ISO currency codes and default', () => {
  for (const code of ['ILS', 'USD', 'EUR', 'JPY', 'KWD']) equal(currencyCodeSchema.parse(code), code);
  equal(initialReportingCurrency, 'ILS');
});
for (const value of ['ils', 'ZZZ', 'US', 'USDD', '', null, 1]) test(`currency rejects ${String(value)}`, () => equal(currencyCodeSchema.safeParse(value).success, false));
test('money requires a currency and never accepts numeric amounts', () => {
  for (const value of ['12.5', { amount: '12.5' }, { amount: 12.5, currency: 'ILS' }, { amount: '1', currency: 'ILS', provider: 'raw' }]) equal(moneySchema.safeParse(value).success, false);
});
test('money bounds match numeric(24,8)', () => {
  equal(money('9999999999999999.99999999').amount, '9999999999999999.99999999');
  rejects(() => money('10000000000000000')); rejects(() => money('0.000000001'));
  rejects(() => money('1.000000000')); rejects(() => addMoney(money('9999999999999999.99999999'), money('0.00000001')));
});
test('money operations retain currency and precision', () => {
  equal(addMoney(money('0.1'), money('0.2')), { amount: '0.3', currency: 'ILS' });
  equal(subtractMoney(money('0.1'), money('0.2')).amount, '-0.1');
  equal(scaleMoney(money('0.1'), d('3')).amount, '0.3');
  equal(divideMoney(money('1'), d('8')).amount, '0.125');
  equal(compareMoney(money('1'), money('1.0')), 0);
});
test('money operations reject unrelated currencies', () => {
  for (const operation of [addMoney, subtractMoney, compareMoney]) rejects(() => operation(money('1', 'USD'), money('1', 'ILS')));
});
test('currency display rounding is separate from stored posted amount', () => {
  const value = money('1.005'); equal(roundMoney(value).amount, '1.01');
  equal(value.amount, '1.005'); equal(displayMoney(value), '1.01 ILS');
  equal(displayMoney(money('-1.005')), '-1.01 ILS'); equal(displayMoney(money('-0.001')), '0.00 ILS');
  equal(displayMoney(money('12.5', 'JPY')), '13 JPY'); equal(displayMoney(money('1.2345', 'KWD')), '1.235 KWD');
});
test('FX direction multiplies USD by ILS per USD', () => equal(convertMoney(money('100', 'USD'), 'ILS', date, fx), { amount: '372', currency: 'ILS' }));
test('FX does not implicitly invert a pair or accept a wrong target', () => {
  rejects(() => convertMoney(money('372', 'ILS'), 'USD', date, fx));
  rejects(() => convertMoney(money('100', 'USD'), 'EUR', date, fx));
});
test('FX rejects reversed labelled rate for forward conversion', () => rejects(() => convertMoney(money('100', 'USD'), 'ILS', date, fxRateSchema.parse({ ...rawFx, base: 'ILS', quote: 'USD', rate: '0.268817204301' }))));
test('FX effective date must match the supplied valuation date', () => rejects(() => convertMoney(money('1', 'USD'), 'ILS', financialDateSchema.parse('2024-03-01'), fx)));
test('FX twelve-place precision and explicit money rounding', () => {
  const precise = fxRateSchema.parse({ ...rawFx, rate: '3.123456789123' });
  rejects(() => convertMoney(money('1', 'USD'), 'ILS', date, precise));
  equal(convertMoney(money('1', 'USD'), 'ILS', date, precise, { scale: 8, mode: 'HALF_UP' }).amount, '3.12345679');
  equal(convertMoney(money('-0.5', 'USD'), 'ILS', date, fx).amount, '-1.86');
});
test('FX rejects non-positive, numeric, malformed and same-currency rates', () => {
  for (const rate of ['0', '-1', 3.72, '1e2', '0.0000000000001']) equal(fxRateSchema.safeParse({ ...rawFx, rate }).success, false);
  equal(fxRateSchema.safeParse({ ...rawFx, quote: 'USD' }).success, false);
  equal(fxRateSchema.safeParse({ ...rawFx, origin: undefined }).success, false);
});
for (const value of ['2024-02-29', '2000-02-29', '2023-02-28', '0001-01-01', '9999-12-31']) test(`valid date ${value}`, () => equal(financialDateSchema.parse(value), value));
for (const value of ['2023-02-29', '1900-02-29', '2100-02-29', '2024-04-31', '2024-13-01', '2024-00-01', '2024-01-00', '2024-01-32', '0000-01-01', '2024-2-01', '2024-02-01T00:00:00Z', '', 20240201]) {
  test(`invalid date ${String(value)}`, () => equal(financialDateSchema.safeParse(value).success, false));
}
test('date comparison and half-open month boundaries', () => {
  equal(compareFinancialDates(date, financialDateSchema.parse('2024-03-01')), -1);
  equal(compareFinancialDates(date, date), 0); equal(monthOf(date), '2024-02');
  equal(firstDayOfMonth(month), '2024-02-01'); equal(lastDayOfMonth(month), '2024-02-29');
  equal(monthBoundaries(month), { start: '2024-02-01', endExclusive: '2024-03-01' });
});
test('moving financial months handles year and negative boundaries', () => {
  equal(moveFinancialMonth(financialMonthSchema.parse('2024-01'), -1), '2023-12');
  equal(moveFinancialMonth(financialMonthSchema.parse('2024-12'), 1), '2025-01');
  equal(moveFinancialMonth(month, 12), '2025-02');
  rejects(() => moveFinancialMonth(month, 0.5)); rejects(() => moveFinancialMonth(month, NaN));
  rejects(() => moveFinancialMonth(financialMonthSchema.parse('0001-01'), -1));
  rejects(() => monthBoundaries(financialMonthSchema.parse('9999-12')));
});
test('invalid financial months are rejected', () => {
  for (const value of ['2024-00', '2024-13', '0000-02', '2024-2', '2024-02-01']) equal(financialMonthSchema.safeParse(value).success, false);
});
test('monthly day 31 clamps without drift across February and April', () => {
  const rule = monthlyRecurrenceSchema.parse({ dayOfMonth: 31, overflow: 'CLAMP_TO_MONTH_END' });
  equal(['2024-01', '2024-02', '2024-04', '2024-05', '2023-02'].map((value) => recurrenceDate(financialMonthSchema.parse(value), rule)), ['2024-01-31', '2024-02-29', '2024-04-30', '2024-05-31', '2023-02-28']);
});
test('monthly day 30 and century leap-year rules', () => {
  for (const [value, expected] of [['1900-02', '1900-02-28'], ['2000-02', '2000-02-29'], ['2100-02', '2100-02-28'], ['2024-05', '2024-05-30']]) {
    equal(recurrenceDate(financialMonthSchema.parse(value), monthlyRecurrenceSchema.parse({ dayOfMonth: 30, overflow: 'CLAMP_TO_MONTH_END' })), expected);
  }
});
test('recurrence rejects invalid days and invented holiday policies', () => {
  for (const dayOfMonth of [0, 32, 1.5, NaN]) equal(monthlyRecurrenceSchema.safeParse({ dayOfMonth, overflow: 'CLAMP_TO_MONTH_END' }).success, false);
  equal(monthlyRecurrenceSchema.safeParse({ dayOfMonth: 31, overflow: 'NEXT_BUSINESS_DAY' }).success, false);
});
test('date-only values round-trip unchanged in the runtime timezone', () => {
  equal(financialDateSchema.parse(JSON.parse(JSON.stringify(date))), '2024-02-29');
  equal(recurrenceDate(month, monthlyRecurrenceSchema.parse({ dayOfMonth: 31, overflow: 'CLAMP_TO_MONTH_END' })), '2024-02-29');
});
test('UTC timestamps validate calendar/time independently of financial dates', () => {
  for (const value of ['2024-02-29T23:59:59Z', '2024-02-29T23:59:59.123456Z']) equal(utcTimestampSchema.parse(value), value);
  for (const value of ['2023-02-29T00:00:00Z', '2024-01-01', '2024-01-01T24:00:00Z', '2024-01-01T23:59:60Z', '2024-01-01T00:00:00+02:00', '2024-01-01T00:00:00.1234567Z']) equal(utcTimestampSchema.safeParse(value).success, false);
});
test('Israel midnight and DST boundaries do not reinterpret supplied financial dates', () => {
  // Instant-to-calendar projection is a test/runtime concern, never domain Date.
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: householdTimeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  for (const [instant, expected] of [
    ['2024-01-31T21:59:59Z', '2024-01-31'], ['2024-01-31T22:00:00Z', '2024-02-01'],
    ['2024-07-31T20:59:59Z', '2024-07-31'], ['2024-07-31T21:00:00Z', '2024-08-01'],
    ['2024-03-29T00:30:00Z', '2024-03-29'], ['2024-10-26T23:30:00Z', '2024-10-27'],
  ]) {
    const parts = formatter.formatToParts(new Date(utcTimestampSchema.parse(instant)));
    const part = (kind: string) => parts.find((value) => value.type === kind)?.value;
    equal(financialDateSchema.parse(`${part('year')}-${part('month')}-${part('day')}`), expected);
    equal(financialDateSchema.parse('2024-01-31'), '2024-01-31');
  }
});
test('ownership uses relational members and strict household shape', () => {
  equal(ownershipSchema.parse({ kind: 'HOUSEHOLD' }), { kind: 'HOUSEHOLD' });
  equal(ownershipSchema.parse({ kind: 'MEMBER', memberId: id }).kind, 'MEMBER');
  for (const value of [{ kind: 'MEMBER' }, { kind: 'MEMBER', memberId: '' }, { kind: 'HOUSEHOLD', memberId: id }, { kind: 'MAOZ' }, { kind: 'SHACHAR' }]) equal(ownershipSchema.safeParse(value).success, false);
});
test('IDs are validated UUIDs', () => {
  equal(accountIdSchema.parse(id), id); equal(householdIdSchema.parse(secondId), secondId);
  rejects(() => accountIdSchema.parse('provider-account-123'));
});
test('accounts distinguish ledger and observed without source identity', () => {
  equal(accountSchema.parse(account).balancePolicy, 'LEDGER');
  equal(accountSchema.parse({ ...account, type: 'INVESTMENT', balancePolicy: 'OBSERVED', currency: 'USD', valuationCurrency: 'ILS' }).balancePolicy, 'OBSERVED');
  equal(balancePolicySchema.safeParse('SUM_IMPORTED_TRANSACTIONS').success, false);
  for (const fields of [{ providerId: id }, { sourceId: id }, { balance: '100' }, { balancePolicy: 'UNKNOWN' }]) equal(accountSchema.safeParse({ ...account, ...fields }).success, false);
});
test('transactions preserve optional value date and normalized merchant', () => {
  const parsed = transactionSchema.parse({ ...transaction(), valueDate: '2024-03-01', merchant: { id, name: 'Synthetic merchant' } });
  equal(parsed.valueDate, '2024-03-01'); equal(parsed.merchant?.name, 'Synthetic merchant');
});
test('transaction pending, posted and voided status are distinct', () => {
  for (const status of ['PENDING', 'POSTED', 'VOIDED']) equal(transactionSchema.parse({ ...transaction(), status }).status, status);
  equal(transactionStatusSchema.safeParse('SETTLED').success, false);
});
const effects = [
  ['bank income', 'BANK', '100', 'INCOME'],
  ['bank purchase', 'BANK', '-20', 'EXPENSE'],
  ['card purchase increases liability', 'CREDIT_CARD', '-20', 'EXPENSE'],
  ['card settlement outgoing bank leg', 'BANK', '-20', 'TRANSFER'],
  ['card settlement increases card position', 'CREDIT_CARD', '20', 'TRANSFER'],
  ['internal transfer outgoing', 'BANK', '-20', 'TRANSFER'],
  ['internal transfer incoming', 'BANK', '20', 'TRANSFER'],
  ['investment contribution outgoing', 'BANK', '-20', 'TRANSFER'],
  ['investment contribution incoming', 'INVESTMENT', '20', 'TRANSFER'],
  ['loan proceeds bank leg are not income', 'BANK', '100', 'DEBT_PRINCIPAL'],
  ['loan proceeds liability leg', 'LOAN', '-100', 'DEBT_PRINCIPAL'],
  ['loan principal bank leg is not expense', 'BANK', '-20', 'DEBT_PRINCIPAL'],
  ['loan repayment reduces liability', 'LOAN', '20', 'DEBT_PRINCIPAL'],
  ['interest and fees', 'BANK', '-2', 'EXPENSE'],
  ['refund reduces expense', 'BANK', '20', 'EXPENSE'],
  ['opening balance', 'BANK', '100', 'ADJUSTMENT'],
  ['correction', 'BANK', '-1', 'ADJUSTMENT'],
  ['unrealized movement is not income', 'INVESTMENT', '10', 'ADJUSTMENT'],
  ['investment trade', 'INVESTMENT', '-50', 'INVESTMENT_TRADE'],
  ['uncategorized movement', 'BANK', '-10', 'UNCLASSIFIED'],
] as const;
for (const [label, type, amount, effect] of effects) test(`signed-position contract: ${label}`, () => {
  const parsedAccount = accountSchema.parse({ ...account, type });
  const parsed = transactionSchema.parse(transaction(amount, effect));
  equal(parsedAccount.type, type); equal(parsed.money.amount, amount);
  equal(parsed.allocations[0]?.effect, effect);
  equal(addMoney(money('0'), parsed.money).amount, amount);
});
test('reporting effects are independent of categories and amount sign', () => {
  for (const effect of reportingEffectSchema.options) {
    equal(allocationSchema.parse({ ...allocation('1', effect), categoryId: id }).effect, effect);
    equal(allocationSchema.parse(allocation('-1', effect)).effect, effect);
  }
});
test('split principal and fee allocations reconcile exactly', () => {
  const parsed = transactionSchema.parse({ ...transaction('-102'), allocations: [allocation('-100', 'DEBT_PRINCIPAL'), { ...allocation('-2', 'EXPENSE'), id: secondId, costBehavior: 'VARIABLE', necessity: 'ESSENTIAL' }] });
  equal(parsed.allocations.length, 2);
});
test('allocation totals reject mismatch, mixed currency, duplicates and missing splits', () => {
  for (const allocations of [[], [allocation('-9')], [allocation('-10', 'EXPENSE', 'USD')], [allocation('-5'), allocation('-5')]]) equal(transactionSchema.safeParse({ ...transaction(), allocations }).success, false);
});
test('signed split offsets and zero transactions are valid', () => {
  equal(transactionSchema.parse({ ...transaction('-10'), allocations: [allocation('-12'), { ...allocation('2', 'EXPENSE'), id: secondId }] }).money.amount, '-10');
  equal(transactionSchema.parse(transaction('0', 'ADJUSTMENT')).money.amount, '0');
});
test('allocation fields and precision are validated', () => {
  for (const fields of [{ effect: 'GROCERIES' }, { ownership: { kind: 'MEMBER' } }, { money: { amount: 1, currency: 'ILS' } }, { costBehavior: 'SOMETIMES' }, { necessity: 'UNKNOWN' }, { categorization: { origin: 'USER', userLocked: 'yes' } }]) equal(allocationSchema.safeParse({ ...allocation('1'), ...fields }).success, false);
});
test('transaction contract rejects provider payloads and numeric money', () => {
  equal(transactionSchema.safeParse({ ...transaction(), providerPayload: {} }).success, false);
  equal(transactionSchema.safeParse({ ...transaction(), money: { amount: -10, currency: 'ILS' } }).success, false);
  equal(transactionSchema.safeParse({ ...transaction(), provenance: [] }).success, false);
});
const ingestion = { householdId: secondId, accountId: thirdId, source, externalTransactionId: 'upstream-0001', idempotencyKey: 'command_1234567890', fingerprint: { algorithm: 'SHA256', version: 1, digest: 'a'.repeat(64) } };
test('ingestion keeps source, external ID, candidate and command key separate', () => {
  const parsed = ingestionIdentitySchema.parse(ingestion);
  equal(parsed.source.sourceId, id); equal(parsed.externalTransactionId, 'upstream-0001');
  equal(parsed.idempotencyKey, 'command_1234567890');
  equal(ingestionIdentitySchema.parse({ ...ingestion, externalTransactionId: undefined }).fingerprint?.digest, 'a'.repeat(64));
});
test('matching fingerprints do not imply equal external identities', () => {
  const a = ingestionIdentitySchema.parse(ingestion);
  const b = ingestionIdentitySchema.parse({ ...ingestion, externalTransactionId: 'upstream-0002', idempotencyKey: 'command_0987654321' });
  equal(a.fingerprint?.digest, b.fingerprint?.digest); equal(a.externalTransactionId === b.externalTransactionId, false);
});
test('ingestion rejects invalid identities and malformed fingerprints', () => {
  for (const fields of [{ idempotencyKey: '' }, { externalTransactionId: ' ' }, { externalTransactionId: 'id\n' }, { fingerprint: { algorithm: 'SHA256', version: 0, digest: 'a'.repeat(64) } }, { fingerprint: { algorithm: 'SHA256', version: 1, digest: 'not-a-hash' } }, { source: { sourceId: 'provider-name', kind: 'LIVE_SYNC' } }]) equal(ingestionIdentitySchema.safeParse({ ...ingestion, ...fields }).success, false);
});
test('normalized provenance allows multiple independent source kinds', () => {
  for (const kind of ['MANUAL', 'FILE_IMPORT', 'LIVE_SYNC']) equal(sourceIdentitySchema.parse({ sourceId: id, kind }).kind, kind);
  equal(transactionProvenanceSchema.safeParse({ source, token: 'secret' }).success, false);
});
test('safe errors expose only fixed messages and structured identifiers', () => {
  const error = internalSafeError({ requestId: id, correlationId: secondId });
  equal(error.code, 'INTERNAL_ERROR'); equal(error.retryable, false);
  equal(safeErrorSchema.parse(JSON.parse(JSON.stringify(error))), error);
  const validation = safeErrorSchema.parse({ code: 'INVALID_INPUT', kind: 'VALIDATION', safeMessage: 'Some values are invalid.', retryable: false, fieldErrors: [{ field: 'amount', code: 'INVALID', safeMessage: 'Invalid value.' }] });
  equal(validation.code, 'INVALID_INPUT');
});
test('safe errors reject stacks, tokens, raw responses and arbitrary messages', () => {
  const safe = internalSafeError();
  for (const fields of [{ stack: 'trace' }, { token: 'secret' }, { providerRawResponse: {} }, { credentials: {} }, { safeMessage: 'secret leaked' }, { retryable: true }, { requestId: 'token-value' }, { fieldErrors: [{ field: 'amount', safeMessage: 'raw response' }] }]) equal(safeErrorSchema.safeParse({ ...safe, ...fields }).success, false);
});
test('transient safe errors are explicitly retryable', () => equal(safeErrorSchema.parse({ code: 'TEMPORARILY_UNAVAILABLE', kind: 'UNAVAILABLE', safeMessage: 'Temporarily unavailable. Please try again.', retryable: true }).retryable, true));
test('wire primitives reject trailing line terminators', () => {
  for (const suffix of ['\n', '\r', '\r\n', '\u2028', '\u2029']) {
    equal(decimalStringSchema.safeParse(`1${suffix}`).success, false);
    equal(moneySchema.safeParse({ amount: `1${suffix}`, currency: 'ILS' }).success, false);
    equal(financialDateSchema.safeParse(`2024-01-01${suffix}`).success, false);
    equal(utcTimestampSchema.safeParse(`2024-01-01T00:00:00Z${suffix}`).success, false);
    equal(accountIdSchema.safeParse(`${id}${suffix}`).success, false);
    equal(ingestionIdentitySchema.safeParse({ ...ingestion, idempotencyKey: `${ingestion.idempotencyKey}${suffix}` }).success, false);
    equal(ingestionIdentitySchema.safeParse({ ...ingestion, fingerprint: { ...ingestion.fingerprint, digest: `${ingestion.fingerprint.digest}${suffix}` } }).success, false);
  }
});
test('UUID case normalization cannot bypass allocation uniqueness', () => {
  const lower = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  equal(accountIdSchema.parse(lower.toUpperCase()), lower);
  equal(transactionSchema.safeParse({ ...transaction(), allocations: [{ ...allocation('-5'), id: lower }, { ...allocation('-5'), id: lower.toUpperCase() }] }).success, false);
});
