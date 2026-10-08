import { z } from 'zod';

const uuidSchema = z.uuid().length(36).toLowerCase();
export const accountIdSchema = uuidSchema.brand<'AccountId'>();
export const householdIdSchema = uuidSchema.brand<'HouseholdId'>();
export const memberIdSchema = uuidSchema.brand<'MemberId'>();
export const transactionIdSchema = uuidSchema.brand<'TransactionId'>();
export const allocationIdSchema = uuidSchema.brand<'AllocationId'>();
export const categoryIdSchema = uuidSchema.brand<'CategoryId'>();
export const merchantIdSchema = uuidSchema.brand<'MerchantId'>();
export const sourceIdSchema = uuidSchema.brand<'SourceId'>();
export const ingestionItemIdSchema = uuidSchema.brand<'IngestionItemId'>();
export const fxRateIdSchema = uuidSchema.brand<'FxRateId'>();
export const requestIdSchema = uuidSchema.brand<'RequestId'>();
export type AccountId = z.infer<typeof accountIdSchema>;
export type HouseholdId = z.infer<typeof householdIdSchema>;
export type MemberId = z.infer<typeof memberIdSchema>;
export type SourceId = z.infer<typeof sourceIdSchema>;
export type TransactionId = z.infer<typeof transactionIdSchema>;
