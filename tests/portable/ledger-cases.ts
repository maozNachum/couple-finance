import { accountRecordSchema } from '@finance/contracts/valuation';
import { manualTransactionCommandSchema, transactionRevisionSchema } from '@finance/contracts/ledger';
import type { TransactionRevision } from '@finance/contracts/ledger';
import { currentTransactions, ledgerBalance } from '@finance/domain/money/ledger';

export const ledgerCases: { name: string; run: () => void }[] = [];
const test = (name: string, run: () => void) => ledgerCases.push({ name: `ledger: ${name}`, run });
function equal(a: unknown, b: unknown) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const record = accountRecordSchema.parse({ account: { id: id(1), householdId: id(2), name: 'Synthetic cash', type: 'CASH', currency: 'ILS', valuationCurrency: 'USD', status: 'ACTIVE', balancePolicy: 'LEDGER', ownership: { kind: 'HOUSEHOLD' } }, version: 1, manualSourceId: id(3), sources: [{ id: id(3), accountId: id(1), householdId: id(2), kind: 'MANUAL', authoritativeFrom: '0001-01-01' }] });
function revision(n: number, amount: string, options: { opening?: boolean; status?: string; date?: string; coverage?: string; effect?: string } = {}) {
  return transactionRevisionSchema.parse({ revisionId: id(n + 100), version: 1, supersedesRevisionId: null, entryKind: options.opening ? 'OPENING' : 'MOVEMENT', openingCoverage: options.opening ? options.coverage ?? 'COMPLETE' : null, reason: '', createdAt: '2026-10-09T00:00:00.000000Z', recordedAt: '2026-10-09T00:00:00.000000Z',
    transaction: { id: id(n + 200), householdId: id(2), accountId: id(1), transactionDate: options.date ?? '2026-10-01', description: 'Synthetic transaction', status: options.status ?? 'POSTED', money: { amount, currency: 'ILS' }, provenance: [{ source: { sourceId: id(3), kind: 'MANUAL' } }], allocations: [{ id: id(n + 300), money: { amount, currency: 'ILS' }, effect: options.opening ? 'ADJUSTMENT' : options.effect ?? 'UNCLASSIFIED', ownership: { kind: 'HOUSEHOLD' }, categorization: { origin: 'USER', userLocked: true } }] } });
}
function corrected(old: TransactionRevision, amount: string, status = 'POSTED', coverage = old.openingCoverage) {
  return transactionRevisionSchema.parse({ ...old, version: old.version + 1, revisionId: id(900 + old.version), supersedesRevisionId: old.revisionId, openingCoverage: coverage, reason: 'Synthetic correction', recordedAt: '2026-10-10T00:00:00.000000Z', transaction: { ...old.transaction, status, money: { amount, currency: 'ILS' }, allocations: old.transaction.allocations.map((a) => ({ ...a, money: { amount, currency: 'ILS' } })) } });
}
const opening = revision(1, '100', { opening: true });
test('FILE_IMPORT revisions use account relationships and exact ledger while manual creation stays restricted',()=>{
 const fileRecord=accountRecordSchema.parse({...record,sources:[...record.sources,{id:id(4),householdId:id(2),accountId:id(1),kind:'FILE_IMPORT',authoritativeFrom:null}]});
 const imported=transactionRevisionSchema.parse({...revision(2,'-0.12345678'),transaction:{...revision(2,'-0.12345678').transaction,provenance:[{source:{sourceId:id(4),kind:'FILE_IMPORT'},ingestionItemId:id(5)}]}});
 const result=ledgerBalance(fileRecord,[opening,imported],'2026-10-05');equal(result.state,'KNOWN');if(result.state==='KNOWN')equal(result.money.amount,'99.87654322');
 equal(ledgerBalance(record,[opening,imported],'2026-10-05').state,'ERROR');
 equal(ledgerBalance(fileRecord,[imported],'2026-10-05').state,'UNKNOWN');
 equal(manualTransactionCommandSchema.safeParse({...imported,idempotencyKey:'synthetic_import_01',expectedVersion:0,version:undefined,createdAt:undefined,recordedAt:undefined}).success,false);
 const next=corrected(imported,'-2');equal(currentTransactions(fileRecord,[imported,next]).length,1);
 const forged=transactionRevisionSchema.parse({...next,transaction:{...next.transaction,provenance:[{source:{sourceId:id(3),kind:'MANUAL'}}]}});
 equal(ledgerBalance(fileRecord,[opening,imported,forged],'2026-10-05').state,'ERROR');
});
const balance = (history: readonly TransactionRevision[], date = '2026-10-05') => ledgerBalance(record, history, date);
function amount(history: readonly TransactionRevision[], date?: string) { const result = balance(history, date); if (result.state !== 'KNOWN' && result.state !== 'INCOMPLETE') throw new Error('Expected balance'); return result.money.amount; }
test('missing opening is unknown, even with posted activity', () => { equal(balance([]).state, 'UNKNOWN'); equal(balance([revision(2, '10')]).state, 'UNKNOWN'); });
test('explicit zero is known', () => { equal(balance([revision(1, '0', { opening: true })]).state, 'KNOWN'); equal(amount([revision(1, '0', { opening: true })]), '0'); });
test('cutoff before opening is unknown', () => equal(balance([opening], '2026-09-30'), { state: 'UNKNOWN', reason: 'BEFORE_OPENING' }));
test('opening and same-day movements use inclusive cutoff', () => equal(amount([opening, revision(2, '-0.12345678')], '2026-10-01'), '99.87654322'));
test('future posted movements excluded', () => equal(amount([opening, revision(2, '-20', { date: '2026-10-06' })]), '100'));
test('pending and voided never contribute', () => equal(amount([opening, revision(2, '-20', { status: 'PENDING' }), revision(3, '90', { status: 'VOIDED' })]), '100'));
test('partial coverage remains incomplete', () => { equal(balance([revision(1, '0', { opening: true, coverage: 'PARTIAL' })]).state, 'INCOMPLETE'); });
test('out of order rows and dates are deterministic', () => { const a = revision(2, '-1', { date: '2026-10-03' }), b = revision(3, '0.01', { date: '2026-10-02' }); equal(balance([a, opening, b]), balance([b, a, opening])); equal(amount([a, opening, b]), '99.01'); });
test('correction replaces without doubling and retains evidence', () => { const old = revision(2, '-20'), next = corrected(old, '-12'); equal(amount([next, opening, old]), '88'); equal(currentTransactions(record, [old, next]).length, 1); equal(old.transaction.money.amount, '-20'); });
test('pending posting preserves stable movement identity', () => { const old = revision(2, '-20', { status: 'PENDING' }); equal(amount([opening, old, corrected(old, '-20')]), '80'); });
test('timestamp ordering handles optional and differing fractional precision', () => {
  const old = transactionRevisionSchema.parse({ ...revision(2, '-20'), createdAt: '2026-10-09T00:00:00Z', recordedAt: '2026-10-09T00:00:00Z' });
  const next = transactionRevisionSchema.parse({ ...corrected(old, '-10'), recordedAt: '2026-10-09T00:00:00.1Z' });
  equal(amount([opening, old, next]), '90');
});
test('voided posted movement removed under corrected knowledge', () => { const old = revision(2, '-20'); equal(amount([opening, old, corrected(old, '-20', 'VOIDED')]), '100'); });
test('opening can be corrected to known full coverage', () => { const old = revision(1, '100', { opening: true, coverage: 'PARTIAL' }); const history = [old, corrected(old, '110', 'POSTED', 'COMPLETE')]; equal(amount(history), '110'); equal(balance(history).state, 'KNOWN'); });
test('voided opening yields unknown', () => equal(balance([opening, corrected(opening, '100', 'VOIDED')]).state, 'UNKNOWN'));
test('a voided opening can be restored by a new audited revision', () => { const voided = corrected(opening, '100', 'VOIDED'); equal(amount([opening, voided, corrected(voided, '100')]), '100'); });
test('archived ledger stays readable', () => equal(ledgerBalance(accountRecordSchema.parse({ ...record, account: { ...record.account, status: 'ARCHIVED' } }), [opening], '2026-10-05'), balance([opening])));
test('observed account is never valued from transactions', () => equal(ledgerBalance(accountRecordSchema.parse({ ...record, account: { ...record.account, type: 'BANK', balancePolicy: 'OBSERVED' } }), [opening], '2026-10-05').state, 'NOT_LEDGER'));
test('large exact amounts retain eight places beyond Number precision', () => equal(amount([revision(1, '9007199254740991.12345678', { opening: true }), revision(2, '-0.00000001')]), '9007199254740991.12345677'));
test('overflow and malformed date produce ERROR', () => { equal(balance([revision(1, '9999999999999999', { opening: true }), revision(2, '1')]).state, 'ERROR'); equal(balance([opening], '2026-02-30').state, 'ERROR'); });
test('duplicate openings rejected', () => equal(balance([opening, revision(2, '10', { opening: true })]).state, 'ERROR'));
test('preopening history rejected rather than omitted', () => equal(balance([opening, revision(2, '10', { date: '2026-09-30' })]).state, 'ERROR'));
test('missing predecessor and duplicate versions rejected', () => { const next = corrected(opening, '101'); equal(balance([next]).state, 'ERROR'); equal(balance([opening, opening]).state, 'ERROR'); equal(balance([opening, next, transactionRevisionSchema.parse({ ...next, revisionId: id(999) })]).state, 'ERROR'); });
test('foreign account, household, currency or source is not accepted', () => {
  for (const t of [{ ...opening.transaction, accountId: id(999) }, { ...opening.transaction, householdId: id(999) }, { ...opening.transaction, provenance: [{ source: { kind: 'MANUAL', sourceId: id(999) } }] }, { ...opening.transaction, money: { amount: '100', currency: 'USD' }, allocations: opening.transaction.allocations.map((a) => ({ ...a, money: { amount: '100', currency: 'USD' } })) }]) equal(balance([transactionRevisionSchema.parse({ ...opening, transaction: t })]).state, 'ERROR');
});
test('illegal state transitions and date changes rejected', () => {
  const old = revision(2, '-20');
  equal(balance([opening, old, corrected(old, '-20', 'PENDING')]).state, 'ERROR');
  const voided = corrected(old, '-20', 'VOIDED'); equal(balance([opening, old, voided, corrected(voided, '-10')]).state, 'ERROR');
  const next = corrected(old, '-10'); equal(balance([opening, old, transactionRevisionSchema.parse({ ...next, transaction: { ...next.transaction, transactionDate: '2026-10-02' } })]).state, 'ERROR');
});
for (const effect of ['INCOME', 'EXPENSE', 'TRANSFER', 'DEBT_PRINCIPAL', 'INVESTMENT_TRADE', 'ADJUSTMENT', 'UNCLASSIFIED']) {
  test(`effect ${effect} never changes signed movement arithmetic`, () => { equal(amount([opening, revision(2, '-10', { effect }), revision(3, '2', { effect })]), '92'); });
}
test('manual command rejects fabricated timestamps, category and provider data', () => {
  const fields = { transaction: opening.transaction, revisionId: opening.revisionId, supersedesRevisionId: opening.supersedesRevisionId, entryKind: opening.entryKind, openingCoverage: opening.openingCoverage, reason: opening.reason };
  const command = { ...fields, expectedVersion: 0, idempotencyKey: 'synthetic-command-0001' };
  equal(manualTransactionCommandSchema.safeParse(command).success, true);
  for (const change of [{ createdAt: '2026-01-01T00:00:00Z' }, { expectedVersion: 1 }, { transaction: { ...opening.transaction, allocations: opening.transaction.allocations.map((a) => ({ ...a, categoryId: id(8) })) } }, { transaction: { ...opening.transaction, provenance: [{ source: { sourceId: id(3), kind: 'FILE_IMPORT' } }] } }]) equal(manualTransactionCommandSchema.safeParse({ ...command, ...change }).success, false);
});
test('history above the API row cap is summed completely', () => {
  const rows = Array.from({ length: 1001 }, (_, n) => revision(n + 1000, '0.01')); equal(amount([opening, ...rows]), '110.01');
});
