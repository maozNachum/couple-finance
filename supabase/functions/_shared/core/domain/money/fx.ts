import { fxRateSchema } from '../../contracts/fx.ts';
import type { FxRate } from '../../contracts/fx.ts';
import { moneySchema } from '../../contracts/money.ts';
import type { Money } from '../../contracts/money.ts';
import { currencyCodeSchema } from '../../contracts/currency.ts';
import type { CurrencyCode } from '../../contracts/currency.ts';
import { financialDateSchema } from '../../contracts/financial-date.ts';
import type { FinancialDate } from '../../contracts/financial-date.ts';
import { multiply } from './decimal.ts';
import type { Rounding } from './decimal.ts';

/** No lookup, inversion or stale-rate fallback. Callers choose a dated record. */
export function convertMoney(value: Money, target: CurrencyCode, valuationDate: FinancialDate, rate: FxRate, policy?: Rounding): Money {
  const money = moneySchema.parse(value);
  const fx = fxRateSchema.parse(rate);
  if (money.currency !== fx.base || currencyCodeSchema.parse(target) !== fx.quote) throw new RangeError('FX direction mismatch');
  if (financialDateSchema.parse(valuationDate) !== fx.effectiveDate) throw new RangeError('FX effective date mismatch');
  return moneySchema.parse({ amount: multiply(money.amount, fx.rate, policy), currency: fx.quote });
}
