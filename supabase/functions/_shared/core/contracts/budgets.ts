import { z } from 'zod';
import { householdIdSchema, memberIdSchema, categoryIdSchema } from './identity.ts';
import { financialMonthSchema, utcTimestampSchema } from './financial-date.ts';
import { moneySchema } from './money.ts';
import { categorySchema } from './categorization.ts';
import { reportingSnapshotSchema } from './reporting.ts';
import { idempotencyKeySchema } from './ingestion.ts';
import { safeErrorSchema } from './safe-error.ts';
import { compare, decimal } from '../domain/money/decimal.ts';

export const budgetIdSchema = z.uuid().length(36).toLowerCase().brand<'BudgetId'>();
export const budgetScopeSchema = z.strictObject({
  kind: z.enum(['TOTAL','ALL','SHARED','MEMBER']), memberId: memberIdSchema.nullable(), categoryId: categoryIdSchema.nullable(),
}).refine(s => (s.kind === 'MEMBER') === (s.memberId !== null) &&
  (s.kind !== 'TOTAL' || s.categoryId === null) && (s.kind !== 'ALL' || s.categoryId !== null)).readonly();
const planned = moneySchema.refine(m => compare(m.amount,decimal('0')) >= 0);
const fields = { id:budgetIdSchema, householdId:householdIdSchema, month:financialMonthSchema, scope:budgetScopeSchema, planned };
export const budgetCommandSchema = z.strictObject({
  ...fields, action:z.enum(['CREATE','EDIT','ARCHIVE']), expectedVersion:z.number().int().min(0).max(2147483645), idempotencyKey:idempotencyKeySchema,
}).refine(c => (c.action === 'CREATE') === (c.expectedVersion === 0)).readonly();
export const budgetRevisionSchema = z.strictObject({
  ...fields, version:z.number().int().min(1).max(2147483646), status:z.enum(['ACTIVE','ARCHIVED']),
  actorMemberId:memberIdSchema, recordedAt:utcTimestampSchema, category:categorySchema.nullable(),
}).refine(r => r.scope.categoryId === null ? r.category === null : r.category?.id === r.scope.categoryId &&
  r.category.householdId === r.householdId && r.category.kind === 'EXPENSE').readonly();
export const budgetSnapshotSchema = z.strictObject({
  reporting:reportingSnapshotSchema, categories:z.array(categorySchema).max(10000).readonly(),
  revisions:z.array(budgetRevisionSchema).max(10000).readonly(), size:z.number().int().min(0).max(20000),
}).refine(s => s.size === s.categories.length+s.revisions.length).readonly();
export const budgetResponseSchema = z.discriminatedUnion('ok',[
  z.strictObject({ok:z.literal(true),snapshot:budgetSnapshotSchema}),
  z.strictObject({ok:z.literal(false),error:safeErrorSchema}),
]);
export type BudgetScope = z.infer<typeof budgetScopeSchema>;
export type BudgetCommand = z.infer<typeof budgetCommandSchema>;
export type BudgetRevision = z.infer<typeof budgetRevisionSchema>;
export type BudgetSnapshot = z.infer<typeof budgetSnapshotSchema>;
