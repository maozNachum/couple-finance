import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { browserClient } from '@/shared/infrastructure/supabase-client';
import type { ObligationsSnapshot, PlanningCommand, ObligationRevision, ObligationCommand } from '@finance/contracts/obligations';
import { rejectionCommandSchema } from '@finance/contracts/obligations';
import { safeErrorSchema } from '@finance/contracts/safe-error';
import type { recurringCandidates } from '@finance/domain/obligations';
import { displayMoney } from '@finance/domain/money/money';
import { loadObligations, saveObligation } from '../api/obligations';
import { buildObligations, currentPeriod, issueText, eventState } from '../model/presentation';
import { ObligationForm } from './ObligationForm';
import { PaymentReview } from './PaymentReview';

type Candidate=ReturnType<typeof recurringCandidates>['candidates'][number];
export function ObligationsPanel() {
  const navigate=useNavigate(),[period]=useState(currentPeriod);
  const [snapshot,setSnapshot]=useState<ObligationsSnapshot|null>(null),[failed,setFailed]=useState(false),[reload,setReload]=useState(0);
  const [householdId,setHouseholdId]=useState(''),[from,setFrom]=useState<string>(period.from),[to,setTo]=useState<string>(period.to);
  const [form,setForm]=useState(false),[edit,setEdit]=useState<ObligationRevision|null>(null),[candidate,setCandidate]=useState<Candidate|null>(null);
  const [action,setAction]=useState<ObligationCommand['action']>('CONFIRM'),[reject,setReject]=useState<Candidate|null>(null);
  const [pending,setPending]=useState<PlanningCommand|null>(null),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
  const gate=useRef(false),generation=useRef(0);
  useEffect(()=>{
    let live=true; const invalidate=()=>{generation.current++;};
    const clear=()=>{invalidate();setSnapshot(null);setForm(false);setEdit(null);setCandidate(null);setReject(null);};
    async function refresh() {
      clear();const version=generation.current;setFailed(false);
      try {const data=await loadObligations();if(live&&version===generation.current){setSnapshot(data);setHouseholdId(id=>data.reporting.households.some(h=>h.id===id)?id:data.reporting.households[0]?.id??'');setPending(p=>p&&data.reporting.households.some(h=>h.id===p.householdId)?p:null);if(!data.reporting.households.length)setMessage('');}}
      catch(error){if(live&&version===generation.current){setFailed(true);const safe=safeErrorSchema.safeParse(error);if(safe.success&&safe.data.code==='NOT_AUTHORIZED'){setPending(null);setMessage('');navigate('/sign-in',{replace:true});}}}
    }
    const subscription=browserClient()?.auth.onAuthStateChange(event=>{
      if(event==='SIGNED_OUT'){clear();setPending(null);setMessage('');navigate('/sign-in',{replace:true});}
      else if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED'||event==='USER_UPDATED')void refresh();
    }).data.subscription;
    const focus=()=>{void refresh();},visibility=()=>{if(document.visibilityState==='visible')void refresh();else clear();};
    window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visibility);void refresh();
    return()=>{live=false;invalidate();subscription?.unsubscribe();window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visibility);};
  },[navigate,reload]);
  const result=useMemo(()=>snapshot&&householdId?buildObligations(snapshot,householdId,from,to):null,[snapshot,householdId,from,to]);
  async function submit(command:PlanningCommand) {
    if(gate.current)return;gate.current=true;setSaving(true);setPending(command);setMessage('');const version=generation.current;
    try{await saveObligation(command);if(version===generation.current){setPending(null);setMessage('ההחלטה נשמרה.');setSnapshot(null);setReload(n=>n+1);}}
    catch(error){if(version===generation.current){const safe=safeErrorSchema.safeParse(error);
      if(safe.success&&safe.data.code==='NOT_AUTHORIZED'){setSnapshot(null);setPending(null);setMessage('');navigate('/sign-in',{replace:true});}
      else if(safe.success&&(safe.data.code==='CONFLICT'||safe.data.code==='INVALID_INPUT')){setPending(null);setSnapshot(null);setReload(n=>n+1);setMessage('הראיות או הגרסה השתנו, השיוך תפוס או הערכים אינם נתמכים. רעננו ובדקו החלטה חדשה; שינוי מועדים עם שיוך קיים דורש קודם ביטול שיוך מפורש.');}
      else setMessage('תוצאת השמירה אינה ידועה. נסו שוב עם אותה פקודה כדי למנוע החלטה כפולה.');}}
    finally{gate.current=false;setSaving(false);}
  }
  const reset=()=>{setForm(false);setEdit(null);setCandidate(null);setReject(null);setMessage('');};
  const disabled=saving||pending!==null;
  const pendingVisible=pending&&snapshot?.reporting.households.some(h=>h.id===pending.householdId);
  function editPlan(v:ObligationRevision,a:ObligationCommand['action']) {reset();setEdit(v);setAction(a);setForm(true);}
  return <section className="accounts-panel obligations-panel" aria-label="התחייבויות חוזרות">
    <button disabled={saving} onClick={()=>{setSnapshot(null);setReload(n=>n+1);}}>רענון התחייבויות וראיות</button>
    {message&&<p role="status">{message}</p>}
    {pendingVisible&&<div role="status"><p>פקודת שמירה ממתינה לבירור. אין להתחיל החלטה אחרת.</p><button disabled={saving} onClick={()=>void submit(pending)}>ניסיון חוזר של אותה שמירה</button></div>}
    {failed?<p role="alert">לא ניתן לטעון ראיות מאומתות. נסו לרענן.</p>:!snapshot?<p role="status">טוענים התחייבויות וראיות…</p>:!snapshot.reporting.households.length?<p>אין כרגע גישה לבית.</p>:<>
      <div className="accounts-toolbar">
        <label>בית<select value={householdId} disabled={disabled} onChange={e=>{reset();setHouseholdId(e.target.value);}}>{snapshot.reporting.households.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
        <label>מועדים צפויים מתאריך<input type="date" required disabled={disabled} value={from} onChange={e=>{reset();setFrom(e.target.value);}} /></label>
        <label>מועדים צפויים עד תאריך<input type="date" required disabled={disabled} value={to} onChange={e=>{reset();setTo(e.target.value);}} /></label>
      </div>
      <p>הצעה היא השערה. התחייבות מאושרת היא תכנון בלבד; מועד צפוי אינו תנועה כספית, אינו משנה תקציב ואינו אישור לכסף פנוי.</p>
      <p>נתמכות התחייבויות הוצאה חודשיות בלבד. העברות, קרן הלוואה, השקעות והחזרים אינם מוסקים כהוצאות חוזרות. אין המרת מטבע עתידית.</p>
      {result?.error?<p role="alert">לא ניתן להציג תוצאה אמינה. בדקו שלמות היסטוריה וטווח של עד 120 חודשים ו־1,000 מועדים.</p>:<>
        <button disabled={disabled} onClick={()=>{reset();setAction('CONFIRM');setForm(true);}}>הוספת התחייבות ידנית</button>
        {form&&<ObligationForm key={`${householdId}/${edit?.id??candidate?.key??'manual'}/${action}`} snapshot={snapshot} householdId={householdId} edit={edit} proposal={candidate?.proposed} origin={candidate?.origin} action={action} disabled={disabled} onSave={c=>void submit(c)} onCancel={reset} />}
        {reject&&<div role="group" aria-label="אישור דחיית הצעה"><p>דחיית ההשערה {reject.proposed.name} עבור הראיות שנבדקו. לא תשתנה אף תנועה.</p><button disabled={disabled} onClick={()=>void submit(rejectionCommandSchema.parse({householdId,id:crypto.randomUUID(),action:'REJECT',expectedVersion:0,idempotencyKey:crypto.randomUUID(),acknowledge:true,evidence:reject.origin}))}>אישור דחיית הצעה</button><button disabled={disabled} onClick={()=>setReject(null)}>ביטול דחייה</button></div>}
        <h2>הצעות לא מאושרות</h2>
        {result?.analysis?.diagnostics.map(i=><p key={i}>{issueText[i]??i}</p>)}
        {!result?.analysis?.candidates.length&&<p>אין כרגע הצעות הנתמכות בשלוש הופעות לפחות. אין בכך הוכחה להיעדר התחייבויות.</p>}
        {result?.analysis?.candidates.map(c=><article className="account-card" key={c.key} aria-label={`הצעה ${c.proposed.name}`}>
          <h3>{c.proposed.name}</h3><p>{c.confidence==='SUPPORTING'?'דפוס תומך — זהות ההתחייבות לא אומתה':'דפוס עמום — נדרשת בדיקה'} · {displayMoney(c.proposed.money)} · {c.occurrences.length} הופעות</p>
          <p>חשבון: {snapshot.reporting.accounts.find(a=>a.account.id===c.proposed.accountId)?.account.name} · ייחוס: {c.proposed.ownership.kind==='HOUSEHOLD'?'משותף':snapshot.reporting.members.find(m=>m.id===(c.proposed.ownership.kind==='MEMBER'?c.proposed.ownership.memberId:null))?.displayName}</p>
          <ul>{c.issues.map(i=><li key={i}>{issueText[i]??i}</li>)}</ul>
          <details><summary>הראיות להצעה</summary><p>קיבוץ לפי חשבון, מטבע, בעלות, זהות סוחר ותיאור מנורמל; בדיקת סכום מדויק וחודשים רצופים ויום חיוב מוצמד.</p><ul>{c.occurrences.map(r=><li key={r.revisionId}>{r.transaction.transactionDate} · {displayMoney(r.transaction.money)} · {r.transaction.description}<p>תנועה {r.transaction.id} · גרסה {r.version} · הקצאה {r.transaction.allocations[0]!.id}</p><p>מקור: {r.transaction.provenance.map(p=>`${p.source.kind} / ${p.source.sourceId} / ${p.ingestionItemId??'ידני'} / ${p.externalTransactionId??''}`).join(' · ')}</p></li>)}</ul></details>
          <button disabled={disabled} onClick={()=>{reset();setCandidate(c);setAction('CONFIRM');setForm(true);}}>בדיקה ואישור התחייבות</button><button disabled={disabled} onClick={()=>{reset();setReject(c);}}>דחיית הצעה</button>
        </article>)}
        <details><summary>היסטוריית דחיות</summary><ul>{snapshot.rejections.filter(r=>r.householdId===householdId).map(r=><li key={r.id}>הצעה נדחתה במפורש · {r.evidence.length} ראיות · {snapshot.reporting.members.find(m=>m.id===r.actorMemberId)?.displayName} · {r.recordedAt}<p>{r.evidence.map(e=>`${e.transactionId} / ${e.revisionId} / ${e.allocationId}`).join(' · ')}</p></li>)}</ul></details>
        <h2>התחייבויות שאושרו במפורש</h2>
        {!result?.context?.heads.some(v=>v.householdId===householdId)&&<p>טרם אושרו התחייבויות בבית זה.</p>}
        {result?.context?.heads.filter(v=>v.householdId===householdId).map(v=><article className="account-card" key={v.id} aria-label={`התחייבות ${v.plan.name}`}>
          <h3>{v.plan.name}</h3><p>{displayMoney(v.plan.money)} · יום {v.plan.schedule.day} בכל חודש · גרסה {v.version} · {v.status==='ACTIVE'?'מאושרת כתכנון':v.status==='ARCHIVED'?'בארכיון':'מבוטלת'}</p>
          <p>תוקף גרסה: {v.effectiveFrom} · התחלה {v.plan.startDate} · סיום {v.plan.endDate??'לא נקבע'}</p>
          <details><summary>היסטוריית החלטות</summary><ul>{snapshot.revisions.filter(n=>n.id===v.id).map(n=><li key={n.version}>גרסה {n.version} · {displayMoney(n.plan.money)} · יום {n.plan.schedule.day} · תוקף {n.effectiveFrom} · {n.status} · {snapshot.reporting.members.find(m=>m.id===n.actorMemberId)?.displayName} · {n.recordedAt}<p>הראיות המקוריות: {n.origin.map(e=>`${e.transactionId} / ${e.revisionId} / ${e.allocationId}`).join(' · ')||'אישור ידני ללא הצעה'}</p></li>)}</ul></details>
          <details><summary>כל החלטות שיוך הראיות</summary><ul>{snapshot.payments.filter(p=>p.obligationId===v.id).map(p=><li key={`${p.id}/${p.version}`}>מועד {p.date} · גרסת התחייבות {p.obligationVersion} · גרסת שיוך {p.version} · {eventState[p.state]} · {p.actual?displayMoney(p.actual):'ללא תשלום משויך'} · {snapshot.reporting.members.find(m=>m.id===p.actorMemberId)?.displayName} · {p.recordedAt}<p>תנועה {p.evidence?.transactionId??'ביטול שיוך'} · ראיית גרסה {p.evidence?.revisionId??'ללא ראיה פעילה'}</p></li>)}</ul></details>
          {v.status==='ACTIVE'&&<><button disabled={disabled} onClick={()=>editPlan(v,'EDIT')}>עריכת התחייבות</button><button disabled={disabled} onClick={()=>editPlan(v,'ARCHIVE')}>העברה לארכיון</button><button disabled={disabled} onClick={()=>editPlan(v,'CANCEL')}>ביטול התחייבות</button></>}
        </article>)}
        <h2>מועדים צפויים וראיות תשלום</h2>
        <p>ללא שיוך מפורש המצב אינו ידוע. גם סכום ותאריך דומים אינם אישור תשלום. חסרה הוכחה לכיסוי חיצוני; סכומים במטבע זר אינם סכומי שקלים קבועים ואין שער עתידי.</p>
        {!result?.events.length&&<p>אין מועדים צפויים בטווח שנבחר.</p>}
        {result?.events.map(event=><article className="account-card" key={event.id} aria-label={`מועד ${event.obligation.plan.name} ${event.date}`}>
          <h3>{event.obligation.plan.name} · {event.date}</h3><p>סכום צפוי {displayMoney(event.money)} · גרסת התחייבות {event.obligation.version}</p><p>{eventState[event.state]}</p>
          <PaymentReview snapshot={snapshot} event={event} head={result.context!.heads.find(v=>v.id===event.obligation.id)!} disabled={disabled} onSave={c=>void submit(c)} />
          <details><summary>היסטוריית שיוך</summary><ul>{snapshot.payments.filter(p=>p.obligationId===event.obligation.id&&p.obligationVersion===event.obligation.version&&p.date===event.date).map(p=><li key={`${p.id}/${p.version}`}>גרסה {p.version} · {eventState[p.state]} · {p.actual?displayMoney(p.actual):'ללא תשלום משויך'} · {p.recordedAt} · {p.evidence?.revisionId??'ביטול שיוך'}</li>)}</ul></details>
        </article>)}
      </>}
    </>}
  </section>;
}
