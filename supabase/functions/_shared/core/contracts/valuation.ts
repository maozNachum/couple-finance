import { z } from 'zod';
import { accountSchema } from './account.ts';
import { accountIdSchema, householdIdSchema, sourceIdSchema } from './identity.ts';
import { financialDateSchema, utcTimestampSchema } from './financial-date.ts';
import { moneySchema } from './money.ts';
import { fxRateSchema } from './fx.ts';

export const observationIdSchema = z.uuid().length(36).toLowerCase().brand<'ObservationId'>();
export const accountRecordSchema = z.strictObject({
  account: accountSchema,
  version: z.number().int().positive().max(2147483647),
  manualSourceId: sourceIdSchema,
}).readonly();
export const createAccountSchema = accountRecordSchema.refine((v) => String(v.account.id) !== String(v.manualSourceId) && v.version === 1 && v.account.status === 'ACTIVE' && (v.account.type !== 'CASH' || v.account.balancePolicy === 'LEDGER'));
export const updateAccountSchema = z.strictObject({
  householdId: householdIdSchema, accountId: accountIdSchema,
  expectedVersion: z.number().int().positive().max(2147483646),
  name: z.string().trim().min(1).max(200), status: z.enum(['ACTIVE', 'ARCHIVED']),
}).readonly();
const observationFields = {
  id: observationIdSchema, householdId: householdIdSchema, accountId: accountIdSchema,
  sourceId: sourceIdSchema, date: financialDateSchema, money: moneySchema,
  coverage: z.enum(['COMPLETE', 'PARTIAL']),
  supersedesId: observationIdSchema.nullable(),
  note: z.string().trim().max(500),
  fx: fxRateSchema.nullable(),
};
export const observationInputSchema = z.strictObject(observationFields).refine((v) => v.supersedesId === null || (v.supersedesId !== v.id && v.note.length > 0), 'Corrections require a reason and a previous observation').readonly();
export const observationSchema = z.strictObject({
  ...observationFields, recordedAt: utcTimestampSchema,
}).refine((v) => v.supersedesId === null || (v.supersedesId !== v.id && v.note.length > 0), 'Corrections require a reason and a previous observation').readonly();
export const accountRecordsSchema = z.array(accountRecordSchema).readonly();
export const observationsSchema = z.array(observationSchema).readonly();
export type AccountRecord = z.infer<typeof accountRecordSchema>;
export type Observation = z.infer<typeof observationSchema>;
export type ObservationInput = z.infer<typeof observationInputSchema>;
