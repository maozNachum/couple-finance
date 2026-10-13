import { browserClient } from '@/shared/infrastructure/supabase-client';
import { obligationsResponseSchema } from '@finance/contracts/obligations';
import { internalSafeError, safeErrorSchema } from '@finance/contracts/safe-error';
import { obligationContext } from '@finance/domain/obligations';

/** Reuse the existing coherent invoker API; no financial mutation or competing SQL formula. */
export async function loadForecast() {
  const client = browserClient();
  if (!client) throw internalSafeError();
  try {
    const user = await client.auth.getUser();
    if (user.error && (user.error.status === 401 || user.error.status === 403 || user.error.name === 'AuthSessionMissingError') || !user.error && !user.data.user)
      throw safeErrorSchema.parse({code:'NOT_AUTHORIZED',kind:'AUTHORIZATION',safeMessage:'This action is not permitted.',retryable:false});
    if (user.error) throw internalSafeError();
    const response = await client.rpc('obligations_snapshot');
    if (response.error) throw internalSafeError();
    const parsed = obligationsResponseSchema.parse(response.data);
    if (!parsed.ok) throw parsed.error;
    return obligationContext(parsed.snapshot).snapshot;
  } catch (error) {
    const safe = safeErrorSchema.safeParse(error);
    throw safe.success ? safe.data : internalSafeError();
  }
}
