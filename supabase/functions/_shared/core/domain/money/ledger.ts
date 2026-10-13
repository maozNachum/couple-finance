import { accountRecordSchema } from '../../contracts/valuation.ts';
import type { AccountRecord } from '../../contracts/valuation.ts';
import { transactionRevisionsSchema } from '../../contracts/ledger.ts';
import type { TransactionRevision } from '../../contracts/ledger.ts';
import { financialDateSchema, utcTimestampSchema } from '../../contracts/financial-date.ts';
import { moneySchema } from '../../contracts/money.ts';
import type { Money } from '../../contracts/money.ts';
import { add, decimal, sumDecimals } from './decimal.ts';

export type LedgerPosition =
  | { readonly state: 'UNKNOWN'; readonly reason: 'NO_OPENING' | 'BEFORE_OPENING' }
  | { readonly state: 'ERROR' }
  | { readonly state: 'NOT_LEDGER' }
  | { readonly state: 'KNOWN' | 'INCOMPLETE'; readonly money: Money; readonly openingDate: string; readonly postedCount: number };

export function timestampOrder(value: string): string {
  return utcTimestampSchema.parse(value).replace(/(?:\.(\d{1,6}))?Z$/, (_match: string, fraction: string | undefined) => `.${(fraction ?? '').padEnd(6, '0')}Z`);
}

/** Validate the complete revision graph before selecting current knowledge. */
export function currentTransactions(record: AccountRecord, input: readonly TransactionRevision[]): readonly TransactionRevision[] {
  const { account } = accountRecordSchema.parse(record);
  if (input.length > 100000) throw new RangeError('History limit');
  const history = transactionRevisionsSchema.parse(input);
  const byId = new Map(history.map((r) => [r.revisionId, r]));
  const successors = new Set<string>();
  const roots = new Set<string>();
  if (byId.size !== history.length) throw new RangeError('Duplicate revision');
  for (const r of history) {
    const t = r.transaction;
    if (t.accountId !== account.id || t.householdId !== account.householdId || t.money.currency !== account.currency || !record.sources.some(s=>s.id===t.provenance[0]?.source.sourceId && s.kind===t.provenance[0]?.source.kind)) throw new RangeError('Invalid context');
    if (r.supersedesRevisionId === null) {
      if (roots.has(t.id)) throw new RangeError('Duplicate identity');
      roots.add(t.id);
      if (r.createdAt !== r.recordedAt) throw new RangeError('Invalid creation time');
    } else {
      const old = byId.get(r.supersedesRevisionId);
      if (!old || successors.has(old.revisionId) || old.transaction.id !== t.id || old.version + 1 !== r.version ||
        JSON.stringify(old.transaction.provenance) !== JSON.stringify(t.provenance) || old.entryKind !== r.entryKind || old.transaction.transactionDate !== t.transactionDate ||
        old.transaction.valueDate !== t.valueDate || old.createdAt !== r.createdAt || timestampOrder(old.recordedAt) > timestampOrder(r.recordedAt) ||
        (old.transaction.status === 'VOIDED' && old.entryKind !== 'OPENING') || (old.transaction.status === 'POSTED' && t.status === 'PENDING')) throw new RangeError('Invalid revision chain');
      successors.add(old.revisionId);
    }
  }
  // Strictly increasing versions and a predecessor for every non-root exclude cycles/gaps.
  return history.filter((r) => !successors.has(r.revisionId));
}

/** Opening is start-of-day; cutoff inclusive. Archived histories remain readable.
 * No observation fallback, no FX selection and no assumed zero for missing data. */
export function ledgerBalance(record: AccountRecord, input: readonly TransactionRevision[], asOf: string): LedgerPosition {
  try {
    const { account } = accountRecordSchema.parse(record);
    const cutoff = financialDateSchema.parse(asOf);
    if (account.balancePolicy !== 'LEDGER') return { state: 'NOT_LEDGER' };
    const current = currentTransactions(record, input);
    const openings = current.filter((r) => r.entryKind === 'OPENING');
    if (openings.length > 1) return { state: 'ERROR' };
    const opening = openings[0];
    if (!opening || opening.transaction.status !== 'POSTED') return { state: 'UNKNOWN', reason: 'NO_OPENING' };
    const start = opening.transaction.transactionDate;
    if (current.some((r) => r.transaction.transactionDate < start)) return { state: 'ERROR' };
    if (cutoff < start) return { state: 'UNKNOWN', reason: 'BEFORE_OPENING' };
    const posted = current.filter((r) => r.transaction.status === 'POSTED' && r.transaction.transactionDate <= cutoff);
    let total = decimal('0');
    // Reuse the bounded Task 2 sum, keeping intermediate values decimal strings.
    for (let offset = 0; offset < posted.length; offset += 1000) {
      total = add(total, sumDecimals(posted.slice(offset, offset + 1000).map((r) => r.transaction.money.amount)));
    }
    return { state: opening.openingCoverage === 'COMPLETE' ? 'KNOWN' : 'INCOMPLETE', money: moneySchema.parse({ amount: total, currency: account.currency }), openingDate: start, postedCount: posted.length };
  } catch { return { state: 'ERROR' }; }
}
