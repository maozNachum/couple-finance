import { z } from 'zod';
import { householdIdSchema, accountIdSchema } from './identity.ts';
import { financialDateSchema } from './financial-date.ts';
import { moneySchema } from './money.ts';
import { compare, decimal } from '../domain/money/decimal.ts';
import type { Coverage, AccountPosition } from './reporting.ts';
import type { Money } from './money.ts';

/** Memory-only, explicitly acknowledged accessibility; never an account balance writer. */
export const forecastRequestSchema = z.strictObject({
  householdId: householdIdSchema,
  start: financialDateSchema,
  evidenceAsOf: financialDateSchema,
  horizon: z.number().int().min(1).max(90),
  buffer: moneySchema.refine(m => {
    const parsed=moneySchema.safeParse(m);
    return parsed.success && compare(parsed.data.amount,decimal('0')) >= 0;
  }),
  accounts: z.array(z.strictObject({ accountId: accountIdSchema, choice: z.enum(['INCLUDE', 'EXCLUDE']) }).readonly()).max(1000)
    .refine(a => new Set(a.map(v => v.accountId)).size === a.length).readonly(),
}).readonly();
export type ForecastRequest = z.infer<typeof forecastRequestSchema>;
export type ForecastDiagnostic = { readonly code: string; readonly accountId: string | null; readonly evidenceId: string | null };
export type ForecastAccount = { readonly position: AccountPosition; readonly eligibility: 'INCLUDED' | 'EXCLUDED' | 'UNRESOLVED'; readonly reason: string };
export type ForecastEvent = {
  readonly id: string; readonly date: string; readonly accountId: string;
  readonly source: 'POSTED_MOVEMENT' | 'CONFIRMED_OBLIGATION'; readonly original: Money;
  readonly cash: Money | null; readonly state: 'PROJECTED' | 'REFLECTED' | 'ACTUAL_REPLACES_PLAN' | 'UNRESOLVED';
  readonly obligationId: string | null; readonly transactionId: string | null;
};
export type ForecastDay = { readonly date: string; readonly ending: Money | null; readonly coverage: Coverage };
export type SafeToSpend =
  | { readonly state: 'UNAVAILABLE'; readonly amount: null; readonly candidate: null; readonly shortfall: null }
  | { readonly state: 'MODELED_AVAILABLE'; readonly amount: Money; readonly candidate: Money; readonly shortfall: null }
  | { readonly state: 'MODELED_SHORTFALL'; readonly amount: null; readonly candidate: Money; readonly shortfall: Money };
export type ForecastResult = {
  readonly coverage: Coverage; readonly starting: Money | null;
  readonly accounts: readonly ForecastAccount[]; readonly events: readonly ForecastEvent[];
  readonly days: readonly ForecastDay[]; readonly minimum: { readonly date: string; readonly money: Money } | null;
  readonly safeToSpend: SafeToSpend; readonly diagnostics: readonly ForecastDiagnostic[];
};
