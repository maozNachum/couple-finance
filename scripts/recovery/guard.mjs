import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const LIMIT = 256 * 1024 * 1024;
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export function requireThat(condition, code) {
  if (!condition) throw new Error(code);
}
export function localOnly(env = process.env) {
  for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DATABASE_URL', 'PGHOST', 'PGPORT', 'PGDATABASE', 'PGSERVICE', 'SUPABASE_DB_URL', 'SUPABASE_PROJECT_ID']) {
    requireThat(!env[key], 'REFUSED_CONNECTION_OVERRIDE');
  }
}
export function validateIdentity(state, volume, kind) {
  requireThat(state.version === 1 && state.synthetic === true && /^[a-f0-9]{32}$/.test(state.nonce), 'REFUSED_IDENTITY');
  requireThat(/^cf15a-[a-f0-9]{12}-(source|target)$/.test(state.project), 'REFUSED_PROJECT');
  const expected = state.volumes[kind];
  requireThat(expected && volume.Name === `supabase_${kind}_${state.project}` && volume.Name === expected.Name && volume.CreatedAt === expected.CreatedAt &&
    volume.Driver === 'local' && !volume.Options && volume.Labels?.['cf15a.nonce'] === state.nonce &&
    volume.Labels?.['cf15a.kind'] === kind && volume.Labels?.['cf15a.project'] === state.project,
  'REFUSED_VOLUME_IDENTITY');
}
export function validateTarget(state, sourceProject, confirmation) {
  requireThat(state.phase === 'EMPTY' && state.project.endsWith('-target'), 'REFUSED_TARGET_STATE');
  requireThat(state.project !== sourceProject && confirmation === `RESTORE ${state.project}`, 'REFUSED_TARGET_CONFIRMATION');
}
export function seal(value, key) {
  requireThat(key.length === 32, 'INVALID_KEY');
  const plain = Buffer.from(JSON.stringify(value));
  requireThat(plain.length <= LIMIT, 'BACKUP_TOO_LARGE');
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('couple-finance-cold-v1'));
  return Buffer.concat([Buffer.from('CF15A001'), iv, cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
}
export function unseal(bytes, key) {
  requireThat(bytes.length > 36 && bytes.length <= LIMIT + 36 && bytes.subarray(0, 8).toString() === 'CF15A001', 'INVALID_BACKUP');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(8, 20));
    decipher.setAAD(Buffer.from('couple-finance-cold-v1'));
    decipher.setAuthTag(bytes.subarray(-16));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(20, -16)), decipher.final()]).toString());
  } catch { throw new Error('BACKUP_AUTHENTICATION_FAILED'); }
}
export function validateBackup(backup) {
  requireThat(backup.version === 1 && backup.synthetic === true && backup.cleanShutdown === true &&
    /^cf15a-[a-f0-9]{12}-source$/.test(backup.sourceProject) && /^[a-f0-9]{64}$/.test(backup.sourceHash), 'INVALID_BACKUP_MANIFEST');
  requireThat(Object.keys(backup.archives ?? {}).sort().join() === 'db,storage', 'INCOMPLETE_BACKUP');
  for (const kind of ['db', 'storage']) {
    const item = backup.archives[kind];
    requireThat(typeof item.data === 'string' && item.data.length < LIMIT, 'INVALID_ARCHIVE');
    const bytes = Buffer.from(item.data, 'base64');
    requireThat(bytes.length === item.bytes && sha256(bytes) === item.sha256, 'ARCHIVE_INTEGRITY_FAILED');
  }
  requireThat(Array.isArray(backup.objects) && backup.objects.length > 0 && backup.images && backup.migrations.length === 15, 'INCOMPLETE_EVIDENCE');
  return backup;
}

export function validateTarListing(listing) {
  const names = listing.trim().split('\n');
  requireThat(names.length > 0 && names.every(name => name === './' || name.startsWith('./') &&
    !name.includes('\\') && !name.split('/').includes('..') && !name.includes('\0')), 'UNSAFE_ARCHIVE_PATH');
}
