import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { browserClient } from '@/shared/infrastructure/supabase-client';
import { budgetCommandSchema } from '@finance/contracts/budgets';
import type { BudgetSnapshot, BudgetCommand, BudgetRevision } from '@finance/contracts/budgets';
import { safeErrorSchema } from '@finance/contracts/safe-error';
import { loadBudgets, saveBudget } from '../api/budgets';
import { buildBudgetReport } from '../model/presentation';
import { BudgetForm } from './BudgetForm';
import { BudgetResults } from './BudgetResults';

const thisMonth=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).slice(0,7);
export function BudgetsPanel() {
  const navigate=useNavigate();
  const [snapshot,setSnapshot]=useState<BudgetSnapshot|null>(null),[failed,setFailed]=useState(false),[reload,setReload]=useState(0);
  const [householdId,setHouseholdId]=useState(''),[month,setMonth]=useState(thisMonth),[currency,setCurrency]=useState('ILS');
  const [form,setForm]=useState(false),[edit,setEdit]=useState<BudgetRevision|null>(null),[archive,setArchive]=useState<BudgetRevision|null>(null);
  const [pending,setPending]=useState<BudgetCommand|null>(null),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
  const gate=useRef(false),generation=useRef(0);
  useEffect(()=>{
    let live=true;
    const invalidate=()=>{generation.current++;};
    const clear=()=>{invalidate();setSnapshot(null);setForm(false);setEdit(null);setArchive(null);};
    async function refresh() {
      clear(); const version=generation.current; setFailed(false);
      try {
        const data=await loadBudgets();
        if(live&&version===generation.current){setSnapshot(data);setHouseholdId(id=>data.reporting.households.some(h=>h.id===id)?id:data.reporting.households[0]?.id??'');setPending(p=>p&&data.reporting.households.some(h=>h.id===p.householdId)?p:null);if(data.reporting.households.length===0)setMessage('');}
      }catch(error){if(live&&version===generation.current){setFailed(true);const safe=safeErrorSchema.safeParse(error);if(safe.success&&safe.data.code==='NOT_AUTHORIZED'){setPending(null);navigate('/sign-in',{replace:true});}}}
    }
    const subscription=browserClient()?.auth.onAuthStateChange(event=>{
      if(event==='SIGNED_OUT'){clear();setPending(null);setMessage('');navigate('/sign-in',{replace:true});}
      else if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED'||event==='USER_UPDATED')void refresh();
    }).data.subscription;
    const focus=()=>{void refresh();}; const visibility=()=>{if(document.visibilityState==='visible')void refresh();else clear();};
    window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visibility);void refresh();
    return()=>{live=false;invalidate();subscription?.unsubscribe();window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visibility);};
  },[navigate,reload]);
  const activeCurrency=snapshot?.revisions.filter(b=>b.householdId===householdId&&b.month===month&&b.status==='ACTIVE'&&!snapshot.revisions.some(n=>n.id===b.id&&n.version>b.version))[0]?.planned.currency;
  const selectedCurrency=activeCurrency??currency;
  const result=useMemo(()=>snapshot&&householdId?buildBudgetReport(snapshot,householdId,month,selectedCurrency):null,[snapshot,householdId,month,selectedCurrency]);
  async function submit(command:BudgetCommand) {
    if(gate.current)return;gate.current=true;setSaving(true);setPending(command);setMessage('');
    const version=generation.current;
    try {await saveBudget(command);if(version===generation.current){setPending(null);setMessage('התוכנית נשמרה.');setSnapshot(null);setReload(n=>n+1);}}
    catch(error){if(version===generation.current){const safe=safeErrorSchema.safeParse(error);
      if(safe.success&&safe.data.code==='NOT_AUTHORIZED'){setSnapshot(null);setPending(null);navigate('/sign-in',{replace:true});}
      else if(safe.success&&(safe.data.code==='CONFLICT'||safe.data.code==='INVALID_INPUT')){setPending(null);setForm(false);setArchive(null);setSnapshot(null);setReload(n=>n+1);setMessage(safe.data.code==='CONFLICT'?'התוכנית השתנתה, חופפת לתוכנית קיימת או משתמשת במטבע אחר. רעננו ובחרו עריכה חדשה.':'הערכים אינם נתמכים. בדקו את התכנון.');}
      else setMessage('תוצאת השמירה אינה ידועה. נסו שוב עם אותה פקודה כדי למנוע תוכנית כפולה.');}}
    finally{gate.current=false;setSaving(false);}
  }
  const reset=()=>{setForm(false);setEdit(null);setArchive(null);setMessage('');};
  const disabled=saving||pending!==null;
  const pendingVisible=pending&&snapshot?.reporting.households.some(h=>h.id===pending.householdId);
  return <section className="accounts-panel" aria-label="תקציבים חודשיים">
    <button disabled={saving} onClick={()=>{setSnapshot(null);setReload(n=>n+1);}}>רענון תוכניות וראיות</button>
    {message&&<p role="status">{message}</p>}
    {pendingVisible&&<div role="status"><p>פקודת שמירה ממתינה לבירור. אין להתחיל שמירה אחרת.</p><button disabled={saving} onClick={()=>void submit(pending)}>ניסיון חוזר של אותה שמירה</button></div>}
    {failed?<p role="alert">לא ניתן לטעון תוכניות וראיות מאומתות. נסו לרענן.</p>:!snapshot?<p role="status">טוענים תוכניות וראיות…</p>:snapshot.reporting.households.length===0?<p>אין כרגע גישה לבית.</p>:<>
      <div className="accounts-toolbar">
        <label>בית<select disabled={disabled} value={householdId} onChange={e=>{reset();setHouseholdId(e.target.value);}}>{snapshot.reporting.households.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
        <label>חודש התכנון<input disabled={disabled} type="month" required value={month} onChange={e=>{reset();setMonth(e.target.value);}} /></label>
        <label>מטבע התכנון<select disabled={disabled||activeCurrency!==undefined} value={selectedCurrency} onChange={e=>{reset();setCurrency(e.target.value);}}>{['ILS','USD','EUR','JPY','KWD'].map(c=><option key={c}>{c}</option>)}</select></label>
      </div>
      {result?.error?<p role="alert">אי אפשר להפיק השוואה אמינה. בדקו את החודש, המטבע ושלמות ההיסטוריה. סכומים חורגים אינם מוצגים.</p>:<>
        <button disabled={disabled} onClick={()=>{setEdit(null);setArchive(null);setForm(true);}}>הוספת תוכנית</button>
        {form&&<BudgetForm key={`${householdId}/${month}/${edit?.id??'new'}`} snapshot={snapshot} householdId={householdId} month={month} currency={selectedCurrency} edit={edit} onSave={c=>void submit(c)} onCancel={reset} disabled={disabled} />}
        {archive&&<div role="group" aria-label="אישור העברה לארכיון"><p>להעביר את התוכנית לארכיון? ההיסטוריה תישמר ותחום התוכנית יתפנה.</p><button disabled={disabled} onClick={()=>void submit(budgetCommandSchema.parse({id:archive.id,householdId:archive.householdId,month:archive.month,scope:archive.scope,planned:archive.planned,expectedVersion:archive.version,action:'ARCHIVE',idempotencyKey:crypto.randomUUID()}))}>אישור ארכיון</button><button disabled={disabled} onClick={()=>setArchive(null)}>ביטול ארכיון</button></div>}
        {result?.report&&<BudgetResults snapshot={snapshot} result={result.report} disabled={disabled} onEdit={b=>{setEdit(b);setArchive(null);setForm(true);}} onArchive={b=>{setForm(false);setArchive(b);}} />}
      </>}
    </>}
  </section>;
}
