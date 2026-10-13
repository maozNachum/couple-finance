import type { Money } from '@finance/contracts/money';
import { displayMoney } from '@finance/domain/money/money';
import { householdReport } from '@finance/domain/reporting';
import { reportingRequestSchema } from '@finance/contracts/reporting';
import type { ReportingSnapshot } from '@finance/contracts/reporting';

export const moneyText = (money: Money | null) => money ? displayMoney(money) : 'לא זמין';
export const coverageText = { COMPLETE:'מלא לפי הראיות הרשומות', PARTIAL:'חלקי — נדרשות ראיות נוספות', UNKNOWN:'לא ידוע', UNAVAILABLE:'לא זמין' };
export const reconciliationText = {EXACT:'תואם לפי ההקצאות הנוכחיות',PARTIAL:'התאמה חלקית',NEEDS_CORRECTION:'נדרש תיקון פיננסי',STALE:'נדרשת בדיקה מחדש לאחר שינוי',MISSING_FX:'חסר שער להתאמה'};
export const meaningText = {TRANSFER:'העברה',PURCHASE:'רכישה או החזר',PRINCIPAL:'קרן חוב',INTEREST:'ריבית',FEE:'עמלה'};
export const warningText: Readonly<Record<string,string>> = {
  NO_OPENING:'חסרה יתרת פתיחה.', BEFORE_OPENING:'התאריך קודם ליתרת הפתיחה.', PARTIAL_OPENING:'כיסוי יתרת הפתיחה חלקי.',
  MISSING_OBSERVATION:'חסרה תצפית מהמקור המוסמך לתאריך המבוקש.', PARTIAL_OBSERVATION:'תצפית השווי מכסה רק חלק מהחשבון.',
  CARRIED_OBSERVATION:'השווי מבוסס על מדידה מוקדמת יותר; אין מדידה מלאה לתאריך המבוקש.',
  MISSING_FX:'חסרה ראיית שער בכיוון ובתאריך הנדרשים.', AMBIGUOUS_FX:'קיימות כמה ראיות שער מתחרות; ההמרה אינה זמינה.',
  ARCHIVED_HISTORY:'חשבון בארכיון נכלל בשווי. טרם נשמר תאריך סגירה פיננסי.',
  INCOMPLETE_LEDGER_PERIOD:'חסר כיסוי מלא מתחילת החודש.', UNCLASSIFIED:'לתנועה אין משמעות פיננסית מוכרעת.',
  UNLINKED_EVIDENCE:'תנועה מסומנת כהעברה או קרן חוב ללא התאמה מפורשת. לא הומצאה תנועה נגדית.',
  RECONCILIATION_STALE:'תנועות השתנו מאז ההתאמה; נדרשת בדיקה מחדש.',
  RECONCILIATION_PARTIAL:'ראיות ההתאמה חלקיות או שסכומים אינם תואמים.',
  RECONCILIATION_NEEDS_CORRECTION:'משמעות ההקצאות אינה תואמת את ההתאמה. נדרש תיקון מפורש.',
  RECONCILIATION_MISSING_FX:'חסר שער להערכת ההתאמה.', CARD_DOUBLE_CONSUMPTION:'תשלום כרטיס עדיין מסומן כהוצאה ועלול לספור צריכה פעמיים. הסכום נשמר בדוח עד לתיקון מפורש.',
};
export function buildReport(snapshot: ReportingSnapshot, householdId: string, asOf: string, month: string, currency: string) {
  try { return {report:householdReport(snapshot,reportingRequestSchema.parse({householdId,asOf,month,currency})),error:false}; }
  catch { return {report:null,error:true}; }
}
