import { browserClient } from '@/shared/infrastructure/supabase-client';
import { manualFxCommandSchema, manualFxResponseSchema } from '@finance/contracts/fx';
import { internalSafeError, safeErrorSchema } from '@finance/contracts/safe-error';

export async function recordManualFx(input: unknown) {
  const command = manualFxCommandSchema.safeParse(input);
  if (!command.success) throw safeErrorSchema.parse({ code: 'INVALID_INPUT', kind: 'VALIDATION', safeMessage: 'Some values are invalid.', retryable: false });
  const client = browserClient();
  if (!client) throw internalSafeError();
  let user;
  try { user = await client.auth.getUser(); } catch { throw internalSafeError(); }
  if (user.error && (user.error.status === 401 || user.error.status === 403 || user.error.name === 'AuthSessionMissingError') || !user.error && !user.data.user)
    throw safeErrorSchema.parse({ code: 'NOT_AUTHORIZED', kind: 'AUTHORIZATION', safeMessage: 'This action is not permitted.', retryable: false });
  if (user.error) throw internalSafeError();
  let result;
  try { result = await client.rpc('record_manual_fx', { payload: command.data }); } catch { throw internalSafeError(); }
  if (result.error) throw internalSafeError();
  const response = manualFxResponseSchema.safeParse(result.data);
  if (!response.success) throw internalSafeError();
  if (!response.data.ok) throw response.data.error;
  const e = response.data.evidence, c = command.data;
  if (e.householdId !== c.householdId || e.rate.id !== c.id || e.rate.base !== c.base || e.rate.quote !== c.quote || e.rate.rate !== c.rate || e.rate.effectiveDate !== c.effectiveDate || e.rate.origin.kind !== 'MANUAL') throw internalSafeError();
  return e;
}
