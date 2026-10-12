import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { browserClient } from '@/shared/infrastructure/supabase-client';
import { csvFailureSchema, importLimits, type ImportPreview, type UploadRecord, type ColumnMapping } from '@finance/contracts/import-preview';
import { loadImports, importCommand, uploadBytes, processUpload, cancelUpload } from '../api/imports';
import { MappingForm } from './MappingForm';
import { PreviewRows } from './PreviewRows';

export function ImportsPanel(){
 const navigate=useNavigate();const [data,setData]=useState<Awaited<ReturnType<typeof loadImports>>|null>(null);
 const [household,setHousehold]=useState(''),[accountId,setAccountId]=useState(''),[sourceId,setSourceId]=useState('');
 const [file,setFile]=useState<File|null>(null),[upload,setUpload]=useState<UploadRecord|null>(null),[preview,setPreview]=useState<ImportPreview|null>(null);
 const [headers,setHeaders]=useState<readonly string[]>([]),[delimiter,setDelimiter]=useState<','|';'|''>('');
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false),[generation,setGeneration]=useState(0);
 const inFlight=useRef(false),epoch=useRef(0); const [pending,setPending]=useState<{id:string;householdId:string;accountId:string;sourceId:string;filename:string;bytes:number}|null>(null);
 useEffect(()=>{
  let live=true;
  async function refresh(){const ticket=++epoch.current;setData(null);setPreview(null);setHeaders([]);setUpload(null);setFailed(false);setFile(null);setPending(null);
   try{const next=await loadImports();if(live&&ticket===epoch.current)setData(next);}catch{if(live&&ticket===epoch.current)setFailed(true);}}
  const sub=browserClient()?.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){epoch.current++;setData(null);setPreview(null);setHeaders([]);setFile(null);setUpload(null);navigate('/sign-in',{replace:true});}}).data.subscription;
  const focus=()=>{if(!inFlight.current)void refresh();};window.addEventListener('focus',focus);void refresh();
  const invalidate=()=>{epoch.current++;}; return()=>{live=false;invalidate();sub?.unsubscribe();window.removeEventListener('focus',focus);};
 },[navigate,generation]);
 const households=data?.households??[];
 const accounts=data?.accounts.filter(a=>a.account.householdId===household&&a.account.status==='ACTIVE')??[];
 const account=accounts.find(a=>a.account.id===accountId);
 async function work(action:()=>Promise<void>){if(inFlight.current)return;inFlight.current=true;setBusy(true);setMessage('');try{await action();}catch(error){setPreview(null);const failure=csvFailureSchema.safeParse(error);if(failure.success){setMessage({CSV_FORMAT:'מבנה CSV אינו תקין. נדרש UTF-8, מפריד תואם, כותרות ייחודיות ומירכאות סגורות; אין תמיכה ב־Excel.',CSV_LIMIT:'הקובץ חורג ממגבלות הגודל, השורות, העמודות או אורך התא. לא הושמטו שורות; יש להכין קובץ קטן יותר.',COLUMN_MAPPING:'המיפוי אינו תואם לעמודות הקובץ. בדקו שאין עמודות חסרות או תפקידים כפולים.'}[failure.data]);}else setMessage('הפעולה לא הושלמה או שלא ניתן לאשר את תוצאתה. בדקו הרשאות, פורמט ומגבלות. אפשר לרענן ולבחור את הרשומה הזמנית לניסיון חוזר או לביטול.');}finally{inFlight.current=false;setBusy(false);}}
 async function inspect(record:UploadRecord,mapping:ColumnMapping|null){if(!delimiter)return;const ticket=epoch.current;setPreview(null);const next=await processUpload({id:record.id,format:{encoding:'UTF-8',delimiter},mapping});if(ticket!==epoch.current)return;setHeaders(next.headers);setUpload(record);if(mapping)setPreview(next);else setMessage('הקובץ נקרא כ־UTF-8. בחרו מיפוי מפורש כדי לבדוק את השורות.');}
 const disabled=busy||Boolean(pending);
 return <section className="accounts-panel categorization-panel" aria-label="הכנת קובץ CSV"><h1>הכנת קובץ CSV</h1><p>העלאה פרטית, מיפוי ובדיקה בלבד. יבוא תנועות כספיות יהיה זמין בשלב 8; לא נשמרות תנועות או קטגוריות בתהליך זה.</p><Link to="/accounts">חזרה לחשבונות</Link>
 <p>UTF-8 בלבד, עד 1 MiB, עד 2,000 שורות נתונים, 32 עמודות ו־2,048 תווים בתא. שורת כותרת נדרשת. אין תמיכה ב־Excel או בקידודים אחרים.</p>
 {message&&<p role="status">{message}</p>}{busy&&<p role="status">מעבדים את הבקשה…</p>}
 {failed?<p role="alert">לא ניתן לטעון את ההרשאות. <Link to="/sign-in">התחברו מחדש</Link></p>:!data?<p role="status">טוענים חשבונות וקבצים זמניים…</p>:<>
 <button disabled={busy} onClick={()=>setGeneration(g=>g+1)}>רענון קבצים זמניים</button>
 <form className="identity-form" aria-label="העלאת CSV" onSubmit={e=>{e.preventDefault();if(!file||!account||!sourceId)return;void work(async()=>{
  const command=pending??{id:crypto.randomUUID(),householdId:household,accountId,sourceId,filename:file.name,bytes:file.size};setPending(command);
  const record=await importCommand('AUTHORIZE',command);setUpload(record);
  if(record.state==='AUTHORIZED')await uploadBytes(record,file);
  setPending(null);setFile(null);await inspect(record,null);
 });}}><fieldset disabled={disabled}><legend>הקשר והעלאה מפורשת</legend>
 <label>משק בית לקובץ<select required value={household} onChange={e=>{setHousehold(e.target.value);setAccountId('');setSourceId('');}}><option value="">בחרו משק בית</option>{households.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
 <label>חשבון קיים<select required value={accountId} onChange={e=>{setAccountId(e.target.value);setSourceId('');}}><option value="">בחרו חשבון</option>{accounts.map(a=><option key={a.account.id} value={a.account.id}>{a.account.name} · {a.account.currency}</option>)}</select></label>
 <label>מקור קיים<select required value={sourceId} onChange={e=>setSourceId(e.target.value)}><option value="">בחרו מקור</option>{account?.sources.map(s=><option key={s.id} value={s.id}>{{MANUAL:'מקור ידני',FILE_IMPORT:'מקור קובץ',LIVE_SYNC:'מקור מסונכרן'}[s.kind]} · {s.id}</option>)}</select></label>
 <p>שיוך ההקשר אינו משנה את המקור הקובע ליתרה או יוצר מקור חדש.</p>
 <label>קובץ CSV<input type="file" accept=".csv,text/csv" onChange={e=>{const f=e.target.files?.[0];setPreview(null);setHeaders([]);if(f&&f.size>0&&f.size<=importLimits.bytes&&/\.csv$/i.test(f.name)&&f.name.length<=160){setFile(f);setMessage('הקובץ נבחר; טרם הועלה.');}else{setFile(null);setMessage('בחרו CSV שאינו ריק ועומד במגבלות הגודל והשם.');}}}/></label>
 <button disabled={!file||!delimiter}>העלאה פרטית והכנת מיפוי</button></fieldset></form>
 {pending&&<button disabled={busy} onClick={()=>setGeneration(g=>g+1)}>בדיקת מצב הבקשה לפני ניסיון חוזר</button>}
 <label>מפריד עמודות<select disabled={busy} value={delimiter} onChange={e=>{setDelimiter(e.target.value as ','|';'|'');setPreview(null);setHeaders([]);}}><option value="">בחרו מפריד</option><option value=",">פסיק</option><option value=";">נקודה־פסיק</option></select></label>
 <h2>קבצים זמניים</h2><p>ההרשאה פגה לאחר 24 שעות. רענון מוחק את התצוגה מהזיכרון בלבד. ביטול ומחיקה מסירים את הקובץ ואת הרשומה הזמנית; תיעוד פעולה מינימלי נשאר.</p>
 <ul>{data.uploads.map(u=><li key={u.id}>{u.filename} · {u.state==='CANCELLED'?'בוטל':u.state==='EXPIRED'?'פג תוקף':u.state==='UPLOADED'?'הועלה':'ממתין להעלאה'} · תוקף עד <bdi>{u.expiresAt}</bdi><div className="accounts-toolbar"><button disabled={busy||!delimiter||u.state!=='UPLOADED'} onClick={()=>{void work(()=>inspect(u,null));}}>מיפוי {u.filename}</button><button disabled={busy} onClick={()=>{void work(async()=>{await cancelUpload(u);setPreview(null);setHeaders([]);setUpload(null);setMessage('הקובץ והרשומה הזמנית נמחקו. נשמר תיעוד פעולה בלבד.');setGeneration(g=>g+1);});}}>ביטול ומחיקת {u.filename}</button></div></li>)}</ul>
 {upload&&!data.uploads.some(u=>u.id===upload.id)&&<p>קובץ זמני: {upload.filename}. <button disabled={busy} onClick={()=>{void work(async()=>{await cancelUpload(upload);setUpload(null);setPreview(null);setHeaders([]);setMessage('הקובץ והרשומה הזמנית נמחקו.');setGeneration(g=>g+1);});}}>ביטול ומחיקת הקובץ הנוכחי</button></p>}
 {upload&&headers.length>0&&<p>מיפוי הקובץ {upload.filename} לחשבון {data.accounts.find(a=>a.account.id===upload.accountId)?.account.name} · {data.households.find(h=>h.id===upload.householdId)?.name}. מקור נבחר: <bdi>{upload.sourceId}</bdi></p>}
 {upload&&headers.length>0&&<MappingForm key={`${upload.id}-${delimiter}`} headers={headers} busy={busy} onChange={()=>setPreview(null)} onPreview={mapping=>{void work(()=>inspect(upload,mapping));}}/>}
 {preview&&<PreviewRows preview={preview}/>}
 </>}
 </section>;
}
