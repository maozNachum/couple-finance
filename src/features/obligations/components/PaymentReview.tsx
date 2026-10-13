import { useState } from 'react';
import { eligibleObligationPayments } from '@finance/domain/obligations';
import { paymentCommandSchema } from '@finance/contracts/obligations';
import type { ObligationsSnapshot, ObligationRevision, PaymentCommand } from '@finance/contracts/obligations';
import type { expectedObligations } from '@finance/domain/obligations';
import { displayMoney } from '@finance/domain/money/money';

export function PaymentReview({snapshot,event,head,disabled,onSave}:{snapshot:ObligationsSnapshot;event:ReturnType<typeof expectedObligations>[number];head:ObligationRevision;disabled:boolean;onSave:(c:PaymentCommand)=>void}) {
  const [selected,setSelected]=useState(''),[ack,setAck]=useState(false),[reviewing,setReviewing]=useState(false);
  // Compute/render potentially large actual-evidence options only on an explicit review.
  if (!reviewing) return <button disabled={disabled} onClick={()=>setReviewing(true)}>סקירת ראיות ושיוך</button>;
  const options=event.link?[]:eligibleObligationPayments(snapshot,event.obligation.plan,event.obligation.householdId);
  if (options.length>1000) return <p role="alert">יותר מ־1,000 ראיות תשלום כשירות. השיוך במסך זה אינו זמין; לא מוצגת רשימה חלקית ולא מוסק תשלום.</p>;
  const option=options.find(p=>`${p.evidence.revisionId}/${p.evidence.allocationId}`===selected);
  const prior=snapshot.payments.filter(d=>d.obligationId===event.obligation.id&&d.obligationVersion===event.obligation.version&&d.date===event.date).sort((a,b)=>b.version-a.version)[0];
  const linked=event.link!==null;
  function command() {
    const parsed=paymentCommandSchema.parse({householdId:head.householdId,id:prior?.id??crypto.randomUUID(),expectedVersion:prior?.version??0,
      idempotencyKey:crypto.randomUUID(),action:linked?'UNLINK':'LINK',obligationId:event.obligation.id,obligationVersion:event.obligation.version,
      expectedObligationVersion:head.version,date:event.date,evidence:linked?null:option?.evidence,acknowledge:ack});
    onSave(parsed);
  }
  return <div role="group" aria-label="בדיקת שיוך תשלום">
    {linked?<p>תשלום ששויך: {event.link!.actual?displayMoney(event.link!.actual):'לא ידוע'} · תנועה {event.link!.evidence?.transactionId}. ביטול שומר את ההיסטוריה.</p>:<>
      <label>ראיית תשלום לשיוך<select value={selected} disabled={disabled} onChange={e=>{setSelected(e.target.value);setAck(false);}}><option value="">בחרו תנועה לבדיקה</option>{options.map(p=><option key={`${p.evidence.revisionId}/${p.evidence.allocationId}`} value={`${p.evidence.revisionId}/${p.evidence.allocationId}`}>{p.revision.transaction.transactionDate} · {p.revision.transaction.description} · {displayMoney(p.actual)}</option>)}</select></label>
      {option&&<p>סקירה: צפוי {displayMoney(event.money)} ביום {event.date}; בפועל {displayMoney(option.actual)} ביום {option.revision.transaction.transactionDate}. גרסת תנועה {option.revision.version}. פער סכום נשאר חלקי או דורש בירור.</p>}
      {options.length===0&&<p>אין ראיית הוצאה כשירה ופנויה בחשבון ובבעלות אלו. אין להסיק שהתשלום הוחמץ.</p>}
    </>}
    <label><input type="checkbox" checked={ack} disabled={disabled||!linked&&!option} onChange={e=>setAck(e.target.checked)} />בדקתי ואני מאשר/ת {linked?'ביטול שיוך':'את שיוך הראיה למועד הצפוי'} במפורש.</label>
    <button disabled={disabled||!ack||!linked&&!option} onClick={command}>{linked?'אישור ביטול שיוך':'אישור שיוך תשלום'}</button>
  </div>;
}
