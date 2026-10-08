import { browserClient } from '@/shared/infrastructure/supabase-client';

export async function requestSignIn(email: string): Promise<void> {
  const client = browserClient();
  if (!client) throw new Error('AUTH_UNAVAILABLE');
  // Deliberately mask all provider responses, including 5xx: delivery can fail only
  // for existing accounts. Per-request diagnostics would become an enumeration oracle.
  // Operators use aggregate service diagnostics (npm run local:auth-diagnostics).
  try {
    await client.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/auth/confirm` } });
  } catch {
    // Also suppress raw SDK/transport exceptions; the conditional response remains identical.
  }
}
export function consumeConfirmation(fragment: string): { token_hash: string; type: 'invite' | 'email' } | null {
  const params = new URLSearchParams(fragment.replace(/^#/, ''));
  const token_hash = params.get('token_hash');
  const type = params.get('type');
  return token_hash && /^[a-f0-9]{32,128}$/i.test(token_hash) && (type === 'invite' || type === 'email') ? { token_hash, type } : null;
}
export async function confirmSignIn(confirmation: NonNullable<ReturnType<typeof consumeConfirmation>>): Promise<boolean> {
  const client = browserClient();
  if (!client) return false;
  try { const { error } = await client.auth.verifyOtp(confirmation); return !error; }
  catch { return false; }
}
