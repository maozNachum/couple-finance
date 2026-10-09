import { useState } from 'react';
import type { AccountRecord, Observation } from '@finance/contracts/valuation';
import { financialDateSchema } from '@finance/contracts/financial-date';
import { displayMoney } from '@finance/domain/money/money';
import { valueAccount } from '@finance/domain/money/valuation';
import { accountTypes } from '../model/presentation';
import { ObservationForm } from './ObservationForm';

export function AccountDetails({ record, history, asOf, owner, busy, command }: { record: AccountRecord; history: readonly Observation[]; asOf: string; owner: string; busy: boolean; command: (name: 'update_account' | 'record_balance', input: unknown) => Promise<void> }) {
  const [correction, setCorrection] = useState<Observation | null>(null);
  const { account } = record;
  const date = financialDateSchema.safeParse(asOf);
  let position;
  try { position = date.success ? valueAccount(record, history, date.data) : null; } catch { position = null; }
  const superseded = new Set(history.map((row) => row.supersedesId));
  return <article className="account-card">
    <h2>{account.name}</h2><p>{accountTypes[account.type]} · {owner} · {account.currency} · {account.status === 'ARCHIVED' ? 'בארכיון' : 'פעיל'}</p>
    <p>{account.balancePolicy === 'OBSERVED' ? 'מדיניות: תצפיות שווי מתוארכות' : 'מדיניות: יתרה מתנועות'}</p>
    <div aria-live="polite">
      {!position ? <p>לא ניתן לחשב שווי לתאריך שנבחר. בדקו את התאריך והנתונים.</p> : position.state === 'LEDGER_UNAVAILABLE' ? <p>יתרה אינה זמינה: ספר התנועות יתווסף בשלב הבא.</p> : position.state === 'MISSING' ? <p>אין תצפית שווי בתאריך זה או לפניו.</p> : <>
        <p>תצפית אחרונה ל־{position.observation.date}: <bdi>{displayMoney(position.observation.money)}</bdi></p>
        <p>{position.observation.coverage === 'PARTIAL' ? 'שווי חלקי — חסרים רכיבים' : 'כיסוי מלא לפי התצפית'}</p>
        {position.observation.date !== asOf && <p>התצפית קודמת לתאריך שנבחר; זה אינו שווי שנמדד באותו יום.</p>}
        <p>{position.state === 'MISSING_FX' ? 'חסר שער חליפין לתאריך התצפית.' : <>שווי במטבע היעד: <bdi>{displayMoney(position.money)}</bdi></>}</p>
      </>}
    </div>
    {account.status === 'ACTIVE' && <>
      <form className="identity-form" aria-label={`עריכת ${account.name}`} onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void command('update_account', { householdId: account.householdId, accountId: account.id, expectedVersion: record.version, name: form.get('name'), status: 'ACTIVE' }); }}>
        <label>שם מעודכן<input name="name" required maxLength={200} defaultValue={account.name} /></label><button disabled={busy}>שמירת שם</button>
      </form>
      <button disabled={busy} onClick={() => { void command('update_account', { householdId: account.householdId, accountId: account.id, expectedVersion: record.version, name: account.name, status: 'ARCHIVED' }); }}>העברה לארכיון</button>
      {account.balancePolicy === 'OBSERVED' && <><ObservationForm key={correction?.id ?? 'new'} record={record} correction={correction} busy={busy} submit={(input) => command('record_balance', input)} />{correction && <button onClick={() => setCorrection(null)}>ביטול תיקון</button>}</>}
    </>}
    {history.length > 0 && <details><summary>היסטוריית תצפיות ({history.length})</summary><ol className="observation-history">{[...history].sort((a,b) => b.date.localeCompare(a.date) || b.recordedAt.localeCompare(a.recordedAt)).map((row) => <li key={row.id}>
      <p>{row.date} · <bdi>{displayMoney(row.money)}</bdi> · {row.coverage === 'PARTIAL' ? 'חלקי' : 'מלא'}{superseded.has(row.id) ? ' · הוחלף בתיקון' : ''}</p>
      <p>נרשם: <bdi>{row.recordedAt}</bdi></p>{row.note && <p>{row.note}</p>}
      {row.fx && <p>שער: <bdi>1 {row.fx.base} = {row.fx.rate} {row.fx.quote}</bdi> · {row.fx.effectiveDate}</p>}
      {account.status === 'ACTIVE' && !superseded.has(row.id) && <button disabled={busy} onClick={() => setCorrection(row)}>תיקון תצפית {row.date}</button>}
    </li>)}</ol></details>}
  </article>;
}
