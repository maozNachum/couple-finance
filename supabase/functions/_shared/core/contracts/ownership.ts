import { z } from 'zod';
import { memberIdSchema } from './identity.ts';

export const ownershipSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('HOUSEHOLD') }),
  z.strictObject({ kind: z.literal('MEMBER'), memberId: memberIdSchema }),
]).readonly();
export type Ownership = z.infer<typeof ownershipSchema>;
