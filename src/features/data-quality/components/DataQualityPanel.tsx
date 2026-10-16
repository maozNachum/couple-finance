import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { browserClient } from '@/shared/infrastructure/supabase-client';
import { dataQualityRequestSchema } from '@finance/contracts/data-quality';
import type { DataQualitySnapshot } from '@finance/contracts/data-quality';
import type { ForecastRequest } from '@finance/contracts/forecast';
import { financialDataQuality } from '@finance/domain/data-quality';
import { safeErrorSchema } from '@finance/contracts/safe-error';
import { loadDataQuality } from '../api/data-quality';
import { currentDay, coverageText, moduleText, typeText, reasonText, actions } from '../model/presentation';
import { accountHref } from '@/shared/navigation/account-context';

export function DataQualityPanel() {
  const navigate=useNavigate(),generation=useRef(0);
  const [snapshot,setSnapshot]=useState<DataQualitySnapshot|null>(null),[failed,setFailed]=useState(false),[reload,setReload]=useState(0);
  const [householdId,setHouseholdId]=useState(''),[asOf,setAsOf]=useState<string>(currentDay),[month,setMonth]=useState(()=>currentDay().slice(0,7)),[currency,setCurrency]=useState('ILS');
  const [evidenceAsOf,setEvidenceAsOf]=useState<string>(currentDay),[withForecast,setWithForecast]=useState(false),[buffer,setBuffer]=useState('');
  const [choices,setChoices]=useState<ForecastRequest['accounts']>([]),[page,setPage]=useState(0);
  useEffect(()=>{
    let live=true;
    const invalidate=()=>{generation.current++;};
    const clear=()=>{invalidate();setSnapshot(null);setChoices([]);setBuffer('');setWithForecast(false);setPage(0);};
    async function refresh() {
      clear();const version=generation.current;setFailed(false);
      try {const data=await loadDataQuality();if(live && version===generation.current){setSnapshot(data);setEvidenceAsOf(currentDay());setHouseholdId(id=>data.obligations.reporting.households.some(h=>h.id===id)?id:data.obligations.reporting.households[0]?.id??'');}}
      catch(error){if(live && version===generation.current){setFailed(true);const safe=safeErrorSchema.safeParse(error);if(safe.success && safe.data.code==='NOT_AUTHORIZED')navigate('/sign-in',{replace:true});}}
    }
    const subscription=browserClient()?.auth.onAuthStateChange(event=>{
      if(event==='SIGNED_OUT'){clear();navigate('/sign-in',{replace:true});}
      else if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED'||event==='USER_UPDATED')void refresh();
    }).data.subscription;
    const focus=()=>{void refresh();},visibility=()=>{if(document.visibilityState==='visible')void refresh();else clear();};
    window.addEventListener('focus',focus);document.addEventListener('visibilitychange',visibility);void refresh();
    return ()=>{live=false;invalidate();subscription?.unsubscribe();window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',visibility);};
  },[navigate,reload]);
  const input=useMemo(()=>dataQualityRequestSchema.safeParse({reporting:{householdId,asOf,month,currency},forecast:withForecast?{householdId,start:asOf,evidenceAsOf,horizon:30,buffer:{amount:buffer,currency},accounts:choices}:null}),[householdId,asOf,month,currency,withForecast,evidenceAsOf,buffer,choices]);
  const evaluated=useMemo(()=>{
    if(!snapshot||!input.success)return null;
    try{return {ok:true as const,result:financialDataQuality(snapshot,input.data)};}catch{return {ok:false as const};}
  },[snapshot,input]);
  const result=evaluated?.ok?evaluated.result:null;
  const accounts=snapshot?.obligations.reporting.accounts.filter(a=>a.account.householdId===householdId)??[];
  const change=()=>setPage(0);
  const pageCount=Math.max(1,Math.ceil((result?.findings.length??0)/10)),currentPage=Math.min(page,pageCount-1);
  return <section className="accounts-panel" aria-label="איכות המידע הפיננסי">
    <button onClick={()=>{generation.current++;setSnapshot(null);setReload(n=>n+1);}}>רענון איכות המידע</button>
    {failed?<p role="alert">לא ניתן לטעון ראיות מאומתות. נסו לרענן.</p>:!snapshot?<p role="status">טוענים ראיות פיננסיות…</p>:!snapshot.obligations.reporting.households.length?<p>אין כרגע גישה לבית.</p>:<>
      <div className="accounts-toolbar">
        <label>בית<select value={householdId} onChange={e=>{generation.current++;setHouseholdId(e.target.value);setChoices([]);setBuffer('');setWithForecast(false);change();}}>{snapshot.obligations.reporting.households.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
        <label>תאריך בדיקת יתרות<input type="date" value={asOf} onChange={e=>{setAsOf(e.target.value);change();}} /></label>
        <label>חודש הדיווח<input type="month" value={month} onChange={e=>{setMonth(e.target.value);change();}} /></label>
        <label>מטבע הדיווח<select value={currency} onChange={e=>{setCurrency(e.target.value);setBuffer('');change();}}>{['ILS','USD','EUR','JPY','KWD'].map(c=><option key={c}>{c}</option>)}</select></label>
      </div>
      <p>שלמות החישוב מתייחסת לרשומות הידועות בלבד. לא ניתן לוודא שכל החשבונות החיצוניים וכל התקופות ההיסטוריות נמצאים במערכת.</p>
      <p>התמונה נטענה מהשרת: <bdi>{snapshot.capturedAt}</bdi>. שינויים לאחר מועד זה דורשים רענון. תאריך מדידה ותאריך רישום אינם בהכרח זהים.</p>
      <details><summary>בדיקת ראיות לתחזית ל־30 יום</summary>
        <label><input type="checkbox" checked={withForecast} onChange={e=>{setWithForecast(e.target.checked);change();}} />לכלול בדיקת תחזית לפי בחירות מפורשות</label>
        {withForecast&&<>
          <p>בסיס הראיות לפי שעון הדפדפן בירושלים: {evidenceAsOf}. בחירות אלה הן לבדיקה זו בלבד.</p>
          <label>כרית מזומן מפורשת<input inputMode="decimal" value={buffer} onChange={e=>{setBuffer(e.target.value);change();}} /></label>
          {accounts.filter(a=>a.account.status==='ACTIVE'&&['BANK','CASH','SAVINGS'].includes(a.account.type)).map(a=><label key={a.account.id}>זמינות {a.account.name}<select value={choices.find(c=>c.accountId===a.account.id)?.choice??''} onChange={e=>{const other=choices.filter(c=>c.accountId!==a.account.id);setChoices(e.target.value?[...other,{accountId:a.account.id,choice:e.target.value as 'INCLUDE'|'EXCLUDE'}]:other);change();}}><option value="">טרם הוכרעה</option><option value="INCLUDE">מאשר/ת זמינות מיידית</option><option value="EXCLUDE">לא לכלול במזומן</option></select></label>)}
        </>}
        <p><Link to="/forecast">למסך התחזית המלא</Link></p>
      </details>
      {!input.success&&<p role="status">השלימו תאריך וחודש תקינים, ובבדיקת תחזית גם כרית מזומן מפורשת שאינה שלילית.</p>}
      {evaluated?.ok===false&&<p role="alert">לא ניתן להשלים את הבדיקה: הראיות אינן תקינות או חורגות מהגבול הנתמך. אין סיכום חלקי שמוצג כמלא.</p>}
      {result&&<>
        <h2>{result.findings.length} נושאים לבירור בנתונים הידועים</h2>
        {!result.findings.length&&<p>לא זוהו בעיות נתמכות בטווח שנבחר. כיסוי החשבונות והתקופות מחוץ למערכת עדיין אינו ידוע.</p>}
        <ul>{result.calculations.map(c=><li key={c.module}>{moduleText[c.module]}: {coverageText[c.state]}</li>)}</ul>
        <p>אותו מקור לבעיה עשוי להשפיע על כמה תוצאות. המדדים אינם אישור להוציא כסף. בדיקת תקציב משתמשת במטבע התוכנית הרשום.</p>
        {result.findings.slice(currentPage*10,(currentPage+1)*10).map(f=><article className="account-card quality-finding" key={f.id}>
          <h3>{typeText[f.type]}{f.subject.kind==='ACCOUNT'&&` — ${accounts.find(a=>a.account.id===f.subject.id)?.account.name??''}`}</h3>
          <p>{f.explanation}</p>
          <ul>{f.reasons.map(reason=><li key={reason}>{reasonText[reason]??'יש לבדוק את מגבלת החישוב במסך הרלוונטי.'}</li>)}</ul>
          <p>משפיע על: {[...new Set(f.impacts.map(i=>moduleText[i.module]))].join(' · ')}. מצב הראיות: {coverageText[f.state]}.</p>
          {f.observationAgeDays!==null&&<p>גיל המדידה ביחס לתאריך הבדיקה: {f.observationAgeDays} ימים. אין דרישה שכל סוג חשבון יתעדכן מדי יום.</p>}
          <ul>{[...new Set(f.evidence.map(e=>e.measuredOn||e.recordedAt||e.currency?`תאריך פיננסי: ${e.measuredOn??'לא צוין'} · נרשם: ${e.recordedAt??'לא צוין'} · מטבע מקורי: ${e.currency??'לא צוין'}`:''))].filter(Boolean).slice(0,3).map(line=><li key={line}>{line}</li>)}</ul>
          {f.type==='HISTORICAL_FX'&&<p>כיוון ותאריך ההמרה: <bdi>{f.subject.id}</bdi></p>}
          {f.limitation&&<p>{f.limitation}</p>}
          {f.action&&<Link to={f.subject.kind==='ACCOUNT' && (f.action==='ACCOUNTS'||f.action==='TRANSACTIONS') && accounts.some(a=>a.account.id===f.subject.id) ? accountHref(f.action==='ACCOUNTS'?'/accounts':'/transactions',{id:f.subject.id,householdId}) : actions[f.action].path}>{actions[f.action].label}</Link>}
          <details><summary>כל {f.evidence.length} מקורות הראיות והתוצאות המושפעות</summary>
            <p>זהות הנושא: <bdi>{f.subject.id}</bdi>. יש לבחור את הבית והנושא במסך הבדיקה; הגישה נבדקת שם מחדש.</p>
            <ul>{f.evidence.map(e=><li key={`${e.kind}/${e.id}/${e.version}`}><bdi>{e.id}</bdi> · תאריך פיננסי: {e.measuredOn??'לא צוין'} · נרשם: {e.recordedAt??'לא צוין'} · מטבע מקורי: {e.currency??'לא צוין'}{e.kind==='SOURCE'&&` · סמכות מקור מתאריך: ${e.authorityFrom??'לא מונתה'}`}{e.version!==null&&` · גרסה ${e.version}`}{e.sourceId&&<> · מקור <bdi>{e.sourceId}</bdi></>}</li>)}</ul>
            <ul>{f.impacts.map(i=><li key={`${i.module}/${i.resultId}/${i.state}`}>{moduleText[i.module]} · <bdi>{i.resultId}</bdi> · {coverageText[i.state]}</li>)}</ul>
          </details>
        </article>)}
        {pageCount>1&&<nav aria-label="עמודי ממצאים"><button disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>הקודם</button><span role="status">עמוד {currentPage+1} מתוך {pageCount} — כל {result.findings.length} הנושאים זמינים</span><button disabled={currentPage+1===pageCount} onClick={()=>setPage(currentPage+1)}>הבא</button></nav>}
      </>}
    </>}
  </section>;
}
