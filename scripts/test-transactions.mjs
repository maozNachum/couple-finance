import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { localStatus, localSql, localAdmin, uuid } from './local-supabase.mjs';
import { createFixture } from '../tests/integration/local-fixtures.mjs';

const status = localStatus(), fixture = await createFixture();
const client = () => createClient(status.API_URL, status.ANON_KEY, { db: { schema: 'api' }, auth: { persistSession: false, autoRefreshToken: false } });
const a = client(), b = client(), anon = client();
let checks = 0;
const equal = (x, y) => { assert.deepEqual(x, y); checks++; };
async function call(c, payload) { const result = await c.rpc('record_transaction', { payload }); assert.equal(result.error, null, 'RPC transport failure'); return result.data; }
const account = { id: randomUUID(), householdId: fixture.households[0], name: 'Synthetic cash', ownership: { kind: 'HOUSEHOLD' }, type: 'CASH', currency: 'ILS', valuationCurrency: 'ILS', balancePolicy: 'LEDGER', status: 'ACTIVE' };
const source = randomUUID();
function command(amount = '-10', effect = 'UNCLASSIFIED', date = '2026-10-02') {
  return { revisionId: randomUUID(), supersedesRevisionId: null, expectedVersion: 0, idempotencyKey: randomUUID(), entryKind: 'MOVEMENT', openingCoverage: null, reason: '', transaction: { id: randomUUID(), householdId: account.householdId, accountId: account.id, transactionDate: date, money: { amount, currency: 'ILS' }, description: 'Synthetic movement', status: 'POSTED', provenance: [{ source: { sourceId: source, kind: 'MANUAL' } }], allocations: [{ id: randomUUID(), effect, money: { amount, currency: 'ILS' }, ownership: { kind: 'HOUSEHOLD' }, categorization: { origin: 'UNCLASSIFIED', userLocked: false } }] } };
}
function correction(old, amount, statusValue = 'POSTED') {
  return { ...old, revisionId: randomUUID(), idempotencyKey: randomUUID(), supersedesRevisionId: old.revisionId, expectedVersion: old.expectedVersion + 1, reason: 'Synthetic correction', transaction: { ...old.transaction, status: statusValue, money: { amount, currency: 'ILS' }, allocations: old.transaction.allocations.map(v => ({ ...v, money: { amount, currency: 'ILS' } })) } };
}
try {
  for (const [c, user] of [[a, fixture.users[0]], [b, fixture.users[1]]]) assert.equal((await c.auth.verifyOtp({ token_hash: user.hash, type: 'invite' })).error, null);
  equal((await a.rpc('create_account', { payload: { account, manualSourceId: source, version: 1 } })).data.ok, true);
  equal((await anon.rpc('transaction_snapshot')).error !== null, true);
  equal((await anon.rpc('record_transaction', { payload: command() })).error !== null, true);
  const opening = { ...command('0', 'ADJUSTMENT', '2026-10-01'), entryKind: 'OPENING', openingCoverage: 'COMPLETE' };
  equal((await call(a, opening)).ok, true);
  const voidOpening = correction(opening, '0', 'VOIDED'); equal((await call(a, voidOpening)).ok, true);
  equal((await call(a, correction(voidOpening, '0'))).ok, true);
  const movement = command('-9007199254740991.12345678', 'EXPENSE');
  const results = await Promise.all(Array.from({ length: 5 }, () => call(a, movement)));
  equal(results.every(x => x.ok && x.revisionId === movement.revisionId && x.version === 1), true);
  equal((await a.from('transaction_history').select('revision_id')).data.length, 4);
  equal((await call(a, { ...movement, reason: 'changed payload' })).error.code, 'CONFLICT');
  equal((await call(a, { ...movement, idempotencyKey: randomUUID() })).error.code, 'CONFLICT');
  const collision = command('1'); collision.revisionId = movement.revisionId;
  equal((await call(a, collision)).error.code, 'CONFLICT');
  equal(localSql(`select count(*) from finance.transactions where id='${uuid(collision.transaction.id)}';`), '0');
  equal(localSql(`select count(*) from private.transaction_receipts where household_id='${uuid(account.householdId)}' and idempotency_key='${uuid(collision.idempotencyKey)}';`), '0');
  equal((await b.from('transaction_history').select('*')).data, []);
  equal((await call(b, movement)).error.code, 'NOT_AUTHORIZED');
  equal((await b.rpc('transaction_snapshot')).data.history, []);
  equal((await a.schema('finance').from('transaction_revisions').select('*')).error !== null, true);
  equal((await a.schema('private').rpc('record_transaction', { payload: command() })).error !== null, true);
  equal((await a.from('transaction_history').insert({ revision_id: randomUUID() })).error !== null, true);
  const snapshot = (await a.rpc('transaction_snapshot')).data;
  equal(snapshot.history.find(x => x.revisionId === movement.revisionId).transaction.money, movement.transaction.money);
  equal(snapshot.history.find(x => x.revisionId === movement.revisionId).transaction.allocations, movement.transaction.allocations);
  equal(snapshot.history.find(x => x.revisionId === movement.revisionId).createdAt, snapshot.history.find(x => x.revisionId === movement.revisionId).recordedAt);
  const competing = [correction(movement, '-12'), correction(movement, '-13')];
  const conflicts = await Promise.all(competing.map(x => call(a, x)));
  equal(conflicts.filter(x => x.ok).length, 1); equal(conflicts.filter(x => x.error?.code === 'CONFLICT').length, 1);
  const winner = competing[conflicts.findIndex(x => x.ok)];
  equal((await call(a, winner)).ok, true);
  equal((await call(a, correction(winner, '-13', 'PENDING'))).error.code, 'CONFLICT');
  const voided = correction(winner, '-13', 'VOIDED'); equal((await call(a, voided)).ok, true);
  equal((await call(a, correction(voided, '-13'))).error.code, 'CONFLICT');
  const pending = command('-5'); pending.transaction.status = 'PENDING'; equal((await call(a, pending)).ok, true);
  equal((await call(a, correction(pending, '-5'))).ok, true);
  equal((await call(a, { ...command('1', 'ADJUSTMENT'), entryKind: 'OPENING', openingCoverage: 'COMPLETE' })).error.code, 'CONFLICT');
  equal((await call(a, command('1', 'INCOME', '2026-09-30'))).error.code, 'INVALID_INPUT');
  equal((await call(a, command('-1', 'EXPENSE', '2026-10-04'))).ok, true);
  equal((await call(a, command('1', 'EXPENSE', '2026-10-03'))).ok, true); // out-of-order refund
  for (const effect of ['INCOME', 'TRANSFER', 'DEBT_PRINCIPAL', 'INVESTMENT_TRADE', 'ADJUSTMENT', 'UNCLASSIFIED']) equal((await call(a, command('1', effect))).ok, true);
  const member = localSql(`select id from finance.household_members where household_id='${uuid(account.householdId)}';`);
  const owned = command('1'); owned.transaction.allocations[0].ownership = { kind: 'MEMBER', memberId: member }; equal((await call(a, owned)).ok, true);
  const split = command('-11', 'DEBT_PRINCIPAL'); split.transaction.allocations[0].money.amount = '-10'; split.transaction.allocations.push({ ...split.transaction.allocations[0], id: randomUUID(), effect: 'EXPENSE', money: { amount: '-1', currency: 'ILS' } }); equal((await call(a, split)).ok, true);
  const offset = command('1'); offset.transaction.allocations[0].money.amount = '3'; offset.transaction.allocations.push({ ...offset.transaction.allocations[0], id: randomUUID(), money: { amount: '-2', currency: 'ILS' } }); equal((await call(a, offset)).ok, true);
  const beforeInvalid = Number(localSql(`select count(*) from finance.transaction_revisions where household_id='${uuid(account.householdId)}';`));
  const invalids = [
    x => { x.transaction.money.amount = 1; }, x => { x.transaction.money.amount = '1e2'; }, x => { x.transaction.money.amount = '1.000000000'; },
    x => { x.transaction.money.amount = '01'; }, x => { x.transaction.money.amount = '1\n'; }, x => { x.transaction.money.amount = null; },
    x => { x.transaction.money.amount = '10000000000000000'; }, x => { x.transaction.money.amount = 'NaN'; },
    x => { x.transaction.transactionDate = '2026-02-30'; }, x => { x.transaction.transactionDate = '2026-1-01'; }, x => { x.transaction.transactionDate = '0000-01-01'; },
    x => { x.transaction.allocations = []; }, x => { x.transaction.allocations[0].money.amount = '2'; }, x => { x.transaction.allocations.push(x.transaction.allocations[0]); },
    x => { x.transaction.allocations[0].money.currency = 'USD'; }, x => { x.transaction.money.currency = 'USD'; },
    x => { x.transaction.provenance[0].source.sourceId = randomUUID(); }, x => { x.transaction.accountId = randomUUID(); },
    x => { x.transaction.allocations[0].ownership = { kind: 'MEMBER', memberId: randomUUID() }; },
    x => { x.transaction.allocations[0].ownership = { kind: 'MEMBER', memberId: localSql(`select id from finance.household_members where household_id='${uuid(fixture.households[1])}';`) }; },
    x => { x.transaction.allocations[0].categoryId = randomUUID(); }, x => { x.transaction.allocations[0].categorization.origin = 'RULE'; },
    x => { x.recordedAt = '2026-01-01T00:00:00Z'; }, x => { x.transaction.provenance[0].source.kind = 'LIVE_SYNC'; },
    x => { x.expectedVersion = null; }, x => { x.idempotencyKey += '\n'; }, x => { x.openingCoverage = 'COMPLETE'; }, x => { x.reason = null; },
  ];
  for (const mutate of invalids) { const invalid = command('1'); mutate(invalid); const result = await call(a, invalid); equal(result.error?.code, 'INVALID_INPUT'); equal(Object.keys(result.error).sort(), ['code', 'kind', 'retryable', 'safeMessage']); }
  equal(Number(localSql(`select count(*) from finance.transaction_revisions where household_id='${uuid(account.householdId)}';`)), beforeInvalid);
  equal(Number(localSql(`select count(*) from private.transaction_receipts where household_id='${uuid(account.householdId)}';`)), beforeInvalid);
  equal(Number(localSql(`select count(*) from private.transaction_audit where household_id='${uuid(account.householdId)}';`)), beforeInvalid);
  // Reuse a rejected key safely: no receipt exists until commit.
  const rejected = command('1'); rejected.transaction.allocations[0].money.amount = '2'; equal((await call(a, rejected)).error.code, 'INVALID_INPUT'); rejected.transaction.allocations[0].money.amount = '1'; equal((await call(a, rejected)).ok, true);
  await a.auth.updateUser({ data: { household_id: fixture.households[1], role: 'admin' } });
  equal((await call(a, { ...command(), transaction: { ...command().transaction, householdId: fixture.households[1] } })).error.code, 'NOT_AUTHORIZED');
  // A scalar RPC must carry full history beyond the default Data API cap, using the real command path.
  const bulk = Array.from({ length: 1001 }, () => command('0.01'));
  const claims = localSql(`select json_build_object('sub','${uuid(fixture.users[0].id)}','session_id',id)::text from auth.sessions where user_id='${uuid(fixture.users[0].id)}' limit 1;`);
  const rows = bulk.map(x => `select private.record_transaction('${JSON.stringify(x)}'::jsonb)->>'ok';`).join('\n');
  const inserted = localSql(`begin; set local role authenticated; select set_config('request.jwt.claims','${claims}',true); ${rows} commit;`);
  equal(inserted.split('\n').filter(x => x === 'true').length, 1001);
  equal((await a.rpc('transaction_snapshot')).data.history.length, beforeInvalid + 1 + 1001);
  equal((await a.rpc('update_account', { payload: { householdId: account.householdId, accountId: account.id, expectedVersion: 1, name: account.name, status: 'ARCHIVED' } })).data.ok, true);
  equal((await call(a, movement)).ok, true); // original receipt survives corrections and archival
  equal((await call(a, command())).error.code, 'CONFLICT');
  const jwt = (await a.auth.getSession()).data.session.access_token;
  localSql(`update finance.household_members set status='REVOKED' where household_id='${uuid(account.householdId)}';`);
  equal((await a.rpc('transaction_snapshot')).data.history, []); equal((await call(a, movement)).error.code, 'NOT_AUTHORIZED');
  equal((await a.auth.getSession()).data.session.access_token, jwt);
  localSql(`update finance.household_members set status='ACTIVE' where household_id='${uuid(account.householdId)}'; delete from auth.sessions where user_id='${uuid(fixture.users[0].id)}';`);
  equal((await a.from('transaction_history').select('*')).data, []); equal((await call(a, movement)).error.code, 'NOT_AUTHORIZED');
  await localAdmin().auth.admin.deleteUser(fixture.users[0].id);
  equal((await a.from('transaction_history').select('*')).data, []); equal((await call(a, movement)).error.code, 'NOT_AUTHORIZED');
  equal(localSql(`select owner_member_id from finance.transaction_allocations where revision_id='${uuid(owned.revisionId)}';`), member);
  console.log(`Transactions integration: ${checks} assertions passed (real Auth/PostgREST, retries, concurrency, precision, durable ownership and revocation).`);
} finally { await Promise.all([a.auth.signOut(), b.auth.signOut()]); await fixture.cleanup(); }
