import { useState } from 'react';
import type { AccountRecord } from '@finance/contracts/valuation';
import type { TransactionRevision } from '@finance/contracts/ledger';
import type { HouseholdMember } from '@finance/contracts/household';
import type { Allocation } from '@finance/contracts/allocation';
import { effects, statuses, today } from '../model/presentation';

type DraftSplit = Omit<Allocation, 'id' | 'money'> & { id: string; money: { amount: string; currency: string } };

export function TransactionForm({ record, correction, members, disabled, submit }: { record: AccountRecord; correction: TransactionRevision | null; members: readonly HouseholdMember[]; disabled: boolean; submit: (input: unknown) => void }) {
  const [identity] = useState(() => ({ transaction: correction?.transaction.id ?? crypto.randomUUID(), revision: crypto.randomUUID(), key: crypto.randomUUID() }));
  const [splits, setSplits] = useState<DraftSplit[]>(() => correction?.transaction.allocations.map((a) => ({ ...a })) ?? [{ id: crypto.randomUUID(), effect: 'UNCLASSIFIED', ownership: record.account.ownership, money: { amount: '', currency: record.account.currency }, categorization: { origin: 'UNCLASSIFIED', userLocked: false } }]);
  const [kind, setKind] = useState(correction?.entryKind ?? 'MOVEMENT');
  const { account } = record;
  return <form className="identity-form transaction-form" aria-label="תנועה ידנית" onSubmit={(event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    submit({ revisionId: identity.revision, idempotencyKey: identity.key, expectedVersion: correction?.version ?? 0, supersedesRevisionId: correction?.revisionId ?? null,
      entryKind: kind, openingCoverage: kind === 'OPENING' ? form.get('coverage') : null, reason: form.get('reason') ?? '',
      transaction: { id: identity.transaction, householdId: account.householdId, accountId: account.id, transactionDate: correction?.transaction.transactionDate ?? form.get('date'),
        ...(correction?.transaction.valueDate ? { valueDate: correction.transaction.valueDate } : {}),
        description: form.get('description'), money: { amount: form.get('amount'), currency: account.currency }, status: form.get('status'), provenance: [{ source: { sourceId: record.manualSourceId, kind: 'MANUAL' } }],
        allocations: splits.map((s, i) => ({ id: s.id, money: { amount: form.get(`split-${i}`), currency: account.currency }, effect: kind === 'OPENING' ? 'ADJUSTMENT' : form.get(`effect-${i}`),
          ownership: form.get(`owner-${i}`) === 'HOUSEHOLD' ? { kind: 'HOUSEHOLD' } : { kind: 'MEMBER', memberId: form.get(`owner-${i}`) },
          ...(s.costBehavior ? { costBehavior: s.costBehavior } : {}), ...(s.necessity ? { necessity: s.necessity } : {}),
          ...(s.categoryId !== undefined ? { categoryId: s.categoryId } : {}),
          categorization: s.categorization })),
      } });
  }}>
    <h2>{correction ? 'תיקון תנועה' : 'תנועה חדשה'}</h2>
    <fieldset disabled={disabled}><legend>פרטי התנועה והחלוקה</legend>
      {correction ? <p>תיקון לגרסה {correction.version}, בתאריך {correction.transaction.transactionDate}. ההיסטוריה נשמרת.</p> : <>
        <label>סוג רישום<select value={kind} onChange={(e) => setKind(e.target.value as 'MOVEMENT' | 'OPENING')}><option value="MOVEMENT">תנועה / התאמה</option>{account.balancePolicy === 'LEDGER' && <option value="OPENING">יתרת פתיחה</option>}</select></label>
        <label>תאריך התנועה<input name="date" type="date" min="0001-01-01" max="9999-12-31" required defaultValue={today()} /></label>
      </>}
      <label>תיאור<input name="description" required maxLength={2000} defaultValue={correction?.transaction.description ?? ''} /></label>
      <label>סכום התנועה ב־{account.currency}<input name="amount" dir="ltr" inputMode="decimal" required defaultValue={correction?.transaction.money.amount ?? ''} /></label>
      <p>סכום חיובי מגדיל את היתרה; סכום שלילי מקטין אותה. בחרו את המשמעות בנפרד. העברה לחיסכון אינה הוצאה; החזר הוצאה מסומן כהוצאה בסכום חיובי.</p>
      <label>מצב<select name="status" defaultValue={correction?.transaction.status ?? 'POSTED'}>{Object.entries(statuses).filter(([s]) => s !== 'PENDING' || (kind !== 'OPENING' && correction?.transaction.status !== 'POSTED')).map(([s, label]) => <option key={s} value={s}>{label}</option>)}</select></label>
      {kind === 'OPENING' && <label>שלמות יתרת הפתיחה<select name="coverage" defaultValue={correction?.openingCoverage ?? 'COMPLETE'}><option value="COMPLETE">מלאה — היתרה ידועה</option><option value="PARTIAL">חלקית — חסרים נתונים</option></select></label>}
      {splits.map((s, i) => <fieldset key={s.id}><legend>חלוקה {i + 1}</legend>
        <label>סכום חלוקה {i + 1}<input name={`split-${i}`} dir="ltr" inputMode="decimal" required defaultValue={s.money.amount} /></label>
        {kind !== 'OPENING' && <label>משמעות חלוקה {i + 1}<select name={`effect-${i}`} defaultValue={s.effect}>{Object.entries(effects).map(([effect, label]) => <option key={effect} value={effect}>{label}</option>)}</select></label>}
        <label>שיוך חלוקה {i + 1}<select name={`owner-${i}`} defaultValue={s.ownership.kind === 'MEMBER' ? s.ownership.memberId : 'HOUSEHOLD'}><option value="HOUSEHOLD">משותף לבית</option>{members.filter((m) => m.householdId === account.householdId).map((m) => <option key={m.id} value={m.id}>{m.displayName}{m.status === 'REVOKED' ? ' (היסטורי)' : ''}</option>)}</select></label>
        {splits.length > 1 && <button type="button" onClick={() => setSplits(splits.filter((v) => v.id !== s.id))}>הסרת חלוקה {i + 1}</button>}
      </fieldset>)}
      <p>סכומי החלוקות חייבים להשתוות בדיוק לסכום התנועה, באותו מטבע.</p>
      <button type="button" disabled={splits.length >= 1000} onClick={() => setSplits([...splits, { id: crypto.randomUUID(), effect: 'UNCLASSIFIED', ownership: { kind: 'HOUSEHOLD' }, money: { amount: '', currency: account.currency }, categorization: { origin: 'UNCLASSIFIED', userLocked: false } }])}>הוספת חלוקה</button>
      <label>סיבת התיקון / הערה<input name="reason" maxLength={500} required={Boolean(correction)} /></label>
      <button>שמירת תנועה</button>
    </fieldset>
  </form>;
}
