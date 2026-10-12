import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { importBatchLimit, importCommitCommandSchema, type ImportReview, type ImportResult, type ImportCommitCommand } from '@finance/contracts/import-commit';
import { safeErrorSchema } from '@finance/contracts/safe-error';
import { commitImport } from '../api/imports';

const reasons={PRIOR_IMPORT:'זהות שורת מקור שכבר יובאה — חסומה',INTERPRETATION_CHANGED:'אותה שורת מקור פורשה אחרת בעבר — חסומה',SAME_REFERENCE:'אסמכתה זהה באותו מקור',SAME_FINANCIAL_VALUES:'תאריך, סכום, מטבע ותיאור מנורמל זהים',SAME_DATE_AMOUNT:'תאריך, סכום ומטבע זהים',REPEATED_IN_FILE:'תאריך וסכום חוזרים בקובץ עצמו'};
const effects={UNCLASSIFIED:'לא מסווגת',INCOME:'הכנסה',EXPENSE:'הוצאה / החזר הוצאה',TRANSFER:'העברה',DEBT_PRINCIPAL:'קרן חוב',INVESTMENT_TRADE:'עסקת השקעה',ADJUSTMENT:'התאמה'};
export function ImportReviewPanel({review,context,onRunning}:{review:ImportReview;context:string;onRunning:(value:boolean)=>void}){
 const [decisions,setDecisions]=useState(()=>review.preview.rows.map(row=>({row:row.row,include:false,effect:'UNCLASSIFIED' as keyof typeof effects,status:'POSTED' as 'POSTED'|'PENDING',acknowledge:false})));
 const [page,setPage]=useState(0),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [pending,setPending]=useState<ImportCommitCommand|null>(null),[result,setResult]=useState<ImportResult|null>(null);
 const inFlight=useRef(false);const [rejected,setRejected]=useState(false);
 const selected=decisions.filter(d=>d.include),pages=Math.max(1,Math.ceil(decisions.length/25));
 const locked=busy||pending!==null||result!==null||rejected;
 function change(row:number,update:Partial<(typeof decisions)[number]>){setConfirm(false);setDecisions(ds=>ds.map(d=>d.row===row?{...d,...update}:d));}
 async function send(){
  if(inFlight.current||result||rejected)return;
  const parsed=importCommitCommandSchema.safeParse(pending??{action:'COMMIT',reviewId:review.id,idempotencyKey:crypto.randomUUID(),decisions});
  if(!parsed.success){setMessage('בחרו בין 1 ל־100 שורות תקינות ואשרו את האזהרות.');return;}
  const command=parsed.data;inFlight.current=true;setPending(command);setBusy(true);onRunning(true);setMessage('');
  try{const committed=await commitImport(command);setResult(committed);setPending(null);setConfirm(false);}
  catch(error){const safe=safeErrorSchema.safeParse(error);if(safe.success&&!safe.data.retryable&&['CONFLICT','INVALID_INPUT','NOT_AUTHORIZED'].includes(safe.data.code)){setPending(null);setRejected(true);setConfirm(false);setMessage('השרת דחה את הבקשה. רעננו את הקבצים, בדקו את תיעוד היבוא והכינו סקירה חדשה בהתאם להרשאות ולהיסטוריה העדכניות.');}else setMessage('לא ניתן לאשר שמירה. לא נציג הצלחה ללא אישור השרת. נסו שוב עם אותה בקשה כדי לבדוק את תוצאתה.');}
  finally{inFlight.current=false;setBusy(false);onRunning(false);}
 }
 return <section aria-label="סקירה ושמירת יבוא"><h2>סקירת יבוא לפני שמירה כספית</h2><p>{context}</p>
 <details><summary>פרטי מקור הקובץ והתיעוד</summary><p>מקור קובץ: <bdi>{review.sourceId}</bdi> · מזהה סקירה: <bdi>{review.id}</bdi></p><p>טביעת הקובץ: <bdi className="import-fingerprint">{review.contentHash}</bdi></p></details>
 <p>כל השורות מוחרגות בתחילה. דמיון אינו הוכחה לכפילות; אפשר לכלול תנועה נפרדת לאחר אישור מפורש. שתי תנועות באותו תאריך ובאותו סכום עשויות להיות תקינות.</p>
 <ol className="observation-history">{review.preview.rows.slice(page*25,page*25+25).map(row=>{
  const d=decisions.find(d=>d.row===row.row)!;const duplicate=review.duplicates.find(d=>d.row===row.row)!;
  const eligible=row.state==='VALID'&&!duplicate.exact;
  const evidence=duplicate.exact?'זהות מקור מוכחת':duplicate.reasons.some(reason=>reason==='SAME_REFERENCE'||reason==='SAME_FINANCIAL_VALUES')?'התאמה חזקה לבדיקה — אינה הוכחת כפילות':'דמיון חלש לבדיקה — אינו הוכחת כפילות';
  return <li key={row.row}><strong>רשומת יבוא {row.row} · שורות {row.lineStart}–{row.lineEnd}</strong><p>{row.description}</p><p><bdi>{row.date??'—'} · {row.money?`${row.money.amount} ${row.money.currency}`:'—'}</bdi></p>
  {!eligible&&<p>{row.state!=='VALID'?'שגויה או חסרת מידע — אין אפשרות לשמור': 'שורת מקור שכבר יובאה — אין אפשרות לשמור'}</p>}
  {duplicate.reasons.length>0&&<p>{evidence}: {duplicate.reasons.map(r=>reasons[r]).join(' · ')}</p>}
  {duplicate.candidateCount>0&&<details><summary>תנועות לבדיקה ({duplicate.candidateCount})</summary><p>מוצגים עד 10 מזהים; {duplicate.candidateCount} מועמדות בסך הכול. <Link to="/transactions">פתיחת היסטוריית התנועות</Link></p>{duplicate.candidates.map(id=><p key={id}><bdi>{id}</bdi></p>)}</details>}
  <label className="import-choice"><input type="checkbox" disabled={locked||!eligible} checked={d.include} onChange={e=>change(row.row,{include:e.target.checked})}/>לכלול רשומה {row.row}</label>
  <p>{d.include?'נבחרה ליבוא':'מוחרגת'}</p>
  {eligible&&<><label>משמעות רשומה {row.row}<select disabled={locked} value={d.effect} onChange={e=>change(row.row,{effect:e.target.value as keyof typeof effects})}>{Object.entries(effects).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  <label>מצב רשומה {row.row}<select disabled={locked} value={d.status} onChange={e=>change(row.row,{status:e.target.value as 'POSTED'|'PENDING'})}><option value="POSTED">נרשמה</option><option value="PENDING">ממתינה</option></select></label>
  {duplicate.reasons.length>0&&<label className="import-choice"><input type="checkbox" disabled={locked} checked={d.acknowledge} onChange={e=>change(row.row,{acknowledge:e.target.checked})}/>בדקתי את האזהרה ברשומה {row.row}; זו תנועה נפרדת שיש לשמור</label>}</>}
  </li>;
 })}</ol>
 <div className="accounts-toolbar"><button disabled={busy||page===0} onClick={()=>setPage(p=>p-1)}>עמוד סקירה קודם</button><span>עמוד {page+1} מתוך {pages}</span><button disabled={busy||page+1>=pages} onClick={()=>setPage(p=>p+1)}>עמוד סקירה הבא</button></div>
 <p role="status">נבחרו {selected.length} · תקינות שלא נבחרו {review.preview.valid-selected.length} · שגויות {review.preview.invalid} · חסרות מידע {review.preview.unresolved}. עד {importBatchLimit} תנועות בשמירה אטומית.</p>
 {!result&&!pending&&!rejected&&<button disabled={busy||selected.length===0||selected.length>importBatchLimit||selected.some(d=>!d.acknowledge&&(review.duplicates.find(r=>r.row===d.row)?.reasons.length??0)>0)} onClick={()=>setConfirm(true)}>בדיקת סיכום לפני שמירה</button>}
 {confirm&&!pending&&<div role="group" aria-label="אישור שמירת תנועות"><h3>שמירת {selected.length} תנועות כספיות</h3><p>זהו יבוא ושמירה ממשיים. תנועות שנרשמו ישפיעו על יתרת LEDGER אם קיימת יתרת פתיחה. לא ייווצרו יתרת פתיחה, קטגוריות או תנועות בחשבון אחר.</p><p>{context}</p><button disabled={busy} onClick={()=>{void send();}}>אישור ושמירת יבוא</button><button disabled={busy} onClick={()=>setConfirm(false)}>חזרה לסקירה</button></div>}
 {pending&&<button disabled={busy} onClick={()=>{void send();}}>בדיקת תוצאה וניסיון חוזר של אותה בקשה</button>}
 {busy&&<p role="status">ממתינים לאישור שמירה מהשרת…</p>}{message&&<p role="alert">{message}</p>}
 {result&&<div role="status"><h3>היבוא נשמר ואושר בשרת</h3><p>נשמרו {result.committed} · דולגו {result.skipped} · שגויות {result.invalid} · חסרות מידע {result.unresolved}</p><p>תיעוד המקור נשמר גם לאחר מחיקת הקובץ הזמני.</p>{result.transactions.map(t=><p key={t.transactionId}>רשומה {t.row}: <bdi>{t.transactionId}</bdi></p>)}<Link to="/transactions">צפייה בתנועות שנשמרו</Link></div>}
 </section>;
}
