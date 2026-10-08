// @vitest-environment node
import { expect, it } from 'vitest';
import { assertPublicConfig } from '../../scripts/check-public-config.mjs';

it('rejects elevated browser credentials before bundling without echoing values', () => {
  const legacy = (role) => ['test', Buffer.from(JSON.stringify({ role })).toString('base64url'), 'test'].join('.');
  expect(() => assertPublicConfig({ VITE_SUPABASE_PUBLISHABLE_KEY: legacy('anon') })).not.toThrow();
  for (const key of [legacy('service_role'), 'sb_secret_synthetic_test_only', 'invalid']) {
    try { assertPublicConfig({ VITE_SUPABASE_PUBLISHABLE_KEY: key }); throw new Error('Expected rejection'); }
    catch (error) { expect(error.message).toBe('Browser configuration requires a publishable or legacy anon key.'); }
  }
});
