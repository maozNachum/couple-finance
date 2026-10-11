import type { ReportingEffect } from '@finance/contracts/allocation';
export const effects: Record<ReportingEffect, string> = { INCOME: 'הכנסה', EXPENSE: 'הוצאה / החזר הוצאה', TRANSFER: 'העברה פנימית / הפקדה להשקעה', INVESTMENT_TRADE: 'מסחר בהשקעות', DEBT_PRINCIPAL: 'קרן הלוואה / חוב', ADJUSTMENT: 'התאמה', UNCLASSIFIED: 'לא מסווג' };
export const statuses = { PENDING: 'ממתינה', POSTED: 'נרשמה', VOIDED: 'בוטלה' } as const;
export function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
