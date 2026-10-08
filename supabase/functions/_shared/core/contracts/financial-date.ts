import { z } from 'zod';
import { isFinancialDate } from '../domain/dates/calendar.ts';

export const householdTimeZone = 'Asia/Jerusalem' as const;
export const financialDateSchema = z.string().refine(isFinancialDate, 'Expected a valid YYYY-MM-DD calendar date').brand<'FinancialDate'>();
export type FinancialDate = z.infer<typeof financialDateSchema>;
export const financialMonthSchema = z.string().regex(/^\d{4}-\d{2}$/)
  .refine((value) => isFinancialDate(`${value}-01`), 'Expected a valid YYYY-MM month').brand<'FinancialMonth'>();
export type FinancialMonth = z.infer<typeof financialMonthSchema>;

// PostgreSQL timestamptz-compatible UTC wire instants, microseconds at most.
// Validate the calendar component without parsing it through a runtime timezone.
export const utcTimestampSchema = z.string()
  .endsWith('Z')
  .regex(/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?Z$/)
  .refine((value) => isFinancialDate(value.slice(0, 10)), 'Invalid timestamp calendar date')
  .brand<'UtcTimestamp'>();
export type UtcTimestamp = z.infer<typeof utcTimestampSchema>;
export const monthlyRecurrenceSchema = z.strictObject({
  dayOfMonth: z.number().int().min(1).max(31),
  overflow: z.literal('CLAMP_TO_MONTH_END'),
}).readonly();
export type MonthlyRecurrence = z.infer<typeof monthlyRecurrenceSchema>;
