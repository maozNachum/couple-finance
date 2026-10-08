import { z } from 'zod';
import { allocationIdSchema, categoryIdSchema } from './identity.ts';
import { moneySchema } from './money.ts';
import { ownershipSchema } from './ownership.ts';

export const reportingEffectSchema = z.enum(['INCOME', 'EXPENSE', 'TRANSFER', 'INVESTMENT_TRADE', 'DEBT_PRINCIPAL', 'ADJUSTMENT', 'UNCLASSIFIED']);
export type ReportingEffect = z.infer<typeof reportingEffectSchema>;
export const allocationSchema = z.strictObject({
  id: allocationIdSchema,
  effect: reportingEffectSchema,
  categoryId: categoryIdSchema.optional(),
  ownership: ownershipSchema,
  // Same account-position sign and currency as the parent movement, including
  // positive expense refunds. No reporting sign is inferred from a category.
  money: moneySchema,
  costBehavior: z.enum(['FIXED', 'VARIABLE']).optional(),
  necessity: z.enum(['ESSENTIAL', 'DISCRETIONARY']).optional(),
  categorization: z.strictObject({
    origin: z.enum(['USER', 'RULE', 'SOURCE', 'UNCLASSIFIED']),
    userLocked: z.boolean(),
  }).readonly(),
}).readonly();
export type Allocation = z.infer<typeof allocationSchema>;
