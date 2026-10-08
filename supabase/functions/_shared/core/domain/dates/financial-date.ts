import { financialDateSchema, financialMonthSchema, monthlyRecurrenceSchema } from '../../contracts/financial-date.ts';
import type { FinancialDate, FinancialMonth, MonthlyRecurrence } from '../../contracts/financial-date.ts';
import { daysInMonth } from './calendar.ts';

export function compareFinancialDates(a: FinancialDate, b: FinancialDate): -1 | 0 | 1 {
  const left = financialDateSchema.parse(a);
  const right = financialDateSchema.parse(b);
  return left === right ? 0 : left < right ? -1 : 1;
}
export function monthOf(value: FinancialDate): FinancialMonth {
  return financialMonthSchema.parse(financialDateSchema.parse(value).slice(0, 7));
}
export function firstDayOfMonth(value: FinancialMonth): FinancialDate {
  return financialDateSchema.parse(`${financialMonthSchema.parse(value)}-01`);
}
export function lastDayOfMonth(value: FinancialMonth): FinancialDate {
  const month = financialMonthSchema.parse(value);
  return financialDateSchema.parse(`${month}-${daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)))}`);
}
export function moveFinancialMonth(value: FinancialMonth, offset: number): FinancialMonth {
  const month = financialMonthSchema.parse(value);
  if (!Number.isSafeInteger(offset) || Math.abs(offset) > 119987) throw new RangeError('Invalid month offset');
  const index = (Number(month.slice(0, 4)) - 1) * 12 + Number(month.slice(5, 7)) - 1 + offset;
  if (index < 0 || index >= 9999 * 12) throw new RangeError('Calendar overflow');
  return financialMonthSchema.parse(`${String(Math.floor(index / 12) + 1).padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}`);
}
export function monthBoundaries(value: FinancialMonth): Readonly<{ start: FinancialDate; endExclusive: FinancialDate }> {
  return Object.freeze({ start: firstDayOfMonth(value), endExclusive: firstDayOfMonth(moveFinancialMonth(value, 1)) });
}
/** Always use the original configured day; February clamping never changes it. */
export function recurrenceDate(value: FinancialMonth, rule: MonthlyRecurrence): FinancialDate {
  const month = financialMonthSchema.parse(value);
  const recurrence = monthlyRecurrenceSchema.parse(rule);
  const lastDay = daysInMonth(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
  return financialDateSchema.parse(`${month}-${String(Math.min(recurrence.dayOfMonth, lastDay)).padStart(2, '0')}`);
}
