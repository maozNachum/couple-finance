# Couple Finance

Private household finance application for Maoz and Shachar. Tasks 1–16b are merged: Hebrew RTL interface, canonical financial contracts, invitation-only Auth and household isolation, dated accounts/ledger, categorization, explicit CSV ingestion, reconciliation, reporting, budgets, confirmed obligations and conservative cash-flow forecasting. Financial data quality, synthetic recovery, mobile usability, account intake and historical FX intake are included. Task 17 adds planning-only financial goals for independent review. Live banking, AI, production deployment and pilot readiness remain future work; see the [current roadmap](docs/roadmap.md).

## Run locally

Use Node 22.14.0 (`.node-version`) and npm 10.9.2. The informational shell requires no environment file. For local authentication, follow [local setup and invitations](docs/local-auth.md).

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Routes include `/`, `/about`, `/sign-in`, `/auth/confirm`, `/household`, `/accounts`, `/transactions`, `/dashboard`, `/budgets`, `/obligations`, `/forecast`, `/imports`, `/reconciliation`, `/categories`, `/data-quality` and `/goals`, plus an unknown-route fallback. Authenticated routes need the local stack/configuration. The site contains no mock balances. Public configuration guidance is in `.env.example`.

## Verify

```sh
npx playwright install chromium
npm run db:start
npm run verify
```

On Linux CI use `npx playwright install --with-deps chromium`. Deno is pinned as a project-local development dependency; no global Deno installation or runtime permissions are required for the contract tests.

Individual commands:

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Strict browser, ES-only core, and tool TypeScript checks |
| `npm run lint` | ESLint, TypeScript, React hooks and refresh rules |
| `npm run check:architecture` | AST-based dependency and alias validation |
| `npm test` | React behavior, shared contract, adversarial architecture tests |
| `npm run check:deno` | Offline Deno typecheck and permission-free shared-contract tests using installed npm packages |
| `npm run build` | Guarded production browser build plus isolated test-only core browser bundle |
| `npm run test:e2e` | Built-site desktop/mobile, keyboard, accessibility, route and overflow tests |
| `npm run test:accounts` | Real account API isolation, precision, concurrent commands and complete snapshot tests |
| `npm run test:goals` | Synthetic goal API authorization, exact retries, concurrent edits, revocation races and financial non-mutation |
| `npm run test:transactions` | Real transaction API retries, conflicting corrections, exact allocations, history and authorization |
| `npm run preview` | Preview the most recent production build |

`test:e2e` expects a current `dist/` and `.artifacts/core-probe/`; `verify` builds both first. The probe never enters the app distribution. Browser tests own port 4173 and do not reuse an unknown running server. Shell screenshots/traces are local ignored artifacts under `test-results/`; authenticated browser tests disable capture. The full verification also runs PostgreSQL RLS tests, SQL lint/security advisors, real Auth/API tests and authenticated desktop/mobile checks. One financial test corpus runs in Vitest, Deno, and Chromium with UTC, Jerusalem, Los Angeles, and Kiritimati timezones.

## Where code belongs

Read [architecture](docs/architecture.md), [financial model](docs/data-model.md), [security](docs/security.md), [providers](docs/providers.md), and [roadmap](docs/roadmap.md). Scoped instructions are in `src/AGENTS.md` and `supabase/AGENTS.md`.

The root is the application root; there is no nested `couple-finance/` directory. The inherited root `AGENTS.md` and `sources/` are read-only mirror material and must remain untouched. Synced references are excluded from Git, tooling, and browser serving.

This is a local foundation, not a deployed financial application. See [Task 2 contracts](docs/portable-contracts.md), [delivery report](docs/task-2-report.md), and [recommended Task 3 prompt](docs/task-3-prompt.md). Task 3 adds [local auth and household isolation](docs/local-auth.md); see [its report](docs/task-3-report.md).

Task 4 adds manual account management and immutable dated observations; see [decisions](docs/task-4-decisions.md), [delivery report](docs/task-4-report.md) and the [recommended Task 5 prompt](docs/task-5-prompt.md). Account history is corrected by supersession, never by editing a current balance.

The [Task 4 architecture review fixes](docs/task-4-review-fixes.md) separate source relationships from accounts, define dated source authority and preserve reusable historical FX evidence independently of future reporting-date valuation.

Task 5 adds immutable transaction revisions, atomic allocations/receipts/audit and pure dated ledger calculation. See [decisions](docs/task-5-decisions.md), [delivery report](docs/task-5-report.md) and the [recommended Task 6 prompt](docs/task-6-prompt.md). All development/test data is synthetic; no production deployment or financial execution exists.

## Git workflow for future tasks

1. Implement one bounded, explicitly requested task at a time.
2. Run `npm run verify` and any additional checks required by that task; all checks must pass.
3. Review `git status`, the complete diff, and new files. Stage only relevant project files and inspect `git diff --cached`.
4. Never commit secrets, credentials, real financial information, local databases, generated builds, dependencies, or unrelated workspace files. Keep `sources/` and the inherited root `AGENTS.md` excluded and untouched; environment examples must contain placeholders only. Review relevant history before the first push.
5. Commit with a meaningful message, verify a clean working tree, and push the current branch to the private `couple-finance` repository only after checks pass. Confirm the remote owner and PRIVATE visibility before the first push; inspect existing remote history before connecting to an existing repository.
6. Check the push result and any GitHub Actions run. Never force-push or rewrite shared history without explicit approval.

Task 6 adds household categories, deterministic description rules, read-only preview, explicit audited application and manual locking. See [decisions](docs/task-6-decisions.md), [delivery report](docs/task-6-report.md) and [Task 7 prompt](docs/task-7-prompt.md). Run `npm run test:categorization` for real Auth/API concurrency, history and authorization checks (also included in `verify`).

Task 7 adds private CSV upload preparation at `/imports`, with explicit mapping and server-validated preview only. No transactions are imported. See [delivery/limits](docs/task-7-report.md) and [Task 8 handoff](docs/task-8-prompt.md). Local Storage and Edge runtime are enabled for the synthetic verification stack; operator-only `npm run local:cleanup-imports` removes expired/cancelled staging data.
