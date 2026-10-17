import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DataQualitySnapshot, QualityFinding } from '@finance/contracts/data-quality';
import { manualFxCommandSchema } from '@finance/contracts/fx';
import type { ManualFxCommand } from '@finance/contracts/fx';
import { safeErrorSchema } from '@finance/contracts/safe-error';
import { recordManualFx } from '../api/manual-fx';

export function HistoricalFxEvidence({ finding, snapshot, refresh, unauthorized }: {
  finding: QualityFinding; snapshot: DataQualitySnapshot; refresh: () => void; unauthorized: () => void;
}) {
  const live = useRef(true);
  const [pending, setPending] = useState<ManualFxCommand | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const [base, quote, date] = finding.subject.id.split('/');
  const r = snapshot.obligations.reporting;
  const rates = r.rates.filter(e => e.householdId === finding.householdId);
  const eligible = rates.filter(e => e.rate.base === base && e.rate.quote === quote && e.rate.effectiveDate === date);
  const others = rates.filter(e => !eligible.includes(e) && (e.rate.base === base && e.rate.quote === quote || e.rate.base === quote && e.rate.quote === base));
  const sources = r.accounts.filter(a => a.account.householdId === finding.householdId && a.account.status === 'ACTIVE' && a.account.currency === base && a.account.valuationCurrency === quote);
  const revisionIds = new Set(finding.evidence.filter(e => e.kind === 'REVISION').map(e => e.id));
  const accountIds = new Set(finding.evidence.filter(e => e.kind === 'ACCOUNT').map(e => e.id));
  for (const v of r.history) if (revisionIds.has(v.revisionId)) accountIds.add(v.transaction.accountId);
  const affected = r.accounts.filter(a => accountIds.has(a.account.id));
  async function send(command: ManualFxCommand) {
    setPending(command); setBusy(true); setMessage('');
    try {
      await recordManualFx(command);
      if (live.current) refresh();
    } catch (error) {
      if (!live.current) return;
      const safe = safeErrorSchema.safeParse(error);
      if (safe.success && safe.data.code === 'NOT_AUTHORIZED') { unauthorized(); return; }
      if (safe.success && safe.data.code === 'CONFLICT') setMessage('הראיות השתנו או שכבר קיים שער. רעננו ובדקו את הראיות; אין ליצור שער מתחרה.');
      else if (safe.success && safe.data.code === 'INVALID_INPUT') setMessage('ההצהרה לא התקבלה. רעננו ובדקו את החשבון, התאריך והשער.');
      else setMessage('תוצאת השמירה אינה ידועה. אפשר לנסות שוב רק את אותה פקודה. לאחר רענון או יציאה בדקו ראיות לפני הזנה חדשה.');
    } finally { if (live.current) setBusy(false); }
  }
  return <div className="historical-fx">
    <p>נדרש: <bdi>{base} → {quote}</bdi> בתאריך <bdi>{date}</bdi>. חשבונות מושפעים: {affected.map(a => a.account.name).join(' · ') || 'לפי הראיות המפורטות'}.</p>
    <p>לתנועות נדרש תאריך ההכרה; ליתרה בדוח נדרש תאריך בדיקת היתרה. שער בתצפית מתייחס לתאריך המדידה שלה.</p>
    <details><summary>שערים שמורים בבית — {eligible.length} מתאימים לתאריך ולכיוון</summary>
      <ul>{eligible.map(({ rate }) => <li key={rate.id}><bdi>{rate.rate} · {rate.base} → {rate.quote} · {rate.effectiveDate}</bdi><br />מזהה: <bdi>{rate.id}</bdi> · מקור מוצהר: <bdi>{rate.origin.kind} / {rate.origin.sourceId}</bdi> · נרשם: <bdi>{rate.recordedAt}</bdi></li>)}</ul>
      {others.length > 0 && <><p>ראיות שאינן מתאימות — אינן תחליף לשער הדרוש:</p><ul>{others.map(({ rate }) => <li key={rate.id}><bdi>{rate.base} → {rate.quote} · {rate.effectiveDate} · {rate.rate} · {rate.id}</bdi> — {rate.base !== base ? 'כיוון הפוך' : 'תאריך אחר'}</li>)}</ul></>}
      <p>סוג המקור השמור הוא תיאור מקור; אין כאן אישור שהשער אומת חיצונית.</p>
    </details>
    {eligible.length > 1 ? <p role="status">קיימים שערים מתחרים (AMBIGUOUS_FX). אין בתהליך זה בחירה, תיקון או החלפה שלהם.</p> : eligible.length === 1 ? <p>קיים שער מתאים. שער עצמאי אינו מצורף אוטומטית לתצפית; בדקו את מסלול תיקון התצפית הקיים.</p> : finding.reasons.includes('MISSING_FX') ? sources.length ? <>
      <form className="identity-form" aria-label={`הצהרת שער ${base} ${quote} ${date}`} onSubmit={event => {
        event.preventDefault(); if (pending || busy) return;
        const form = new FormData(event.currentTarget);
        const parsed = manualFxCommandSchema.safeParse({ householdId: finding.householdId, sourceAccountId: form.get('sourceAccountId'),
          id: crypto.randomUUID(), idempotencyKey: crypto.randomUUID(), base, quote, effectiveDate: date, rate: form.get('rate'), acknowledge: form.get('acknowledge') === 'on' });
        if (!parsed.success) { setMessage('נדרש שער עשרוני חיובי: עד 18 ספרות שלמות ו־12 אחרי הנקודה, ואישור ההצהרה.'); return; }
        void send(parsed.data);
      }}>
        <h4>הוספת שער ידני חסר</h4>
        <p>הצהרת משתמש — לא אומתה מול מקור חיצוני. השער נשמר לצמיתות; אין כאן תיקון שער לאחר שמירה.</p>
        <label>חשבון מקור להצהרה<select name="sourceAccountId" disabled={busy || pending !== null} required defaultValue={sources[0]!.account.id}>{sources.map(a => <option key={a.account.id} value={a.account.id}>{a.account.name}</option>)}</select></label>
        <label>1 {base} ביחידות {quote}<input name="rate" inputMode="decimal" dir="ltr" required disabled={busy || pending !== null} /></label>
        <label><input type="checkbox" name="acknowledge" required disabled={busy || pending !== null} />בדקתי את הכיוון והתאריך ואני מצהיר/ה על השער הידני.</label>
        <button disabled={busy || pending !== null}>שמירת הצהרת שער</button>
      </form>
    </> : <p>אין חשבון מקור פעיל במטבעות אלה. לא ניתן להזין שער באמצעות מסלול זה.</p> : <p>לתצפית חסר שער מצורף. בדקו את התצפית במסך החשבונות; יצירת שער עצמאי אינה תיקון תצפית.</p>}
    {message && <p role="alert">{message}</p>}
    {pending && <><p>פקודה ממתינה לבירור. אין להתחיל הצהרה נוספת.</p><button disabled={busy} onClick={() => void send(pending)}>ניסיון חוזר של אותה הצהרה</button><button disabled={busy} onClick={refresh}>רענון ובדיקת ראיות</button></>}
    <p><Link to="/reconciliation">בדיקת התאמות עם ראיות שמורות</Link></p>
  </div>;
}
