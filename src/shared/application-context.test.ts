import { describe, expect, it } from 'vitest';
import { applicationContext, parseApplicationContext } from '@finance/contracts/application-context';

describe('public application context in the browser runtime', () => {
  it('round-trips the same validated contract used in Deno', () => {
    expect(parseApplicationContext(JSON.parse(JSON.stringify(applicationContext)))).toEqual({ locale: 'he-IL', direction: 'rtl', timeZone: 'Asia/Jerusalem' });
    expect(Object.isFrozen(applicationContext)).toBe(true);
  });
  it.each([null, [], {}, { ...applicationContext, direction: 'ltr' }, { ...applicationContext, token: 'unexpected' }])('rejects invalid input %j', (value) => {
    expect(() => parseApplicationContext(value)).toThrow(TypeError);
  });
});
