import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { browserClient } from '@/shared/infrastructure/supabase-client';
import { goalCommandSchema } from '@finance/contracts/goals';
import type { GoalsSnapshot, GoalCommand, GoalRevision } from '@finance/contracts/goals';
import { safeErrorSchema } from '@finance/contracts/safe-error';
import { loadGoals, saveGoal } from '../api/goals';
import { GoalForm } from './GoalForm';
import { GoalCard } from './GoalCard';

const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function GoalsPanel(){
  const navigate=useNavigate();
  const [snapshot,setSnapshot]=useState<GoalsSnapshot|null>(null),[failed,setFailed]=useState(false),[reload,setReload]=useState(0);
  const [householdId,setHouseholdId]=useState(''),[day,setDay]=useState(today);
  const [form,setForm]=useState(false),[edit,setEdit]=useState<GoalRevision|null>(null),[archive,setArchive]=useState<GoalRevision|null>(null);
  const [pending,setPending]=useState<GoalCommand|null>(null),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
  const gate=useRef(false),generation=useRef(0);
  useEffect(()=>{
    let live=true;
    const invalidate=()=>{generation.current++;};
    const clear=()=>{invalidate();setSnapshot(null);setForm(false);setEdit(null);setArchive(null);};
    async function refresh(){
      clear();const version=generation.current;setFailed(false);
      try{
        const data=await loadGoals();
        if(live&&version===generation.current){setSnapshot(data);setDay(today());setHouseholdId(id=>data.households.some(h=>h.id===id)?id:data.households[0]?.id??'');setPending(p=>p&&data.households.some(h=>h.id===p.householdId)?p:null);}
      }catch(error){if(live&&version===generation.current){setFailed(true);const safe=safeErrorSchema.safeParse(error);if(safe.success&&safe.data.code==='NOT_AUTHORIZED'){setPending(null);navigate('/sign-in',{replace:true});}}}
    }
    const subscription=browserClient()?.auth.onAuthStateChange(event=>{
      if(event==='SIGNED_OUT'){clear();setPending(null);navigate('/sign-in',{replace:true});}
      else if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED'||event==='USER_UPDATED')void refresh();
    }).data.subscription;
    const focus=()=>{void refresh();},visibility=()=>{if(document.visibilityState==='visible')void refresh();else clear();};
    window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visibility);void refresh();
    return()=>{live=false;invalidate();subscription?.unsubscribe();window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visibility);};
  },[navigate,reload]);
  async function submit(command:GoalCommand){
    if(gate.current)return;gate.current=true;setSaving(true);setPending(command);setMessage('');const version=generation.current;
    try{await saveGoal(command);if(version===generation.current){setPending(null);setMessage('היעד נשמר כתכנון בלבד.');setSnapshot(null);setReload(n=>n+1);}}
    catch(error){if(version===generation.current){const safe=safeErrorSchema.safeParse(error);
      if(safe.success&&safe.data.code==='NOT_AUTHORIZED'){setSnapshot(null);setPending(null);navigate('/sign-in',{replace:true});}
      else if(safe.success&&(safe.data.code==='CONFLICT'||safe.data.code==='INVALID_INPUT')){setPending(null);setSnapshot(null);setReload(n=>n+1);setMessage('השמירה נדחתה. רעננו ובחרו עריכה חדשה לאחר בדיקת הגרסה והערכים.');}
      else setMessage('תוצאת השמירה אינה ידועה. נסו שוב עם אותה פקודה; אין להתחיל יעד או עדכון נוסף.');}}
    finally{gate.current=false;setSaving(false);}
  }
  const reset=()=>{setForm(false);setEdit(null);setArchive(null);setMessage('');};
  const disabled=saving||pending!==null;
  const heads=snapshot?.revisions.filter(r=>r.householdId===householdId&&!snapshot.revisions.some(n=>n.id===r.id&&n.version>r.version))??[];
  return <section className="accounts-panel" aria-label="תכנון יעדים">
    <p>הצהרות תכנון בלבד. מימון בנקאי לא אומת.</p>
    <details><summary>מה משמעות הסכומים והייחוס האישי?</summary><p>סכומים מוצהרים אינם יתרת בנק מאומתת, נכס נוסף או כסף שנשמר בפועל. אותו כסף עשוי להופיע ביותר מיעד אחד. אין שינוי ביתרות, בשווי הנקי או בסכום הפנוי להוצאה. כל חברי הבית המורשים יכולים לראות יעדים אישיים.</p></details>
    <button disabled={saving} onClick={()=>{setSnapshot(null);setReload(n=>n+1);}}>רענון יעדים</button>
    {message&&<p role="status">{message}</p>}
    {pending&&snapshot?.households.some(h=>h.id===pending.householdId)&&<div role="status"><p>פקודת יעד ממתינה לבירור.</p><button disabled={saving} onClick={()=>void submit(pending)}>ניסיון חוזר של אותה שמירה</button></div>}
    {failed?<p role="alert">לא ניתן לטעון את היעדים המורשים. נסו לרענן.</p>:!snapshot?<p role="status">טוענים יעדים…</p>:snapshot.households.length===0?<p>אין כרגע גישה לבית.</p>:<>
      <label>בית<select disabled={disabled} value={householdId} onChange={e=>{generation.current++;reset();setHouseholdId(e.target.value);}}>{snapshot.households.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
      <p>תאריך בסיס לתכנון (שעון הדפדפן, ירושלים): <bdi>{day}</bdi>. אינו שעון שרת מאומת.</p>
      <details><summary>איך מחושב החיסכון החודשי?</summary><p>הפקדה אחת בסוף כל חודש שאחרי חודש התכנון ועד חודש היעד, כולל. החישוב מתייחס לסוף חודש היעד, גם אם נבחר בו יום מוקדם יותר. החודש הנוכחי אינו נכלל. בהיעדר חודשים עתידיים הסכום נדרש כעת. הסכום החודשי מעוגל כלפי מעלה לשמונה ספרות אחרי הנקודה. אין הנחת ריבית, תשואה או הפקדות שבוצעו.</p></details>
      <button disabled={disabled} onClick={()=>{setEdit(null);setArchive(null);setForm(true);}}>הוספת יעד</button>
      {form&&<GoalForm key={`${householdId}/${edit?.id??'new'}`} snapshot={snapshot} householdId={householdId} edit={edit} onSave={c=>void submit(c)} onCancel={reset} disabled={disabled} />}
      {archive&&<div role="group" aria-label="אישור העברה לארכיון"><p>להעביר את {archive.name} לארכיון? ההיסטוריה נשמרת; אין שינוי בכסף.</p><button disabled={disabled} onClick={()=>void submit(goalCommandSchema.parse({id:archive.id,householdId:archive.householdId,ownership:archive.ownership,name:archive.name,target:archive.target,declared:archive.declared,monthly:archive.monthly,targetDate:archive.targetDate,action:'ARCHIVE',expectedVersion:archive.version,acknowledge:true,idempotencyKey:crypto.randomUUID()}))}>אישור ארכיון</button><button disabled={disabled} onClick={()=>setArchive(null)}>ביטול ארכיון</button></div>}
      <h2>יעדים פעילים</h2>{!heads.some(r=>r.status==='ACTIVE')&&<p>עדיין אין יעדים פעילים. אפשר להתחיל גם בלי נתוני חשבונות; המימון לא אומת.</p>}
      {heads.filter(r=>r.status==='ACTIVE').map(r=><GoalCard key={r.id} goal={r} snapshot={snapshot} day={day} disabled={disabled} onEdit={()=>{setEdit(r);setArchive(null);setForm(true);}} onArchive={()=>{setForm(false);setArchive(r);}} />)}
      <details><summary>יעדים בארכיון</summary>{heads.filter(r=>r.status==='ARCHIVED').map(r=><GoalCard key={r.id} goal={r} snapshot={snapshot} day={day} disabled={disabled} onEdit={()=>{}} onArchive={()=>{}} />)}</details>
    </>}
  </section>;
}
