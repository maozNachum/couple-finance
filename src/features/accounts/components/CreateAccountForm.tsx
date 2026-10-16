import { useState } from 'react';
import { accountTypes } from '../model/presentation';
import type { loadAccounts } from '../api/accounts';

type Data = Awaited<ReturnType<typeof loadAccounts>>;
export function CreateAccountForm({ data, submit, busy }: { data: Data; submit: (input: unknown) => Promise<void>; busy: boolean }) {
  const [householdId, setHouseholdId] = useState(data.households[0]?.id ?? '');
  const [owner, setOwner] = useState('HOUSEHOLD');
  const [type, setType] = useState('BANK');
  const [policy, setPolicy] = useState('OBSERVED');
  const [identity] = useState(() => ({ id: crypto.randomUUID(), source: crypto.randomUUID() }));
  return <form className="identity-form" aria-label="חשבון חדש" onSubmit={(event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void submit({ account: { id: identity.id, householdId, name: form.get('name'), ownership: owner === 'HOUSEHOLD' ? { kind: 'HOUSEHOLD' } : { kind: 'MEMBER', memberId: owner }, type, currency: form.get('currency'), valuationCurrency: form.get('valuationCurrency'), balancePolicy: policy, status: 'ACTIVE' }, version: 1, manualSourceId: identity.source });
  }}>
    <h2>חשבון חדש</h2>
    <label>בית<select value={householdId} onChange={(event) => { setHouseholdId(event.target.value); setOwner('HOUSEHOLD'); }}>{data.households.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
    <label>שם החשבון<input name="name" required maxLength={200} /></label>
    <label>סוג חשבון<select value={type} onChange={(event) => { setType(event.target.value); if (event.target.value === 'CASH') setPolicy('LEDGER'); }}>{Object.entries(accountTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>שיוך<select value={owner} onChange={(event) => setOwner(event.target.value)}><option value="HOUSEHOLD">משותף לבית</option>{data.members.filter((m) => m.householdId === householdId && m.status === 'ACTIVE').map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}</select></label>
    <p>השיוך מציין בעלות. כל חברי הבית הפעילים יכולים לצפות בחשבון.</p>
    <label>מטבע החשבון<select name="currency" defaultValue="ILS">{['ILS','USD','EUR','JPY','KWD'].map((c) => <option key={c}>{c}</option>)}</select></label>
    <label>מטבע השווי<select name="valuationCurrency" defaultValue="ILS">{['ILS','USD','EUR','JPY','KWD'].map((c) => <option key={c}>{c}</option>)}</select></label>
    <label>מדיניות יתרה<select value={policy} disabled={type === 'CASH'} onChange={(event) => setPolicy(event.target.value)}><option value="OBSERVED">תצפיות שווי מתוארכות</option><option value="LEDGER">יתרה מתנועות</option></select></label>
    <p>המטבעות, הבעלות והמדיניות קבועים לאחר יצירה. בחשבון מתנועות נדרשת יתרת פתיחה במסך תנועות ויתרות כדי לחשב יתרה.</p>
    <button disabled={busy}>יצירת חשבון</button>
  </form>;
}
