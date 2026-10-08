# Task 3 delivery report

Date: 2026-10-08. Scope: local invited-user authentication, household membership and database isolation only. No Task 4, financial account UI/tables, provider, ingestion, reporting, deployment or real household data was added.

The subsequent [Task 3 review corrections](task-3-review-fixes.md) supersede the original membership lifecycle and verification counts below. The original delivery results are retained here as the baseline.

## Baseline and branch

Before implementation, [master CI run 37765143548](https://github.com/maozNachum/couple-finance/actions/runs/37765143548) was verified completed/success at `5603a1c72e64ee8de4814f09a025a3330d290d11`. The clean existing repository was switched to `feature/task-3-household-auth` from that master. Task 1 and Task 2 history is preserved. Root read-only AGENTS.md and sources/ were not modified.

## Implementation

- Local Supabase project `couple-finance`, PostgreSQL 17, GoTrue, PostgREST and Mailpit; no hosted project or external email delivery. API/database/mail ports are 15421/15432/15424 to avoid a Windows-reserved default port range.
- Reproducible CLI-generated migration `20261008104827_household_auth.sql`: `finance.profiles`, `finance.households`, `finance.household_members`, and private identity audit records. UUID identities, UTC timestamps, unique relational membership and composite household/member key.
- Least-privilege grants and RLS on all application tables. Only `api` is exposed; invoker views preserve RLS. A fixed-search-path private helper checks current membership and live user/session identity without trusting editable metadata. Narrow definer helpers have explicit execution grants; private audit records cannot be changed by clients.
- Profile mutation uses a security-invoker RPC, column grants and both USING/WITH CHECK policies. Fixed SafeError results replace raw SQL diagnostics. Audit writes occur in the same transaction.
- Local operator commands create households, invite users and revoke membership. Invitation alone grants no household access. Failed profile/membership provisioning compensates by deleting the newly invited Auth user.
- Hebrew RTL `/sign-in`, `/auth/confirm` and `/household` routes. Invitation/email-link authentication, explicit confirmation, expiring/single-use links, safe failure messages and accessible inputs. Public signup is disabled globally; the email provider remains enabled. The actual Auth API tests prove both properties.
- Sessions remain in memory; no browser auth/data persistence. Logout clears UI data and revokes server sessions. Network logout failure destroys the in-memory client by full navigation and explicitly reports that server logout was not confirmed. Household reads recheck authorization; focus refetch clears previously displayed data first.
- Canonical household/UserId contracts with exact approved aliases and cross-runtime tests. SDK imports and public environment access are confined to reviewed shared infrastructure. A build guard rejects elevated browser credentials without echoing them.
- Full CI now starts a disposable local Supabase stack, runs the entire verification chain and stops the stack. No deployment pipeline or automatic merge was added.

## Changed files

Created: local setup/decision/report/next-task documentation; `playwright.auth.config.ts`; public-config guard and local stack/config/admin/Auth test scripts; auth and household features and route pages; shared browser infrastructure; identity styles; Supabase config/ignore/templates/migration/RLS tests; household contract; public-config, authenticated-browser and local email/fixture tests.

Updated: README, architecture/data-model/security/roadmap docs, placeholder environment example, ignore rules, existing CI workflow, package manifest/lockfile, exact architecture policy/checker, app routes/navigation/styles, identity contract, portable corpus, TypeScript/Deno aliases and Vite configuration. Financial domain implementations and existing shell E2E assertions are unchanged.

## Exact added dependencies

| Dependency | Version | Scope |
| --- | --- | --- |
| `@supabase/supabase-js` | 2.117.3 | Browser infrastructure and local test/operator tooling |
| `supabase` | 2.120.0 | Development-only local CLI |

Node 22.14.0/npm 10.9.2 and prior exact direct versions remain. Clean `npm ci` installed 267 packages and reported zero vulnerabilities. The existing transitive whatwg-encoding deprecation remains.

## Verification results

`npm run verify` passed in full with exit code 0 after a clean install and the final fixes.

| Check | Final result |
| --- | --- |
| TypeScript, ESLint, architecture boundaries | Passed |
| Vitest | 189 tests across 6 files passed |
| Offline, permission-free Deno | 129 tests passed |
| Production build and core probe | Passed |
| Existing shell/core browser tests | 12 passed, including unchanged 320px overflow assertions |
| Actual PostgreSQL pgTAP RLS/privilege tests | 44 assertions passed |
| SQL lint / security advisors | No schema errors / no issues |
| Real GoTrue/PostgREST/email integration | 26 assertions passed |
| Authenticated desktop/mobile Playwright | 6 passed |
| Desktop/mobile synthetic screenshot review | Passed |
| Browser secret scan | 8 generated files scanned; zero local server credential/signing-secret matches |
| Git whitespace and candidate-file secret/exclusion checks | Passed |

Production JavaScript is 576.01 kB (166.65 kB gzip), CSS 7.17 kB (2.20 kB gzip). Vite warns about the JavaScript chunk exceeding 500 kB; this is a documented performance limitation, not a failed check. Existing NO_COLOR/FORCE_COLOR warnings remain. The final local verification log is ignored under `.artifacts/repo-setup/task3-verify.log`. Remote PR CI is reported separately rather than assumed from local success.

Independent development checks established: migration replay through `supabase db reset --local --yes`; 44 PostgreSQL pgTAP assertions; 26 real Auth/API assertions; SQL lint and security advisors with no issues. The SQL assertions execute as actual `anon` and `authenticated` roles, not solely as the service role. Privileged operations only prepare/clean fixtures and separately verify constraints/audit metadata.

Coverage includes household A/B isolation at base-table and invoker-view boundaries, anonymous denial, cross-household composite references, forged user metadata, unauthorized writes, independent WITH CHECK enforcement, private helper/audit grants, revoked membership, invalid/missing/expired/deleted sessions, banned users, safe RPC validation, public-signup denial, invitation expiry/reuse, actual locally captured invitation/magic-link templates, refresh/logout and JWT replay. Browser checks cover desktop/mobile, RTL/accessibility, no persistent session storage, reload behavior and network logout failure. Synthetic-only screenshots are local ignored review artifacts; auth traces/automatic screenshots are disabled.

Development failures were resolved without weakening checks: the default PostgreSQL port was reserved by Windows; a temporary-table FK test was changed to a rolled-back ordinary probe because PostgreSQL forbids temporary-to-permanent FKs; local email-provider configuration was corrected while retaining global signup denial; navigation now wraps to satisfy the unchanged 320px overflow regression.

## Practical limits

This is a local foundation, not a deployed financial product. Passwordless email is the only UI sign-in method. MFA, production recovery/SMTP/HTTPS, backup/retention and deployment need separate work. Reload deliberately requires another sign-in. Offline devices can retain already rendered information until navigation/refocus; database revocation prevents subsequent reads. Failed network logout cannot promise server-side revocation, which the UI explicitly states. No user-facing membership administrator UI, existing-user multi-household assignment workflow or financial features are included.

See [local operations](local-auth.md), [decisions](task-3-decisions.md) and [recommended Task 4 request](task-4-prompt.md). Task 4 requires a separate request after review. The PR must remain unmerged for human review.
