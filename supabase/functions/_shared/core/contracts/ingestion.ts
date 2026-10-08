import { z } from 'zod';
import { sourceIdSchema, householdIdSchema, accountIdSchema, ingestionItemIdSchema } from './identity.ts';

export const sourceIdentitySchema = z.strictObject({
  sourceId: sourceIdSchema,
  kind: z.enum(['MANUAL', 'FILE_IMPORT', 'LIVE_SYNC']),
}).readonly();
export type SourceIdentity = z.infer<typeof sourceIdentitySchema>;
export const externalTransactionIdSchema = z.string().min(1).max(512)
  .refine((value) => value.trim().length > 0 && [...value].every((character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127))
  .brand<'ExternalTransactionId'>();
export const fingerprintSchema = z.strictObject({
  algorithm: z.literal('SHA256'),
  version: z.number().int().min(1),
  digest: z.string().length(64).regex(/^[a-f0-9]{64}$/).brand<'CandidateFingerprint'>(),
}).readonly();
export const idempotencyKeySchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/)
  .refine((value) => value.trim() === value).brand<'IdempotencyKey'>();

/** External IDs are scoped to source/account. Fingerprints are candidates only. */
export const ingestionIdentitySchema = z.strictObject({
  householdId: householdIdSchema,
  accountId: accountIdSchema,
  source: sourceIdentitySchema,
  externalTransactionId: externalTransactionIdSchema.optional(),
  fingerprint: fingerprintSchema.optional(),
  idempotencyKey: idempotencyKeySchema,
}).readonly();
export type IngestionIdentity = z.infer<typeof ingestionIdentitySchema>;

/** Stable normalized provenance, never a provider payload. */
export const transactionProvenanceSchema = z.strictObject({
  source: sourceIdentitySchema,
  externalTransactionId: externalTransactionIdSchema.optional(),
  ingestionItemId: ingestionItemIdSchema.optional(),
}).readonly();
