import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { browserClient } from '@/shared/infrastructure/supabase-client';
import { accountCommand, loadAccounts } from '../api/accounts';
import { commandMessage, householdToday } from '../model/presentation';
import { CreateAccountForm } from './CreateAccountForm';
import { AccountDetails } from './AccountDetails';
import { createAccountSchema } from '@finance/contracts/valuation';

export function AccountsPanel() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [household, setHousehold] = useState(params.get('household') ?? '');
  const [selected, setSelected] = useState(params.get('account') ?? '');
  const [data, setData] = useState<Awaited<ReturnType<typeof loadAccounts>> | null>(null);
  const [reload, setReload] = useState(0);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [asOf, setAsOf] = useState(householdToday);
  useEffect(() => {
    let live = true; let revision = 0;
    async function refresh() {
      const current = ++revision; setData(null); setFailed(false); setError('');
      try { const result = await loadAccounts(); if (live && current === revision) setData(result); }
      catch { if (live && current === revision) setFailed(true); }
    }
    const sub = browserClient()?.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') { revision++; setData(null); navigate('/sign-in', { replace: true }); } }).data.subscription;
    const focus = () => { void refresh(); };
    const visibility = () => { if (document.visibilityState === 'visible') void refresh(); else { revision++; setData(null); } };
    window.addEventListener('focus', focus); document.addEventListener('visibilitychange', visibility); void refresh();
    return () => { live = false; revision++; sub?.unsubscribe(); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', visibility); };
  }, [navigate, reload]);
  async function command(name: 'create_account' | 'update_account' | 'record_balance', input: unknown) {
    setBusy(true); setError('');
    try {
      await accountCommand(name, input);
      if (name === 'create_account') {
        const created = createAccountSchema.safeParse(input);
        if (created.success) { setHousehold(created.data.account.householdId); setSelected(created.data.account.id); }
      }
      setData(null); setReload((n) => n + 1);
    }
    catch (caught) { setError(commandMessage(caught)); }
    finally { setBusy(false); }
  }
  const householdId = household || data?.households[0]?.id || '';
  const accounts = data?.accounts.filter(r => r.account.householdId === householdId) ?? [];
  const available = data?.households.some(h => h.id === householdId) && (!selected || accounts.some(r => r.account.id === selected));
  return <section className="accounts-panel" aria-label="ניהול חשבונות">
    {failed ? <div role="alert"><p>לא ניתן לטעון חשבונות. התחברו מחדש ונסו שוב.</p><Link to="/sign-in">להתחברות</Link></div> : !data ? <p role="status">טוענים חשבונות…</p> : data.households.length === 0 ? <p role="status">אין כרגע גישה לבית.</p> : <>
      <div className="accounts-toolbar"><label>שווי נכון לתאריך<input aria-label="שווי נכון לתאריך" type="date" min="0001-01-01" max="9999-12-31" value={asOf} onChange={(event) => setAsOf(event.target.value)} /></label><button disabled={busy} onClick={() => setReload((n) => n + 1)}>רענון</button><Link to="/reconciliation">התאמת העברות וסילוקים</Link></div>
      {error && <p role="alert">{error}</p>}
      <section aria-label="מלאי החשבונות והכיסוי"><h2>מלאי החשבונות</h2>
        <p>רישום החשבונות הוא הצהרה שלכם. כיסוי חיצוני לא ידוע.</p>
        {data.households.length > 1 || !data.households.some(h => h.id === householdId) ? <label>בית להצגת חשבונות<select value={householdId} onChange={e => { setHousehold(e.target.value); setSelected(''); }}>{!data.households.some(h => h.id === householdId) && <option value={householdId}>הבית המבוקש אינו זמין</option>}{data.households.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label> : <p>{data.households[0]?.name}</p>}
        <label>מיקוד בחשבון<select value={selected} onChange={e => setSelected(e.target.value)}><option value="">כל החשבונות בבית</option>{selected && !accounts.some(r => r.account.id === selected) && <option value={selected}>החשבון המבוקש אינו זמין</option>}{accounts.map(r => <option key={r.account.id} value={r.account.id}>{r.account.name}</option>)}</select></label>
        {!available ? <p role="alert">הקשר החשבון המבוקש אינו זמין בהרשאות הנוכחיות. בחרו בית וחשבון מהרשימה.</p> : <><p>{accounts.length} חשבונות רשומים בבית · {accounts.filter(r => r.account.status === 'ARCHIVED').length} שהועברו לארכיון.</p>
        {!accounts.length && <p>אין עדיין חשבונות. אפשר ליצור את החשבון הראשון.</p>}
        <a className="intake-link" href="#register-account">רישום חשבון נוסף</a></>}
        <details><summary>מה אפשר לדעת מהראיות?</summary><p>אין אפשרות לוודא שכל החשבונות וכל הפעילות מחוץ למערכת נרשמו, גם כשאין ממצאים. מספר הרשומות אינו מספר החשבונות הקיימים מחוץ למערכת.</p><p>יתרת פתיחה מעגנת חישוב מתנועות; תצפית מוסיפה מדידה לתאריך מסוים. תאריכי תנועות או קובץ CSV אינם מאשרים כיסוי של תקופה שלמה.</p></details>
      </section>
      {available && accounts.filter(r => !selected || r.account.id === selected).map((record) => <AccountDetails key={`${record.account.id}-${record.version}-${reload}`} record={record} ledgerHistory={data.ledgerHistory.filter((row) => row.transaction.accountId === record.account.id)} history={data.observations.filter((row) => row.accountId === record.account.id && row.householdId === record.account.householdId)} asOf={asOf}
        owner={record.account.ownership.kind === 'HOUSEHOLD' ? 'משותף לבית' : data.members.find((m) => record.account.ownership.kind === 'MEMBER' && m.id === record.account.ownership.memberId)?.displayName ?? 'חבר בית היסטורי'} busy={busy} command={command} />)}
      {available && <div id="register-account"><CreateAccountForm key={`${householdId}-${reload}`} data={{...data, households: data.households.filter(h => h.id === householdId)}} busy={busy} submit={(input) => command('create_account', input)} /></div>}
      <nav className="section-links" aria-label="בדיקת התמונה לאחר השלמת מידע"><Link to="/dashboard">בדיקת תמונת המצב</Link><Link to="/data-quality">בדיקת איכות המידע</Link></nav>
    </>}
  </section>;
}
