import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { browserClient } from '@/shared/infrastructure/supabase-client';
import type { ObligationsSnapshot } from '@finance/contracts/obligations';
import { forecastRequestSchema } from '@finance/contracts/forecast';
import type { ForecastRequest } from '@finance/contracts/forecast';
import { householdForecast } from '@finance/domain/forecast';
import { displayExactMoney as displayMoney } from '@finance/domain/money/money';
import { safeErrorSchema } from '@finance/contracts/safe-error';
import { loadForecast } from '../api/forecast';
import { currentDay, coverageText, diagnosticText, eventText } from '../model/presentation';

export function ForecastPanel() {
  const navigate = useNavigate(), generation = useRef(0);
  const [snapshot,setSnapshot] = useState<ObligationsSnapshot | null>(null), [failed,setFailed] = useState(false), [reload,setReload] = useState(0);
  const [householdId,setHouseholdId] = useState(''), [start,setStart] = useState<string>(currentDay), [horizon,setHorizon] = useState(30);
  const [buffer,setBuffer] = useState(''), [currency,setCurrency] = useState('ILS');
  const [choices,setChoices] = useState<ForecastRequest['accounts']>([]);
  const [evidenceAsOf,setEvidenceAsOf] = useState<string>(currentDay);
  useEffect(() => {
    let live = true;
    const invalidate = () => { generation.current++; };
    const clear = () => { invalidate(); setSnapshot(null); setChoices([]); setBuffer(''); };
    async function refresh() {
      clear(); const version = generation.current; setFailed(false);
      try {
        const data = await loadForecast();
        if (live && version === generation.current) { setEvidenceAsOf(currentDay()); setSnapshot(data); setHouseholdId(id => data.reporting.households.some(h => h.id === id) ? id : data.reporting.households[0]?.id ?? ''); }
      } catch (error) {
        if (live && version === generation.current) {
          setFailed(true); const safe = safeErrorSchema.safeParse(error);
          if (safe.success && safe.data.code === 'NOT_AUTHORIZED') navigate('/sign-in',{replace:true});
        }
      }
    }
    const subscription = browserClient()?.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') { clear(); navigate('/sign-in',{replace:true}); }
      else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') void refresh();
    }).data.subscription;
    const focus = () => { void refresh(); }, visibility = () => { if (document.visibilityState === 'visible') void refresh(); else clear(); };
    window.addEventListener('focus',focus); document.addEventListener('visibilitychange',visibility); void refresh();
    return () => { live=false; invalidate(); subscription?.unsubscribe(); window.removeEventListener('focus',focus); document.removeEventListener('visibilitychange',visibility); };
  },[navigate,reload]);
  const input = useMemo(() => forecastRequestSchema.safeParse({householdId,start,evidenceAsOf,horizon,buffer:{amount:buffer,currency},accounts:choices}),[householdId,start,evidenceAsOf,horizon,buffer,currency,choices]);
  const result = useMemo(() => snapshot && input.success ? householdForecast(snapshot,input.data) : null,[snapshot,input]);
  const accounts = snapshot?.reporting.accounts.filter(a => a.account.householdId === householdId) ?? [];
  function choose(accountId: string, value: string) {
    const other = choices.filter(c => c.accountId !== accountId);
    const selected = accounts.find(a => a.account.id === accountId)!;
    setChoices(value ? [...other,{accountId:selected.account.id,choice:value as 'INCLUDE' | 'EXCLUDE'}] : other);
  }
  return <section className="accounts-panel forecast-panel" aria-label="תחזית תזרים">
    <button onClick={() => {setSnapshot(null);setReload(n => n+1);}}>רענון ראיות לתחזית</button>
    {failed ? <p role="alert">לא ניתן לטעון ראיות מאומתות. נסו לרענן.</p> : !snapshot ? <p role="status">טוענים יתרות ותכנון…</p> : !snapshot.reporting.households.length ? <p>אין כרגע גישה לבית.</p> : <>
      <div className="accounts-toolbar">
        <label>בית<select value={householdId} onChange={e => {setHouseholdId(e.target.value);setChoices([]);setBuffer('');}}>{snapshot.reporting.households.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
        <label>תאריך יתרת פתיחה בסוף היום<input type="date" required max={evidenceAsOf} value={start} onChange={e => setStart(e.target.value)} /></label>
        <label>אופק התחזית<select value={horizon} onChange={e => setHorizon(Number(e.target.value))}>{[7,30,60,90].map(n => <option key={n} value={n}>{n} ימים</option>)}</select></label>
        <label>מטבע החישוב<select value={currency} onChange={e => {setCurrency(e.target.value);setBuffer('');}}>{['ILS','USD','EUR','JPY','KWD'].map(c => <option key={c}>{c}</option>)}</select></label>
        <label>כרית מזומן מפורשת<input inputMode="decimal" required value={buffer} onChange={e => setBuffer(e.target.value)} /></label>
      </div>
      <p>התחזית מתחילה ביתרת סוף היום שנבחר, ולא ביתרה הזמינה ברגע זה. תשלומים צפויים נכללים מהיום הבא. הזינו כרית מזומן, גם אם בחרתם אפס.</p>
      <p>תאריך בסיס הראיות לפי שעון הדפדפן בירושלים: {evidenceAsOf}. אין יתרת פתיחה ידועה לתאריך עתידי.</p>
      <p>תוצאה מלאה היא הערכת תכנון לפי הרשומות בלבד; אינה מבטיחה כיסוי דפי בנק, הכנסה עתידית או אישור להוציא כסף. הצעות חוזרות ומשכורות משוערות אינן נכללות.</p>
      <h2>זמינות חשבונות</h2>
      {!accounts.length && <p>אין חשבונות רשומים. אין להסיק יתרה אפס.</p>}
      {accounts.map(a => <article className="account-card" key={a.account.id}>
        <h3>{a.account.name}</h3><p>{a.account.balancePolicy === 'LEDGER' ? 'יתרה לפי תנועות רשומות' : 'יתרה לפי תצפית מוסמכת'} · {a.account.ownership.kind === 'HOUSEHOLD' ? 'משותף — נספר פעם אחת' : snapshot.reporting.members.find(m => m.id === (a.account.ownership.kind === 'MEMBER' ? a.account.ownership.memberId : ''))?.displayName}</p>
        {['BANK','CASH','SAVINGS'].includes(a.account.type) && a.account.status === 'ACTIVE' ? <label>זמינות {a.account.name}<select value={choices.find(c => c.accountId === a.account.id)?.choice ?? ''} onChange={e => choose(a.account.id,e.target.value)}><option value="">טרם הוכרעה</option><option value="INCLUDE">מאשר/ת זמינות מיידית — לכלול</option><option value="EXCLUDE">לא לכלול בכספים נזילים</option></select></label> : <p>אינו נכלל בכספים נזילים לפי מדיניות סוג החשבון או הארכיון.</p>}
        {result?.accounts.find(p => p.position.account.id === a.account.id)?.position && (() => {
          const p = result.accounts.find(p => p.position.account.id === a.account.id)!.position;
          return <p>יתרה מקורית: {p.amount ? displayMoney(p.amount.original) : 'לא ידועה'} · נמדדה: {p.measurementDate ?? 'לא ידוע'} · {coverageText[p.coverage]}{p.amount?.fx && ` · שער היסטורי מתאריך ${p.amount.fx.effectiveDate}`}</p>;
        })()}
      </article>)}
      {!input.success && <p role="status">בחרו תאריך וכרית מזומן לא שלילית בעד שמונה ספרות עשרוניות כדי לחשב.</p>}
      {result && <>
        <h2>{coverageText[result.coverage]}</h2>
        <p>יתרת פתיחה נכללת במודל: {result.starting ? displayMoney(result.starting) : 'לא ידועה'}{result.coverage !== 'COMPLETE' && ' — סכום חלקי בלבד, אינו יתרה מלאה מאומתת'}</p>
        <p>המינימום {result.coverage === 'COMPLETE' ? 'החזוי' : 'של הסכום החלקי'}: {result.minimum ? `${displayMoney(result.minimum.money)} בתאריך ${result.minimum.date}` : 'אינו ידוע'}</p>
        {result.safeToSpend.state === 'MODELED_AVAILABLE' ? <p role="status">סכום מעל כרית המזומן לפי המודל: {displayMoney(result.safeToSpend.amount)}. הערכת תכנון בלבד.</p> : result.safeToSpend.state === 'MODELED_SHORTFALL' ? <p role="status">מחסור ביחס לכרית המזומן לפי המודל: {displayMoney(result.safeToSpend.shortfall)}. אין סכום פנוי מוצג.</p> : <p role="status">סכום פנוי להוצאה אינו זמין: חסרות ראיות מספיקות לחישוב.</p>}
        <ul>{result.diagnostics.map(d => <li key={`${d.code}/${d.accountId}/${d.evidenceId}`}>{diagnosticText[d.code] ?? 'ראיה פיננסית חסרה — נדרשת בדיקה.'}{d.accountId && ` · ${accounts.find(a => a.account.id === d.accountId)?.account.name ?? ''}`}</li>)}</ul>
        <p><Link to="/accounts">בדיקת חשבונות ותצפיות</Link> · <Link to="/transactions">תיקון תנועות ויתרות</Link> · <Link to="/obligations">בדיקת התחייבויות ושיוך תשלומים</Link> · <Link to="/reconciliation">בדיקת התאמות</Link></p>
        <h2>ראיות לתזרים צפוי</h2>
        {!result.events.length && <p>אין תנועות צפויות נתמכות בטווח. זו אינה הוכחה שאין תשלומים עתידיים.</p>}
        {result.events.map(e => {
          const obligation=snapshot.revisions.find(v => e.id === `${v.id}/${v.version}/${e.date}`);
          return <article className="account-card" key={e.id}><h3>{e.date} · {e.source === 'CONFIRMED_OBLIGATION' ? obligation?.plan.name ?? 'התחייבות מאושרת לתכנון' : 'תנועה רשומה'}</h3>
            <p>תזרים במטבע המקורי: {displayMoney(e.original)} · {eventText[e.state]}</p>
            {obligation && <p>סכום התכנון המקורי: {displayMoney(obligation.plan.money)} · גרסת התחייבות {obligation.version} · {obligation.plan.ownership.kind === 'HOUSEHOLD' ? 'משותף' : snapshot.reporting.members.find(m => m.id === (obligation.plan.ownership.kind === 'MEMBER' ? obligation.plan.ownership.memberId : ''))?.displayName}</p>}
            <p>חשבון: {accounts.find(a => a.account.id === e.accountId)?.account.name} · {e.source === 'CONFIRMED_OBLIGATION' ? 'התחייבות לתכנון אינה תשלום שבוצע.' : 'התנועה אינה נוצרת או משתנה על ידי התחזית.'}</p>
            {e.transactionId && <details><summary>זהות ראיית התשלום</summary><p dir="ltr">{e.transactionId}</p></details>}
          </article>;
        })}
        <h2>יתרה חזויה לכל יום</h2>
        <div className="table-scroll"><table><caption>יתרות סוף יום במודל; היום הראשון הוא יתרת הפתיחה</caption><thead><tr><th scope="col">תאריך</th><th scope="col">יתרה</th><th scope="col">שלמות</th></tr></thead><tbody>{result.days.map(d => <tr key={d.date}><th scope="row">{d.date}</th><td>{d.ending ? displayMoney(d.ending) : 'לא ידועה'}</td><td>{coverageText[d.coverage]}</td></tr>)}</tbody></table></div>
      </>}
    </>}
  </section>;
}
