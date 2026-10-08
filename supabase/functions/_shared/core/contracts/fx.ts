import { z } from 'zod';
import { decimalStringSchema, isPositive } from '../domain/money/decimal.ts';
import { currencyCodeSchema } from './currency.ts';
import { financialDateSchema, utcTimestampSchema } from './financial-date.ts';
import { fxRateIdSchema } from './identity.ts';
import { sourceIdentitySchema } from './ingestion.ts';

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
