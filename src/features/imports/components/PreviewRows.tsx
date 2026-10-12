import { useState } from 'react';
import type { ImportPreview } from '@finance/contracts/import-preview';
const issues={MISSING_DATE:'תאריך חסר',INVALID_DATE:'תאריך אינו תואם לפורמט',MISSING_DESCRIPTION:'תיאור חסר',INVALID_DESCRIPTION:'תיאור ארוך מ־2,000 תווים',INVALID_AMOUNT:'סכום או דיוק לא נתמך',MISSING_AMOUNT:'סכום חסר',CONFLICTING_AMOUNT:'חובה וזכות סותרות',MISSING_CURRENCY:'מטבע חסר',INVALID_CURRENCY:'מטבע לא נתמך',CURRENCY_MISMATCH:'מטבע שונה ממטבע החשבון',INVALID_REFERENCE:'אסמכתה ארוכה מדי'};
export function PreviewRows({preview}:{preview:ImportPreview}){
 const [page,setPage]=useState(0);const pages=Math.ceil(preview.rows.length/25);
 return <section aria-label="תוצאות תצוגה מקדימה"><h2>תצוגה מקדימה בלבד</h2><p role="status">סה״כ {preview.total} · תקינות {preview.valid} · שגויות {preview.invalid} · חסרות מידע {preview.unresolved}</p><p>המשמעות הכספית של כל השורות אינה מסווגת (UNCLASSIFIED). אין שיוך אוטומטי להכנסה או להוצאה.</p>
 <ol className="observation-history">{preview.rows.slice(page*25,page*25+25).map(r=><li key={r.row}><strong>רשומה {r.row} · שורות מקור {r.lineStart}–{r.lineEnd}</strong><p>{r.description}</p><p><bdi>{r.date??'—'} · {r.money?`${r.money.amount} ${r.money.currency}`:'—'}</bdi></p>{r.reference&&<p>אסמכתה: {r.reference}</p>}{r.supplementary&&<p>מידע נוסף: {r.supplementary}</p>}<p>{r.state==='VALID'?'תקינה':r.issues.map(i=>issues[i]).join(' · ')}</p></li>)}</ol>
 <div className="accounts-toolbar"><button disabled={page===0} onClick={()=>setPage(p=>p-1)}>הקודם</button><span>עמוד {page+1} מתוך {Math.max(1,pages)}</span><button disabled={page+1>=pages} onClick={()=>setPage(p=>p+1)}>הבא</button></div></section>;
}
