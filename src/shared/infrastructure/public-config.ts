/** The only source module permitted to read build-time public configuration. */
export function publicConfig(): { url: string; key: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!url || !key) return null;
  if (!/^https:\/\/[a-zA-Z0-9.-]+(?::\d+)?$|^http:\/\/127\.0\.0\.1:\d+$/.test(url)) return null;
  // The local CLI can still emit legacy anon JWTs. Never accept elevated roles.
  if (!key.startsWith('sb_publishable_')) {
    try {
      const encoded = key.split('.')[1];
      if (!encoded || JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))).role !== 'anon') return null;
    } catch { return null; }
  }
  return { url, key };
}
