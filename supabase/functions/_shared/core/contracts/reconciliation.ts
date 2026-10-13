import { z } from 'zod';
import { accountIdSchema, transactionIdSchema, householdIdSchema, allocationIdSchema, memberIdSchema } from './identity.ts';
import { revisionIdSchema, transactionRevisionSchema, transactionRevisionsSchema } from './ledger.ts';
import { accountRecordsSchema } from './valuation.ts';
import { householdListSchema, householdMemberListSchema } from './household.ts';
import { idempotencyKeySchema } from './ingestion.ts';
import { fxRateSchema } from './fx.ts';
import { utcTimestampSchema } from './financial-date.ts';
import { decimalStringSchema } from '../domain/money/decimal.ts';

export const reconciliationKindSchema = z.enum(['TRANSFER', 'CARD', 'LOAN']);
export const reconciliationMeaningSchema = z.enum(['TRANSFER', 'PURCHASE', 'PRINCIPAL', 'INTEREST', 'FEE']);
export const reconciliationParticipantSchema = z.strictObject({
  accountId: accountIdSchema, accountVersion: z.number().int().positive().max(2147483647),
  transactionId: transactionIdSchema, revisionId: revisionIdSchema, expectedVersion: z.number().int().positive().max(2147483647),
  role: z.enum(['PAYMENT', 'COUNTERPART', 'PURCHASE']),
  parts: z.array(z.strictObject({ allocationId: allocationIdSchema, meaning: reconciliationMeaningSchema }).readonly()).min(1).max(1000).readonly(),
}).refine(v => new Set(v.parts.map(p => p.allocationId)).size === v.parts.length).readonly();
export const reconciliationCommandSchema = z.strictObject({
  householdId: householdIdSchema, id: z.uuid().length(36).toLowerCase(),
  expectedVersion: z.number().int().min(0).max(2147483646), idempotencyKey: idempotencyKeySchema,
  action: z.enum(['LINK', 'REPLACE', 'UNLINK']), kind: reconciliationKindSchema,
  participants: z.array(reconciliationParticipantSchema).max(100).readonly(),
  fxRateId: z.uuid().length(36).toLowerCase().nullable(), reason: z.string().trim().min(1).max(500),
  acknowledge: z.literal(true),
}).refine(v => (v.action === 'LINK') === (v.expectedVersion === 0))
  .refine(v => v.action === 'UNLINK' ? v.participants.length === 0 && v.fxRateId === null : v.participants.length >= 1)
  .refine(v => new Set(v.participants.map(p => p.transactionId)).size === v.participants.length)
  .refine(v => v.participants.reduce((n,p) => n+p.parts.length,0) <= 1000).readonly();
export type ReconciliationCommand = z.infer<typeof reconciliationCommandSchema>;
export type ReconciliationParticipant = z.infer<typeof reconciliationParticipantSchema>;
export type ReconciliationKind = z.infer<typeof reconciliationKindSchema>;
export type ReconciliationMeaning = z.infer<typeof reconciliationMeaningSchema>;
export const reconciliationDecisionSchema = z.strictObject({
  householdId: householdIdSchema, id: z.uuid(), version: z.number().int().positive(),
  action: z.enum(['LINK','REPLACE','UNLINK']), kind: reconciliationKindSchema,
  reason: z.string().min(1).max(500), actorMemberId: memberIdSchema, recordedAt: utcTimestampSchema,
  participants: z.array(z.strictObject({ selection: reconciliationParticipantSchema, revision: transactionRevisionSchema,
    // Immutable accepted-row provenance snapshot, never raw CSV. Text is inert.
    sourceReference: z.string().nullable(), importItemId: z.uuid().nullable(), contentHash: z.string().nullable(),
  }).readonly()).max(100).readonly(), fx: fxRateSchema.nullable(),
  state: z.enum(['EXACT','PARTIAL','NEEDS_CORRECTION']), difference: decimalStringSchema.nullable(), purchaseDifference:decimalStringSchema.nullable(),
}).readonly();
export type ReconciliationDecision = z.infer<typeof reconciliationDecisionSchema>;
export const reconciliationSnapshotSchema = z.strictObject({
  households: householdListSchema, members: householdMemberListSchema, accounts: accountRecordsSchema,
  history: transactionRevisionsSchema, decisions: z.array(reconciliationDecisionSchema).readonly(),
  rates: z.array(z.strictObject({ householdId: householdIdSchema, rate: fxRateSchema }).readonly()).readonly(),
  references: z.array(z.strictObject({householdId: householdIdSchema, transactionId: transactionIdSchema, reference:z.string().nullable()}).readonly()).readonly(),
}).readonly();
export type ReconciliationSnapshot = z.infer<typeof reconciliationSnapshotSchema>;
