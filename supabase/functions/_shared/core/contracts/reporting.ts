import { z } from 'zod';
import { reconciliationSnapshotSchema } from './reconciliation.ts';
import { observationsSchema } from './valuation.ts';
import { householdIdSchema } from './identity.ts';
import { financialDateSchema, financialMonthSchema } from './financial-date.ts';
import { currencyCodeSchema } from './currency.ts';
import type { Money } from './money.ts';
import type { FxRate } from './fx.ts';
import type { Account } from './account.ts';
import { safeErrorSchema } from './safe-error.ts';

export const reportingSnapshotSchema = reconciliationSnapshotSchema.unwrap().extend({
  observations: observationsSchema,
  size: z.number().int().min(0).max(323100),
}).refine(s => s.households.length <= 100 && s.members.length <= 1000 && s.accounts.length <= 1000 &&
  s.accounts.reduce((n,a) => n+a.sources.length,0) <= 10000 && s.history.length <= 100000 &&
  s.history.reduce((n,r) => n+r.transaction.allocations.length,0) <= 100000 && s.observations.length <= 100000 &&
  s.decisions.length <= 10000 && s.rates.length <= 10000 && s.references.length === 0 &&
  s.size === s.households.length+s.members.length+s.accounts.length+s.history.length+s.observations.length+s.decisions.length+s.rates.length,
  'Incomplete or oversized snapshot').readonly();
export const reportingResponseSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), snapshot: reportingSnapshotSchema }).readonly(),
  z.strictObject({ ok: z.literal(false), error: safeErrorSchema }).readonly(),
]);
export const reportingRequestSchema = z.strictObject({
  householdId: householdIdSchema, asOf: financialDateSchema, month: financialMonthSchema,
  currency: currencyCodeSchema,
}).readonly();
export type ReportingSnapshot = z.infer<typeof reportingSnapshotSchema>;
export type ReportingRequest = z.infer<typeof reportingRequestSchema>;
export type Coverage = 'COMPLETE' | 'PARTIAL' | 'UNKNOWN' | 'UNAVAILABLE';
export type ReportWarning = { readonly code: string; readonly accountId: string | null; readonly transactionId: string | null; readonly relationshipId: string | null };
export type ConvertedAmount = { readonly original: Money; readonly money: Money | null; readonly fx: FxRate | null; readonly reason: 'MISSING_FX' | 'AMBIGUOUS_FX' | null };
export type AccountPosition = {
  readonly account: Account; readonly coverage: Coverage; readonly reason: string | null;
  readonly measurementDate: string | null; readonly amount: ConvertedAmount | null;
};
export type PositionTotal = {
  readonly coverage: Coverage; readonly netWorth: Money | null; readonly availableSubtotal: Money | null;
  readonly assets: Money | null; readonly liabilities: Money | null; readonly included: number; readonly required: number;
};
