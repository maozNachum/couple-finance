import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { browserClient } from '@/shared/infrastructure/supabase-client';
import type { ReportingSnapshot } from '@finance/contracts/reporting';
import { safeErrorSchema } from '@finance/contracts/safe-error';
import { loadReporting } from '../api/reporting';
import { buildReport } from '../model/presentation';
import { ReportView } from './ReportView';

function today() { return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
export function DashboardPanel() {
  const navigate = useNavigate();
  const [snapshot,setSnapshot] = useState<ReportingSnapshot | null>(null);
  const [failed,setFailed] = useState(false), [reload,setReload] = useState(0);
  const [householdId,setHouseholdId] = useState('');
  const [asOf,setAsOf] = useState(today), [month,setMonth] = useState(() => today().slice(0,7));
  const [currency,setCurrency] = useState('ILS');
  useEffect(() => {
    let live = true, generation = 0;
    async function refresh() {
      const version = ++generation;
      setSnapshot(null); setFailed(false);
      try {
        const data = await loadReporting();
        if (live && version === generation) { setSnapshot(data); setHouseholdId(id => data.households.some(h => h.id === id) ? id : data.households[0]?.id ?? ''); }
      } catch (error) {
        if (live && version === generation) {
          setSnapshot(null); setFailed(true);
          const safe = safeErrorSchema.safeParse(error);
          if (safe.success && safe.data.code === 'NOT_AUTHORIZED') navigate('/sign-in',{replace:true});
        }
      }
    }
    const subscription = browserClient()?.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') { generation++; setSnapshot(null); navigate('/sign-in',{replace:true}); }
      else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') { void refresh(); }
    }).data.subscription;
    const focus = () => { void refresh(); };
    const visibility = () => { if (document.visibilityState === 'visible') void refresh(); else { generation++; setSnapshot(null); } };
    window.addEventListener('focus',focus); document.addEventListener('visibilitychange',visibility);
    void refresh();
    return () => { live = false; generation++; subscription?.unsubscribe(); window.removeEventListener('focus',focus); document.removeEventListener('visibilitychange',visibility); };
  },[navigate,reload]);
  const result = useMemo(() => snapshot && householdId ? buildReport(snapshot,householdId,asOf,month,currency) : null,[snapshot,householdId,asOf,month,currency]);
  return <section className="accounts-panel dashboard-panel" aria-label="דוח פיננסי לבית">
    <button onClick={() => { setSnapshot(null); setReload(n => n+1); }}>רענון ראיות</button>
    {failed ? <div role="alert"><p>לא ניתן להפיק דוח אמין. ייתכן שהגישה השתנתה, שהנתונים חורגים ממגבלת הדוח או שיש תקלה זמנית. נסו לרענן.</p><Link to="/sign-in">להתחברות</Link></div> : !snapshot ? <p role="status">טוענים ראיות מאומתות…</p> : snapshot.households.length === 0 ? <p role="status">אין כרגע גישה לבית.</p> : <>
      <div className="accounts-toolbar">
        <label>בית<select value={householdId} onChange={e => setHouseholdId(e.target.value)}>{snapshot.households.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
        <label>תאריך שווי<input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} required /></label>
        <label>חודש הכנסות וצריכה<input type="month" value={month} onChange={e => setMonth(e.target.value)} required /></label>
        <label>מטבע הדוח<select value={currency} onChange={e => setCurrency(e.target.value)}>{['ILS','USD','EUR','JPY','KWD'].map(c => <option key={c}>{c}</option>)}</select></label>
      </div>
      {result?.error ? <p role="alert">לא ניתן לחשב דוח אמין. בדקו את התאריכים ואת שלמות הראיות; סכומים חורגים לא יוצגו.</p> : result?.report && <ReportView report={result.report} />}
      {result?.report?.positions.length === 0 && <p>אין חשבונות רשומים בבית. שווי הבית אינו ידוע.</p>}
    </>}
  </section>;
}
