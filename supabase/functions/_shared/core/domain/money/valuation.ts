import { accountRecordSchema, observationsSchema } from '../../contracts/valuation.ts';
import type { AccountRecord, Observation } from '../../contracts/valuation.ts';
import { financialDateSchema } from '../../contracts/financial-date.ts';
import type { FinancialDate } from '../../contracts/financial-date.ts';
import { convertMoney } from './fx.ts';

/** Effective-date view of currently corrected knowledge, not a recorded-time report. */
export function valueAccount(record: AccountRecord, history: readonly Observation[], asOf: FinancialDate) {
  const { account, manualSourceId } = accountRecordSchema.parse(record);
  const date = financialDateSchema.parse(asOf);
  const rows = observationsSchema.parse(history);
  if (account.balancePolicy === 'LEDGER') return { state: 'LEDGER_UNAVAILABLE' as const };
  const own = rows.filter((row) => row.householdId === account.householdId && row.accountId === account.id);
  for (const row of own) {
    if (row.money.currency !== account.currency || row.sourceId !== manualSourceId) throw new RangeError('Observation context mismatch');
  }
  const superseded = new Set(own.map((row) => row.supersedesId));
  const candidates = own.filter((row) => row.date <= date && !superseded.has(row.id)).sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  const observation = candidates[0];
  if (!observation) return { state: 'MISSING' as const };
  if (candidates[1]?.date === observation.date) throw new RangeError('Ambiguous observation');
  if (account.currency === account.valuationCurrency) {
    if (observation.fx !== null) throw new RangeError('Unexpected FX');
    return { state: 'VALUED' as const, observation, money: observation.money };
  }
  if (!observation.fx) return { state: 'MISSING_FX' as const, observation };
  if (observation.fx.origin.kind !== 'MANUAL' || observation.fx.origin.sourceId !== observation.sourceId) throw new RangeError('FX origin mismatch');
  return { state: 'VALUED' as const, observation, money: convertMoney(observation.money, account.valuationCurrency, observation.date, observation.fx, { scale: 8, mode: 'HALF_UP' }) };
}
