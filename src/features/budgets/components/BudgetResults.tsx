import { Link } from 'react-router-dom';
import type { BudgetSnapshot, BudgetRevision } from '@finance/contracts/budgets';
import type { budgetReport } from '@finance/domain/budgets';
import { issueText, moneyText, scopeText, stateText } from '../model/presentation';

export function BudgetResults({snapshot,result,onEdit,onArchive,disabled}:{snapshot:BudgetSnapshot;result:ReturnType<typeof budgetReport>;onEdit:(b:BudgetRevision)=>void;onArchive:(b:BudgetRevision)=>void;disabled:boolean}) {
  return <>
    <p>נותר בתכנון הוא התכנון פחות ההוצאות שהוכרו. הוא אינו כסף זמין, תחזית או סכום בטוח להוצאה.</p>
    <p>שלמות החישוב מתייחסת לראיות הרשומות במערכת, ואינה אישור שכל דפי החשבון הוזנו.</p>
    <p>הקצאות ללא משמעות פיננסית מוכרעת בחודש: {result.report.monthly.unclassifiedCount}. הן אינן משויכות לתקציב עד לתיקון מפורש.</p>
    {result.configuration==='NO_PLAN'&&<p role="status">לא הוגדרה תוכנית פעילה לחודש זה. היעדר תוכנית אינו תקציב אפס.</p>}
    {result.report.monthly.coverage!=='COMPLETE'&&<div role="status"><h2>ראיות ההוצאות אינן מלאות</h2><p>מוצגים רק סכומים מוכרים שניתן לחשב. אין יתרה מאומתת בתכנון.</p></div>}
    {result.report.monthly.issues.length>0&&<ul>{result.report.monthly.issues.map(code=><li key={code}>{issueText[code]??'נדרשת בדיקת הראיות.'}</li>)}</ul>}
    <div className="budget-cards">{result.comparisons.map(c=><article className="account-card" key={c.plan.id} aria-label={scopeText(c.plan.scope,snapshot)}>
      <h2>{scopeText(c.plan.scope,snapshot)}</h2><p><strong>{stateText[c.state]}</strong></p>
      <dl><dt>מתוכנן</dt><dd dir="ltr">{moneyText(c.plan.planned)}</dd><dt>{c.coverage==='COMPLETE'?'הוצאות שהוכרו':'הוצאות מוכרות חלקיות'}</dt><dd dir="ltr">{moneyText(c.actual)}</dd>
        <dt>נותר בתכנון</dt><dd dir="ltr">{moneyText(c.remaining)}</dd><dt>חריגה</dt><dd dir="ltr">{moneyText(c.over)}</dd><dt>ניצול התכנון</dt><dd dir="ltr">{c.utilization===null?'לא ניתן לחשב':`${c.utilization}%`}</dd></dl>
      {c.plan.planned.amount==='0'&&<p>תכנון אפס הוגדר במפורש. אחוז הניצול אינו מוגדר.</p>}
      {c.issues.length>0&&<ul>{c.issues.map(code=><li key={code}>{issueText[code]??'נדרשת בדיקת הראיות.'}</li>)}</ul>}
      {c.plan.status==='ACTIVE'&&<div><button disabled={disabled} onClick={()=>onEdit(c.plan)}>עריכת סכום</button><button disabled={disabled} onClick={()=>onArchive(c.plan)}>העברה לארכיון</button></div>}
      <details><summary>היסטוריית התכנון</summary><ol>{result.history.filter(b=>b.id===c.plan.id).map(b=><li key={b.version}>גרסה {b.version} · {moneyText(b.planned)} · {b.status==='ARCHIVED'?'ארכיון':'פעיל'} · {snapshot.reporting.members.find(m=>m.id===b.actorMemberId)?.displayName} · <time dir="ltr">{b.recordedAt}</time>{b.category&&` · קטגוריה בעת התכנון: ${b.category.name}`}</li>)}</ol></details>
    </article>)}</div>
    <h2>הוצאות לפי קטגוריה</h2>
    {result.groups.length===0?<p>אין הוצאות מוכרות ברשומות לחודש זה. כאשר הראיות חסרות, אין בכך אישור להוצאות אפס.</p>:<ul>{result.groups.map(g=><li key={g.categoryId??'none'}>{g.name}: <bdi>{moneyText(g.actual)}</bdi>{g.missingFx>0&&' — חסרה המרה לחלק מההוצאות'}{!result.unbudgeted.complete&&' — תמונה חלקית'}</li>)}</ul>}
    <h2>הוצאות מחוץ ליעדים המפורטים</h2><p><bdi>{moneyText(result.unbudgeted.actual)}</bdi> · {result.unbudgeted.count} הקצאות{!result.unbudgeted.complete&&' · סכום חלקי'}</p>
    <p>היעד הכולל אינו משייך הוצאות ליעדים מפורטים. הוצאות ללא קטגוריה נשארות גלויות.</p>
    <details><summary>ראיות הצריכה והמרות היסטוריות</summary><ul>{result.report.expenses.map(e=><li key={`${e.transactionId}/${e.allocationId}`}>
      <time dir="ltr">{e.date}</time> · צריכה במטבע המקורי: <bdi>{moneyText(e.amount.original)}</bdi> · במטבע התכנון: <bdi>{moneyText(e.amount.money)}</bdi>
      {e.amount.fx&&<> · שער <bdi>{e.amount.fx.rate}</bdi> מתאריך <time dir="ltr">{e.amount.fx.effectiveDate}</time></>}
      {e.amount.reason&&` · ${issueText[e.amount.reason]}`}
    </li>)}</ul></details>
    <p><Link to="/transactions">בדיקה ותיקון מפורש של תנועות</Link> · <Link to="/categories">בדיקת קטגוריות</Link> · <Link to="/reconciliation">בדיקת התאמות</Link></p>
  </>;
}
