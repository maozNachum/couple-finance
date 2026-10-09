import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { browserClient } from '@/shared/infrastructure/supabase-client';
import { accountCommand, loadAccounts } from '../api/accounts';
import { commandMessage, householdToday } from '../model/presentation';
import { CreateAccountForm } from './CreateAccountForm';
import { AccountDetails } from './AccountDetails';

export function AccountsPanel() {
  const navigate = useNavigate();
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
    window.addEventListener('focus', focus); void refresh();
    return () => { live = false; revision++; sub?.unsubscribe(); window.removeEventListener('focus', focus); };
  }, [navigate, reload]);
  async function command(name: 'create_account' | 'update_account' | 'record_balance', input: unknown) {
    setBusy(true); setError('');
    try { await accountCommand(name, input); setData(null); setReload((n) => n + 1); }
    catch (caught) { setError(commandMessage(caught)); }
    finally { setBusy(false); }
  }
  return <section className="accounts-panel" aria-label="ניהול חשבונות">
    {failed ? <div role="alert"><p>לא ניתן לטעון חשבונות. התחברו מחדש ונסו שוב.</p><Link to="/sign-in">להתחברות</Link></div> : !data ? <p role="status">טוענים חשבונות…</p> : data.households.length === 0 ? <p role="status">אין כרגע גישה לבית.</p> : <>
      <div className="accounts-toolbar"><label>שווי נכון לתאריך<input aria-label="שווי נכון לתאריך" type="date" min="0001-01-01" max="9999-12-31" value={asOf} onChange={(event) => setAsOf(event.target.value)} /></label><button disabled={busy} onClick={() => setReload((n) => n + 1)}>רענון</button></div>
      {error && <p role="alert">{error}</p>}
      {data.accounts.length === 0 && <p>אין עדיין חשבונות. אפשר ליצור את החשבון הראשון.</p>}
      {data.accounts.map((record) => <AccountDetails key={`${record.account.id}-${record.version}-${reload}`} record={record} history={data.observations.filter((row) => row.accountId === record.account.id && row.householdId === record.account.householdId)} asOf={asOf}
        owner={record.account.ownership.kind === 'HOUSEHOLD' ? 'משותף לבית' : data.members.find((m) => record.account.ownership.kind === 'MEMBER' && m.id === record.account.ownership.memberId)?.displayName ?? 'חבר בית היסטורי'} busy={busy} command={command} />)}
      <CreateAccountForm key={reload} data={data} busy={busy} submit={(input) => command('create_account', input)} />
    </>}
  </section>;
}
