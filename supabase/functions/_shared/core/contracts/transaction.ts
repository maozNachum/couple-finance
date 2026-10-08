import { z } from 'zod';
import { transactionIdSchema, householdIdSchema, accountIdSchema, merchantIdSchema } from './identity.ts';
import { financialDateSchema } from './financial-date.ts';
import { moneySchema } from './money.ts';
import { allocationSchema } from './allocation.ts';
import { transactionProvenanceSchema } from './ingestion.ts';
import { compare, sumDecimals } from '../domain/money/decimal.ts';

export const transactionStatusSchema = z.enum(['PENDING', 'POSTED', 'VOIDED']);
export const transactionSchema = z.strictObject({
  id: transactionIdSchema,
  householdId: householdIdSchema,
  accountId: accountIdSchema,
  transactionDate: financialDateSchema,
  valueDate: financialDateSchema.optional(),
  money: moneySchema,
  description: z.string().trim().min(1).max(2000),
  merchant: z.strictObject({ id: merchantIdSchema.optional(), name: z.string().trim().min(1).max(200) }).readonly().optional(),
  status: transactionStatusSchema,
  provenance: z.array(transactionProvenanceSchema).min(1).max(100).readonly(),
  // An uncategorized movement has one full-amount UNCLASSIFIED allocation.
  allocations: z.array(allocationSchema).min(1).max(1000).readonly(),
}).superRefine((transaction, ctx) => {
  if (new Set(transaction.allocations.map((value) => value.id)).size !== transaction.allocations.length) {
    ctx.addIssue({ code: 'custom', path: ['allocations'], message: 'Allocation IDs must be unique' });
  }
  if (transaction.allocations.some((value) => value.money.currency !== transaction.money.currency)) {
    ctx.addIssue({ code: 'custom', path: ['allocations'], message: 'Allocation currencies must match the parent' });
    return;
  }
  try {
    const total = sumDecimals(transaction.allocations.map((value) => value.money.amount));
    if (compare(total, transaction.money.amount) === 0) return;
  } catch {
    // Convert bounded arithmetic failure to a validation issue, never raw input.
  }
  ctx.addIssue({ code: 'custom', path: ['allocations'], message: 'Allocation amounts must sum exactly to the parent' });
}).readonly();
export type Transaction = z.infer<typeof transactionSchema>;
export type TransactionStatus = z.infer<typeof transactionStatusSchema>;
