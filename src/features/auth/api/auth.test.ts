import { describe, it, expect, vi, afterEach } from 'vitest';
import { consumeConfirmation, confirmSignIn, requestSignIn } from './auth';
const { verifyOtp, signInWithOtp } = vi.hoisted(() => ({ verifyOtp: vi.fn(), signInWithOtp: vi.fn() }));
vi.mock('@/shared/infrastructure/supabase-client', () => ({ browserClient: () => ({ auth: { verifyOtp, signInWithOtp } }) }));
afterEach(() => vi.resetAllMocks());
describe('email sign-in boundary', () => {
  it('only accepts bounded invite/email hashes, never arbitrary redirect or signup types', () => {
    expect(consumeConfirmation('#token_hash=' + 'a'.repeat(64) + '&type=invite')?.type).toBe('invite');
    for (const value of ['', '#token_hash=x&type=invite', '#token_hash=' + 'a'.repeat(64) + '&type=signup']) expect(consumeConfirmation(value)).toBeNull();
  });
  it('never opts into public account creation or exposes account existence', async () => {
    signInWithOtp.mockResolvedValue({ error: { message: 'private diagnostics' } });
    await expect(requestSignIn('synthetic@example.test')).resolves.toBeUndefined();
    expect(signInWithOtp).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ shouldCreateUser: false }) }));
  });
  it('failed and interrupted confirmation return only failure', async () => {
    const confirmation = { token_hash: 'a'.repeat(64), type: 'invite' as const };
    verifyOtp.mockResolvedValue({ error: { message: 'secret' } });
    expect(await confirmSignIn(confirmation)).toBe(false);
    verifyOtp.mockRejectedValue(new Error('raw diagnostics'));
    expect(await confirmSignIn(confirmation)).toBe(false);
  });
});
