import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { TransactionRevision } from '@finance/contracts/ledger';
import { ledgerBalance } from '@finance/domain/money/ledger';
import type { AccountRecord, Observation } from '@finance/contracts/valuation';
import { financialDateSchema } from '@finance/contracts/financial-date';
import { displayMoney } from '@finance/domain/money/money';
import { valueAccount } from '@finance/domain/money/valuation';
import { accountTypes } from '../model/presentation';
import { ObservationForm } from './ObservationForm';
import { accountHref } from '@/shared/navigation/account-context';

export function AccountDetails({ record, history, ledgerHistory, asOf, owner, busy, command }: { record: AccountRecord; history: readonly Observation[]; ledgerHistory: readonly TransactionRevision[]; asOf: string; owner: string; busy: boolean; command: (name: 'update_account' | 'record_balance', input: unknown) => Promise<void> }) {
  const [correction, setCorrection] = useState<Observation | null>(null);
  const { account } = record;
  const date = financialDateSchema.safeParse(asOf);
  let position;
  try { position = date.success ? valueAccount(record, history, date.data) : null; } catch { position = null; }
  const superseded = new Set(history.map((row) => row.supersedesId));
  const ledger = account.balancePolicy === 'LEDGER' ? ledgerBalance(record, ledgerHistory, asOf) : null;
  return <article className="account-card" id={`account-${account.id}`}>
    <h2>{account.name}</h2><p>{accountTypes[account.type]} · {owner} · {account.currency} · {account.status === 'ARCHIVED' ? 'בארכיון' : 'פעיל'}</p>
    <p>{account.balancePolicy === 'OBSERVED' ? 'מדיניות: תצפיות שווי מתוארכות' : 'מדיניות: יתרה מתנועות'}</p>
    <p>מטבע מקורי: <bdi>{account.currency}</bdi> · מטבע שווי: <bdi>{account.valuationCurrency}</bdi></p>
    <div aria-live="polite">
      {!position ? <p>לא ניתן לחשב שווי לתאריך שנבחר. בדקו את התאריך והנתונים.</p> : position.state === 'LEDGER_UNAVAILABLE' ? <>
        {ledger?.state === 'KNOWN' || ledger?.state === 'INCOMPLETE' ? <p>{ledger.state === 'KNOWN' ? 'יתרה מחושבת' : 'יתרה חלקית — חסרים נתונים'}: <bdi>{displayMoney(ledger.money)}</bdi></p> : <p>{ledger?.state === 'UNKNOWN' ? ledger.reason === 'BEFORE_OPENING' ? 'יתרה לא ידועה — התאריך קודם ליתרת הפתיחה.' : 'יתרה לא ידועה — אין יתרת פתיחה פעילה לתאריך שנבחר.' : 'לא ניתן לחשב יתרה. בדקו את הנתונים והתאריך.'}</p>}
        {ledger && (ledger.state === 'KNOWN' || ledger.state === 'INCOMPLETE') && <p>יתרת פתיחה מ־{ledger.openingDate}; החישוב כולל רק את התנועות הרשומות.</p>}
        <Link className="intake-link" to={accountHref('/transactions', account)}>{account.status === 'ARCHIVED' ? 'לצפייה בהיסטוריית התנועות' : 'לרישום תנועות ויתרת פתיחה'}</Link>
      </> : position.state === 'MISSING' ? <p>אין תצפית שווי בתאריך זה או לפניו.</p> : <>
        <p>תצפית אחרונה ל־{position.observation.date}: <bdi>{displayMoney(position.observation.money)}</bdi></p>
        <p>{position.observation.coverage === 'PARTIAL' ? 'שווי חלקי — חסרים רכיבים' : 'כיסוי מלא לפי התצפית — הצהרת המדווח על רכיבי המדידה בלבד'}</p>
        {position.observation.date !== asOf && <p>התצפית קודמת לתאריך שנבחר; זה אינו שווי שנמדד באותו יום.</p>}
        <p>המרה לפי ראיית שער היסטורית; אינה שווי לפי שער עדכני.</p>
        <p>{position.state === 'MISSING_FX' ? 'חסר שער חליפין לתאריך התצפית.' : <>המרה היסטורית לתאריך התצפית: <bdi>{displayMoney(position.money)}</bdi></>}</p>
      </>}
    </div>
    <p>{ledgerHistory.length} גרסאות תנועה שמורות · {history.length} תצפיות שמורות, כולל תיקונים. רישומים אלה אינם מאשרים רצף פעילות מלא.</p>
    {account.status === 'ACTIVE' ? <nav className="section-links" aria-label={`השלמת מידע עבור ${account.name}`}>
      {account.balancePolicy === 'OBSERVED' && <a href={`#observation-${account.id}`}>הוספת ראיית שווי מתוארכת</a>}
      <Link to={accountHref('/imports', account)}>ייבוא CSV לחשבון זה</Link>
      {account.balancePolicy === 'OBSERVED' && <Link to={accountHref('/transactions', account)}>תנועות החשבון</Link>}
    </nav> : <p>החשבון הועבר לארכיון — הראיות זמינות לקריאה בלבד.</p>}
    <details><summary>מקורות הראיות של החשבון</summary><p>מקור קובץ מתעד יבוא; הוא אינו חיבור חי ואינו מתמנה למקור הקובע ליתרה.</p><ul>{record.sources.map(source => <li key={source.id}>{source.kind === 'MANUAL' ? 'מקור ידני' : source.kind === 'FILE_IMPORT' ? 'מקור קובץ' : 'מקור מסונכרן רשום'} · <bdi>{source.id}</bdi> · {source.authoritativeFrom ? `סמכות יתרה מתאריך ${source.authoritativeFrom}` : 'ללא סמכות יתרה'}</li>)}</ul></details>
    {account.balancePolicy === 'OBSERVED' && <p>תנועות וייבוא אינם משנים את השווי המבוסס על תצפיות. תצפית ידנית מוסיפה מדידה שדיווחתם, ולא אימות של מוסד פיננסי.</p>}
    {account.status === 'ACTIVE' && <>
      <form className="identity-form" aria-label={`עריכת ${account.name}`} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void command('update_account', { householdId: account.householdId, accountId: account.id, expectedVersion: record.version, name: form.get('name'), status: 'ACTIVE' }); }}>
        <label>שם מעודכן<input name="name" required maxLength={200} defaultValue={account.name} /></label><button disabled={busy}>שמירת שם</button>
      </form>
      <button disabled={busy} onClick={() => { void command('update_account', { householdId: account.householdId, accountId: account.id, expectedVersion: record.version, name: account.name, status: 'ARCHIVED' }); }}>העברה לארכיון</button>
      {account.balancePolicy === 'OBSERVED' && <div id={`observation-${account.id}`}><ObservationForm key={correction?.id ?? 'new'} record={record} correction={correction} busy={busy} submit={(input) => command('record_balance', input)} />{correction && <button onClick={() => setCorrection(null)}>ביטול תיקון</button>}</div>}
    </>}
    {history.length > 0 && <details><summary>היסטוריית תצפיות ({history.length})</summary><ol className="observation-history">{[...history].sort((a,b) => b.date.localeCompare(a.date) || b.recordedAt.localeCompare(a.recordedAt)).map((row) => <li key={row.id}>
      <p>{row.date} · <bdi>{displayMoney(row.money)}</bdi> · {row.coverage === 'PARTIAL' ? 'חלקי' : 'מלא'}{superseded.has(row.id) ? ' · הוחלף בתיקון' : ''}</p>
      <p>נרשם: <bdi>{row.recordedAt}</bdi></p>{row.note && <p>{row.note}</p>}
      {row.fx && <p>שער: <bdi>1 {row.fx.base} = {row.fx.rate} {row.fx.quote}</bdi> · {row.fx.effectiveDate}</p>}
      {account.status === 'ACTIVE' && row.sourceId === record.manualSourceId && !superseded.has(row.id) && <button disabled={busy} onClick={() => setCorrection(row)}>תיקון תצפית {row.date}</button>}
    </li>)}</ol></details>}
  </article>;
}
