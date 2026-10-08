import { Decimal } from 'decimal.js';
import { z } from 'zod';

// Operands have at most 30 digits. 80 keeps bounded sums/products exact and
// leaves guard digits for division; no library instance escapes this module.
const Arithmetic = Decimal.clone({ precision: 80, rounding: Decimal.ROUND_HALF_UP });
export const decimalLimits = Object.freeze({ integerDigits: 18, scale: 12 });
const syntax = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function fitsDecimal(value: string, integerDigits: number, scale: number): boolean {
  if (value.trim() !== value || !syntax.test(value)) return false;
  const [integer = '', fraction = ''] = value.replace(/^-/, '').split('.');
  return integer.length <= integerDigits && fraction.length <= scale;
}

function canonical(value: string): string {
  const trimmed = value.includes('.') ? value.replace(/0+$/, '').replace(/\.$/, '') : value;
  return trimmed === '-0' ? '0' : trimmed;
}

export const decimalStringSchema = z.string().max(32)
  .refine((value) => fitsDecimal(value, 18, 12), 'Expected a decimal with at most 18 integer and 12 fractional digits')
  .transform(canonical).brand<'DecimalString'>();
export type DecimalString = z.infer<typeof decimalStringSchema>;
export const decimal = (value: unknown): DecimalString => decimalStringSchema.parse(value);

export const roundingSchema = z.strictObject({
  scale: z.number().int().min(0).max(12),
  mode: z.literal('HALF_UP'),
});
export type Rounding = z.infer<typeof roundingSchema>;

function operand(value: DecimalString): Decimal { return new Arithmetic(decimal(value)); }
function result(value: Decimal): DecimalString {
  if (!value.isFinite()) throw new RangeError('Non-finite decimal result');
  const wire = value.isZero() ? '0' : value.toFixed();
  if (!fitsDecimal(wire, 18, 12)) throw new RangeError('Decimal overflow or excessive precision; explicit rounding required');
  return decimal(wire);
}
function rounded(value: Decimal, policy: Rounding): Decimal {
  const { scale } = roundingSchema.parse(policy);
  return value.toDecimalPlaces(scale, Arithmetic.ROUND_HALF_UP);
}

export function add(a: DecimalString, b: DecimalString): DecimalString { return result(operand(a).plus(operand(b))); }
export function subtract(a: DecimalString, b: DecimalString): DecimalString { return result(operand(a).minus(operand(b))); }
/** Bound the input count and validate only the final sum, allowing cancellation. */
export function sumDecimals(values: readonly DecimalString[]): DecimalString {
  if (values.length > 1000) throw new RangeError('Too many decimal terms');
  return result(values.reduce((total, value) => total.plus(operand(value)), new Arithmetic('0')));
}
export function multiply(a: DecimalString, b: DecimalString, policy?: Rounding): DecimalString {
  const product = operand(a).times(operand(b));
  return result(policy === undefined ? product : rounded(product, policy));
}
export function divide(a: DecimalString, b: DecimalString, policy?: Rounding): DecimalString {
  const numerator = operand(a);
  const denominator = operand(b);
  if (denominator.isZero()) throw new RangeError('Division by zero');
  const quotient = numerator.dividedBy(denominator);
  if (policy !== undefined) return result(rounded(quotient, policy));
  const exact = result(quotient);
  if (!operand(exact).times(denominator).equals(numerator)) throw new RangeError('Division requires explicit rounding');
  return exact;
}
export function compare(a: DecimalString, b: DecimalString): -1 | 0 | 1 {
  const order = operand(a).comparedTo(operand(b));
  return order === 0 ? 0 : order < 0 ? -1 : 1;
}
export function absolute(value: DecimalString): DecimalString { return result(operand(value).abs()); }
export function negate(value: DecimalString): DecimalString { return result(operand(value).negated()); }
export function isZero(value: DecimalString): boolean { return operand(value).isZero(); }
export function isPositive(value: DecimalString): boolean { return compare(value, decimal('0')) > 0; }
export function isNegative(value: DecimalString): boolean { return compare(value, decimal('0')) < 0; }
export function roundDecimal(value: DecimalString, policy: Rounding): DecimalString { return result(rounded(operand(value), policy)); }
export function fixedDecimal(value: DecimalString, policy: Rounding): string {
  const checked = roundingSchema.parse(policy);
  const output = roundDecimal(value, checked);
  return operand(output).toFixed(checked.scale);
}
