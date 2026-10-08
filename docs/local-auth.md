# Local household authentication

Task 3 is local only. Docker must be running. The public shell still works without configuration; protected routes require the local stack. Do not connect these operator/test tools to a hosted project.

```sh
npm ci
npm run db:start
npm run local:config
npm run dev
```

The local API uses `127.0.0.1:15421`, PostgreSQL `15432`, shadow DB `15430`, and Mailpit `15424`. These avoid Windows-reserved default port ranges. `local:config` writes only a public URL and publishable/anon key to ignored `.env.local`, refusing to overwrite an existing file. No local service credential is committed or bundled. The pinned CLI obtains server credentials internally for local operator/test tooling. Local Docker services are development services, not a secured production deployment; do not expose their ports to untrusted networks.

## Invite and revoke

```sh
npm run local:admin -- create-household "Synthetic household"
npm run local:admin -- invite HOUSEHOLD_UUID synthetic@example.test "Synthetic member"
```

Replace `HOUSEHOLD_UUID` with the returned ID. Use only synthetic addresses for local tests. Mail is captured in [local Mailpit](http://127.0.0.1:15424), not sent externally. Open the invitation from Mailpit, then click **אישור כניסה**. The link expires after ten minutes and can be used once. Existing invited users request new links at `/sign-in`; the form always gives the same response regardless of whether an address exists. No public registration, anonymous sign-in or browser household-creation/invitation capability exists.

The operator provisions a profile and membership together. An invitation alone gives no household access. If provisioning fails after the email is created, the new Auth user is removed and the operator command fails. Re-inviting an existing user is intentionally rejected by Auth; request a new sign-in link instead. Membership administration is local operator work; no browser administrator role is invented.

```sh
npm run local:admin -- revoke HOUSEHOLD_UUID USER_UUID
```

The database checks current membership on every read; a previously issued JWT does not retain revoked household access. The UI refreshes on focus and clears old data before refetching. Already displayed information cannot be remotely erased from an offline device. Revocation is authorization removal, not data erasure.

## Session and security boundaries

- Sessions are in memory only. Reloading or closing the tab requires signing in again. No localStorage/sessionStorage auth cache or offline household cache is used.
- Only `/api` data objects (the `api` PostgreSQL schema) are exposed: three security-invoker views and `rename_profile`. The `finance` and `private` schemas are not Data API schemas.
- RLS checks relational membership plus `auth.uid()` and the signed session ID against a live, unexpired `auth.sessions` row belonging to the same unbanned user. Editable metadata is ignored. A deleted session immediately loses database access even if its JWT has not expired.
- `rename_profile` is an invoker command. Only the caller's display-name column is writable; identity and membership are not. It returns fixed canonical SafeError messages. SDK/database diagnostics are never rendered to users.
- Logout requests server session revocation and clears UI data. If the network fails, a full navigation destroys the in-memory client and displays that server logout was not confirmed. Close other tabs too; an unrevoked token remains subject to expiry and the live database checks.
- The private membership helper avoids recursive RLS without accepting arbitrary user identity. Definer functions have empty fixed search paths and explicit execution grants. Audit triggers record IDs, operations and timestamps without copying profile text, emails or tokens. Audit tables have no client grants.
- Household membership has a unique `(household_id, id)` key for future same-household references. Tests exercise it using a rolled-back probe table; no financial tables were added.

## Verification

```sh
npx playwright install chromium
npm run verify
```

The stack must already be running. Verification includes the unchanged foundation chain, PostgreSQL pgTAP RLS tests under `anon`/`authenticated`, SQL lint/security advisors, real GoTrue/PostgREST tests, and desktop/mobile authenticated browser tests. Tests use disposable synthetic users/households, clean them up, and roll back SQL fixtures. Auth traces/screenshots are disabled so link/session material is not captured. The separate authenticated test build lives under ignored `.artifacts/auth-app`; it does not replace `dist`.

One explicit household screenshot per device contains synthetic labels only, after the confirmation token is removed from the URL, for visual review. Local Mailpit retains synthetic test emails until the disposable stack is cleared. Its higher local email limit is for testing only. `auth.email.enable_signup=true` enables the email provider in this CLI; the global `auth.enable_signup=false` setting still disables registration, which is tested against the real Auth API.

`npx supabase db reset --local --yes` destroys this local project's data and replays migrations. Use only on a disposable local stack. CI creates a fresh local stack, runs the full chain and stops it afterwards. No hosted Supabase project, deployment or production email service is configured.

Production readiness still requires separately scoped SMTP/redirect configuration, HTTPS/hosting protections, MFA/recovery decisions, backups and retention. Task 4 must not begin until this PR is reviewed.

References: [Supabase email authentication](https://supabase.com/docs/guides/auth/auth-email-passwordless), [RLS and invoker views](https://supabase.com/docs/guides/database/postgres/row-level-security), [local configuration](https://supabase.com/docs/guides/local-development/cli/config).
