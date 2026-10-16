import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { browserClient } from '@/shared/infrastructure/supabase-client';
import { manualTransactionCommandSchema } from '@finance/contracts/ledger';
import type { ManualTransactionCommand, TransactionRevision } from '@finance/contracts/ledger';
import { safeErrorSchema } from '@finance/contracts/safe-error';
import { currentTransactions, ledgerBalance } from '@finance/domain/money/ledger';
import { displayMoney } from '@finance/domain/money/money';
import { loadTransactions, recordTransaction } from '../api/transactions';
import { effects, statuses, today } from '../model/presentation';
import { TransactionForm } from './TransactionForm';

export function TransactionsPanel() {
  const navigate = useNavigate();
  const [data, setData] = useState<Awaited<ReturnType<typeof loadTransactions>> | null>(null);
  const [selected, setSelected] = useState(''); const [asOf, setAsOf] = useState(today);
  const [correction, setCorrection] = useState<TransactionRevision | null>(null);
  const [reload, setReload] = useState(0); const [failed, setFailed] = useState(false);
  const [queued, setQueued] = useState<ManualTransactionCommand | null>(null);
  const [busy, setBusy] = useState(false); const inFlight = useRef(false);
  const [message, setMessage] = useState('');
  const [historyPage, setHistoryPage] = useState(0);
  const historyHeading = useRef<HTMLHeadingElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true; let revision = 0;
    async function refresh() {
      const current = ++revision; setData(null); setCorrection(null); setFailed(false);
      try { const result = await loadTransactions(); if (live && current === revision) {
        setData(result);
        setQueued((pending) => pending && result.accounts.some((r) => r.account.id === pending.transaction.accountId && r.account.householdId === pending.transaction.householdId) ? pending : null);
      } }
      catch { if (live && current === revision) setFailed(true); }
    }
    const sub = browserClient()?.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') { revision++; setData(null); setQueued(null); setCorrection(null); navigate('/sign-in', { replace: true }); } }).data.subscription;
    const focus = () => { void refresh(); };
    const visibility = () => { if (document.visibilityState === 'visible') void refresh(); else { revision++; setData(null); setCorrection(null); } };
    window.addEventListener('focus', focus); document.addEventListener('visibilitychange', visibility); void refresh();
    return () => { live = false; revision++; sub?.unsubscribe(); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', visibility); };
  }, [navigate, reload]);
  async function submit(input: unknown) {
    if (inFlight.current) return;
    const checked = manualTransactionCommandSchema.safeParse(queued ?? input);
    if (!checked.success) { setMessage('בדקו סכומים, תאריכים וחלוקות. סכום החלוקות חייב להתאים בדיוק לתנועה.'); return; }
    inFlight.current = true; setBusy(true); setQueued(checked.data); setMessage('');
    try { await recordTransaction(checked.data); setQueued(null); setCorrection(null); setReload((n) => n + 1); setMessage('התנועה נשמרה.'); }
    catch (error) {
      const safe = safeErrorSchema.safeParse(error);
      if (safe.success && ['INVALID_INPUT', 'CONFLICT', 'NOT_AUTHORIZED'].includes(safe.data.code)) {
        setQueued(null); setCorrection(null); setReload((n) => n + 1);
        setMessage(safe.data.code === 'CONFLICT' ? 'הנתונים השתנו. בדקו את ההיסטוריה לפני רישום נוסף.' : 'הבקשה נדחתה. בדקו הרשאות ונתונים.');
      } else setMessage('לא ניתן לאשר אם הבקשה נשמרה. ניסיון חוזר ישלח את אותה בקשה ללא רישום כפול.');
    } finally { inFlight.current = false; setBusy(false); }
  }
  const record = data?.accounts.find((r) => r.account.id === selected) ?? data?.accounts[0];
  const history = data?.history.filter((r) => r.transaction.accountId === record?.account.id) ?? [];
  let current: readonly TransactionRevision[] = []; let historyError = false;
  try { if (record) current = currentTransactions(record, history); } catch { historyError = true; }
  const balance = record ? ledgerBalance(record, history, asOf) : null;
  const sortedHistory = [...history].sort((a, b) => b.transaction.transactionDate.localeCompare(a.transaction.transactionDate) || b.version - a.version);
  const historyPages = Math.max(1, Math.ceil(history.length / 20));
  const visiblePage = Math.min(historyPage, historyPages - 1);
  return <section className="accounts-panel" aria-label="ניהול תנועות">
    {message && <p role="status">{message}</p>}
    {failed ? <p role="alert">לא ניתן לטעון תנועות. <Link to="/sign-in">התחברו מחדש</Link></p> : !data ? <p role="status">טוענים תנועות…</p> : !record ? <p>אין חשבונות זמינים. <Link to="/accounts">לניהול חשבונות</Link></p> : <>
      <div className="accounts-toolbar"><label>חשבון<select value={record.account.id} disabled={busy || Boolean(queued)} onChange={(e) => { setSelected(e.target.value); setCorrection(null); setHistoryPage(0); }}>{data.accounts.map((r) => <option key={r.account.id} value={r.account.id}>{r.account.name}{r.account.status === 'ARCHIVED' ? ' (בארכיון)' : ''}</option>)}</select></label>
        <label>יתרה לתאריך<input type="date" min="0001-01-01" max="9999-12-31" value={asOf} onChange={(e) => setAsOf(e.target.value)} /></label><button disabled={busy} onClick={() => setReload((n) => n + 1)}>רענון תנועות</button></div>
      <div className="account-card" aria-live="polite">
        {balance?.state === 'NOT_LEDGER' ? <p>חשבון זה מבוסס תצפיות. התנועות אינן משנות את שוויו. <Link to="/accounts">לתצפיות השווי</Link></p> : balance?.state === 'UNKNOWN' ? <p>יתרה לא ידועה — {balance.reason === 'BEFORE_OPENING' ? 'התאריך קודם ליתרת הפתיחה.' : 'חסרה יתרת פתיחה פעילה.'}</p> : balance?.state === 'ERROR' || historyError ? <p role="alert">שגיאה בנתונים או בתאריך. לא ניתן לחשב יתרה.</p> : balance && <><p>{balance.state === 'KNOWN' ? 'יתרה מחושבת' : 'יתרה חלקית — חסרים נתונים'}: <bdi>{displayMoney(balance.money)}</bdi></p><p>יתרת פתיחה מ־{balance.openingDate}. החישוב כולל רק תנועות שנרשמו עד התאריך שנבחר.</p></>}
        <p>היתרות מוצגות במטבע החשבון לפי המידע המתוקן כיום. תנועות ממתינות ומבוטלות אינן משנות את היתרה.</p>
      </div>
      <div className="section-links">{record.account.status === 'ACTIVE' && !historyError && <a href="#transaction-editor" onClick={() => editor.current?.focus()}>לתנועה חדשה או לתיקון</a>}<a href="#transaction-history" onClick={() => historyHeading.current?.focus()}>להיסטוריית התנועות ({history.length} גרסאות)</a></div>
      {queued && <div role="status"><p>בקשה ממתינה לאישור. הפרטים נשמרים בזיכרון עד להשלמת הניסיון החוזר; אין לרענן את הדפדפן.</p><button disabled={busy} onClick={() => { void submit(queued); }}>ניסיון חוזר לאותה בקשה</button></div>}
      <div id="transaction-editor" ref={editor} tabIndex={-1}>
      {record.account.status === 'ACTIVE' && !historyError && <><TransactionForm key={`${record.account.id}-${correction?.revisionId ?? 'new'}-${reload}`} record={record} correction={correction} members={data.members} disabled={busy || Boolean(queued)} submit={(input) => { void submit(input); }} />{correction && <button disabled={busy || Boolean(queued)} onClick={() => setCorrection(null)}>ביטול עריכת התיקון</button>}</>}
      </div>
      {record.account.status === 'ARCHIVED' && <p>החשבון בארכיון — ההיסטוריה זמינה לקריאה.</p>}
      <Link to="/categories">ניהול קטגוריות וכללי סיווג</Link> · <Link to="/reconciliation">התאמת תנועות וסילוקים</Link><h2 id="transaction-history" className="history-heading" ref={historyHeading} tabIndex={-1}>היסטוריית תנועות</h2>{history.length === 0 && <p>אין תנועות רשומות.</p>}
      <ol className="observation-history">{sortedHistory.slice(visiblePage * 20, (visiblePage + 1) * 20).map((r) => <li className="account-card" key={r.revisionId}>
        <h3>{r.transaction.description}</h3><Link to={`/categories?transaction=${r.transaction.id}`}>סיווג והסבר {r.transaction.description}</Link><p>{r.transaction.transactionDate} · <bdi>{displayMoney(r.transaction.money)}</bdi> · {statuses[r.transaction.status]} · גרסה {r.version}{!current.some((v) => v.revisionId === r.revisionId) && ' · הוחלפה בתיקון'}</p>
        <p>נרשמה: <bdi>{r.recordedAt}</bdi></p>{r.reason && <p>סיבה: {r.reason}</p>}
        <ul>{r.transaction.allocations.map((a) => <li key={a.id}>{effects[a.effect]} · <bdi>{displayMoney(a.money)}</bdi> · {a.ownership.kind === 'HOUSEHOLD' ? 'משותף לבית' : data.members.find((m) => a.ownership.kind === 'MEMBER' && m.id === a.ownership.memberId)?.displayName ?? 'חבר בית היסטורי'}</li>)}</ul>
        {current.some((v) => v.revisionId === r.revisionId) && (r.transaction.status !== 'VOIDED' || r.entryKind === 'OPENING') && record.account.status === 'ACTIVE' && <button disabled={busy || Boolean(queued)} onClick={() => { setCorrection(r); editor.current?.focus(); editor.current?.scrollIntoView({ block: 'start' }); }}>תיקון / ביטול {r.transaction.description}</button>}
      </li>)}</ol>
      {historyPages > 1 && <nav className="history-pages" aria-label="עמודי היסטוריית תנועות"><button disabled={visiblePage === 0} onClick={() => { setHistoryPage(visiblePage - 1); historyHeading.current?.focus(); }}>הקודם</button><span role="status">עמוד {visiblePage + 1} מתוך {historyPages} · כל {history.length} הגרסאות זמינות</span><button disabled={visiblePage + 1 === historyPages} onClick={() => { setHistoryPage(visiblePage + 1); historyHeading.current?.focus(); }}>הבא</button></nav>}
    </>}
  </section>;
}
