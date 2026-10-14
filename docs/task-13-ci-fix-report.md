# Task 13 post-merge master CI remediation

## Original failure and collected evidence

Fetched current remote master before changes: `26a3dd80f8a7c6e135d970fa5613e605a4ab4f11`. GitHub confirms PR #12 merged at that SHA. [Original master workflow 38464725677](https://github.com/maozNachum/couple-finance/actions/runs/38464725677), attempt 1, Foundation checks, concluded failure on that exact SHA.

Failing job: `verify` (job 115528585611). Failing step/command: `Run npm run verify` → `npm run test:reporting` → `node scripts/test-reporting.mjs`. Original script line 28 calls the authenticated `reporting_snapshot` after 1,001 additional movements. `tests/integration/reconciliation-fixture.mjs:11` asserted the RPC transport error was null; it received PostgreSQL `57014`, `canceling statement due to statement timeout`. The expected complete history length is 1,003, not a paginated 1,000. This is a PostgreSQL/API timeout, not a financial formula or Chromium assertion failure.

The original log records this error at 20:48:15 UTC on October 13 (23:48:15 Jerusalem). All earlier compiler, domain/runtime, portable-browser, pgTAP, SQL lint/advisor and API gates through reconciliation passed. Budgets, obligations, authenticated browsers and forecast API had not yet run in this failed chain. Supabase stop and artifact upload completed afterward.

Retrieved complete run logs, annotations and artifact 11848387439. Annotations contain only the exit-code error and unrelated runner/Node deprecation notices. The artifact contains two already-passing public shell screenshots; it has no PostgreSQL plan or failed authenticated-browser trace. Ignored local evidence is under `.artifacts/task13-master-failed-logs`, `.artifacts/task13-master-failed-artifacts`, and the two `.artifacts/task13-success-*` directories. GitHub initially returned one transient jobs-endpoint server error; a subsequent read and all log/artifact downloads succeeded. No diagnostic access limitation remains, but historical database plans/CPU metrics were never collected by the old workflow.

## Root cause, controlled reproduction and limits of inference

The three ledger SELECT policies called `private.is_household_member(household_id)` for every row. That helper repeatedly queries current Auth session/user and ACTIVE membership. Bulk history and its allocations amplify this authorization work. EXPLAIN ANALYZE on the exact synthetic 1,003-revision fixture also showed account-prefix nested-loop plans discarding roughly 1,000 candidates on each of 1,003 loops, or roughly 500 candidates when the join direction reversed. Estimates/plans changed across fixture churn. Unchanged history projections took about 1.4–1.5 seconds locally; unchanged complete RPCs took about 2.1–2.9 seconds with normal resources. Turning JIT off did not remove this workload; a lateral join trial did not reliably improve it. Neither trial is delivered.

A transaction-only trial replaced per-row authorization with a once-per-statement live authorized household set. EXPLAIN recorded three InitPlans, each executed once, and the projection fell to 343 ms even with unfavorable account-prefix scans. The final normally resourced targeted run projected history in 33 ms and returned the complete RPC in 196 ms.

For controlled stress reproduction, only the disposable database container was limited to 0.15 CPU after fixture creation. The original API request failed with the identical `57014` after 8,006 ms. Under the same CPU restriction, trial-fixed RPCs succeeded three times in 1,222 / 696 / 599 ms. Every complete JSON response was asserted deeply equal to the original successful baseline, including all 1,003 revisions, ownership, dates, allocations and reconciliation/FX evidence. No timeout, retry or financial assertion changed.

The first attempted Docker `--cpus 0` reset returned success but retained its CPU setting; inspecting NanoCpus caught this. The disposable stack was stopped and recreated from its preserved backup, then NanoCpus was verified zero. All synthetic users/households were cleaned and verified zero. No normal-resource failure is inferred from requests made before that reset was verified. Original stack counts stayed 2 Auth users / 4 households, and it was never reset or stopped.

This demonstrates a real bulk-read authorization cost and reproduces the timeout under controlled resource pressure. The original runner's exact CPU contention and query plan cannot be reconstructed from its archived logs, so they remain possible triggers, not independently proven historical measurements. A successful rerun alone would not address that recurrence risk; no rerun is used as the fix.

## Why branch/PR passed and limited reliability review

[Task 13 push CI 38459932010](https://github.com/maozNachum/couple-finance/actions/runs/38459932010) and [PR CI 38460344191](https://github.com/maozNachum/couple-finance/actions/runs/38460344191) succeeded on `7c6a45fb46b0ae1e2162bef16c8e88ea88e7efd7`. Their reporting scripts completed in roughly 15 / 16 seconds including fixture creation and 1,001 writes. The merged master tree has no diff from that successful head. Workflow commands are identical, with no master-only condition; dependencies are locked. Passing earlier executions establish that the same data/command can succeed, not that bulk authorization was reliably bounded on every runner.

The workflow uses a fresh hosted runner/local stack for each push/PR run. Distinct hosted jobs do not share Docker databases despite identical project IDs. Verify gates run sequentially; authenticated browsers use one worker and no retries. API fixtures use generated household/user IDs with finally cleanup; pgTAP fixtures roll back. Repeated reads and fixture churn were exercised locally, and cleanup was checked. No evidence identifies cross-job collision, residual production data, test ordering, timezone differences, changed merge code or broken financial formulas as the cause.

Delivered reliability improvements are deliberately small: exact RPC names in transport assertion labels, a pre-call synthetic bulk scenario marker, scalar duration/count diagnostics, and a work-based regression proving all three authorization InitPlans execute once. No JWTs, SQL payloads, private records or raw plans are emitted to CI. Existing failure artifacts/cleanup remain intact; no workflow refactor, blanket retry or timeout increase.

## Exact changes and security preservation

- `supabase/migrations/20261013212843_task13_reporting_authorization_performance.sql`: new additive migration, generated by the CLI. Adds private STABLE fixed-empty-search-path `live_household_ids()` and updates only the existing transactions/revisions/allocations SELECT policies to uncorrelated ARRAY InitPlans. The helper accepts no identity or household argument, reads `auth.uid()`, calls the unchanged live-session predicate and filters ACTIVE memberships. PUBLIC/anon EXECUTE are revoked; authenticated policy execution is granted. Existing DML grants, invoker projections and financial logic remain unchanged.
- `supabase/tests/ledger-authorization-performance.test.sql`: 15 pgTAP assertions for helper privilege/configuration, retained RLS/invoker view, two-household isolation, missing/deleted sessions, revoked membership with unchanged JWT, banned/anonymous/deleted users.
- `scripts/test-reporting.mjs`: preserves the 1,003-history pagination regression and all previous security/non-mutation assertions; adds three exact repeated reads and four work-based plan assertions. Prints only generated scenario counts and scalar timing.
- `tests/integration/reconciliation-fixture.mjs`: includes the RPC name in the existing transport assertion without changing its expected error/result or retries.
- `docs/security.md`: documents per-statement authorization and fresh revocation checks.
- This report: original evidence, reproduction, limits, verification and review handoff.

The authorized set is scoped to an individual SQL statement/MVCC snapshot, never persisted in a client, session cache or database table. The next request rechecks session/user/membership, including unchanged revoked JWTs. No row-specific ownership authorization is removed: the former three predicates were exactly live session plus ACTIVE household membership, now materialized as that same set. Finance/private schemas remain unexposed. All thirteen previously merged migrations, synced references and financial business rules remain unchanged. No Task 14, product architecture work, deployment or automatic merge.

The approach follows the [Supabase RLS performance guidance](https://supabase.com/docs/guides/database/postgres/row-level-security) on statement-level initialization of row-independent authorization; row-dependent membership calls cannot simply be wrapped in a correlated SELECT and assumed cached.

## Verification and handoff

The full unchanged `npm run verify` passed **exit 0** on October 14, 2026 (Jerusalem), with all Task 3–13 gates intact. Log: ignored `.artifacts/task13-verification/.artifacts/task13-ci-fix-verify.log`. Only local stack addressing differs; source parity checked across 189 source/test files. The new migration was dry-run inspected and then applied only to this disposable stack; no reset or destructive replay. Final stack cleanup verified zero Auth users/households and 14 applied migrations; original remained 2 users/4 households.

| Gate | Actual full-run result |
| --- | --- |
| TypeScript / ESLint / architecture and exact aliases | Passed |
| Vitest | 525 tests / 10 files passed |
| Permission-free Deno / generic CSV | 413 / 15 passed |
| Both existing Edge Function typechecks / production build | Passed |
| Portable four-timezone Chromium / public shell | 12 passed |
| Real PostgreSQL pgTAP/RLS | 585 assertions / 13 files passed |
| SQL lint / security advisors | No errors / no issues; preexisting Task 9 unused-counter warning unchanged |
| Auth / accounts / transactions API | 33 / 33 / 118 assertions passed |
| Categorization / import Storage-preview / import commit API | 70 / 91 / 195 assertions passed |
| Reconciliation / reporting / budgets / obligations API | 86 / 30 / 50 / 93 assertions passed |
| Authenticated desktop/mobile Chromium | All 56 passed |
| Forecast read API | 15 assertions passed |

No required gate was unavailable. The targeted pre-chain run also passed 585 database assertions and 30 reporting assertions. The full-chain bulk RPC took 169 ms and its history projection 35 ms, with all three authorization InitPlans executed once; three additional exact full-response reads passed. These follow the three successful controlled CPU-limited comparisons, not a broad test retry. Existing security, concurrency, idempotency, rollback and financial assertions remain. No timeout or retry limit was altered.

Branch starts from the fetched merged master: `codex/task13-master-ci-fix`. The fix will be committed/pushed and delivered as a separate PR only after complete local verification. Exact final head and completed remote push/PR CI evidence will be recorded on that PR.

Product & Architecture Replanning remains **blocked** until independent review, manual merge of this fix, and successful post-merge CI on the new exact current master. Green fix-branch/PR CI does not replace that requirement. Remaining risks include ordinary hosted-runner variability and large graphs near the existing snapshot bounds; no universal performance SLA is claimed. The regression prevents repeated per-row live authorization in this projection, rather than asserting an arbitrary wall-clock budget.
