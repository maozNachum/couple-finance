import { z } from 'zod';
import { transactionSchema } from './transaction.ts';
import { utcTimestampSchema } from './financial-date.ts';
import { idempotencyKeySchema } from './ingestion.ts';

export const revisionIdSchema = z.uuid().length(36).toLowerCase().brand<'RevisionId'>();
const fields = {
  transaction: transactionSchema,
  revisionId: revisionIdSchema,
  supersedesRevisionId: revisionIdSchema.nullable(),
  entryKind: z.enum(['MOVEMENT', 'OPENING']),
  openingCoverage: z.enum(['COMPLETE', 'PARTIAL']).nullable(),
  reason: z.string().trim().max(500),
};
function validManual(v: { transaction: z.infer<typeof transactionSchema>; entryKind: string; openingCoverage: string | null; supersedesRevisionId: string | null; revisionId: string; reason: string }) {
  const t = v.transaction;
  return t.merchant === undefined && t.provenance.length === 1 &&
    t.provenance.every((p) => p.source.kind === 'MANUAL' && p.externalTransactionId === undefined && p.ingestionItemId === undefined) &&
    t.allocations.every((a) => a.categoryId === undefined && ['USER', 'UNCLASSIFIED'].includes(a.categorization.origin)) &&
    (v.entryKind === 'OPENING' ? v.openingCoverage !== null && t.status !== 'PENDING' && t.allocations.every((a) => a.effect === 'ADJUSTMENT') : v.openingCoverage === null) &&
    (v.supersedesRevisionId === null || (v.supersedesRevisionId !== v.revisionId && v.reason.length > 0));
}
export const manualTransactionCommandSchema = z.strictObject({
  ...fields, idempotencyKey: idempotencyKeySchema,
  expectedVersion: z.number().int().min(0).max(2147483646),
}).refine(validManual).refine((v) => (v.expectedVersion === 0) === (v.supersedesRevisionId === null)).readonly();
export const transactionRevisionSchema = z.strictObject({
  ...fields, version: z.number().int().positive().max(2147483647),
  createdAt: utcTimestampSchema, recordedAt: utcTimestampSchema,
}).refine(validManual).refine((v) => (v.version === 1) === (v.supersedesRevisionId === null)).readonly();
export const transactionRevisionsSchema = z.array(transactionRevisionSchema).readonly();
export type ManualTransactionCommand = z.infer<typeof manualTransactionCommandSchema>;
export type TransactionRevision = z.infer<typeof transactionRevisionSchema>;
