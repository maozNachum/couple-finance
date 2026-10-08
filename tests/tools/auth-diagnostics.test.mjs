// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { summarizeAuthDiagnostics } from '../../scripts/auth-diagnostic-summary.mjs';

describe('operator Auth diagnostics', () => {
  it('counts service failures without copying identity, token or provider diagnostics', () => {
    const raw = [
      { level: 'error', msg: 'private SMTP diagnostics', email: 'private@example.test', token: 'private-token' },
      { level: 'info', status: 503, path: '/otp', request_id: 'private-id' },
      { level: 'info', status: 400, error: 'user not found' },
      { level: 'info', status: 200 },
    ].map((entry) => JSON.stringify(entry)).join('\n');
    expect(summarizeAuthDiagnostics(raw)).toEqual({ parsedEntries: 4, AUTH_SERVICE_ERRORS: 1, AUTH_HTTP_5XX: 1 });
    expect(JSON.stringify(summarizeAuthDiagnostics(raw))).not.toMatch(/private|SMTP|email|token|user not found/);
  });
  it('ignores raw lines and malformed fields rather than printing them', () => {
    expect(summarizeAuthDiagnostics('private raw diagnostics\nnull\n[]\n{"status":"500 secret"}')).toEqual({ parsedEntries: 1, AUTH_SERVICE_ERRORS: 0, AUTH_HTTP_5XX: 0 });
  });
});
