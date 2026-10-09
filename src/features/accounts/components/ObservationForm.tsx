import { useState } from 'react';
import type { AccountRecord, Observation } from '@finance/contracts/valuation';
import { householdToday } from '../model/presentation';

export function ObservationForm({ record, correction, busy, submit }: { record: AccountRecord; correction: Observation | null; busy: boolean; submit: (input: unknown) => Promise<void> }) {
  const [identity] = useState(() => ({ observation: crypto.randomUUID(), fx: crypto.randomUUID(), recordedAt: new Date().toISOString() }));
  const { account, manualSourceId } = record;
  return <form className="identity-form" aria-label="תצפית שווי" onSubmit={(event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const date = correction?.date ?? String(form.get('date'));
    const rate = String(form.get('rate') ?? '');
    void submit({ id: identity.observation, householdId: account.householdId, accountId: account.id, sourceId: manualSourceId,
      date, money: { amount: form.get('amount'), currency: account.currency }, coverage: form.get('coverage'), supersedesId: correction?.id ?? null, note: form.get('note'),
      fx: rate ? { id: identity.fx, base: account.currency, quote: account.valuationCurrency, rate, effectiveDate: date, recordedAt: identity.recordedAt, origin: { sourceId: manualSourceId, kind: 'MANUAL' } } : null });
  }}>
    <h3>{correction ? 'תיקון תצפית קיימת' : 'רישום תצפית שווי'}</h3>
    {correction ? <p>התיקון מתייחס לתאריך {correction.date} ושומר את הרישום הקודם.</p> : <label>תאריך התצפית<input name="date" type="date" min="0001-01-01" max="9999-12-31" required defaultValue={householdToday()} /></label>}
    <label>סכום ב־{account.currency}<input name="amount" inputMode="decimal" dir="ltr" required defaultValue={correction?.money.amount ?? ''} /></label>
    <p>נכסים בערך חיובי; התחייבויות בערך שלילי. אין צורך להפוך את הסימן לפי סוג החשבון.</p>
    <label>כיסוי השווי<select name="coverage" defaultValue={correction?.coverage ?? 'COMPLETE'}><option value="COMPLETE">מלא</option><option value="PARTIAL">חלקי — חסרים רכיבים</option></select></label>
    {account.currency !== account.valuationCurrency && <label>שער ידני לתאריך התצפית: 1 {account.currency} ב־{account.valuationCurrency}<input name="rate" inputMode="decimal" dir="ltr" /><small>אפשר להשאיר ריק. ללא שער לא יחושב שווי במטבע היעד.</small></label>}
    <label>{correction ? 'סיבת התיקון' : 'הערה'}<input name="note" maxLength={500} required={Boolean(correction)} /></label>
    <button disabled={busy}>שמירת תצפית</button>
  </form>;
}
