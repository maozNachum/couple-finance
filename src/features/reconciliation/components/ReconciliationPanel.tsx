import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { browserClient } from '@/shared/infrastructure/supabase-client';
import { reconciliationCommandSchema } from '@finance/contracts/reconciliation';
import type { ReconciliationCommand, ReconciliationKind, ReconciliationMeaning, ReconciliationParticipant, ReconciliationSnapshot, ReconciliationDecision } from '@finance/contracts/reconciliation';
import { decisionIsStale, latestDecisions, previewReconciliation, reconciliationCandidates, reconciliationCurrent, selectionFor } from '@finance/domain/reconciliation';
import { compare, decimal } from '@finance/domain/money/decimal';
import { safeErrorSchema } from '@finance/contracts/safe-error';
import { loadReconciliation, saveReconciliation } from '../api/reconciliation';
import { kinds, meanings, states, confirmedStates, actions, reasons, financialEffects } from '../model/presentation';

type Draft = Omit<ReconciliationParticipant,'parts'> & {parts: {allocationId:string;meaning:ReconciliationMeaning|''}[]};
export function ReconciliationPanel(){
 const navigate=useNavigate();
 const [data,setData]=useState<ReconciliationSnapshot|null>(null),[household,setHousehold]=useState(''),[account,setAccount]=useState('');
 const [kind,setKind]=useState<ReconciliationKind>('TRANSFER'),[selected,setSelected]=useState<Draft[]>([]),[reason,setReason]=useState(''),[fx,setFx]=useState('');
 const [replacement,setReplacement]=useState<ReconciliationDecision|null>(null),[ack,setAck]=useState(false);
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[checking,setChecking]=useState(false),[failed,setFailed]=useState(false);
 const [pending,setPending]=useState<ReconciliationCommand|null>(null);
 const pendingRef=useRef<ReconciliationCommand|null>(null),inFlight=useRef(false),epoch=useRef(0),live=useRef(true);
 const clearPreview=useCallback(()=>{setSelected([]);setReason('');setFx('');setAck(false);setReplacement(null);},[]);
 const clearProtected=useCallback(()=>{setData(null);clearPreview();pendingRef.current=null;setPending(null);setHousehold('');setAccount('');},[clearPreview]);
 const refresh=useCallback(async()=>{
  if(!live.current)return;const ticket=++epoch.current;setChecking(true);clearPreview();
  try{const next=await loadReconciliation();if(!live.current||ticket!==epoch.current)return;
   const retained=pendingRef.current;
   if(!next.households.length||(retained&&!next.households.some(h=>h.id===retained.householdId))){clearProtected();setFailed(true);setMessage('הגישה למשק הבית בוטלה. המידע והבקשה נמחקו.');return;}
   setData(next);setFailed(false);
  }catch(error){if(!live.current||ticket!==epoch.current)return;const safe=safeErrorSchema.safeParse(error);
   if(safe.success&&safe.data.code==='NOT_AUTHORIZED'){clearProtected();setFailed(true);}else{setData(null);setMessage('לא ניתן לאמת מחדש את המידע. בקשה שתוצאתה אינה ודאית נשמרת בזיכרון לניסיון זהה.');}
  }finally{if(live.current&&ticket===epoch.current)setChecking(false);}
 },[clearPreview,clearProtected]);
 useEffect(()=>{live.current=true;void Promise.resolve().then(refresh);
  const sub=browserClient()?.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){epoch.current++;clearProtected();setChecking(false);navigate('/sign-in',{replace:true});}}).data.subscription;
  const focus=()=>{if(!inFlight.current)void refresh();};window.addEventListener('focus',focus);
  const token=epoch;
  return()=>{live.current=false;token.current++;sub?.unsubscribe();window.removeEventListener('focus',focus);};
 },[navigate,refresh,clearProtected]);
 async function send(command:ReconciliationCommand){
  if(inFlight.current)return;inFlight.current=true;setBusy(true);setMessage('');pendingRef.current=command;setPending(command);const ticket=epoch.current;
  try{await saveReconciliation(command);if(!live.current||ticket!==epoch.current)return;
   pendingRef.current=null;setPending(null);setMessage(command.action==='UNLINK'?'הקשר הוסר. ההיסטוריה נשמרה.':'הקשר נשמר בשרת. לא שונו תנועות או יתרות.');await refresh();
  }catch(error){if(!live.current||ticket!==epoch.current)return;const safe=safeErrorSchema.safeParse(error);
   if(safe.success&&safe.data.code==='NOT_AUTHORIZED'){clearProtected();setFailed(true);setMessage('אין הרשאה. המידע נמחק.');}
   else if(safe.success&&['CONFLICT','INVALID_INPUT'].includes(safe.data.code)){pendingRef.current=null;setPending(null);clearPreview();setMessage('הבקשה נדחתה. רעננו את הנתונים וסקרו שוב את הגרסאות והקשרים.');}
   else setMessage('תוצאת השמירה אינה ודאית. יש לנסות שוב את אותה בקשה כדי לקבל את התוצאה המקורית.');
  }finally{inFlight.current=false;if(live.current){setBusy(false);}}
 }
 const derived=useMemo(()=>{try{return {current:data?reconciliationCurrent(data,household):[],failed:false};}catch{return {current:[],failed:true};}},[data,household]);
 const current=derived.current,decisions=data?latestDecisions(data.decisions,household):[];
 const claims=decisions.filter(d=>d.action!=='UNLINK'&&d.id!==replacement?.id).flatMap(d=>d.participants.map(p=>p.selection.transactionId));
 const accounts=data?.accounts.filter(a=>a.account.householdId===household)??[];
 const payment=selected.find(p=>p.role==='PAYMENT');
 const candidates=data&&payment?reconciliationCandidates(data,household,payment.transactionId,kind):[];
 const eligible=current.filter(r=>r.entryKind==='MOVEMENT'&&r.transaction.status==='POSTED'&&!claims.includes(r.transaction.id)&&accounts.some(a=>a.account.id===r.transaction.accountId&&a.account.status==='ACTIVE'));
 const payload={householdId:household,id:replacement?.id??'00000000-0000-4000-8000-000000000001',expectedVersion:replacement?.version??0,action:replacement?'REPLACE':'LINK',kind,participants:selected,fxRateId:fx||null,reason,acknowledge:true,idempotencyKey:'preview_reconciliation_01'};
 let preview:ReturnType<typeof previewReconciliation>|null=null;
 try{if(data&&selected.length&&reason.trim()&&selected.every(p=>p.parts.every(a=>a.meaning)))preview=previewReconciliation(payload,data);}catch{/* Incomplete selection remains unresolved. */}
 const disabled=busy||checking||Boolean(pending);
 function add(id:string,role:ReconciliationParticipant['role']){
  const r=current.find(r=>r.transaction.id===id),a=accounts.find(a=>a.account.id===r?.transaction.accountId);if(!r||!a)return;
  const selection=selectionFor(r,a.version,role,kind);
  setSelected(prev=>[...prev.filter(p=>p.transactionId!==id&&(role!=='PAYMENT'||p.role!=='PAYMENT')&&(role!=='COUNTERPART'||p.role!=='COUNTERPART')),{...selection,parts:selection.parts.map(p=>({...p,meaning:kind==='LOAN'?'':p.meaning}))}]);setAck(false);
 }
 function unlink(d:ReconciliationDecision){
  const command=reconciliationCommandSchema.parse({householdId:household,id:d.id,expectedVersion:d.version,action:'UNLINK',kind:d.kind,participants:[],fxRateId:null,reason:'הסרה מפורשת לאחר סקירת הקשר וההיסטוריה',acknowledge:true,idempotencyKey:crypto.randomUUID()});void send(command);
 }
 return <section className="accounts-panel reconciliation-panel" aria-label="התאמת תנועות"><h1>התאמת תנועות</h1>
 <p>קישור מפורש של ראיות קיימות. לא נוצרת תנועה חדשה ולא משתנים סכומים, תאריכים, חלוקות או יתרות.</p>
 <div className="accounts-toolbar"><Link to="/accounts">חשבונות ומקורות</Link><Link to="/transactions">תנועות ותיקון כספי נפרד</Link></div>
 {message&&<p role="status">{message}</p>}{checking&&<p role="status">מאמתים הרשאות וגרסאות…</p>}
 {pending&&<div role="status"><p>בקשה שמורה בזיכרון עד לאישור התוצאה. רענון הדף המלא מוחק אותה; לאחר מכן בדקו את ההיסטוריה לפני יצירת קשר חדש.</p><button disabled={busy||checking||failed} onClick={()=>{void send(pending);}}>ניסיון חוזר לאותה התאמה</button></div>}
 {derived.failed&&<p role="alert">היסטוריית התנועות אינה שלמה או אינה תקינה. לא ניתן להציע או לאשר התאמות; רעננו ובדקו את הנתונים.</p>}
 {failed?<p role="alert">הגישה אינה זמינה. <Link to="/sign-in">כניסה מחדש</Link></p>:data&&!derived.failed&&<>
 <button disabled={busy||checking} onClick={()=>{void refresh();}}>רענון התאמות והרשאות</button>
 <fieldset disabled={disabled}><legend>הקשר פיננסי</legend>
 <label>משק בית להתאמה<select value={household} onChange={e=>{clearPreview();setHousehold(e.target.value);setAccount('');}}><option value="">בחרו משק בית</option>{data.households.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
 <label>סוג התאמה<select value={kind} onChange={e=>{clearPreview();setKind(e.target.value as ReconciliationKind);}}>{Object.entries(kinds).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
 <label>חשבון מקור<select value={account} onChange={e=>{clearPreview();setAccount(e.target.value);}}><option value="">בחרו חשבון</option>{accounts.filter(a=>a.account.status==='ACTIVE'&&(kind==='TRANSFER'||a.account.type==='BANK')).map(a=><option key={a.account.id} value={a.account.id}>{a.account.name} · {a.account.currency}</option>)}</select></label>
 <label>תנועה יוצאת קיימת<select value={payment?.transactionId??''} onChange={e=>{setSelected([]);if(e.target.value)add(e.target.value,'PAYMENT');}}><option value="">בחרו תנועה רשומה</option>{eligible.filter(r=>r.transaction.accountId===account&&compare(r.transaction.money.amount,decimal('0'))<0).map(r=><option key={r.revisionId} value={r.transaction.id}>{r.transaction.description} · {r.transaction.transactionDate} · {r.transaction.money.amount} {r.transaction.money.currency}</option>)}</select></label>
 </fieldset>
 {payment&&<><h2>הצעות לסקירה</h2><p>סכום זהה, תאריך קרוב או טקסט דומה אינם מוכיחים קשר. אין אישור אוטומטי.</p>
 {!candidates.length&&<p>אין הצעה מתאימה. אפשר לשמור ראיה חד־צדדית כחלקית או לבחור ראיה מפורשת מהרשימה.</p>}
 <ul>{candidates.map(c=><li key={c.revision.revisionId}>{c.revision.transaction.description} · <bdi>{c.revision.transaction.money.amount} {c.revision.transaction.money.currency}</bdi><p>{c.strength==='WEAK'?'דמיון חלש':'ראיות תומכות בלבד'}{c.ambiguous?' · כמה מועמדים — נדרשת הכרעה':''}</p><ul>{c.reasons.map(r=><li key={r}>{reasons[r]}</li>)}</ul><button disabled={disabled} onClick={()=>add(c.revision.transaction.id,'COUNTERPART')}>בחירת {c.revision.transaction.description}</button></li>)}</ul>
 <label>ראיה נגדית מפורשת<select disabled={disabled} value={selected.find(p=>p.role==='COUNTERPART')?.transactionId??''} onChange={e=>{setSelected(p=>p.filter(v=>v.role!=='COUNTERPART'));if(e.target.value)add(e.target.value,'COUNTERPART');}}><option value="">ללא ראיה נגדית — התאמה חלקית</option>{eligible.filter(r=>r.transaction.accountId!==payment.accountId&&compare(r.transaction.money.amount,decimal('0'))>0&&accounts.some(a=>a.account.id===r.transaction.accountId&&(kind==='TRANSFER'?!['CREDIT_CARD','LOAN'].includes(a.account.type):a.account.type===(kind==='CARD'?'CREDIT_CARD':'LOAN')))).map(r=><option key={r.revisionId} value={r.transaction.id}>{accounts.find(a=>a.account.id===r.transaction.accountId)?.account.name} · {r.transaction.description} · {r.transaction.money.amount} {r.transaction.money.currency}</option>)}</select></label>
 {kind==='CARD'&&<fieldset disabled={disabled}><legend>רכישות והחזרים שנבחרו במפורש</legend><p>בחרו רק רכישות ששייכות לסילוק הזה. הרשאות ממתינות אינן זמינות. הפרשים ועמלות לא יושלמו אוטומטית.</p>{eligible.filter(r=>accounts.some(a=>a.account.id===r.transaction.accountId&&a.account.type==='CREDIT_CARD')).map(r=><label key={r.revisionId}><input type="checkbox" checked={selected.some(p=>p.role==='PURCHASE'&&p.transactionId===r.transaction.id)} onChange={e=>{if(e.target.checked)add(r.transaction.id,'PURCHASE');else setSelected(p=>p.filter(v=>v.transactionId!==r.transaction.id));setAck(false);}}/>{r.transaction.description} · <bdi>{r.transaction.money.amount} {r.transaction.money.currency}</bdi></label>)}</fieldset>}
 <h2>המשמעות לפני האישור</h2>{selected.map(p=>{const r=current.find(r=>r.revisionId===p.revisionId);return r&&<article className="account-card" key={p.transactionId}><h3>{r.transaction.description}</h3><p>{accounts.find(a=>a.account.id===p.accountId)?.account.name} · {r.transaction.transactionDate} · <bdi>{r.transaction.money.amount} {r.transaction.money.currency}</bdi> · גרסה {r.version} · {p.role==='PAYMENT'?'תשלום':p.role==='COUNTERPART'?'ראיה נגדית':'רכישה / החזר'}</p>{r.transaction.allocations.map((a,ordinal)=><div key={a.id}><p><bdi>{a.money.amount} {a.money.currency}</bdi> · משמעות כספית קיימת: {financialEffects[a.effect]}{a.categorization.userLocked?' · סיווג משתמש נעול':''}</p>{kind==='LOAN'?<label>משמעות חלוקה {ordinal+1}<select aria-label={`משמעות חלוקה ${ordinal+1} בתנועה ${r.transaction.description}`} disabled={disabled} value={p.parts.find(v=>v.allocationId===a.id)?.meaning??''} onChange={e=>{const meaning=e.target.value as ReconciliationMeaning|'';setSelected(prev=>prev.map(v=>v.transactionId===p.transactionId?{...v,parts:v.parts.map(part=>part.allocationId===a.id?{...part,meaning}:part)}:v));setAck(false);}}><option value="">בחרו לפי ראיה מפורשת</option>{(['PRINCIPAL','INTEREST','FEE'] as const).filter(m=>p.role==='PAYMENT'||m==='PRINCIPAL').map(m=><option key={m} value={m}>{meanings[m]}</option>)}</select></label>:<p>משמעות הקשר: {p.role==='PURCHASE'?meanings.PURCHASE:meanings.TRANSFER}</p>}</div>)}</article>;})}
 <label>שער היסטורי שמור<select disabled={disabled} value={fx} onChange={e=>{setFx(e.target.value);setAck(false);}}><option value="">ללא שער — מטבע זהה בלבד</option>{data.rates.filter(r=>r.householdId===household).map(({rate})=><option key={rate.id} value={rate.id}>{rate.base} → {rate.quote} · {rate.rate} · {rate.effectiveDate} · {rate.id}</option>)}</select></label>
 <p>המרה רק בכיוון הרשום ובתאריך התשלום, בעיגול מפורש לשמונה ספרות. ללא שער מתאים הקשר נשאר בלתי פתור.</p>
 <label>ראיה וסיבת ההחלטה<textarea disabled={disabled} maxLength={500} value={reason} onChange={e=>{setReason(e.target.value);setAck(false);}}/></label>
 {preview?<div role="status"><p>{states[preview.state]}</p>{preview.difference!==null&&<p>הפרש מול הראיה הנגדית: <bdi>{preview.difference}</bdi></p>}{preview.purchaseDifference!==null&&<p>הפרש מול הרכישות: <bdi>{preview.purchaseDifference}</bdi></p>}{preview.state==='NEEDS_CORRECTION'&&<p>הקישור לא מתקן הוצאה כפולה או פיצול קרן. יש לבצע <Link to="/transactions">תיקון כספי נפרד</Link>, ואז לסקור ולהחליף את הקשר.</p>}</div>:<p>הבחירה עדיין אינה תקינה או מלאה: בדקו משמעות, גרסאות, סוג חשבון ומטבע.</p>}
 <label><input disabled={disabled} type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>סקרתי את הראיות, ההפרשים והמשמעות. אני מאשר/ת קישור בלבד ושומר/ת את כל התנועות המקוריות.</label>
 <button disabled={disabled||!ack||!preview||preview.state==='MISSING_FX'} onClick={()=>{const parsed=reconciliationCommandSchema.safeParse({...payload,id:replacement?.id??crypto.randomUUID(),idempotencyKey:crypto.randomUUID(),acknowledge:ack});if(parsed.success)void send(parsed.data);}}>אישור ושמירת הקשר</button>
 </>}
 <h2>קשרים והחלטות שמורות</h2>{!decisions.length&&<p>אין קשרים שמורים במשק הבית שנבחר.</p>}
 {decisions.map(d=><article className="account-card" key={d.id}><h3>{kinds[d.kind]} · גרסה {d.version}</h3><p>{d.action==='UNLINK'?'הקשר הוסר':decisionIsStale(d,current)?'הגרסאות השתנו — נדרשת סקירה מחדש':confirmedStates[d.state]}</p>{d.difference!==null&&<p>הפרש מול הראיה הנגדית: <bdi>{d.difference}</bdi></p>}{d.purchaseDifference!==null&&<p>הפרש מול הרכישות: <bdi>{d.purchaseDifference}</bdi></p>}<p>{d.reason} · {data.members.find(m=>m.id===d.actorMemberId)?.displayName??'חבר בית היסטורי'}</p>
 {d.action!=='UNLINK'&&<><button disabled={disabled} onClick={()=>{clearPreview();setKind(d.kind);setReplacement(d);setAccount(d.participants.find(p=>p.selection.role==='PAYMENT')?.selection.accountId??'');setReason(d.reason);const revised:Draft[]=d.participants.flatMap(p=>{const r=current.find(r=>r.transaction.id===p.selection.transactionId),a=accounts.find(a=>a.account.id===r?.transaction.accountId);return r&&a?[{...selectionFor(r,a.version,p.selection.role,d.kind),parts:r.transaction.allocations.map(a=>({allocationId:a.id,meaning:p.selection.parts.find(v=>v.allocationId===a.id)?.meaning??(d.kind==='LOAN'?'':p.selection.role==='PURCHASE'?'PURCHASE':'TRANSFER')}))}]:[];});setSelected(revised);}}>סקירה והחלפת ההחלטה</button><details><summary>אישור הסרה מפורשת</summary><p>כל התנועות וההחלטות הקודמות יישמרו. היתרות לא ישתנו.</p><button disabled={disabled} onClick={()=>unlink(d)}>אישור הסרת הקשר</button></details></>}
 <details><summary>היסטוריית החלטות וראיות מקור</summary>{data.decisions.filter(v=>v.householdId===household&&v.id===d.id).map(v=><div key={v.version}><h4>גרסה {v.version} · {actions[v.action]}</h4><p>{v.reason} · <bdi>{v.recordedAt}</bdi></p>{v.participants.map(p=><div key={p.selection.transactionId}><p>{p.revision.transaction.description} · {p.revision.transaction.transactionDate} · <bdi>{p.revision.transaction.money.amount} {p.revision.transaction.money.currency}</bdi> · גרסה {p.revision.version}</p><p>מקור: <bdi>{p.revision.transaction.provenance[0]?.source.sourceId}</bdi>{p.sourceReference&&<> · הפניה: {p.sourceReference}</>}</p>{p.importItemId&&<p>ראיית יבוא: <bdi>{p.importItemId}</bdi></p>}</div>)}{v.fx&&<p>שער שמור: {v.fx.base} → {v.fx.quote} · {v.fx.rate} · {v.fx.effectiveDate}</p>}</div>)}</details></article>)}
 <h2>ראיות שטרם יושבו</h2><p>תנועות ממתינות ומבוטלות מוצגות להבחנה בלבד ואינן ניתנות לקישור.</p><ul>{current.filter(r=>r.entryKind==='MOVEMENT'&&!claims.includes(r.transaction.id)).map(r=><li key={r.revisionId}>{r.transaction.description} · <bdi>{r.transaction.money.amount} {r.transaction.money.currency}</bdi> · {r.transaction.status==='PENDING'?'ממתינה':r.transaction.status==='VOIDED'?'מבוטלת':'טרם קושרה'}</li>)}</ul>
 </>}
 </section>;
}
