import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

export function localStatus() {
  const result = spawnSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'status', '-o', 'json'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Local Supabase is unavailable. Run npm run db:start.');
  const status = JSON.parse(result.stdout);
  if (status.API_URL !== 'http://127.0.0.1:15421') throw new Error('This tool supports only the configured local test stack.');
  return status;
}
export function localAdmin() {
  const status = localStatus();
  return createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
export function localSql(sql) {
  // Input is sent over stdin; credentials and SQL are never placed in process arguments.
  const result = spawnSync('docker', ['exec', '-i', 'supabase_db_couple-finance', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], { input: sql, encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Local database operation failed. No database diagnostics were exposed.');
  return result.stdout.trim();
}
export function sqlText(value) { return "'" + value.replaceAll("'", "''") + "'"; }
export function uuid(value) {
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value ?? '')) throw new Error('Expected UUID.');
  return value;
}
