import { z } from 'zod';
import { decimalStringSchema, isPositive } from '../domain/money/decimal.ts';
import { currencyCodeSchema } from './currency.ts';
import { financialDateSchema, utcTimestampSchema } from './financial-date.ts';
import { fxRateIdSchema, householdIdSchema, accountIdSchema } from './identity.ts';
import { sourceIdentitySchema, idempotencyKeySchema } from './ingestion.ts';
import { safeErrorSchema } from './safe-error.ts';

/** One base unit = rate quote units. A reverse pair is a different rate record. */
export const fxRateSchema = z.strictObject({
  id: fxRateIdSchema,
  base: currencyCodeSchema,
  quote: currencyCodeSchema,
  rate: decimalStringSchema.refine(isPositive, 'FX rate must be positive'),
  effectiveDate: financialDateSchema,
  recordedAt: utcTimestampSchema,
  origin: sourceIdentitySchema,
}).refine((value) => value.base !== value.quote, 'FX currencies must differ').readonly();
export type FxRate = z.infer<typeof fxRateSchema>;

/** Origin and recording metadata are derived by the authorized server command. */
export const manualFxCommandSchema = z.strictObject({
  householdId: householdIdSchema, sourceAccountId: accountIdSchema, id: fxRateIdSchema,
  idempotencyKey: idempotencyKeySchema, base: currencyCodeSchema, quote: currencyCodeSchema,
  rate: decimalStringSchema.refine(isPositive), effectiveDate: financialDateSchema,
  acknowledge: z.literal(true),
}).refine(c => c.base !== c.quote).readonly();
export type ManualFxCommand = z.infer<typeof manualFxCommandSchema>;
export const manualFxResponseSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), evidence: z.strictObject({ householdId: householdIdSchema, rate: fxRateSchema }).readonly() }).readonly(),
  z.strictObject({ ok: z.literal(false), error: safeErrorSchema }).readonly(),
]);
