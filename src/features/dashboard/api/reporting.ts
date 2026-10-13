import { browserClient } from '@/shared/infrastructure/supabase-client';
import { reportingResponseSchema } from '@finance/contracts/reporting';
import { internalSafeError, safeErrorSchema } from '@finance/contracts/safe-error';

export async function loadReporting() {
  const client = browserClient();
  if (!client) throw internalSafeError();
  try {
    const user = await client.auth.getUser();
    const denied = user.error && (user.error.status === 401 || user.error.status === 403 || user.error.name === 'AuthSessionMissingError');
    if (denied || (!user.error && !user.data.user)) throw safeErrorSchema.parse({code:'NOT_AUTHORIZED',kind:'AUTHORIZATION',safeMessage:'This action is not permitted.',retryable:false});
    if (user.error) throw internalSafeError();
    const response = await client.rpc('reporting_snapshot');
    if (response.error) throw internalSafeError();
    const parsed = reportingResponseSchema.safeParse(response.data);
    if (!parsed.success) throw internalSafeError();
    if (!parsed.data.ok) throw parsed.data.error;
    return parsed.data.snapshot;
  } catch (error) {
    const safe = safeErrorSchema.safeParse(error);
    throw safe.success ? safe.data : internalSafeError();
  }
}
