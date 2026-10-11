import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { browserClient } from '@/shared/infrastructure/supabase-client';
import { previewCategorization } from '@finance/domain/categorization';
import { currentTransactions } from '@finance/domain/money/ledger';
import { displayMoney } from '@finance/domain/money/money';
import { safeErrorSchema } from '@finance/contracts/safe-error';
import type { Category, Rule } from '@finance/contracts/categorization';
import { loadCategorization, saveCategorization } from '../api/categorization';
import { DefinitionForms } from './DefinitionForms';

const previewLabels = { MATCHED: 'נמצאה התאמה', LOCKED: 'נעול — הכלל לא יוחל', UNMATCHED: 'ללא התאמה', AMBIGUOUS: 'עמום — כללים באותה עדיפות מציעים קטגוריות שונות', INELIGIBLE: 'לא מתאים לסיווג באמצעות קטגוריות הכנסה והוצאה' };
const origins = { USER: 'בחירת משתמש', RULE: 'כלל', SOURCE: 'מקור נתונים', UNCLASSIFIED: 'לא מסווג' };
const actions = { ASSIGN: 'שיוך ידני', RULE: 'כלל', CLEAR: 'ניקוי קטגוריה', UNLOCK: 'פתיחת נעילה' };
const effects = { EXPENSE: 'הוצאה', INCOME: 'הכנסה', TRANSFER: 'העברה', DEBT_PRINCIPAL: 'קרן חוב', INVESTMENT_TRADE: 'עסקת השקעה', ADJUSTMENT: 'התאמה', UNCLASSIFIED: 'לא מסווג — UNCLASSIFIED' };
type Pending = { kind: 'DEFINITION' | 'DECISION'; input: unknown };
export function CategorizationPanel() {
  const navigate = useNavigate(); const [params] = useSearchParams();
  const [data, setData] = useState<Awaited<ReturnType<typeof loadCategorization>> | null>(null);
  const [household, setHousehold] = useState(''); const [selected, setSelected] = useState(params.get('transaction') ?? '');
  const [allocationId, setAllocationId] = useState(''); const [category, setCategory] = useState<Category | null>(null); const [rule, setRule] = useState<Rule | null>(null);
  const [reload, setReload] = useState(0); const [failed, setFailed] = useState(false); const [message, setMessage] = useState('');
  const [pending, setPending] = useState<Pending | null>(null); const [busy, setBusy] = useState(false); const inFlight = useRef(false);
  useEffect(() => {
    let live = true; let generation = 0;
    async function refresh() {
      const ticket = ++generation; setData(null); setCategory(null); setRule(null); setFailed(false);
      try { const next = await loadCategorization(); if (live && ticket === generation) { setData(next); setPending((queued) => { if (!queued || typeof queued.input !== 'object' || queued.input === null) return null; const input = queued.input as { householdId?: unknown; record?: { householdId?: unknown } }; return next.catalogs.some((c) => c.householdId === (input.householdId ?? input.record?.householdId)) ? queued : null; }); } }
      catch { if (live && ticket === generation) { setFailed(true); setPending(null); } }
    }
    const sub = browserClient()?.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') { generation++; setData(null); setPending(null); navigate('/sign-in', { replace: true }); } }).data.subscription;
    const focus = () => { void refresh(); }; window.addEventListener('focus', focus); void refresh();
    return () => { live = false; generation++; sub?.unsubscribe(); window.removeEventListener('focus', focus); };
  }, [navigate, reload]);
  async function save(command: Pending) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setPending(command); setMessage('');
    try { await saveCategorization(command.kind, command.input); setPending(null); setCategory(null); setRule(null); setReload((n) => n + 1); setMessage('השינוי נשמר בהיסטוריה.'); }
    catch (error) {
      const safe = safeErrorSchema.safeParse(error);
      if (safe.success && ['INVALID_INPUT', 'CONFLICT', 'NOT_AUTHORIZED'].includes(safe.data.code)) {
        setPending(null); setReload((n) => n + 1); setMessage(safe.data.code === 'CONFLICT' ? 'התצוגה השתנתה או שהפעולה חסומה. בדקו את הנתונים המעודכנים לפני ניסיון נוסף.' : 'הבקשה נדחתה. בדקו נתונים והרשאות.');
      } else setMessage('לא ניתן לאשר שהשינוי נשמר. ניסיון חוזר ישלח בדיוק את אותה בקשה.');
    } finally { inFlight.current = false; setBusy(false); }
  }
  const catalog = data?.catalogs.find((c) => c.householdId === household) ?? data?.catalogs.find((c) => data.history.some((r) => r.transaction.id === selected && r.transaction.householdId === c.householdId)) ?? data?.catalogs[0];
  let movements: ReturnType<typeof currentTransactions> = []; let historyError = false;
  try { if (data && catalog) movements = data.accounts.filter((a) => a.account.householdId === catalog.householdId).flatMap((a) => currentTransactions(a, data.history.filter((r) => r.transaction.accountId === a.account.id))); } catch { historyError = true; }
  const movement = movements.find((r) => r.transaction.id === selected) ?? movements[0];
  const allocation = movement?.transaction.allocations.find((a) => a.id === allocationId) ?? movement?.transaction.allocations[0];
  const active = data?.accounts.find((a) => a.account.id === movement?.transaction.accountId)?.account.status === 'ACTIVE';
  const preview = catalog && movement && allocation ? previewCategorization(movement.transaction, allocation.id, catalog, active) : null;
  const disabled = busy || Boolean(pending);
  function decide(action: 'RULE' | 'ASSIGN' | 'CLEAR' | 'UNLOCK', categoryId: string | null = null) {
    if (!catalog || !movement || !allocation) return;
    void save({ kind: 'DECISION', input: { householdId: catalog.householdId, accountId: movement.transaction.accountId, transactionId: movement.transaction.id, allocationId: allocation.id,
      expectedVersion: movement.version, supersedesRevisionId: movement.revisionId, revisionId: crypto.randomUUID(), generation: catalog.generation, idempotencyKey: crypto.randomUUID(), action,
      categoryId: action === 'RULE' ? preview?.rule?.categoryId ?? null : categoryId, ruleId: action === 'RULE' ? preview?.rule?.id ?? null : null } });
  }
  return <section className="accounts-panel categorization-panel" aria-label="קטגוריות וכללי סיווג">
    <h1>קטגוריות וכללי סיווג</h1><p>תצוגה מקדימה אינה שומרת דבר. כל החלה היא על חלוקה אחת בלבד, בפעולה מפורשת. קטגוריה אינה משנה סכום, יתרה או משמעות כספית.</p>
    <Link to="/transactions">חזרה לתנועות</Link>{message && <p role="status">{message}</p>}
    {failed ? <p role="alert">לא ניתן לטעון את הנתונים. <Link to="/sign-in">התחברו מחדש</Link></p> : !data ? <p role="status">טוענים קטגוריות…</p> : !catalog ? <p>אין משק בית זמין.</p> : <>
      <label>משק בית לסיווג<select disabled={disabled} value={catalog.householdId} onChange={(e) => { setHousehold(e.target.value); setSelected(''); setCategory(null); setRule(null); }}>{data.catalogs.map((c, i) => <option key={c.householdId} value={c.householdId}>משק בית {i + 1}</option>)}</select></label>
      <button disabled={disabled} onClick={() => setReload((n) => n + 1)}>רענון סיווגים</button>
      {pending && <p role="status">בקשה ממתינה לאישור; נשמרת בזיכרון בלבד. <button disabled={busy} onClick={() => { void save(pending); }}>ניסיון חוזר לסיווג</button></p>}
      <h2>תצוגה מקדימה ושיוך ידני</h2>
      {historyError ? <p role="alert">לא ניתן לאמת את היסטוריית התנועות.</p> : !movement || !allocation ? <p>אין תנועות לסיווג.</p> : <div className="account-card">
        <label>תנועה לסיווג<select disabled={disabled} value={movement.transaction.id} onChange={(e) => { setSelected(e.target.value); setAllocationId(''); }}>{movements.map((r) => <option key={r.transaction.id} value={r.transaction.id}>{r.transaction.description} · {r.transaction.transactionDate}</option>)}</select></label>
        <label>חלוקה לסיווג<select disabled={disabled} value={allocation.id} onChange={(e) => setAllocationId(e.target.value)}>{movement.transaction.allocations.map((a, i) => <option key={a.id} value={a.id}>חלוקה {i + 1} · {effects[a.effect]} · {displayMoney(a.money)}</option>)}</select></label>
        <p>קטגוריה נוכחית: {catalog.categories.find((c) => c.id === allocation.categoryId)?.name ?? 'לא מסווג — UNCLASSIFIED'}{catalog.categories.find((c) => c.id === allocation.categoryId)?.status === 'ARCHIVED' && ' (בארכיון)'} · {allocation.categorization.userLocked ? 'נעול' : 'לא נעול'} · מקור: {origins[allocation.categorization.origin]}</p>
        {preview && <><p role="status">{previewLabels[preview.state]}</p>{preview.rule && <p>הצעה: {catalog.categories.find((c) => c.id === preview.rule?.categoryId)?.name} · כלל: {preview.rule.name} · עדיפות {preview.rule.priority} · גרסה {preview.rule.version}</p>}
          <ul>{preview.matches.map((r) => <li key={r.id}>{r.name}: התיאור {r.operator === 'EQUALS' ? 'זהה ל־' : 'מכיל'} „{r.pattern}” לאחר נרמול · עדיפות {r.priority} · מזהה <bdi>{r.id}</bdi></li>)}</ul>
          <button disabled={disabled || preview.state !== 'MATCHED'} onClick={() => decide('RULE')}>החלת הכלל המוצע</button>
        </>}
        <form className="identity-form" onSubmit={(e) => { e.preventDefault(); decide('ASSIGN', String(new FormData(e.currentTarget).get('category'))); }}>
          <fieldset disabled={disabled || preview?.state === 'INELIGIBLE'}><legend>שיוך מפורש</legend>
            <label>קטגוריה ידנית<select name="category" required defaultValue=""><option value="" disabled>בחרו קטגוריה</option>{catalog.categories.filter((c) => c.status === 'ACTIVE' && c.kind === allocation.effect).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
            <button>שיוך קטגוריה ונעילה</button><button type="button" onClick={() => decide('CLEAR')}>ניקוי קטגוריה ופתיחת נעילה</button><button type="button" disabled={!allocation.categorization.userLocked} onClick={() => decide('UNLOCK')}>פתיחת נעילה בלבד</button>
          </fieldset>
        </form>
        <h3>הסבר והיסטוריית סיווג</h3>
        <ol>{data.history.filter((r) => r.transaction.id === movement.transaction.id).sort((a, b) => b.version - a.version).map((r) => { const d = data.decisions.find((v) => v.revisionId === r.revisionId); return <li key={r.revisionId}>גרסה {r.version} · <bdi>{r.recordedAt}</bdi> · {d ? `${actions[d.evidence.action]} · ${d.evidence.category?.name ?? 'ללא שיוך חדש'} · ${d.evidence.rule ? `כלל ${d.evidence.rule.name}, גרסה ${d.evidence.rule.version}, עדיפות ${d.evidence.rule.priority}` : 'פעולת משתמש מפורשת'}` : 'רישום / תיקון כספי; מטא־נתוני הסיווג נשמרו'}</li>; })}</ol>
      </div>}
      <DefinitionForms key={`${catalog.householdId}-${reload}`} catalog={catalog} category={category} rule={rule} disabled={disabled} editCategory={setCategory} editRule={setRule} save={(input) => { void save({ kind: 'DEFINITION', input }); }} />
      <details><summary>היסטוריית הגדרות</summary><ul>{data.categoryHistory.filter((c) => c.householdId === catalog.householdId).map((c) => <li key={`${c.id}-${c.version}`}>{c.name} · גרסה {c.version} · {c.status === 'ACTIVE' ? 'פעילה' : 'בארכיון'}</li>)}{data.ruleHistory.filter((r) => r.householdId === catalog.householdId).map((r) => <li key={`${r.id}-${r.version}`}>{r.name} · גרסה {r.version} · עדיפות {r.priority} · {r.pattern} · {r.status === 'ACTIVE' ? 'פעיל' : r.status === 'DISABLED' ? 'מושבת' : 'בארכיון'}</li>)}</ul></details>
    </>}
  </section>;
}
