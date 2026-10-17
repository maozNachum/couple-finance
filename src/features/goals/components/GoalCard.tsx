import type { GoalRevision, GoalsSnapshot } from '@finance/contracts/goals';
import { calculateGoal } from '@finance/domain/goals';
import { displayExactMoney } from '@finance/domain/money/money';

export function GoalCard({goal,snapshot,day,disabled,onEdit,onArchive}:{goal:GoalRevision;snapshot:GoalsSnapshot;day:string;disabled:boolean;onEdit:()=>void;onArchive:()=>void}) {
  let result:ReturnType<typeof calculateGoal>|null=null;
  try{result=calculateGoal(goal,day);}catch{/* Overflow is a supported unavailable result, never a fabricated amount. */}
  const member=goal.ownership.kind==='MEMBER'?snapshot.members.find(m=>m.id===(goal.ownership.kind==='MEMBER'?goal.ownership.memberId:'')):null;
  return <article className="account-card" aria-label={goal.name}>
    <h2>{goal.name}</h2><p>{goal.ownership.kind==='HOUSEHOLD'?'משותף לבית':`אישי — ${member?.displayName??''}${member?.status==='REVOKED'?' (גישה בוטלה)':''}`} · {goal.status==='ARCHIVED'?'יעד בארכיון':'יעד פעיל'}</p>
    <p>יעד: <bdi>{displayExactMoney(goal.target)}</bdi></p>
    <p>סכום שהוגדר ידנית כמוקצה ליעד: <bdi>{displayExactMoney(goal.declared)}</bdi></p>
    <p>תאריך יעד: <bdi>{goal.targetDate??'לא הוגדר'}</bdi></p>
    {result?<>
      <p>נותר לתכנון: <bdi>{displayExactMoney(result.remaining)}</bdi> · עודף מוצהר: <bdi>{displayExactMoney(result.surplus)}</bdi></p>
      <label>התקדמות מוצהרת <bdi>{result.percentage}%</bdi><progress max="100" value={result.percentage}>{result.percentage}%</progress></label>
      {result.deadline==='OVERDUE'&&<p>תאריך היעד עבר. התוכנית אינה מעידה על הפקדות שבוצעו.</p>}
      {result.requiredMonthly?<p>חיסכון חודשי נדרש: <bdi>{displayExactMoney(result.requiredMonthly)}</bdi> · {result.months} חודשי הפקדה</p>:result.immediatelyRequired?<p>נדרש כעת, ללא חודשי הפקדה עתידיים: <bdi>{displayExactMoney(result.immediatelyRequired)}</bdi></p>:<p>אין תאריך יעד — חיסכון חודשי נדרש אינו מחושב.</p>}
      <p>הפקדה חודשית משוערת שהוגדרה: <bdi>{goal.monthly?displayExactMoney(goal.monthly):'לא הוגדרה'}</bdi></p>
      {result.outcome&&result.plannedDifference?<p>סכום לפי התוכנית בסוף חודש היעד: <bdi>{displayExactMoney(result.outcome)}</bdi> · פער מול היעד (חיובי: עודף, שלילי: חוסר): <bdi>{displayExactMoney(result.plannedDifference)}</bdi></p>:<p>אין אומדן תוצאה ללא תאריך יעד עתידי או נוכחי ותוכנית הפקדה מפורשת.</p>}
    </>:<p role="alert">לא ניתן לחשב תוכנית בטווח הסכומים הנתמך. הסכומים המקוריים נשמרים.</p>}
    <p>מימון בנקאי לא אומת. ההצהרה אינה מבטיחה כסף זמין או בלעדיות מול יעדים אחרים.</p>
    {goal.status==='ACTIVE'&&<div className="accounts-toolbar"><button disabled={disabled} onClick={onEdit}>עריכת יעד</button><button disabled={disabled} onClick={onArchive}>העברה לארכיון</button></div>}
    <details><summary>היסטוריית היעד</summary>{snapshot.revisions.filter(r=>r.id===goal.id).map(r=><div key={r.version}><h3>גרסה {r.version} · {r.status==='ARCHIVED'?'בארכיון':'פעילה'}</h3><p>{r.name} · יעד <bdi>{displayExactMoney(r.target)}</bdi> · מוצהר <bdi>{displayExactMoney(r.declared)}</bdi></p><p>תאריך יעד: <bdi>{r.targetDate??'לא הוגדר'}</bdi> · הפקדה מתוכננת: <bdi>{r.monthly?displayExactMoney(r.monthly):'לא הוגדרה'}</bdi></p><p>נרשם בשרת: <bdi>{r.recordedAt}</bdi> · {snapshot.members.find(m=>m.id===r.actorMemberId)?.displayName}</p></div>)}</details>
  </article>;
}
