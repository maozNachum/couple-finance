import type { AccountId, HouseholdId } from '@finance/contracts/identity';
import type { Money } from '@finance/contracts/money';
import type { DecimalString } from '@finance/domain/money/decimal';
import type { FinancialDate, UtcTimestamp } from '@finance/contracts/financial-date';
import type { Ownership } from '@finance/contracts/ownership';

// Compile-only negative contracts: catches accidental widening to plain strings.
export function checkDistinctTypes(account: AccountId, day: FinancialDate): void {
  // @ts-expect-error account IDs cannot accidentally become household IDs
  const household: HouseholdId = account;
  // @ts-expect-error a financial date is not a UTC instant
  const instant: UtcTimestamp = day;
  // @ts-expect-error callers must validate decimal strings
  const amount: DecimalString = '1.2';
  // @ts-expect-error Money never carries a native numeric amount
  const money: Money = { amount: 1.2, currency: 'ILS' };
  // @ts-expect-error member attribution requires a relational identifier
  const owner: Ownership = { kind: 'MEMBER' };
  void [household, instant, amount, money, owner];
}
