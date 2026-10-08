/** Reject elevated credentials before Vite can embed them in a browser bundle. */
export function assertPublicConfig(env) {
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!key || key === 'replace-with-local-publishable-key') return;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return;
  try {
    const payload = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString('utf8'));
    if (payload.role === 'anon') return;
  } catch { /* Fall through to a fixed error, never echo the key. */ }
  throw new Error('Browser configuration requires a publishable or legacy anon key.');
}
