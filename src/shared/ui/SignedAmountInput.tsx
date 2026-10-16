import { useId, useState } from 'react';

/** Text editing only; canonical money parsing and validation remain with the caller. */
export function SignedAmountInput({ name, label, signLabel, defaultValue = '' }: { name: string; label: string; signLabel: string; defaultValue?: string }) {
  const [value, setValue] = useState(defaultValue);
  const hint = useId();
  return <div>
    <div className="signed-amount">
      <label>{label}<input name={name} dir="ltr" inputMode="decimal" required value={value} onChange={event => setValue(event.target.value)} aria-describedby={hint} /></label>
      <button type="button" aria-label={signLabel} onClick={() => setValue(current => current.startsWith('-') ? current.slice(1) : `-${current}`)}><bdi>+/−</bdi></button>
    </div>
    <small id={hint}>נקודה לשבר עשרוני, ללא מפרידי אלפים. כפתור +/− מחליף את סימן הסכום.</small>
  </div>;
}
