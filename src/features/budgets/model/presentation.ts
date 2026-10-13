import { budgetReport } from '@finance/domain/budgets';
import type { BudgetSnapshot, BudgetScope } from '@finance/contracts/budgets';
import { reportingRequestSchema } from '@finance/contracts/reporting';
import { monthBoundaries } from '@finance/domain/dates/financial-date';
import { financialMonthSchema } from '@finance/contracts/financial-date';
import { displayMoney } from '@finance/domain/money/money';
import type { Money } from '@finance/contracts/money';

export const moneyText=(m:Money|null)=>m?displayMoney(m):'לא ידוע';
export const stateText={ARCHIVED:'תוכנית בארכיון',INCOMPLETE:'השוואה לא מלאה',OVER:'חריגה מהתכנון',WITHIN:'בתוך התכנון לפי הראיות הרשומות'};
export const issueText:Readonly<Record<string,string>>={
  INCOMPLETE_LEDGER_PERIOD:'חסר כיסוי מלא מתחילת החודש.',UNCLASSIFIED:'קיימות תנועות שמשמעותן הפיננסית טרם הוכרעה.',
  MISSING_FX:'חסר שער היסטורי בתאריך ההוצאה.',AMBIGUOUS_FX:'קיימים שערים היסטוריים מתחרים.',
  UNCATEGORIZED_SCOPE:'הוצאות ללא קטגוריה אינן משויכות אוטומטית לתוכנית זו.',ARCHIVED_CURRENCY:'תוכנית ישנה במטבע אחר; אין השוואה בין מטבעות.',
  RECONCILIATION_STALE:'תנועות השתנו מאז ההתאמה.',RECONCILIATION_PARTIAL:'ראיות ההתאמה חלקיות.',
  RECONCILIATION_NEEDS_CORRECTION:'נדרש תיקון מפורש של המשמעות הפיננסית.',RECONCILIATION_MISSING_FX:'חסר שער לבדיקת ההתאמה.',
  CARD_DOUBLE_CONSUMPTION:'תשלום כרטיס עדיין מסומן כהוצאה ועלול לספור צריכה פעמיים. הסכום נכלל עד לתיקון מפורש.',
};
export function scopeText(scope:BudgetScope,snapshot:BudgetSnapshot) {
  const owner=scope.kind==='TOTAL'?'יעד כולל לבית':scope.kind==='ALL'?'כל הבית':scope.kind==='SHARED'?'הוצאות משותפות בלבד':snapshot.reporting.members.find(m=>m.id===scope.memberId)?.displayName??'חבר בית';
  const category=snapshot.categories.find(c=>c.id===scope.categoryId);
  return category?`${owner} — ${category.name}${category.status==='ARCHIVED'?' (קטגוריה בארכיון)':''}`:owner;
}
export function buildBudgetReport(snapshot:BudgetSnapshot,householdId:string,month:string,currency:string) {
  try { return {report:budgetReport(snapshot,reportingRequestSchema.parse({householdId,month,currency,asOf:monthBoundaries(financialMonthSchema.parse(month)).start})),error:false}; }
  catch { return {report:null,error:true}; }
}
