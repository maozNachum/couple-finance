import { z } from 'zod';
import { obligationsSnapshotSchema } from './obligations.ts';
import { budgetRevisionSchema } from './budgets.ts';
import { categorySchema } from './categorization.ts';
import { reportingRequestSchema } from './reporting.ts';
import type { Coverage } from './reporting.ts';
import { forecastRequestSchema } from './forecast.ts';
import { utcTimestampSchema } from './financial-date.ts';
import { safeErrorSchema } from './safe-error.ts';

export const dataQualitySnapshotSchema = z.strictObject({
  version:z.literal(1), capturedAt:utcTimestampSchema, obligations:obligationsSnapshotSchema,
  categories:z.array(categorySchema).max(10000).readonly(), budgets:z.array(budgetRevisionSchema).max(10000).readonly(),
  size:z.number().int().min(0).max(20000),
}).refine(s => s.size === s.categories.length+s.budgets.length).readonly();
export const dataQualityResponseSchema = z.discriminatedUnion('ok',[
  z.strictObject({ok:z.literal(true),snapshot:dataQualitySnapshotSchema}),
  z.strictObject({ok:z.literal(false),error:safeErrorSchema}),
]);
export const dataQualityRequestSchema = z.strictObject({
  reporting:reportingRequestSchema, forecast:forecastRequestSchema.nullable(),
}).refine(r => r.forecast === null || r.forecast.householdId === r.reporting.householdId &&
  r.forecast.start === r.reporting.asOf && r.forecast.buffer.currency === r.reporting.currency).readonly();
export type DataQualitySnapshot = z.infer<typeof dataQualitySnapshotSchema>;
export type DataQualityRequest = z.infer<typeof dataQualityRequestSchema>;
export type QualityModule = 'BALANCE' | 'NET_WORTH' | 'MONTHLY' | 'BUDGET' | 'OBLIGATIONS' | 'RECONCILIATION' | 'FORECAST';
export type QualityAction = 'ACCOUNTS' | 'TRANSACTIONS' | 'CATEGORIES' | 'RECONCILIATION' | 'OBLIGATIONS' | 'FORECAST' | 'BUDGETS';
export type QualityType = 'BALANCE_EVIDENCE' | 'HISTORICAL_FX' | 'UNCLASSIFIED_EFFECT' | 'RECONCILIATION_EVIDENCE' | 'CATEGORY_SCOPE' | 'PAYMENT_EVIDENCE' | 'CALCULATION_LIMITATION';
export type QualityEvidence = {
  readonly kind:'ACCOUNT' | 'SOURCE' | 'REVISION' | 'OBSERVATION' | 'RECONCILIATION' | 'OBLIGATION' | 'PAYMENT' | 'FX';
  readonly id:string; readonly version:number | null; readonly sourceId:string | null;
  readonly measuredOn:string | null; readonly recordedAt:string | null; readonly currency:string | null;
  readonly authorityFrom?:string | null;
};
export type QualityImpact = {readonly module:QualityModule; readonly resultId:string; readonly state:Coverage};
export type QualityFinding = {
  readonly id:string; readonly type:QualityType; readonly householdId:string;
  readonly subject:{readonly kind:'ACCOUNT' | 'TRANSACTION' | 'RELATIONSHIP' | 'OCCURRENCE' | 'FX_PAIR' | 'HOUSEHOLD';readonly id:string};
  readonly reasons:readonly string[]; readonly explanation:string; readonly state:Coverage;
  readonly evidence:readonly QualityEvidence[]; readonly impacts:readonly QualityImpact[];
  readonly action:QualityAction | null; readonly limitation:string | null; readonly observationAgeDays:number | null;
};
export type DataQualityResult = {
  readonly version:1; readonly householdId:string; readonly capturedAt:string; readonly request:DataQualityRequest;
  readonly externalCoverage:'UNKNOWN'; readonly findings:readonly QualityFinding[];
  readonly calculations:readonly {readonly module:QualityModule;readonly state:Coverage | 'NOT_EVALUATED' | 'NO_PLAN'}[];
};
