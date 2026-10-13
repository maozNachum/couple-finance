import type { ReconciliationKind, ReconciliationMeaning } from '@finance/contracts/reconciliation';
import type { ReportingEffect } from '@finance/contracts/allocation';
export const financialEffects:Record<ReportingEffect,string>={INCOME:'הכנסה',EXPENSE:'הוצאה / החזר הוצאה',TRANSFER:'העברה',INVESTMENT_TRADE:'עסקת השקעה',DEBT_PRINCIPAL:'קרן חוב',ADJUSTMENT:'התאמה',UNCLASSIFIED:'טרם הוגדרה'};
export const kinds: Record<ReconciliationKind,string>={TRANSFER:'העברה בין חשבונות',CARD:'סילוק כרטיס אשראי',LOAN:'החזר הלוואה'};
export const meanings:Record<ReconciliationMeaning,string>={TRANSFER:'העברה — ללא צריכה נוספת',PURCHASE:'רכישה או החזר רכישה',PRINCIPAL:'קרן הלוואה',INTEREST:'ריבית — הוצאה',FEE:'עמלה מפורשת — הוצאה'};
export const states={EXACT:'הסכומים שנבחרו תואמים — הקשר דורש אישור מפורש',PARTIAL:'התאמה חלקית — הראיות חסרות או שנותר הפרש',NEEDS_CORRECTION:'המשמעות הכספית דורשת תיקון נפרד',MISSING_FX:'חסרה ראיית שער היסטורי בכיוון ובתאריך המתאימים'};
export const confirmedStates={EXACT:'קשר מאושר — הסכומים שנבחרו תואמים',PARTIAL:'קשר מאושר חלקית — הראיות חסרות או שנותר הפרש',NEEDS_CORRECTION:'הקשר אושר בלבד — המשמעות הכספית עדיין דורשת תיקון נפרד'};
export const actions={LINK:'אישור קשר',REPLACE:'החלפת החלטה',UNLINK:'הסרת קשר'};
export const reasons:Record<string,string>={EXPLICIT_EFFECT:'לחלוקות כבר קיימת משמעות העברה או קרן',SOURCE_REFERENCE:'הפניית מקור זהה — עדיין אינה הוכחת זהות',EXACT_AMOUNT:'סכום ומטבע זהים — דמיון בלבד',DATE_WINDOW:'מרחק התאריכים עד שבעה ימים',MISSING_FX:'מטבעות שונים — נדרש שער היסטורי מפורש'};
