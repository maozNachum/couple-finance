import { useState } from 'react';
import type { FormEvent } from 'react';
import { goalCommandSchema } from '@finance/contracts/goals';
import type { GoalCommand, GoalRevision, GoalsSnapshot } from '@finance/contracts/goals';

export function GoalForm({snapshot,householdId,edit,disabled,onSave,onCancel}:{
  snapshot:GoalsSnapshot;householdId:string;edit:GoalRevision|null;disabled:boolean;
  onSave:(command:GoalCommand)=>void;onCancel:()=>void;
}) {
  const [personal,setPersonal]=useState(edit?.ownership.kind==='MEMBER'),[invalid,setInvalid]=useState(false);
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const data=new FormData(event.currentTarget),currency=edit?.target.currency??String(data.get('currency'));
    const parsed=goalCommandSchema.safeParse({id:edit?.id??crypto.randomUUID(),householdId,
      ownership:edit?.ownership??(personal?{kind:'MEMBER',memberId:data.get('member')}:{kind:'HOUSEHOLD'}),
      name:data.get('name'),target:{amount:data.get('target'),currency},declared:{amount:data.get('declared'),currency},
      monthly:data.get('monthly')?{amount:data.get('monthly'),currency}:null,targetDate:data.get('date')||null,
      action:edit?'EDIT':'CREATE',expectedVersion:edit?.version??0,idempotencyKey:crypto.randomUUID(),acknowledge:data.get('acknowledge')==='on'});
    setInvalid(!parsed.success);if(parsed.success)onSave(parsed.data);
  }
  return <form className="account-form" aria-label={edit?'עריכת יעד':'יעד חדש'} onSubmit={submit}>
    <h2>{edit?'עריכת יעד':'יעד חדש'}</h2><fieldset disabled={disabled}><legend>פרטי התכנון</legend>
      <label>שם היעד<input name="name" required maxLength={100} defaultValue={edit?.name??''} /></label>
      {!edit?<><label>ייחוס היעד<select value={personal?'MEMBER':'HOUSEHOLD'} onChange={e=>setPersonal(e.target.value==='MEMBER')}><option value="HOUSEHOLD">משותף לבית</option><option value="MEMBER">אישי לחבר בית</option></select></label>
        {personal&&<label>חבר בית<select name="member" required><option value="">בחרו חבר בית</option>{snapshot.members.filter(m=>m.householdId===householdId&&m.status==='ACTIVE'&&m.userId).map(m=><option key={m.id} value={m.id}>{m.displayName}</option>)}</select></label>}
        <label>מטבע<select name="currency" defaultValue="ILS">{['ILS','USD','EUR','JPY','KWD'].map(c=><option key={c}>{c}</option>)}</select></label></>:<p>מטבע וייחוס נשמרים: <bdi>{edit.target.currency}</bdi> · גרסה {edit.version}</p>}
      <p>כל חברי הבית המורשים רואים גם יעדים אישיים.</p>
      <label>סכום היעד<input name="target" inputMode="decimal" dir="ltr" required defaultValue={edit?.target.amount??''} /></label>
      <label>סכום שהוגדר ידנית כמוקצה ליעד<input name="declared" inputMode="decimal" dir="ltr" required defaultValue={edit?.declared.amount??'0'} /></label>
      <label>הפקדה חודשית מתוכננת (רשות)<input name="monthly" inputMode="decimal" dir="ltr" defaultValue={edit?.monthly?.amount??''} /></label>
      <label>תאריך יעד (רשות)<input name="date" type="date" min="0001-01-01" max="9999-12-31" defaultValue={edit?.targetDate??''} /></label>
      <label><input type="checkbox" name="acknowledge" required />אני מאשר/ת שזה תכנון והצהרה ידנית; הכסף לא אומת בבנק ולא נשמר או הועבר בפועל.</label>
      <button type="submit">שמירת יעד</button><button type="button" onClick={onCancel}>ביטול</button>
    </fieldset>{invalid&&<p role="alert">בדקו שם, ייחוס, תאריך וסכומים. היעד חיובי; ההצהרה וההפקדה אינן שליליות, עד שמונה ספרות אחרי הנקודה.</p>}
  </form>;
}
