import { financialDateSchema } from '@finance/contracts/financial-date';
export function currentDay() {
  return financialDateSchema.parse(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
}
export const coverageText = {COMPLETE:'מודל מלא לפי הרשומות',PARTIAL:'תחזית חלקית בלבד',UNKNOWN:'יתרת הפתיחה אינה ידועה',UNAVAILABLE:'לא ניתן לחשב תחזית'};
export const diagnosticText: Readonly<Record<string,string>> = {
  ACCESSIBILITY_UNRESOLVED:'נדרשת בחירה מפורשת אם כספי החשבון זמינים מיד.',
  ARCHIVED_LIQUID_POSITION:'לחשבון בארכיון חסרה ראיית סגירה מתוארכת. נדרשת בדיקת יתרה.',
  UNKNOWN_BALANCE:'יתרת החשבון אינה ידועה.',MISSING_OPENING:'חסרה יתרת פתיחה.',PARTIAL_OPENING:'כיסוי יתרת הפתיחה חלקי.',
  NO_OPENING:'חסרה יתרת פתיחה רשומה.',BEFORE_OPENING:'תאריך התחזית קודם ליתרת הפתיחה.',
  MISSING_OBSERVATION:'חסרה תצפית ממקור היתרה המוסמך.',CARRIED_OBSERVATION:'התצפית ישנה מתאריך התחזית. היא אינה כסף נוכחי מאומת.',
  PARTIAL_OBSERVATION:'התצפית מכסה חלק מהיתרה בלבד.',MISSING_FX:'חסר שער היסטורי לתאריך הערכת היתרה.',AMBIGUOUS_FX:'קיימים שערים היסטוריים מתחרים.',
  CARD_CASH_TIMING_UNKNOWN:'לא קיים במודל מועד עתידי מאושר לסילוק הכרטיס מהבנק. אין להסיק אותו ממועד הרכישה.',
  LOAN_CASH_TIMING_UNKNOWN:'לחשיפת ההלוואה אין לוח תשלומי מזומן עתידיים מאושר. אין להסיק אותו מתנועות קודמות.',
  RECONCILIATION_UNRESOLVED:'התאמת תנועות חלקית, שגויה או מיושנת דורשת בדיקה.',UNCLASSIFIED:'קיימת משמעות פיננסית לא מסווגת.',
  PENDING_CASH_TIMING:'תנועה ממתינה אינה תשלום רשום; תזמון יציאת הכסף אינו מוכרע.',
  OBSERVED_FUTURE_MOVEMENT:'תנועה עתידית אינה יכולה להחליף תצפית יתרה מוסמכת.',
  FUTURE_FX_UNKNOWN:'חשיפה עתידית במטבע אחר מוצגת במטבע המקורי; אין שער עתידי מאושר.',
  STARTING_CURRENCY_EXPOSURE:'יתרה במטבע אחר הוערכה היסטורית, אך אינה מזומן במטבע ההוצאה. חשיפת המטבע מונעת סכום פנוי מלא.',
  UNLINKED_FUTURE_EXPENSE:'תשלום עתידי רשום ללא שיוך מפורש עלול לחפוף להתחייבות. נדרשת בדיקה.',
  OBLIGATION_OVERLAP_UNRESOLVED:'קיימת ראיית תשלום שייתכן שכבר מכסה התחייבות ללא שיוך מפורש. אין לגרוע את שניהם או להסיק שלא שולם.',
  CASH_VALUE_DATE_CONFLICT:'תאריך הערך שונה מתאריך התנועה. תזמון זמינות המזומן לא הוכרע.',
  FUTURE_INCOME_UNSUPPORTED:'הכנסה בתאריך עתידי אינה הכנסה שהתקבלה או קלט תכנון מאושר; אינה מגדילה את הסכום הפנוי.',
  FUTURE_INFLOW_UNCONFIRMED:'תנועה חיובית בתאריך עתידי אינה כסף שהתקבל. ללא קלט תכנון נתמך היא אינה מגדילה את הסכום הפנוי.',
  OBLIGATION_CASH_TIMING_UNKNOWN:'התחייבות בחשבון שאינו נכלל במזומן אינה מוכיחה את מועד התשלום מחשבון נזיל.',
  PAYMENT_PARTIAL:'שיוך חלקי אינו מסלק את מלוא ההתחייבות.',PAYMENT_AMBIGUOUS:'סכום התשלום המשויך אינו תואם.',PAYMENT_STALE:'ראיית התשלום המשויך השתנתה.',
  PAYMENT_OUTSIDE_CASH_WINDOW:'מועד התשלום המשויך נמצא מחוץ לחלון המזומן.',PAYMENT_BALANCE_UNCERTAIN:'לא ניתן להוכיח שהתשלום כבר משתקף ביתרת הפתיחה.',
  PAYMENT_CASH_TIMING_UNKNOWN:'תזמון המזומן של התשלום המשויך אינו מוכרע.',BASELINE_OBLIGATION_UNRESOLVED:'התחייבות בתאריך יתרת הפתיחה אינה משויכת לתשלום. אין להסיק ששולמה או שהיא חוב בפיגור.',
  COMPUTATION_UNAVAILABLE:'הנתונים אינם תקינים, חסרים או חורגים מגבולות החישוב. אין תוצאה כספית מאומתת.',
  FUTURE_BASELINE_UNSUPPORTED:'לא ניתן לטעון יתרת פתיחה ידועה בתאריך עתידי. בחרו תאריך עד בסיס הראיות.',
};
export const eventText = {PROJECTED:'תזרים צפוי במודל',REFLECTED:'ראיית התשלום כבר משתקפת ביתרת הפתיחה',ACTUAL_REPLACES_PLAN:'התנועה הרשומה מחליפה את התכנון ונכללת פעם אחת',UNRESOLVED:'תזמון או סכום מזומן לא מוכרע'};
