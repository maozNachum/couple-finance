import { applicationContext, parseApplicationContext } from '../../supabase/functions/_shared/core/contracts/application-context.ts';

Deno.test('public application context round-trips without runtime permissions', () => {
  const parsed = parseApplicationContext(JSON.parse(JSON.stringify(applicationContext)));
  if (parsed.locale !== 'he-IL' || parsed.direction !== 'rtl' || parsed.timeZone !== 'Asia/Jerusalem') throw new Error('Contract changed');
  if (!Object.isFrozen(parsed)) throw new Error('Context must be immutable');
});

Deno.test('invalid application contexts are rejected', () => {
  for (const value of [null, [], {}, { ...applicationContext, direction: 'ltr' }, { ...applicationContext, token: 'unexpected' }]) {
    let rejected = false;
    try { parseApplicationContext(value); } catch (error) { rejected = error instanceof TypeError; }
    if (!rejected) throw new Error('Invalid input accepted');
  }
});
