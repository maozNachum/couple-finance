import { z } from 'zod';
import { accountIdSchema, householdIdSchema } from './identity.ts';
import { ownershipSchema } from './ownership.ts';
import { currencyCodeSchema } from './currency.ts';

export const balancePolicySchema = z.enum(['LEDGER', 'OBSERVED']);
export const accountTypeSchema = z.enum(['BANK', 'CREDIT_CARD', 'CASH', 'SAVINGS', 'INVESTMENT', 'PENSION', 'PROVIDENT_FUND', 'DEPOSIT', 'LOAN', 'OTHER_ASSET', 'OTHER_LIABILITY']);
export const accountSchema = z.strictObject({
  id: accountIdSchema,
  householdId: householdIdSchema,
  name: z.string().trim().min(1).max(200),
  ownership: ownershipSchema,
  type: accountTypeSchema,
  currency: currencyCodeSchema,
  valuationCurrency: currencyCodeSchema,
  balancePolicy: balancePolicySchema,
  status: z.enum(['ACTIVE', 'ARCHIVED']),
}).readonly();
export type Account = z.infer<typeof accountSchema>;
export type AccountType = z.infer<typeof accountTypeSchema>;
export type BalancePolicy = z.infer<typeof balancePolicySchema>;
