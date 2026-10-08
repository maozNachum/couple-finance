import { createClient } from '@supabase/supabase-js';
import { publicConfig } from './public-config';

function createBrowserClient() {
  const config = publicConfig();
  return config ? createClient(config.url, config.key, {
    db: { schema: 'api' },
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce' },
  }) : null;
}
let client: ReturnType<typeof createBrowserClient> | undefined;
export function browserClient() {
  if (client === undefined) client = createBrowserClient();
  return client;
}
