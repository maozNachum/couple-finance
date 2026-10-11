import { z } from 'zod';
import { householdIdSchema, categoryIdSchema, allocationIdSchema, accountIdSchema, transactionIdSchema } from './identity.ts';
import { revisionIdSchema } from './ledger.ts';
import { idempotencyKeySchema } from './ingestion.ts';

const version = z.number().int().min(1).max(2147483646);
export const ruleIdSchema = z.uuid().length(36).toLowerCase().brand<'RuleId'>();
export const categorySchema = z.strictObject({
  id: categoryIdSchema, householdId: householdIdSchema, version,
  name: z.string().trim().min(1).max(100), kind: z.enum(['EXPENSE', 'INCOME']), status: z.enum(['ACTIVE', 'ARCHIVED']),
}).readonly();
export const ruleSchema = z.strictObject({
  id: ruleIdSchema, householdId: householdIdSchema, version,
  name: z.string().trim().min(1).max(100), categoryId: categoryIdSchema,
  effect: z.enum(['EXPENSE', 'INCOME']), operator: z.enum(['CONTAINS', 'EQUALS']),
  pattern: z.string().min(1).max(200).refine((v) => /[^ \t\r\n]/.test(v)),
  priority: z.number().int().min(0).max(1000000), status: z.enum(['ACTIVE', 'DISABLED', 'ARCHIVED']), normalization: z.literal(1),
}).readonly();
export const catalogSchema = z.strictObject({
  householdId: householdIdSchema, generation: z.number().int().min(0).max(2147483646),
  categories: z.array(categorySchema).readonly(), rules: z.array(ruleSchema).readonly(),
}).refine((v) => [...v.categories, ...v.rules].every((r) => r.householdId === v.householdId) &&
  new Set(v.categories.map((r) => r.id)).size === v.categories.length && new Set(v.rules.map((r) => r.id)).size === v.rules.length).readonly();
export const definitionCommandSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('CATEGORY'), record: categorySchema, idempotencyKey: idempotencyKeySchema }),
  z.strictObject({ kind: z.literal('RULE'), record: ruleSchema, idempotencyKey: idempotencyKeySchema }),
]).readonly();
export const categorizeCommandSchema = z.strictObject({
  householdId: householdIdSchema, accountId: accountIdSchema, transactionId: transactionIdSchema, allocationId: allocationIdSchema,
  expectedVersion: version, supersedesRevisionId: revisionIdSchema, revisionId: revisionIdSchema,
  generation: z.number().int().min(0).max(2147483646), idempotencyKey: idempotencyKeySchema,
  action: z.enum(['ASSIGN', 'RULE', 'CLEAR', 'UNLOCK']), categoryId: categoryIdSchema.nullable(), ruleId: ruleIdSchema.nullable(),
}).refine((v) => v.revisionId !== v.supersedesRevisionId &&
  (v.action === 'RULE' ? v.categoryId !== null && v.ruleId !== null : v.action === 'ASSIGN' ? v.categoryId !== null && v.ruleId === null : v.categoryId === null && v.ruleId === null)).readonly();
export type Category = z.infer<typeof categorySchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type Catalog = z.infer<typeof catalogSchema>;
export type CategorizeCommand = z.infer<typeof categorizeCommandSchema>;
export const categorizationSnapshotSchema = z.strictObject({
  catalogs: z.array(catalogSchema).readonly(), categoryHistory: z.array(categorySchema).readonly(), ruleHistory: z.array(ruleSchema).readonly(),
  decisions: z.array(z.strictObject({ revisionId: revisionIdSchema, evidence: z.strictObject({
    action: z.enum(['RULE', 'ASSIGN', 'CLEAR', 'UNLOCK']), generation: z.number().int().nonnegative(), normalization: z.literal(1),
    category: categorySchema.nullable(), rule: ruleSchema.nullable(), matches: z.array(ruleSchema).readonly(),
    previousCategorization: z.strictObject({ origin: z.enum(['USER', 'RULE', 'SOURCE', 'UNCLASSIFIED']), userLocked: z.boolean() }).readonly(),
    previousCategoryId: categoryIdSchema.nullable(),
  }).readonly() }).readonly()).readonly(),
}).readonly();
