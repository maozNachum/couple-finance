import { useState } from 'react';
import { mappingSchema, type ColumnMapping } from '@finance/contracts/import-preview';
const labels={date:'תאריך תנועה',description:'תיאור',amount:'סכום חתום',debit:'חובה',credit:'זכות',currency:'מטבע בקובץ',reference:'אסמכתה',supplementary:'מידע נוסף'};
export function MappingForm({headers,busy,onPreview,onChange}:{headers:readonly string[];busy:boolean;onPreview:(mapping:ColumnMapping)=>void;onChange:()=>void}){
 const [error,setError]=useState(false);
 return <form className="identity-form" aria-label="מיפוי עמודות" onChange={()=>{setError(false);onChange();}} onSubmit={e=>{
  e.preventDefault();const f=new FormData(e.currentTarget);const columns=Object.fromEntries(Object.keys(labels).map(k=>[k,f.get(k)===''?null:Number(f.get(k))]));
  const m=mappingSchema.safeParse({...columns,dateFormat:f.get('dateFormat'),decimal:f.get('decimal'),grouping:f.get('grouping'),sign:f.get('sign'),fixedCurrency:f.get('fixedCurrency')||null});
  if(!m.success){setError(true);return;}onPreview(m.data);
 }}><fieldset disabled={busy}><legend>מיפוי מפורש ופירוש הנתונים</legend>
 <p>בחרו סכום חתום או זוג עמודות חובה וזכות. כל עמודה יכולה לשמש תפקיד אחד. הגדירו מטבע קבוע או עמודת מטבע.</p>
 {Object.entries(labels).map(([key,label])=><div key={key}><label htmlFor={`csv-${key}`}>{label}</label><select id={`csv-${key}`} name={key} required={key==='date'||key==='description'} defaultValue=""><option value="">ללא מיפוי</option>{headers.map((h,i)=><option key={i} value={i}>{i+1} · {h}</option>)}</select></div>)}
 <label>פורמט תאריך<select name="dateFormat" required defaultValue=""><option value="" disabled>בחרו פורמט</option>{['YYYY-MM-DD','DD/MM/YYYY','MM/DD/YYYY'].map(f=><option key={f}>{f}</option>)}</select></label>
 <label>מפריד עשרוני<select name="decimal" required defaultValue=""><option value="" disabled>בחרו מפריד</option><option value=".">נקודה</option><option value=",">פסיק</option></select></label>
 <label>מפריד אלפים<select name="grouping" required defaultValue=""><option value="" disabled>בחרו מפריד</option><option value="NONE">ללא</option><option value=",">פסיק</option><option value=".">נקודה</option></select></label>
 <label>משמעות הסימן<select name="sign" required defaultValue=""><option value="" disabled>בחרו פירוש</option><option value="POSITIVE_INCREASES">סכום חיובי מגדיל את הפוזיציה</option><option value="POSITIVE_DECREASES">סכום חיובי מקטין את הפוזיציה</option><option value="CREDIT_INCREASES">זכות מגדילה, חובה מקטינה</option><option value="DEBIT_INCREASES">חובה מגדילה, זכות מקטינה</option></select></label>
 <label>מטבע קבוע<select name="fixedCurrency" defaultValue=""><option value="">ללא — מיפוי עמודת מטבע נדרש</option>{['ILS','USD','EUR','JPY','KWD'].map(c=><option key={c}>{c}</option>)}</select></label>
 {error&&<p role="alert">המיפוי חסר או סותר. אין להשתמש באותה עמודה פעמיים; בחרו סכום ופירוש סימן תואמים, ומקור מטבע יחיד.</p>}
 <button>יצירת תצוגה מקדימה</button></fieldset></form>;
}
