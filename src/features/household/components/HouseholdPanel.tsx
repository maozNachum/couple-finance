import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { browserClient } from '@/shared/infrastructure/supabase-client';
import { loadHouseholds } from '../api/household';

export function HouseholdPanel() {
  const navigate = useNavigate();
  const [result, setResult] = useState<Awaited<ReturnType<typeof loadHouseholds>> | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    let revision = 0;
    async function refresh() {
      const current = ++revision;
      setResult(null); setFailed(false);
      try { const data = await loadHouseholds(); if (live && current === revision) setResult(data); }
      catch { if (live && current === revision) { setResult(null); setFailed(true); } }
    }
    const client = browserClient();
    const subscription = client?.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') { revision++; setResult(null); navigate('/sign-in', { replace: true }); }
    }).data.subscription;
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    void refresh();
    return () => { live = false; revision++; subscription?.unsubscribe(); window.removeEventListener('focus', onFocus); };
  }, [navigate]);
  async function signOut() {
    // Clear rendered data immediately, including when network logout fails.
    setResult(null);
    const client = browserClient();
    if (client) {
      try { const { error } = await client.auth.signOut(); if (error) { window.location.replace('/sign-in?logout=local'); return; } }
      catch { window.location.replace('/sign-in?logout=local'); return; }
    }
    navigate('/sign-in', { replace: true });
  }
  return <section className="identity-panel" aria-label="פרטי הבית">
    {failed ? <div role="alert"><p>לא ניתן לטעון את הבית. התחברו מחדש ונסו שוב.</p><Link to="/sign-in">להתחברות</Link></div> : !result ? <p role="status">טוענים את הבית…</p> : result.households.length === 0 ? <p role="status">אין כרגע גישה לבית. יש לפנות למי שהזמין אתכם.</p> : result.households.map((household) => <article key={household.id}><h2>{household.name}</h2><p>חברים פעילים: {result.members.filter((member) => member.householdId === household.id && member.status === 'ACTIVE').length}</p><p>אין עדיין חשבונות או נתונים פיננסיים.</p></article>)}
    <button onClick={() => { void signOut(); }}>יציאה</button>
  </section>;
}
