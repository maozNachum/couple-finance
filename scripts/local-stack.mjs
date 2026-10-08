import { spawnSync } from 'node:child_process';
// CLI startup output contains local secrets; never forward it to CI logs.
const result = spawnSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'start'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
if (result.status !== 0) {
  console.error('Local Supabase startup failed. Check Docker, configured ports and container health. Run the CLI locally for diagnostics; do not share credential output.');
  process.exit(result.status ?? 1);
}
console.log('Local Supabase is ready. Credentials were not printed.');
