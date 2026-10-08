import { z } from 'zod';

// Supported ISO 4217 codes, not every syntactically plausible three-letter string.
export const currencyCodeSchema = z.enum(['ILS', 'USD', 'EUR', 'JPY', 'KWD']);
export type CurrencyCode = z.infer<typeof currencyCodeSchema>;
export const currencyMinorUnits: Readonly<Record<CurrencyCode, number>> = Object.freeze({ ILS: 2, USD: 2, EUR: 2, JPY: 0, KWD: 3 });
export const initialReportingCurrency: CurrencyCode = 'ILS';
