import { recurringCandidates, expectedObligations, obligationContext } from '@finance/domain/obligations';
import type { ObligationsSnapshot } from '@finance/contracts/obligations';
import { financialDateSchema } from '@finance/contracts/financial-date';
import { monthOf, firstDayOfMonth, lastDayOfMonth } from '@finance/domain/dates/financial-date';

export function currentPeriod() {
  const today=financialDateSchema.parse(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
  return {from:firstDayOfMonth(monthOf(today)),to:lastDayOfMonth(monthOf(today))};
}
export function buildObligations(snapshot: ObligationsSnapshot, household: string, from: string, to: string) {
  try {return {error:false,context:obligationContext(snapshot),analysis:recurringCandidates(snapshot,household),events:expectedObligations(snapshot,household,from,to)};}
  catch {return {error:true,context:null,analysis:null,events:[]};}
}
export const issueText: Readonly<Record<string,string>> = {
  EXTERNAL_COVERAGE_UNKNOWN:'הכיסוי מבוסס על הראיות הרשומות בלבד; ייתכן שחסרה היסטוריה חיצונית.',
  DESCRIPTION_IDENTITY_UNVERIFIED:'תיאור זהה אינו מוכיח שמדובר באותה התחייבות או בחוזה.',
  VARIABLE_AMOUNT:'הסכומים משתנים; אין סכום קבוע שהוכח.',MULTIPLE_IN_MONTH:'יותר מתנועה אחת באותו חודש; ייתכן שמדובר בתשלומים שונים.',
  MISSING_MONTHS:'יש חודשים חסרים; אין להסיק שתשלום הוחמץ.',AMBIGUOUS_DAY:'מספר ימי חיוב אפשריים מתאימים לראיות.',
  IRREGULAR_DATES:'התאריכים אינם מתאימים ליום חודשי קבוע.',INCOMPLETE_HISTORY:'חסר כיסוי מלא של היסטוריית החשבון.',
  UNCLASSIFIED:'קיימות תנועות שמשמעותן הפיננסית טרם הוכרעה.',REFUNDS_EXCLUDED:'החזרים הוצגו כמשמעות נפרדת ולא כהתחייבות הוצאה.',
  CARD_SETTLEMENT_EXCLUDED:'סילוק כרטיס הוחרג כדי למנוע ספירה כפולה של הרכישות.',RECONCILIATION_UNRESOLVED:'קיימות התאמות חלקיות או ראיות שהשתנו.',
  ARCHIVED_ACCOUNT:'חשבונות בארכיון אינם מקור להצעות חדשות.',CANDIDATE_EVIDENCE_BOUND:'קבוצה חורגת ממאה הופעות; נדרשת בדיקה נפרדת.',
};
export const eventState = {UNRESOLVED:'ללא שיוך מפורש — מצב התשלום לא ידוע',ASSOCIATED:'ראיית תשלום שויכה במפורש',PARTIAL:'ראיית תשלום חלקית — לא הושלם',AMBIGUOUS:'סכום שונה — נדרש בירור',STALE:'ראיית התשלום השתנתה — נדרש שיוך מחדש',UNLINKED:'השיוך בוטל'};
