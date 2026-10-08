import { useState } from 'react';
import type { FormEvent } from 'react';
import { requestSignIn } from '../api/auth';
import { browserClient } from '@/shared/infrastructure/supabase-client';

export function SignInForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState('busy');
    try { await requestSignIn(email.trim()); setState('sent'); }
    catch { setState('error'); }
  }
  if (!browserClient()) return <p role="status">ההתחברות עדיין לא הוגדרה בסביבה הזו.</p>;
  return <form className="identity-form" onSubmit={(event) => { void submit(event); }}>
    {new URLSearchParams(window.location.search).get('logout') === 'local' ? <p role="alert">הנתונים נמחקו מהדפדפן, אך היציאה מהשרת לא אושרה. יש לסגור כרטיסיות פתוחות ולנסות שוב לאחר חזרת החיבור.</p> : null}
    <p>הכניסה מיועדת למשתמשים שהוזמנו בלבד. נשלח קישור חד־פעמי לדוא״ל.</p>
    <label htmlFor="email">כתובת דוא״ל</label>
    <input id="email" name="email" type="email" dir="ltr" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
    <button type="submit" disabled={state === 'busy'}>{state === 'busy' ? 'שולחים…' : 'שליחת קישור כניסה'}</button>
    {state === 'sent' ? <p role="status">אם הכתובת מוזמנת, קישור כניסה יגיע לתיבת הדוא״ל.</p> : null}
    {state === 'error' ? <p role="alert">לא ניתן לשלוח כרגע. נסו שוב.</p> : null}
  </form>;
}
