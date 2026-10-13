import { Link } from 'react-router-dom';
import type { householdReport } from '@finance/domain/reporting';
import { coverageText, moneyText, warningText, reconciliationText, meaningText } from '../model/presentation';

export function ReportView({ report }: { report: ReturnType<typeof householdReport> }) {
  const {netWorth,monthly} = report;
  return <>
    <section aria-labelledby="worth-heading">
      <h2 id="worth-heading">שווי הבית</h2>
      <p role="status">{coverageText[netWorth.coverage]} · חשבונות עם המרה זמינה: {netWorth.included} מתוך {netWorth.required}</p>
      <div className="dashboard-metrics">
        <article className="account-card"><h3>{netWorth.coverage === 'COMPLETE' ? 'שווי נקי' : 'סכום שווי זמין — אינו שווי מאושר'}</h3><bdi>{moneyText(netWorth.netWorth ?? netWorth.availableSubtotal)}</bdi></article>
        <article className="account-card"><h3>נכסים{netWorth.coverage !== 'COMPLETE' ? ' — סכום זמין' : ''}</h3><bdi>{moneyText(netWorth.assets)}</bdi></article>
        <article className="account-card"><h3>התחייבויות חתומות{netWorth.coverage !== 'COMPLETE' ? ' — סכום זמין' : ''}</h3><bdi>{moneyText(netWorth.liabilities)}</bdi></article>
      </div>
      <h3>ייחוס בעלות</h3>
      <ul>{report.ownership.map(o => <li key={o.memberId ?? 'shared'}>{o.name}: <bdi>{moneyText(o.total.netWorth ?? o.total.availableSubtotal)}</bdi> · {coverageText[o.total.coverage]}</li>)}</ul>
      <p>בעלות משותפת מוצגת פעם אחת, ללא חלוקה לאחוזים.</p>
    </section>
    <section aria-labelledby="flow-heading">
      <h2 id="flow-heading">הכנסות וצריכה חודשיות</h2>
      <p>{coverageText[monthly.coverage]} · <bdi>{report.period.start}</bdi> עד <bdi>{report.period.endExclusive}</bdi> (לא כולל)</p>
      <p>סיכום התנועות הרשומות בלבד. אינו אישור לשלמות דפי בנק או יבוא. החודש נבחר בנפרד מתאריך השווי.</p>
      <div className="dashboard-metrics">
        <article className="account-card"><h3>הכנסות{monthly.coverage !== 'COMPLETE' ? ' — סכום זמין' : ''}</h3><bdi>{moneyText(monthly.income)}</bdi></article>
        <article className="account-card"><h3>צריכה{monthly.coverage !== 'COMPLETE' ? ' — סכום זמין' : ''}</h3><bdi>{moneyText(monthly.consumption)}</bdi></article>
        <article className="account-card"><h3>הכנסות פחות צריכה</h3><bdi>{moneyText(monthly.difference)}</bdi></article>
      </div>
      <p>הקצאות ללא משמעות מוכרעת: {monthly.unclassifiedCount} · ללא קטגוריה: {monthly.uncategorizedCount} · המרות חסרות: {monthly.missingFxCount}</p>
      <details><summary>ראיות המרה לתנועות החודש</summary><ul>{monthly.conversions.filter(c => c.amount.original.currency !== report.request.currency).map(c => <li key={c.transactionId + '/' + c.allocationId}><bdi>{c.date}</bdi>: <bdi>{moneyText(c.amount.original)}</bdi> → <bdi>{moneyText(c.amount.money)}</bdi>{c.amount.fx ? <> · שער <bdi>{c.amount.fx.rate}</bdi> לתאריך <bdi>{c.amount.fx.effectiveDate}</bdi> · נרשם <bdi>{c.amount.fx.recordedAt}</bdi></> : ' · חסרה ראיה יחידה מתאימה'}</li>)}</ul></details>
    </section>
    <section aria-labelledby="positions-heading">
      <h2 id="positions-heading">מצב החשבונות</h2>
      {report.positions.map(p => <article className="account-card" key={p.account.id}>
        <h3>{p.account.name}</h3>
        <p>{p.account.ownership.kind === 'HOUSEHOLD' ? 'משותף' : report.ownership.find(o => o.memberId === ('memberId' in p.account.ownership ? p.account.ownership.memberId : null))?.name} · <bdi>{p.account.currency}</bdi> · {p.account.balancePolicy === 'LEDGER' ? 'יתרה מחושבת מתנועות' : 'שווי נמדד'}{p.account.status === 'ARCHIVED' ? ' · בארכיון' : ''}</p>
        <p>יתרה חתומה: <bdi>{moneyText(p.amount?.original ?? null)}</bdi> · במטבע הדוח: <bdi>{moneyText(p.amount?.money ?? null)}</bdi></p>
        <p>תאריך מדידה: <bdi>{p.measurementDate ?? 'לא זמין'}</bdi> · {coverageText[p.coverage]}</p>
        {p.amount?.fx && <p>שער <bdi>{p.amount.fx.rate}</bdi> לתאריך <bdi>{p.amount.fx.effectiveDate}</bdi> · נרשם <bdi>{p.amount.fx.recordedAt}</bdi> · מקור <bdi>{p.amount.fx.origin.kind}</bdi></p>}
      </article>)}
    </section>
    <section aria-labelledby="insights-heading"><h2 id="insights-heading">ראיות חסרות ונושאים לבדיקה</h2>
      {report.warnings.length ? <ul>{report.warnings.map((w,i) => <li key={i}>{w.accountId ? `${report.positions.find(p => p.account.id === w.accountId)?.account.name}: ` : ''}{warningText[w.code] ?? 'נדרשת בדיקת הראיות.'}</li>)}</ul> : <p>לא נמצאו פערים בראיות הרשומות שנבדקו.</p>}
      <p><Link to="/transactions">בדיקת תנועות ותיקון פיננסי</Link> · <Link to="/reconciliation">בדיקת התאמות</Link> · <Link to="/accounts">יתרות פתיחה ותצפיות</Link></p>
      <details><summary>מצב ההתאמות ופירוט קרן, ריבית ועמלות</summary><ul>{report.reconciliation.map(r => <li key={r.id}>{reconciliationText[r.state]}{r.kind === 'LOAN' && <ul>{r.components.map(c => <li key={c.transactionId + '/' + c.allocationId}>{meaningText[c.meaning]}: <bdi>{moneyText(c.money)}</bdi>{c.effect !== (c.meaning === 'PRINCIPAL' ? 'DEBT_PRINCIPAL' : 'EXPENSE') ? ' · נדרש תיקון משמעות ההקצאה' : ''}</li>)}</ul>}</li>)}</ul><p>ראיות התאמה מסבירות את התנועות. הסכומים אינם מתווספים שוב ליתרות או לצריכה.</p></details>
    </section>
    <p>תאריך הדוח הוא תאריך פיננסי. תיקונים מאוחרים חלים גם על דוחות עבר. הרשומות נקראו יחד: {report.snapshotSize}.</p>
  </>;
}
