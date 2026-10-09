import type { AccountType } from '@finance/contracts/account';
import { safeErrorSchema } from '@finance/contracts/safe-error';

export const accountTypes: Record<AccountType, string> = {
  BANK: 'בנק', CREDIT_CARD: 'כרטיס אשראי', CASH: 'מזומן', SAVINGS: 'חיסכון', INVESTMENT: 'השקעות',
  PENSION: 'פנסיה', PROVIDENT_FUND: 'קופת גמל', DEPOSIT: 'פיקדון', LOAN: 'הלוואה', OTHER_ASSET: 'נכס אחר', OTHER_LIABILITY: 'התחייבות אחרת',
};
export function commandMessage(error: unknown) {
  const parsed = safeErrorSchema.safeParse(error);
  if (parsed.success && parsed.data.code === 'INVALID_INPUT') return 'בדקו את השדות, התאריך, המטבע והדיוק של הסכום.';
  if (parsed.success && parsed.data.code === 'CONFLICT') return 'הנתונים השתנו או שכבר נרשמה תצפית לתאריך זה. רעננו לפני ניסיון נוסף.';
  if (parsed.success && parsed.data.code === 'NOT_AUTHORIZED') return 'אין הרשאה לפעולה. התחברו מחדש.';
  return 'לא ניתן להשלים את הבקשה. רעננו ונסו שוב.';
}
export function householdToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (name: string) => parts.find((item) => item.type === name)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
