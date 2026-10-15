import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { localOnly, validateIdentity, validateTarget, validateBackup, validateTarListing, seal, unseal, sha256 } from '../../scripts/recovery/guard.mjs';

const project = 'cf15a-0123456789ab-target';
const volume = { Name: `supabase_db_${project}`, CreatedAt: '2026-10-15T00:00:00Z', Driver: 'local', Options: null,
  Labels: { 'cf15a.nonce': '1'.repeat(32), 'cf15a.kind': 'db', 'cf15a.project': project } };
const state = () => ({ version: 1, synthetic: true, nonce: '1'.repeat(32), project, phase: 'EMPTY', volumes: { db: structuredClone(volume) } });
const bundle = () => {
  const data = Buffer.from('synthetic archive');
  const item = { data: data.toString('base64'), bytes: data.length, sha256: sha256(data) };
  return { version: 1, synthetic: true, cleanShutdown: true, sourceProject: 'cf15a-9876543210ab-source', sourceHash: 'a'.repeat(64),
    archives: { db: { ...item }, storage: { ...item } }, objects: [{ name: 'synthetic.csv' }], images: [], migrations: Array.from({ length: 15 }, (_, i) => String(i)) };
};
test('authenticated encryption round trip and random nonce', () => {
  const key = randomBytes(32), data = bundle(), one = seal(data, key), two = seal(data, key);
  assert.deepEqual(unseal(one, key), data); assert.notDeepEqual(one, two);
});
test('corrupt ciphertext never decrypts', () => {
  const key = randomBytes(32), bytes = seal(bundle(), key); bytes[30] ^= 1;
  assert.throws(() => unseal(bytes, key), /AUTHENTICATION/);
});
test('wrong encryption key is rejected', () => assert.throws(() => unseal(seal(bundle(), randomBytes(32)), randomBytes(32)), /AUTHENTICATION/));
test('truncated bundle is rejected', () => assert.throws(() => unseal(seal(bundle(), randomBytes(32)).subarray(0, 35), randomBytes(32)), /INVALID_BACKUP/));
test('missing Storage archive is a failed backup', () => { const b = bundle(); delete b.archives.storage; assert.throws(() => validateBackup(b), /INCOMPLETE/); });
test('independent archive digest rejects changed payload', () => { const b = bundle(); b.archives.db.data = Buffer.from('changed').toString('base64'); assert.throws(() => validateBackup(b), /INTEGRITY/); });
test('object inventory is mandatory', () => { const b = bundle(); b.objects = []; assert.throws(() => validateBackup(b), /INCOMPLETE/); });
test('unclean PostgreSQL shutdown rejected', () => { const b = bundle(); b.cleanShutdown = false; assert.throws(() => validateBackup(b), /MANIFEST/); });
test('retained or hosted name never qualifies', () => { const s = state(); s.project = 'couple-finance-task14'; assert.throws(() => validateIdentity(s, volume, 'db'), /PROJECT/); });
test('labels alone cannot substitute for creation identity', () => { const v = structuredClone(volume); v.CreatedAt = 'different'; assert.throws(() => validateIdentity(state(), v, 'db'), /IDENTITY/); });
test('volume name alone cannot substitute for ownership', () => { const v = structuredClone(volume); v.Labels = {}; assert.throws(() => validateIdentity(state(), v, 'db'), /IDENTITY/); });
test('remote volume driver refused', () => { const v = structuredClone(volume); v.Driver = 'nfs'; assert.throws(() => validateIdentity(state(), v, 'db'), /IDENTITY/); });
test('volume host-bind options refused', () => { const v = structuredClone(volume); v.Options = { device: '/retained', type: 'none', o: 'bind' }; assert.throws(() => validateIdentity(state(), v, 'db'), /IDENTITY/); });
test('explicit exact target confirmation mandatory', () => assert.throws(() => validateTarget(state(), 'source', 'yes'), /CONFIRMATION/));
test('source cannot also be target', () => assert.throws(() => validateTarget(state(), project, `RESTORE ${project}`), /CONFIRMATION/));
test('interrupted restore is quarantined without retry', () => { const s = state(); s.phase = 'RESTORING'; assert.throws(() => validateTarget(s, 'source', `RESTORE ${project}`), /STATE/); });
test('completed restore cannot be overwritten', () => { const s = state(); s.phase = 'VERIFIED'; assert.throws(() => validateTarget(s, 'source', `RESTORE ${project}`), /STATE/); });
test('connection override refused even if it looks local', () => {
  for (const key of ['DATABASE_URL', 'PGHOST', 'DOCKER_HOST', 'SUPABASE_DB_URL']) assert.throws(() => localOnly({ [key]: 'localhost' }), /OVERRIDE/);
});
test('valid empty target identity and exact confirmation accepted', () => { validateIdentity(state(), volume, 'db'); validateTarget(state(), 'source', `RESTORE ${project}`); });
test('tar traversal and absolute paths rejected before extraction', () => {
  for (const path of ['/retained/data','./../retained','./base/../../retained','C:\\retained','./base\\..\\retained']) assert.throws(()=>validateTarListing(path),/PATH/);
  validateTarListing('./\n./base/\n./base/123\n');
});
