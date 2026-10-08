import { spawnSync } from 'node:child_process';
import { localStatus } from './local-supabase.mjs';
const status = localStatus();
const env = { ...process.env, VITE_SUPABASE_URL: status.API_URL, VITE_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY ?? status.ANON_KEY };
for (const args of [
  ['node_modules/vite/bin/vite.js', 'build', '--outDir', '.artifacts/auth-app'],
  ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.auth.config.ts'],
]) {
  const run = spawnSync(process.execPath, args, { stdio: 'inherit', env });
  if (run.status !== 0) process.exit(run.status ?? 1);
}
