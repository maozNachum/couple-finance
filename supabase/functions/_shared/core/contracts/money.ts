import { z } from 'zod';
import { decimalStringSchema, fitsDecimal } from '../domain/money/decimal.ts';
import { currencyCodeSchema } from './currency.ts';

// Validate the original scale too: importing an over-precise amount must fail,
// even if its extra digits happen to be zero. Persistence is numeric(24,8).
export const moneyAmountSchema = z.string()
  .refine((value) => fitsDecimal(value, 16, 8), 'Expected numeric(24,8) money precision')
  .pipe(decimalStringSchema);
export const moneySchema = z.strictObject({ amount: moneyAmountSchema, currency: currencyCodeSchema }).readonly();
export type Money = z.infer<typeof moneySchema>;
