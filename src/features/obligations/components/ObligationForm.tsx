import { useState } from 'react';
import type { FormEvent } from 'react';
import { obligationCommandSchema } from '@finance/contracts/obligations';
import type { ObligationsSnapshot, ObligationRevision, ObligationPlan, ObligationEvidence, ObligationCommand } from '@finance/contracts/obligations';

export function ObligationForm({snapshot,householdId,edit,proposal,origin=[],action='CONFIRM',disabled,onSave,onCancel}:{
  snapshot:ObligationsSnapshot;householdId:string;edit:ObligationRevision|null;proposal?:ObligationPlan|undefined;origin?:readonly ObligationEvidence[]|undefined;
  action?:ObligationCommand['action'];disabled:boolean;onSave:(c:ObligationCommand)=>void;onCancel:()=>void;
}) {
  const [invalid,setInvalid]=useState(false),[owner,setOwner]=useState(edit?.plan.ownership.kind??proposal?.ownership.kind??'HOUSEHOLD');
  const initial=edit?.plan??proposal,terminal=action==='ARCHIVE'||action==='CANCEL';
  const accounts=snapshot.reporting.accounts.filter(a=>a.account.householdId===householdId&&a.account.status==='ACTIVE');
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();const values=new FormData(event.currentTarget),account=accounts.find(a=>a.account.id===values.get('account'));
    const plan=terminal?initial:{name:values.get('name'),accountId:edit?.plan.accountId??account?.account.id,
      ownership:edit?.plan.ownership??(owner==='HOUSEHOLD'?{kind:'HOUSEHOLD'}:{kind:'MEMBER',memberId:values.get('member')}),
      money:{amount:values.get('amount'),currency:edit?.plan.money.currency??account?.account.currency},effect:'EXPENSE',
      schedule:{frequency:'MONTHLY',day:Number(values.get('day'))},startDate:values.get('start'),endDate:values.get('end')||null};
    const parsed=obligationCommandSchema.safeParse({id:edit?.id??crypto.randomUUID(),householdId,action:edit?action==='CONFIRM'?'EDIT':action:'CONFIRM',
      expectedVersion:edit?.version??0,idempotencyKey:crypto.randomUUID(),acknowledge:values.get('acknowledge')==='on',plan,
      effectiveFrom:edit?values.get('effective'):values.get('start'),origin:edit?.origin??origin});
    setInvalid(!parsed.success);if(parsed.success)onSave(parsed.data);
  }
  return <form className="account-form" aria-label="אישור התחייבות" onSubmit={submit}>
    <h2>{terminal?action==='ARCHIVE'?'העברה לארכיון':'ביטול התחייבות':edit?'עריכת התחייבות':'אישור התחייבות חדשה'}</h2>
    <fieldset disabled={disabled}><legend>תכנון חודשי מפורש בלבד</legend>
      {!terminal&&<>
        <label>שם התחייבות<input name="name" required maxLength={120} defaultValue={initial?.name??''} /></label>
        <label>חשבון ומטבע<select name="account" disabled={edit!==null} defaultValue={initial?.accountId} required>{accounts.map(a=><option key={a.account.id} value={a.account.id}>{a.account.name} · {a.account.currency}</option>)}</select></label>
        <label>ייחוס בעלות<select disabled={edit!==null} value={owner} onChange={e=>setOwner(e.target.value as typeof owner)}><option value="HOUSEHOLD">משותף לבית</option><option value="MEMBER">חבר בית</option></select></label>
        {owner==='MEMBER'&&<label>חבר בית<select name="member" disabled={edit!==null} defaultValue={initial?.ownership.kind==='MEMBER'?initial.ownership.memberId:undefined} required>{snapshot.reporting.members.filter(m=>m.householdId===householdId&&(m.status==='ACTIVE'||m.id===(initial?.ownership.kind==='MEMBER'?initial.ownership.memberId:null))).map(m=><option key={m.id} value={m.id}>{m.displayName}</option>)}</select></label>}
        <label>סכום צפוי<input name="amount" inputMode="decimal" dir="ltr" required defaultValue={initial?.money.amount??''} /></label>
        <label>יום בחודש<input name="day" type="number" min={1} max={31} required defaultValue={initial?.schedule.day??1} /></label>
        <label>תאריך התחלה<input name="start" type="date" required defaultValue={initial?.startDate??''} /></label>
        <label>תאריך סיום אופציונלי<input name="end" type="date" defaultValue={initial?.endDate??''} /></label>
      </>}
      {edit&&<label>תחילת תוקף השינוי<input name="effective" type="date" required /><span>נדרש תאריך אחרי {edit.effectiveFrom}. מועדים קודמים נשמרים בגרסה הקודמת.</span></label>}
      <p>תדירות חודשית. בחודש קצר היום נצמד ליום האחרון; ביום 31, למשל, פברואר יסתיים ב־28 או ב־29. אין התאמות לחגים.</p>
      <p>המטבע המקורי נשמר. אין שער עתידי מובטח, אישור חוזה או הבטחה לכסף פנוי.</p>
      <label><input name="acknowledge" type="checkbox" required />בדקתי ואני מאשר/ת את ההחלטה כתכנון בלבד, ללא יצירת תנועות, שינוי תקציבים או ביצוע תשלום.</label>
      <button type="submit">אישור ושמירה</button><button type="button" onClick={onCancel}>ביטול עריכה</button>
    </fieldset>{invalid&&<p role="alert">בדקו שם, סכום חיובי, יום בחודש, תאריכים ואישור מפורש.</p>}
  </form>;
}
