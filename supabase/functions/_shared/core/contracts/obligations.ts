import { z } from 'zod';
import { householdIdSchema, accountIdSchema, transactionIdSchema, allocationIdSchema, memberIdSchema } from './identity.ts';
import { revisionIdSchema } from './ledger.ts';
import { ownershipSchema } from './ownership.ts';
import { moneySchema } from './money.ts';
import { financialDateSchema, utcTimestampSchema } from './financial-date.ts';
import { idempotencyKeySchema } from './ingestion.ts';
import { reportingSnapshotSchema } from './reporting.ts';
import { safeErrorSchema } from './safe-error.ts';
import { compare, decimal } from '../domain/money/decimal.ts';

const id = z.uuid().length(36).toLowerCase();
const version = z.number().int().min(1).max(2147483646);
export const obligationEvidenceSchema = z.strictObject({
  accountId: accountIdSchema, accountVersion: version, transactionId: transactionIdSchema,
  revisionId: revisionIdSchema, transactionVersion: version, allocationId: allocationIdSchema,
}).readonly();
export const recurrenceSchema = z.strictObject({ frequency: z.literal('MONTHLY'), day: z.number().int().min(1).max(31) }).readonly();
export const obligationPlanSchema = z.strictObject({
  name: z.string().trim().min(1).max(120), accountId: accountIdSchema, ownership: ownershipSchema,
  money: moneySchema.refine(m => compare(m.amount, decimal('0')) > 0), effect: z.literal('EXPENSE'),
  schedule: recurrenceSchema, startDate: financialDateSchema, endDate: financialDateSchema.nullable(),
}).refine(p => p.endDate === null || p.endDate >= p.startDate).readonly();
const origin = z.array(obligationEvidenceSchema).max(100).refine(e => new Set(e.map(v => v.transactionId)).size === e.length).readonly();
const common = {
  householdId: householdIdSchema, id, expectedVersion: z.number().int().min(0).max(2147483645),
  idempotencyKey: idempotencyKeySchema, acknowledge: z.literal(true),
};
export const obligationCommandSchema = z.strictObject({
  ...common, action: z.enum(['CONFIRM','EDIT','ARCHIVE','CANCEL']), plan: obligationPlanSchema,
  effectiveFrom: financialDateSchema, origin,
}).refine(c => (c.action === 'CONFIRM') === (c.expectedVersion === 0))
  .refine(c => c.origin.length === 0 || c.origin.length >= 3)
  .refine(c => c.action !== 'CONFIRM' || c.effectiveFrom === c.plan.startDate)
  .refine(c => c.effectiveFrom >= c.plan.startDate)
  .refine(c => new Set(c.origin.map(e => e.transactionId)).size === c.origin.length).readonly();
export const obligationRevisionSchema = z.strictObject({
  householdId: householdIdSchema, id, version, plan: obligationPlanSchema, effectiveFrom: financialDateSchema,
  origin, status: z.enum(['ACTIVE','ARCHIVED','CANCELLED']), actorMemberId: memberIdSchema, recordedAt: utcTimestampSchema,
}).refine(v => v.origin.length === 0 || v.origin.length >= 3).readonly();
export const paymentCommandSchema = z.strictObject({
  ...common, action: z.enum(['LINK','UNLINK']), obligationId: id, obligationVersion: version,
  expectedObligationVersion: version, date: financialDateSchema, evidence: obligationEvidenceSchema.nullable(),
}).refine(c => (c.action === 'LINK') === (c.evidence !== null))
  .refine(c => c.action !== 'UNLINK' || c.expectedVersion > 0).readonly();
export const paymentDecisionSchema = z.strictObject({
  householdId: householdIdSchema, id, version, obligationId: id, obligationVersion: version, date: financialDateSchema,
  action: z.enum(['LINK','UNLINK']), evidence: obligationEvidenceSchema.nullable(), actual: moneySchema.nullable(),
  state: z.enum(['ASSOCIATED','PARTIAL','AMBIGUOUS','UNLINKED']), actorMemberId: memberIdSchema, recordedAt: utcTimestampSchema,
}).refine(d => d.action === 'UNLINK' ? d.evidence === null && d.actual === null && d.state === 'UNLINKED' : d.evidence !== null && d.actual !== null && d.state !== 'UNLINKED').readonly();
export const rejectionCommandSchema = z.strictObject({
  ...common, action: z.literal('REJECT'), evidence: origin,
}).refine(c => c.expectedVersion === 0 && c.evidence.length >= 3 && new Set(c.evidence.map(e => e.transactionId)).size === c.evidence.length).readonly();
export const rejectionSchema = z.strictObject({
  householdId: householdIdSchema, id, evidence: origin, actorMemberId: memberIdSchema, recordedAt: utcTimestampSchema,
}).readonly();
export const obligationsSnapshotSchema = z.strictObject({
  reporting: reportingSnapshotSchema, revisions: z.array(obligationRevisionSchema).max(10000).readonly(),
  payments: z.array(paymentDecisionSchema).max(10000).readonly(), rejections: z.array(rejectionSchema).max(10000).readonly(),
  size: z.number().int().min(0).max(10000),
}).refine(s => s.size === s.revisions.length + s.payments.length + s.rejections.length).readonly();
export const obligationsResponseSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), snapshot: obligationsSnapshotSchema }),
  z.strictObject({ ok: z.literal(false), error: safeErrorSchema }),
]);
export type ObligationEvidence = z.infer<typeof obligationEvidenceSchema>;
export type ObligationPlan = z.infer<typeof obligationPlanSchema>;
export type ObligationCommand = z.infer<typeof obligationCommandSchema>;
export type ObligationRevision = z.infer<typeof obligationRevisionSchema>;
export type PaymentCommand = z.infer<typeof paymentCommandSchema>;
export type PaymentDecision = z.infer<typeof paymentDecisionSchema>;
export type RejectionCommand = z.infer<typeof rejectionCommandSchema>;
export type ObligationsSnapshot = z.infer<typeof obligationsSnapshotSchema>;
export type PlanningCommand = ObligationCommand | PaymentCommand | RejectionCommand;
