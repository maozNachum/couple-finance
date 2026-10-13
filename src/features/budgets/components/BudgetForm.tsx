import type { FormEvent } from 'react';
import type { BudgetSnapshot, BudgetRevision, BudgetCommand } from '@finance/contracts/budgets';
import { budgetCommandSchema } from '@finance/contracts/budgets';
import { useState } from 'react';
import { scopeText } from '../model/presentation';

export function BudgetForm({snapshot,householdId,month,currency,edit,onSave,onCancel,disabled}:{
  snapshot:BudgetSnapshot;householdId:string;month:string;currency:string;edit:BudgetRevision|null;
  onSave:(command:BudgetCommand)=>void;onCancel:()=>void;disabled:boolean;
}) {
  const [kind,setKind]=useState(edit?.scope.kind??'TOTAL'),[invalid,setInvalid]=useState(false);
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form=new FormData(event.currentTarget);
    const parsed=budgetCommandSchema.safeParse({id:edit?.id??crypto.randomUUID(),householdId,month,
      planned:{amount:String(form.get('amount')??''),currency:edit?.planned.currency??currency},
      scope:edit?.scope??{kind,memberId:kind==='MEMBER'?form.get('member'):null,categoryId:kind==='TOTAL'?null:form.get('category')||null},
      action:edit?'EDIT':'CREATE',expectedVersion:edit?.version??0,idempotencyKey:crypto.randomUUID()});
    setInvalid(!parsed.success); if(parsed.success) onSave(parsed.data);
  }
  return <form className="account-form" aria-label={edit?'עריכת תוכנית':'תוכנית חודשית חדשה'} onSubmit={submit}>
    <h2>{edit?'עריכת סכום מתוכנן':'תוכנית חודשית חדשה'}</h2>
    <fieldset disabled={disabled}>
      <legend>{month} · {edit?.planned.currency??currency}</legend>
      {edit?<p>{scopeText(edit.scope,snapshot)} · גרסה {edit.version}</p>:<>
        <label>תחום התוכנית<select value={kind} onChange={e=>setKind(e.target.value as typeof kind)}>
          <option value="TOTAL">יעד כולל לבית</option><option value="ALL">קטגוריה לכל הבית</option><option value="SHARED">הוצאות משותפות בלבד</option><option value="MEMBER">הוצאות המיוחסות לחבר בית</option>
        </select></label>
        {kind==='MEMBER'&&<label>חבר בית<select name="member" required>{snapshot.reporting.members.filter(m=>m.householdId===householdId&&m.status==='ACTIVE').map(m=><option key={m.id} value={m.id}>{m.displayName}</option>)}</select></label>}
        {kind!=='TOTAL'&&<label>קטגוריה<select name="category" required={kind==='ALL'}><option value="">{kind==='ALL'?'בחרו קטגוריה':'כל הקטגוריות'}</option>{snapshot.categories.filter(c=>c.householdId===householdId&&c.kind==='EXPENSE'&&c.status==='ACTIVE').map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
      </>}
      <label>סכום מתוכנן<input name="amount" inputMode="decimal" dir="ltr" required defaultValue={edit?.planned.amount??''} /></label>
      <p>תכנון בלבד. אין שינוי בתנועות או ביתרות. היעד הכולל אינו מתווסף ליעדים המפורטים.</p>
      <p>ייחוס אישי מבוסס על בעלות ההקצאה הרשומה. חלוקה באחוזים של הוצאות משותפות אינה נתמכת.</p>
      <button type="submit">שמירת תוכנית</button><button type="button" onClick={onCancel}>ביטול</button>
    </fieldset>
    {invalid&&<p role="alert">בדקו את הסכום ואת תחום התוכנית. הסכום חייב להיות לא שלילי, עד שמונה ספרות אחרי הנקודה.</p>}
  </form>;
}
