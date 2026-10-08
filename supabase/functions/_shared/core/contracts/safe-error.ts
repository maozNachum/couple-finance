import { z } from 'zod';
import { requestIdSchema } from './identity.ts';

const fieldErrorSchema = z.strictObject({
  field: z.enum(['amount', 'currency', 'date', 'ownership', 'memberId', 'accountId', 'allocations', 'identity']),
  code: z.enum(['REQUIRED', 'INVALID', 'MISMATCH']),
  safeMessage: z.enum(['Required value.', 'Invalid value.', 'Values do not match.']),
}).readonly();
const contextSchema = z.strictObject({ requestId: requestIdSchema.optional(), correlationId: requestIdSchema.optional() });
const validationErrorSchema = contextSchema.extend({
  code: z.literal('INVALID_INPUT'), kind: z.literal('VALIDATION'),
  safeMessage: z.literal('Some values are invalid.'), retryable: z.literal(false),
  fieldErrors: z.array(fieldErrorSchema).max(100).readonly().optional(),
});
export const safeErrorSchema = z.discriminatedUnion('code', [
  validationErrorSchema,
  contextSchema.extend({ code: z.literal('NOT_AUTHORIZED'), kind: z.literal('AUTHORIZATION'), safeMessage: z.literal('This action is not permitted.'), retryable: z.literal(false) }),
  contextSchema.extend({ code: z.literal('CONFLICT'), kind: z.literal('CONFLICT'), safeMessage: z.literal('The data has changed. Please reload.'), retryable: z.literal(false) }),
  contextSchema.extend({ code: z.literal('TEMPORARILY_UNAVAILABLE'), kind: z.literal('UNAVAILABLE'), safeMessage: z.literal('Temporarily unavailable. Please try again.'), retryable: z.literal(true) }),
  contextSchema.extend({ code: z.literal('INTERNAL_ERROR'), kind: z.literal('INTERNAL'), safeMessage: z.literal('The request could not be completed.'), retryable: z.literal(false) }),
]).readonly();
export type SafeError = z.infer<typeof safeErrorSchema>;

/** Do not pass caught errors or Zod issues to a wire response. This factory
 * intentionally accepts no exception, provider response or arbitrary message. */
export function internalSafeError(context: z.input<typeof contextSchema> = {}): SafeError {
  return safeErrorSchema.parse({ ...contextSchema.parse(context), code: 'INTERNAL_ERROR', kind: 'INTERNAL', safeMessage: 'The request could not be completed.', retryable: false });
}
