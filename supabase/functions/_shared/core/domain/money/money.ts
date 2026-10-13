import { moneySchema } from '../../contracts/money.ts';
import type { Money } from '../../contracts/money.ts';
import { currencyMinorUnits } from '../../contracts/currency.ts';
import { add, subtract, multiply, divide, compare, roundDecimal, fixedDecimal } from './decimal.ts';
import type { DecimalString, Rounding } from './decimal.ts';

function pair(left: Money, right: Money): readonly [Money, Money] {
  const a = moneySchema.parse(left);
  const b = moneySchema.parse(right);
  if (a.currency !== b.currency) throw new RangeError('Currency mismatch; explicit conversion required');
  return [a, b];
}
export function addMoney(left: Money, right: Money): Money {
  const [a, b] = pair(left, right);
  return moneySchema.parse({ amount: add(a.amount, b.amount), currency: a.currency });
}
export function subtractMoney(left: Money, right: Money): Money {
  const [a, b] = pair(left, right);
  return moneySchema.parse({ amount: subtract(a.amount, b.amount), currency: a.currency });
}
export function compareMoney(left: Money, right: Money): -1 | 0 | 1 {
  const [a, b] = pair(left, right);
  return compare(a.amount, b.amount);
}
// Factors/divisors are dimensionless decimals, never another Money value.
export function scaleMoney(value: Money, factor: DecimalString, policy?: Rounding): Money {
  const money = moneySchema.parse(value);
  return moneySchema.parse({ amount: multiply(money.amount, factor, policy), currency: money.currency });
}
export function divideMoney(value: Money, divisor: DecimalString, policy?: Rounding): Money {
  const money = moneySchema.parse(value);
  return moneySchema.parse({ amount: divide(money.amount, divisor, policy), currency: money.currency });
}
export function roundMoney(value: Money): Money {
  const money = moneySchema.parse(value);
  return moneySchema.parse({ amount: roundDecimal(money.amount, { scale: currencyMinorUnits[money.currency], mode: 'HALF_UP' }), currency: money.currency });
}
/** Display only. The original posted Money remains unchanged. */
export function displayMoney(value: Money): string {
  const money = moneySchema.parse(value);
  return `${fixedDecimal(money.amount, { scale: currencyMinorUnits[money.currency], mode: 'HALF_UP' })} ${money.currency}`;
}
/** Planning display preserves all authoritative fractional digits and never rounds capacity upward. */
export function displayExactMoney(value: Money): string {
  const money=moneySchema.parse(value), parts=money.amount.split('.'), fraction=parts[1] ?? '';
  const scale=Math.max(currencyMinorUnits[money.currency],fraction.length);
  return `${parts[0]}${scale?`.${fraction.padEnd(scale,'0')}`:''} ${money.currency}`;
}
