import { z } from 'zod';
import { householdIdSchema, memberIdSchema, userIdSchema } from './identity.ts';
import { utcTimestampSchema } from './financial-date.ts';

export const householdSchema = z.strictObject({
  id: householdIdSchema, name: z.string().min(1).max(100), createdAt: utcTimestampSchema,
}).readonly();
export const householdListSchema = z.array(householdSchema).readonly();
export type Household = z.infer<typeof householdSchema>;
export const householdMemberSchema = z.strictObject({
  id: memberIdSchema, householdId: householdIdSchema,
  userId: userIdSchema, status: z.enum(['ACTIVE', 'REVOKED']),
}).readonly();
export const householdMemberListSchema = z.array(householdMemberSchema).readonly();
export type HouseholdMember = z.infer<typeof householdMemberSchema>;
