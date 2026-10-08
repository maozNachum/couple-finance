import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { confirmSignIn, consumeConfirmation } from '../api/auth';

export function ConfirmSignIn() {
  const navigate = useNavigate();
  const [confirmation] = useState(() => consumeConfirmation(window.location.hash));
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle');
  useEffect(() => { window.history.replaceState(window.history.state, '', '/auth/confirm'); }, []);
  async function confirm() {
    if (!confirmation) return;
    setState('busy');
    if (await confirmSignIn(confirmation)) navigate('/household', { replace: true });
    else setState('error');
  }
  if (!confirmation || state === 'error') return <div role="alert"><p>הקישור אינו תקף, כבר נוצל או פג תוקפו.</p><Link to="/sign-in">בקשת קישור חדש</Link></div>;
  return <div className="identity-form"><p>אישור הכניסה יפתח את המרחב שאליו הוזמנתם.</p><button disabled={state === 'busy'} onClick={() => { void confirm(); }}>{state === 'busy' ? 'מאמתים…' : 'אישור כניסה'}</button></div>;
}
