// Local synthetic lab only. No URL input, existing-volume adoption, reset, drop or cleanup API.
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync, symlinkSync, realpathSync } from 'node:fs';
import { resolve, join, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localOnly, requireThat, validateIdentity, validateTarget, validateBackup, validateTarListing, seal, unseal, sha256, LIMIT } from './guard.mjs';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cli = join(root, 'node_modules/supabase/dist/supabase.js');
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: LIMIT, windowsHide: true, ...options });
  // Do not include stdout/stderr: CLI/Auth/SQL diagnostics can contain credentials or records.
  requireThat(result.status === 0, `COMMAND_FAILED_${command === 'docker' ? 'DOCKER' : 'PROCESS'}`);
  return result.stdout;
}
export const docker = (...args) => run('docker', args);
const jsonDocker = (...args) => JSON.parse(docker(...args));
const stateFile = lab => join(lab, 'state.json');
export function readState(lab) { return JSON.parse(readFileSync(stateFile(lab), 'utf8')); }
export function saveState(lab, state) { writeFileSync(stateFile(lab), JSON.stringify(state, null, 2), { mode: 0o600 }); }
function claim(lab, operation) {
  try { writeFileSync(join(lab,`${operation}.claim`),'one attempt only\n',{flag:'wx',mode:0o600}); }
  catch { throw new Error('OPERATION_ALREADY_CLAIMED'); }
}
function checkHost() {
  localOnly();
  const context = jsonDocker('context', 'inspect')[0];
  requireThat(['npipe:////./pipe/docker_engine', 'npipe:////./pipe/dockerDesktopLinuxEngine', 'unix:///var/run/docker.sock'].includes(context.Endpoints.docker.Host), 'REFUSED_REMOTE_DOCKER');
  requireThat(docker('info', '--format', '{{.OSType}}').trim() === 'linux', 'LINUX_DOCKER_REQUIRED');
}
function outsideRepository(path) {
  const resolved = realpathSync(path), rel = relative(root, resolved);
  requireThat(isAbsolute(rel) || rel.startsWith('..'), 'VAULT_MUST_BE_OUTSIDE_REPOSITORY');
  return resolved;
}
function helper(state, kind, command, args, { writable = false, input } = {}) {
  validateIdentity(state, jsonDocker('volume', 'inspect', state.volumes[kind].Name)[0], kind);
  return run('docker', ['run', '--rm', '-i', '--network', 'none', '--read-only', '--security-opt', 'no-new-privileges',
    '--mount', `type=volume,src=${state.volumes[kind].Name},dst=/volume,volume-nocopy${writable ? '' : ',readonly'}`,
    '--entrypoint', command, state.helperImage, ...args], { encoding: null, input });
}
function noAttachments(state, kind) {
  requireThat(docker('ps', '-aq', '--filter', `volume=${state.volumes[kind].Name}`).trim() === '', 'REFUSED_ATTACHED_TARGET');
}
function emptyVolume(state, kind) {
  const listing = helper(state, kind, 'find', ['/volume', '-mindepth', '1', '-maxdepth', '1']).toString();
  requireThat(listing.trim() === '', 'REFUSED_NONEMPTY_TARGET');
}
function copyTree(source, target, paths) {
  mkdirSync(target, { recursive: true });
  for (const path of paths) {
    mkdirSync(dirname(join(target, path)), { recursive: true });
    copyFileSync(join(source, path), join(target, path));
  }
}
function trackedPaths() {
  return run('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, 'ls-files', '-z'], { cwd: root }).split('\0').filter(Boolean);
}
export function sourceHash() {
  const paths = trackedPaths().filter(p => p.startsWith('src/') || p.startsWith('supabase/') || ['package.json', 'package-lock.json'].includes(p));
  return sha256(paths.sort().map(p => `${p}:${sha256(readFileSync(join(root, p)))}`).join('\n'));
}
function prepareCopy(state) {
  copyTree(root, state.workdir, trackedPaths());
  // Only documented local addresses change. No formula/assertion/timeout/CI command edits.
  const transformations = [['couple-finance', state.project], ['15421', String(state.port)], ['15432', String(state.port + 11)], ['15430', String(state.port + 9)], ['15424', String(state.port + 3)]];
  const changed = [];
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.(mjs|ts|toml)$/.test(path)) {
        const before = readFileSync(path, 'utf8');
        let after = before;
        for (const [from, to] of transformations) after = after.replaceAll(from, to);
        if (after !== before) { writeFileSync(path, after); changed.push({ path: relative(state.workdir, path), before: sha256(before), after: sha256(after) }); }
      }
    }
  }
  visit(state.workdir);
  symlinkSync(join(root, 'node_modules'), join(state.workdir, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  writeFileSync(join(state.workdir, 'address-transformations.json'), JSON.stringify(changed, null, 2));
}
export function prepare(lab, role, port) {
  checkHost();
  requireThat(['source', 'target'].includes(role) && [15621, 15721, 15821, 15921].includes(port), 'INVALID_LAB_ARGUMENTS');
  lab = outsideRepository(lab);
  requireThat(!existsSync(stateFile(lab)), 'LAB_ALREADY_EXISTS');
  claim(lab,'prepare');
  const nonce = randomBytes(16).toString('hex'), project = `cf15a-${nonce.slice(0, 12)}-${role}`;
  const state = { version: 1, synthetic: true, nonce, project, port, phase: 'EMPTY', sourceHash: sourceHash(),
    workdir: join(root, '.artifacts', project), volumes: {}, createdAt: new Date().toISOString() };
  // Use the already-installed PostgreSQL image; record its immutable ID, never pull implicitly.
  state.helperImage = jsonDocker('image', 'inspect', 'public.ecr.aws/supabase/postgres:17.11.0.004')[0].Id;
  requireThat(docker('ps', '-aq', '--filter', `name=${project}`).trim() === '', 'PROJECT_COLLISION');
  for (const kind of ['db', 'storage']) {
    const name = `supabase_${kind}_${project}`;
    requireThat(!docker('volume', 'ls', '--format', '{{.Name}}').split(/\r?\n/).includes(name), 'VOLUME_COLLISION');
    docker('volume', 'create', '--label', `cf15a.nonce=${nonce}`, '--label', `cf15a.kind=${kind}`, '--label', `cf15a.project=${project}`, name);
    state.volumes[kind] = jsonDocker('volume', 'inspect', name)[0];
    validateIdentity(state, state.volumes[kind], kind);
    noAttachments(state, kind); emptyVolume(state, kind);
  }
  prepareCopy(state); saveState(lab, state);
  return state;
}
function containers(state) {
  const ids = docker('ps', '-aq', '--filter', `label=com.supabase.cli.project=${state.project}`).trim().split(/\s+/).filter(Boolean);
  requireThat(ids.length > 0, 'NO_OWNED_CONTAINERS');
  return jsonDocker('inspect', ...ids);
}
export function assertOwned(state) {
  checkHost();
  for (const kind of ['db', 'storage']) validateIdentity(state, jsonDocker('volume', 'inspect', state.volumes[kind].Name)[0], kind);
  const current = containers(state);
  for (const c of current) {
    requireThat(c.Config.Labels['com.supabase.cli.project'] === state.project && c.Name.endsWith(`_${state.project}`), 'CONTAINER_IDENTITY_MISMATCH');
    if (state.containers) requireThat(state.containers.some(old => old.id === c.Id && old.image === c.Image), 'CONTAINER_REPLACED');
  }
  for (const kind of ['db', 'storage']) {
    const attached = docker('ps', '-aq', '--filter', `volume=${state.volumes[kind].Name}`).trim().split(/\s+/).filter(Boolean);
    requireThat(attached.every(id => current.some(c => c.Id.startsWith(id))), 'FOREIGN_VOLUME_ATTACHMENT');
  }
  return current;
}
export function completeServices(state) {
  assertOwned(state);
  // CLI start does not add excluded services to an already-running project.
  // Explicit project ID; default stop retains volumes. Never --all/--no-backup.
  run(process.execPath, [cli, 'stop', '--project-id', state.project, '--workdir', state.workdir]);
  for (const kind of ['db','storage']) validateIdentity(state,jsonDocker('volume','inspect',state.volumes[kind].Name)[0],kind);
  delete state.containers;
  run(process.execPath, [cli, 'start', '--workdir', state.workdir]);
  const current=assertOwned(state);
  requireThat(current.some(c=>c.Name===`/supabase_rest_${state.project}` && c.State.Running),'POSTGREST_NOT_RUNNING');
  state.containers=current.map(c=>({id:c.Id,image:c.Image,name:c.Name}));
}
export function startSource(lab) {
  const state = readState(lab); checkHost();
  requireThat(state.phase === 'EMPTY' && state.project.endsWith('-source'), 'REFUSED_SOURCE_STATE');
  for (const kind of ['db', 'storage']) { noAttachments(state, kind); emptyVolume(state, kind); }
  claim(lab,'start');
  state.phase = 'STARTING'; saveState(lab, state);
  // Precreated empty volumes are treated by the CLI as a recovered cluster;
  // apply application migrations explicitly before starting PostgREST's api schema.
  run(process.execPath, [cli, 'start', '--workdir', state.workdir, '--exclude', 'postgrest']);
  requireThat(sql(state, "select count(*) from auth.users; select count(*) from pg_namespace where nspname='finance';") === '0\n0', 'SOURCE_NOT_EMPTY');
  run(process.execPath, [cli, 'migration', 'up', '--local', '--workdir', state.workdir]);
  completeServices(state);
  state.phase = 'RUNNING'; saveState(lab, state);
  assertOwned(state);
  requireThat(sql(state, 'select count(*) from auth.users; select count(*) from finance.households;').trim() === '0\n0', 'SOURCE_NOT_EMPTY');
  return state;
}
export function sql(state, query) {
  const db = assertOwned(state).find(c => c.Name === `/supabase_db_${state.project}`);
  requireThat(db?.State.Running, 'DATABASE_NOT_RUNNING');
  return run('docker', ['exec', '-i', db.Id, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], { input: query }).trim();
}
export function status(state) {
  assertOwned(state);
  const result = JSON.parse(run(process.execPath, [cli, 'status', '--workdir', state.workdir, '-o', 'json']));
  requireThat(result.API_URL === `http://127.0.0.1:${state.port}`, 'API_IDENTITY_MISMATCH');
  return result; // Internal only; callers must never log this object.
}
export function backup(lab, objects) {
  const state = readState(lab);
  requireThat(state.phase === 'RUNNING' && state.project.endsWith('-source'), 'REFUSED_BACKUP_SOURCE');
  requireThat(sql(state, "select count(*) from auth.users where email not like 'synthetic-%@example.test';") === '0', 'NONSYNTHETIC_USER');
  const migrations = sql(state, 'select version from supabase_migrations.schema_migrations order by version;').split('\n');
  requireThat(JSON.stringify(migrations) === JSON.stringify(readdirSync(join(root,'supabase/migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>f.split('_')[0])), 'MIGRATION_STATE_MISMATCH');
  const current = assertOwned(state), db = current.find(c => c.Name === `/supabase_db_${state.project}`);
  claim(lab,'backup');
  // Stop every owned service before the DB: no writes between database and Storage capture.
  state.phase = 'STOPPING'; saveState(lab, state);
  for (const c of current.filter(c => c.Id !== db.Id && c.State.Running)) docker('stop', '--time', '30', c.Id);
  docker('stop', '--time', '60', db.Id);
  requireThat(assertOwned(state).every(c => !c.State.Running), 'SOURCE_STILL_RUNNING');
  const control = helper(state, 'db', 'pg_controldata', ['/volume']).toString();
  requireThat(/Database cluster state:\s+shut down\s/.test(control), 'UNCLEAN_DATABASE_SHUTDOWN');
  requireThat(helper(state, 'db', 'find', ['/volume/pg_tblspc', '-mindepth', '1']).toString().trim() === '', 'EXTERNAL_TABLESPACE');
  const archives = {};
  for (const kind of ['db', 'storage']) {
    requireThat(helper(state, kind, 'find', ['/volume', '-type', 'l']).toString().trim() === '', 'SYMLINK_VOLUME_UNSUPPORTED');
    const data = helper(state, kind, 'tar', ['-czf', '-', '-C', '/volume', '.']);
    archives[kind] = { bytes: data.length, sha256: sha256(data), data: data.toString('base64') };
  }
  const payload = { version: 1, synthetic: true, cleanShutdown: true, sourceProject: state.project, sourceHash: state.sourceHash,
    createdAt: new Date().toISOString(), migrations, objects, images: current.map(c => ({ name: c.Name.replace(state.project, 'PROJECT'), image: c.Image })), archives };
  validateBackup(payload);
  const key = randomBytes(32), encrypted = seal(payload, key);
  writeFileSync(join(lab, 'recovery.key'), key, { flag: 'wx', mode: 0o600 });
  writeFileSync(join(lab, 'backup.cf15a'), encrypted, { flag: 'wx', mode: 0o600 });
  validateBackup(unseal(readFileSync(join(lab, 'backup.cf15a')), readFileSync(join(lab, 'recovery.key'))));
  state.phase = 'BACKED_UP'; state.backupHash = sha256(encrypted); saveState(lab, state);
  return { encryptedBytes: encrypted.length, sha256: state.backupHash, archives: Object.fromEntries(Object.entries(archives).map(([k,v]) => [k, { bytes: v.bytes, sha256: v.sha256 }])) };
}
export function restore(sourceLab, targetLab, confirmation) {
  checkHost();
  const state = readState(targetLab), source = readState(sourceLab);
  const payload = validateBackup(unseal(readFileSync(join(sourceLab, 'backup.cf15a')), readFileSync(join(sourceLab, 'recovery.key'))));
  requireThat(sha256(readFileSync(join(sourceLab, 'backup.cf15a'))) === source.backupHash, 'BACKUP_RECEIPT_MISMATCH');
  validateTarget(state, payload.sourceProject, confirmation);
  requireThat(state.sourceHash === payload.sourceHash && state.sourceHash === sourceHash(), 'SOURCE_VERSION_MISMATCH');
  requireThat(source.project === payload.sourceProject && source.phase === 'BACKED_UP', 'SOURCE_IDENTITY_MISMATCH');
  requireThat(docker('ps','-aq','--filter',`label=com.supabase.cli.project=${state.project}`).trim()==='', 'TARGET_PROJECT_NOT_EMPTY');
  for (const image of payload.images) requireThat(jsonDocker('image', 'inspect', image.image)[0].Id === image.image, 'MISSING_PINNED_IMAGE');
  // Inspect archives without mounting a destination. AEAD integrity alone does not validate tar paths.
  for (const item of Object.values(payload.archives)) {
    const args=['run','--rm','-i','--network','none','--read-only','--entrypoint','tar',state.helperImage,'-tzf','-'];
    validateTarListing(run('docker',args,{input:Buffer.from(item.data,'base64')}));
    args[args.length-2]='-tvzf';
    const detailed=run('docker',args,{input:Buffer.from(item.data,'base64')});
    requireThat(detailed.trim().split('\n').every(line=>/^[d-]/.test(line)), 'ARCHIVE_LINK_OR_DEVICE_UNSUPPORTED');
  }
  for (const kind of ['db', 'storage']) { noAttachments(state, kind); emptyVolume(state, kind); }
  claim(targetLab,'restore');
  validateTarget(readState(targetLab),payload.sourceProject,confirmation);
  // Write intent before first byte. Any error/termination permanently quarantines this target.
  state.phase = 'RESTORING'; saveState(targetLab, state);
  for (const kind of ['db', 'storage']) {
    noAttachments(state, kind); emptyVolume(state, kind);
    helper(state, kind, 'tar', ['-xzf', '-', '-C', '/volume'], { writable: true, input: Buffer.from(payload.archives[kind].data, 'base64') });
  }
  state.phase = 'RESTORED_OFFLINE'; state.backupHash = source.backupHash; state.expectedImages = payload.images; saveState(targetLab, state);
  return state;
}
export function startRecovered(lab) {
  const state = readState(lab); checkHost();
  requireThat(state.phase === 'RESTORED_OFFLINE', 'REFUSED_RECOVERY_STATE');
  claim(lab,'start-recovered');
  for (const kind of ['db', 'storage']) { validateIdentity(state, jsonDocker('volume', 'inspect', state.volumes[kind].Name)[0], kind); noAttachments(state, kind); }
  state.phase = 'VERIFYING'; saveState(lab, state);
  // Database only: revoke restored sessions before any Auth/Data/Storage API can serve traffic.
  run(process.execPath, [cli, 'start', '--workdir', state.workdir, '--exclude', 'gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor']);
  for(const c of assertOwned(state)) requireThat(state.expectedImages.some(e=>e.name===c.Name.replace(state.project,'PROJECT') && e.image===c.Image),'RECOVERY_IMAGE_MISMATCH');
  sql(state, 'begin; delete from auth.refresh_tokens; delete from auth.sessions; delete from auth.one_time_tokens; delete from auth.flow_state; delete from auth.mfa_challenges; update auth.users set confirmation_token=\'\', recovery_token=\'\', email_change_token_new=\'\', email_change_token_current=\'\', reauthentication_token=\'\', phone_change_token=\'\'; commit;');
  completeServices(state);
  for (const c of state.containers) requireThat(state.expectedImages.some(e => e.name === c.name.replace(state.project, 'PROJECT') && e.image === c.image), 'RECOVERY_IMAGE_MISMATCH');
  saveState(lab, state);
  return state; // Deliberately not SUCCESS: financial, object and authorization checks must pass next.
}
