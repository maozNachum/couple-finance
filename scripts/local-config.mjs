import { existsSync, writeFileSync } from 'node:fs';
import { localStatus } from './local-supabase.mjs';
if (existsSync('.env.local')) throw new Error('.env.local already exists; inspect it rather than overwriting.');
const status = localStatus();
writeFileSync('.env.local', `VITE_SUPABASE_URL=${status.API_URL}\nVITE_SUPABASE_PUBLISHABLE_KEY=${status.PUBLISHABLE_KEY ?? status.ANON_KEY}\n`, { flag: 'wx' });
console.log('Wrote ignored .env.local with local public configuration only.');
