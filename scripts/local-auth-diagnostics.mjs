import { spawnSync } from 'node:child_process';
import { localStatus } from './local-supabase.mjs';
import { summarizeAuthDiagnostics } from './auth-diagnostic-summary.mjs';

// Local operator access only. Raw logs stay in memory, never in artifacts or output.
const status = localStatus();
let health = 'AUTH_HEALTH_UNAVAILABLE';
try {
  const response = await fetch(`${status.API_URL}/auth/v1/health`, {
    headers: { apikey: status.PUBLISHABLE_KEY ?? status.ANON_KEY }, signal: AbortSignal.timeout(5000),
  });
  if (response.ok) health = 'AUTH_HEALTH_OK';
} catch { /* Fixed status only; no exception details. */ }
const result = spawnSync('docker', ['logs', '--since', '10m', '--tail', '1000', 'supabase_auth_couple-finance'], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
if (result.status !== 0) throw new Error('AUTH_DIAGNOSTICS_UNAVAILABLE');
console.log(JSON.stringify({ health, windowMinutes: 10, maxEntries: 1000, ...summarizeAuthDiagnostics(`${result.stdout}\n${result.stderr}`) }));
