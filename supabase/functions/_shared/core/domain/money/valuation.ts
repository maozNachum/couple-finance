import { accountRecordSchema, observationsSchema } from '../../contracts/valuation.ts';
import type { AccountRecord, Observation } from '../../contracts/valuation.ts';
import { financialDateSchema } from '../../contracts/financial-date.ts';
import type { FinancialDate } from '../../contracts/financial-date.ts';
import { convertMoney } from './fx.ts';

/** Authoritative balance as of a date, with historical observation FX only.
 * Reporting-date FX selection belongs to a future application use case.
 */
export function valueAccount(record: AccountRecord, history: readonly Observation[], asOf: FinancialDate) {
  const { account, sources } = accountRecordSchema.parse(record);
  const date = financialDateSchema.parse(asOf);
  const rows = observationsSchema.parse(history);
  if (account.balancePolicy === 'LEDGER') return { state: 'LEDGER_UNAVAILABLE' as const };
  const own = rows.filter((row) => row.householdId === account.householdId && row.accountId === account.id);
  for (const row of own) {
    if (row.money.currency !== account.currency || !sources.some((s) => s.id === row.sourceId)) throw new RangeError('Observation context mismatch');
  }
  const byId = new Map(own.map((row) => [row.id, row]));
  const successors = new Set<string>();
  if (byId.size !== own.length) throw new RangeError('Duplicate observation');
  for (const row of own) {
    if (row.supersedesId === null) continue;
    const previous = byId.get(row.supersedesId);
    if (!previous || previous.sourceId !== row.sourceId || previous.date !== row.date || successors.has(previous.id)) throw new RangeError('Invalid correction lineage');
    successors.add(previous.id);
    const visited = new Set<string>([row.id]);
    let ancestor: Observation | undefined = previous;
    while (ancestor) {
      if (visited.has(ancestor.id)) throw new RangeError('Cyclic correction lineage');
      visited.add(ancestor.id);
      ancestor = ancestor.supersedesId === null ? undefined : byId.get(ancestor.supersedesId);
    }
  }
  const authority = sources.filter((s) => s.authoritativeFrom !== null && s.authoritativeFrom <= date)
    .sort((a, b) => a.authoritativeFrom! < b.authoritativeFrom! ? 1 : -1)[0];
  if (!authority) return { state: 'MISSING' as const };
  const superseded = new Set(own.map((row) => row.supersedesId));
  const candidates = own.filter((row) => row.sourceId === authority.id && row.date >= authority.authoritativeFrom! && row.date <= date && !superseded.has(row.id)).sort((a, b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  const observation = candidates[0];
  if (!observation) return { state: 'MISSING' as const };
  if (candidates[1]?.date === observation.date) throw new RangeError('Ambiguous observation');
  if (account.currency === account.valuationCurrency) {
    if (observation.fx !== null) throw new RangeError('Unexpected FX');
    return { state: 'VALUED' as const, basis: 'HISTORICAL_OBSERVATION' as const, observation, money: observation.money };
  }
  if (!observation.fx) return { state: 'MISSING_FX' as const, observation };
  return { state: 'VALUED' as const, basis: 'HISTORICAL_OBSERVATION' as const, observation, money: convertMoney(observation.money, account.valuationCurrency, observation.date, observation.fx, { scale: 8, mode: 'HALF_UP' }) };
}
