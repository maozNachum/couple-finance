import { z } from 'zod';
import { householdIdSchema, memberIdSchema } from './identity.ts';
import { householdSchema, householdMemberSchema } from './household.ts';
import { ownershipSchema } from './ownership.ts';
import { moneySchema } from './money.ts';
import { financialDateSchema, utcTimestampSchema } from './financial-date.ts';
import { idempotencyKeySchema } from './ingestion.ts';
import { safeErrorSchema } from './safe-error.ts';
import { compare, decimal } from '../domain/money/decimal.ts';

const nonnegative = moneySchema.refine(m => compare(m.amount, decimal('0')) >= 0);
const fields = {
  id: z.uuid().length(36).toLowerCase(), householdId: householdIdSchema,
  ownership: ownershipSchema, name: z.string().trim().min(1).max(200).refine(n => [...n].length <= 100),
  target: moneySchema.refine(m => compare(m.amount, decimal('0')) > 0),
  declared: nonnegative, monthly: nonnegative.nullable(), targetDate: financialDateSchema.nullable(),
};
const currencyMatches = (g: {target:{currency:string};declared:{currency:string};monthly:{currency:string}|null}) =>
  g.target.currency === g.declared.currency && (!g.monthly || g.monthly.currency === g.target.currency);
export const goalCommandSchema = z.strictObject({ ...fields,
  action: z.enum(['CREATE','EDIT','ARCHIVE']), expectedVersion: z.number().int().min(0).max(2147483645),
  acknowledge: z.literal(true), idempotencyKey: idempotencyKeySchema,
}).refine(currencyMatches).refine(c => (c.action === 'CREATE') === (c.expectedVersion === 0)).readonly();
export const goalRevisionSchema = z.strictObject({ ...fields,
  version: z.number().int().min(1).max(2147483646), status: z.enum(['ACTIVE','ARCHIVED']),
  actorMemberId: memberIdSchema, recordedAt: utcTimestampSchema,
}).refine(currencyMatches).readonly();
export const goalsSnapshotSchema = z.strictObject({
  households: z.array(householdSchema).max(1000).readonly(),
  members: z.array(householdMemberSchema).max(10000).readonly(),
  revisions: z.array(goalRevisionSchema).max(10000).readonly(),
  size: z.number().int().min(0).max(21000),
}).refine(s => s.size === s.households.length+s.members.length+s.revisions.length).readonly();
export const goalsResponseSchema = z.discriminatedUnion('ok', [
  z.strictObject({ok:z.literal(true),snapshot:goalsSnapshotSchema}),
  z.strictObject({ok:z.literal(false),error:safeErrorSchema}),
]);
export type GoalCommand = z.infer<typeof goalCommandSchema>;
export type GoalRevision = z.infer<typeof goalRevisionSchema>;
export type GoalsSnapshot = z.infer<typeof goalsSnapshotSchema>;
