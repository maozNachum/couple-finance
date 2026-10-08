// Gregorian integer calendar arithmetic only. No instant, timezone or clock.
export function isLeapYear(year: number): boolean {
  if (!Number.isInteger(year) || year < 1 || year > 9999) throw new RangeError('Invalid calendar year');
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
export function daysInMonth(year: number, month: number): number {
  const leap = isLeapYear(year);
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new RangeError('Invalid calendar month');
  if (month === 2) return leap ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
export function isFinancialDate(value: string): boolean {
  if (value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}
