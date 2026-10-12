import { z } from 'zod';
import { formatSchema, mappingSchema, previewSchema } from './import-preview.ts';
import { reportingEffectSchema } from './allocation.ts';
import { idempotencyKeySchema } from './ingestion.ts';

export const importBatchLimit = 100;
export const importHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const importDecisionSchema = z.strictObject({
 row: z.number().int().min(2).max(2001), include: z.boolean(),
 effect: reportingEffectSchema, status: z.enum(['POSTED','PENDING']), acknowledge: z.boolean(),
}).readonly();
export const importCommitCommandSchema = z.strictObject({
 action: z.literal('COMMIT'), reviewId: z.uuid(), idempotencyKey: idempotencyKeySchema,
 decisions: z.array(importDecisionSchema).max(2000).readonly(),
}).refine(v=>new Set(v.decisions.map(d=>d.row)).size===v.decisions.length && v.decisions.filter(d=>d.include).length>0 && v.decisions.filter(d=>d.include).length<=importBatchLimit).readonly();
export const importReviewRequestSchema = z.strictObject({action:z.literal('REVIEW'),id:z.uuid(),format:formatSchema,mapping:mappingSchema}).readonly();
export const importRequestSchema = z.union([importReviewRequestSchema,importCommitCommandSchema]);
export const duplicateReasonSchema = z.enum(['PRIOR_IMPORT','INTERPRETATION_CHANGED','SAME_REFERENCE','SAME_FINANCIAL_VALUES','SAME_DATE_AMOUNT','REPEATED_IN_FILE']);
export const duplicateRowSchema = z.strictObject({row:z.number().int().min(2).max(2001),exact:z.boolean(),reasons:z.array(duplicateReasonSchema).max(6).readonly(),candidates:z.array(z.uuid()).max(10).readonly(),candidateCount:z.number().int().nonnegative()}).readonly();
export const importReviewSchema = z.strictObject({
 id:z.uuid(),householdId:z.uuid(),accountId:z.uuid(),sourceId:z.uuid(),uploadId:z.uuid(),
 contentHash:importHashSchema,previewHash:importHashSchema,adapter:z.literal('generic-csv-v1'),
 preview:previewSchema,duplicates:z.array(duplicateRowSchema).max(2000).readonly(),
}).readonly();
export const importResultSchema = z.strictObject({
 reviewId:z.uuid(),householdId:z.uuid(),accountId:z.uuid(),sourceId:z.uuid(),contentHash:importHashSchema,
 committed:z.number().int().min(1).max(importBatchLimit),skipped:z.number().int().min(0).max(2000),
 invalid:z.number().int().min(0).max(2000),unresolved:z.number().int().min(0).max(2000),
 transactions:z.array(z.strictObject({row:z.number().int().min(2).max(2001),transactionId:z.uuid(),revisionId:z.uuid(),ingestionItemId:z.uuid()}).readonly()).min(1).max(importBatchLimit).readonly(),
}).refine(r=>r.transactions.length===r.committed).readonly();
export type ImportReview = z.infer<typeof importReviewSchema>;
export type ImportCommitCommand = z.infer<typeof importCommitCommandSchema>;
export type ImportResult = z.infer<typeof importResultSchema>;
