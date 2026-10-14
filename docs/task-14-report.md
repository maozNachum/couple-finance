# Task 14 — Financial data quality and actionable evidence

## Baseline and scope

Started from clean fetched `origin/master` commit `47b002a95468cbf38b89672a9f5a8cee5a3e43c7`, including merged Task 13 and PR #13's authorization-performance CI fix, on `feature/task-14-financial-data-quality`.

Baseline CI provenance is **user-supplied evidence from their authenticated GitHub browser**, not direct Actions access by this implementation session: [successful master push run 38518886396](https://github.com/maozNachum/couple-finance/actions/runs/38518886396), screenshot showing Success/verify/push/master/47b002a, and the full commit hyperlink copied by the user from that run. Its full SHA matches the fetched baseline. Later feature-head CI is independently queried through the GitHub API and recorded with the exact SHA in the PR/review manifest.

Added the Hebrew RTL `/data-quality` view and a pure deterministic evidence evaluator. It groups known-data problems across balances, net worth, monthly reporting, category budgets, reconciliations, obligations and optionally forecast. Existing canonical financial calculations, schemas and writers remain unchanged. No new financial values are invented and no correction is automatic.

## Minimal contract and semantics

The versioned request identifies household, valuation date, month and reporting currency. Optional forecast evaluation additionally requires explicit accessibility, buffer and horizon inputs on the same household/date/currency. The snapshot adds only categories, budget revisions and a server capture timestamp to the existing obligations/reporting graph. The result contains module states and stable evidence findings; there is no persisted issue lifecycle, severity score, generated narrative or background engine.

| Root | Evidence and affected results | Supported review action |
| --- | --- | --- |
| Balance evidence per account | Opening revision or selected observation/source; balance, net worth, monthly history and forecast | Transactions/openings or accounts/observations |
| Historical FX per original currency, target currency and required date | Original evidence plus competing matching rate IDs, when present | Manual observation-attached FX can be reviewed in accounts; standalone reporting FX has no editor |
| Unclassified financial effect per transaction | Current immutable revision; monthly, budgets and forecast | Transactions |
| Reconciliation per relationship | Decision version, current and originally selected revisions | Reconciliation |
| Uncategorized expense per transaction | Recognized expense revision affecting active category budgets | Categories |
| Payment evidence per obligation occurrence | Obligation/link versions and current/original payment revision | Obligations |
| Remaining calculation limitation | Existing forecast reason and available source references | Forecast where supported, otherwise explicit limitation |

Root IDs use version/household/type/domain identity, independent of labels and ordering. Sorted, deduplicated evidence and impacts combine shared symptoms into one root while retaining separate affected result identities. Stable does not mean permanent: findings are recomputed from current authorized evidence. Unmatched transactions alone are not errors; an unlinked obligation is not proof of nonpayment or overdue debt.

Financial measurement dates, recording timestamps, source authority activation and snapshot time are distinct. Observation age is exact Gregorian calendar days, including century rules. Carried pension/investment observations are dated evidence under the existing conservative policy, not proof of invalid value or a broken source. Original currencies and exact-date historical FX requirements remain visible. Internal COMPLETE describes registered evidence only; external coverage remains UNKNOWN even with zero findings.

## Security, consistency and bounds

The only migration adds `api.data_quality_snapshot()`, a STABLE SECURITY INVOKER function with empty search path. It calls the existing obligations snapshot once and reads category/budget history in the same PostgreSQL statement/MVCC snapshot under existing live Auth/session/member checks and RLS. Authenticated users receive execute only; no new tables, privileged helpers, writes or relaxed policies. Existing Task 13 authorization InitPlans are untouched.

Server and client enforce the combined 16 MiB bound, existing collection bounds and added 10,000 category/budget bounds. Full graph validation precedes calculation, including reconciliation/observation lineage. Output is capped at 2,000 roots and 10,000 references/impacts per root with explicit failure, never silent truncation. Pagination shows ten findings at a time while retaining access to all validated results.

Protected evidence exists only in memory. Refresh, focus, visibility, authentication changes and failures clear the snapshot. Household selection discards the prior derived findings and forecast choices, then evaluates the selected household from the same authorized graph; generation checks reject obsolete responses after switching, logout or revocation. Destination screens independently authorize their own data. Links navigate existing routes without fabricating unsupported record-level correction workflows. Archived-account changes, nonmanual source corrections, independent FX management and unsupported settlement/future-income planning remain explicit limitations.

## Verification

The complete final `npm run verify` passed with **exit code 0 on October 14, 2026**. The implementation was frozen throughout the chain; final edits afterward are documentation and removal of a trailing blank line in a test file only. Full log: `.artifacts/task14-verification/.artifacts/task14-verify.log`, also included in the review package.

| Gate | Actual result |
| --- | --- |
| TypeScript, ESLint, exact aliases and architecture | Passed |
| Vitest | 571 tests in 11 files passed (baseline 525) |
| Permission-free portable Deno / generic CSV | 450 / 15 passed (portable baseline 413) |
| Import preview/commit Edge typechecks | Passed |
| Production build / four-timezone Chromium and shell | Passed / 12 tests passed |
| PostgreSQL pgTAP/RLS | 609 assertions in 14 files passed (post-fix baseline 585 in 13) |
| SQL lint / security advisors | No errors / no issues; existing Task 9 unused-variable warning remains |
| Auth / accounts / transactions API | 33 / 33 / 118 passed |
| Categorization / CSV Storage / import commit API | 70 / 91 / 195 passed |
| Reconciliation / reporting / budgets / obligations API | 86 / 31 / 50 / 93 passed |
| Forecast / new data-quality API | 15 / 22 passed |
| Authenticated desktop/mobile Chromium | 62 passed (baseline 56), including six new quality stories |

The 37 new portable cases run in Vitest, Deno and Chromium across UTC, Asia/Jerusalem, America/Los_Angeles and Pacific/Kiritimati. They exercise missing/partial/opening authority, observed valuation and carried age, source changes, original currencies/historical and attached FX, categorized versus unclassified meaning, shared roots, determinism/nonmutation, stale reconciliation/payment versions, bounds and malformed/foreign contexts. Seven loader tests cover authorization and failure behavior. The 24 new SQL assertions and 22 API assertions cover anonymous access, household isolation, forged input, unchanged revoked JWT, deleted/disabled user and deleted session, nonmutation and bounded responses.

The real 1,003-row performance scenario passed: reporting snapshot 94 ms; quality snapshot 168 ms; history projection 41 ms; all three authorization InitPlans executed once. These are local measurements, not production latency promises. Browser stories verify supported navigation, keyboard controls, axe checks, mobile RTL/no overflow, unknown external coverage, explicit forecast inputs, no browser persistence and rejection of late responses after household switch/logout/revocation. Synthetic desktop/mobile screenshots were visually inspected.

The unchanged complete command is `npm run verify`. The data-quality API gate is appended through the existing forecast API script; no previous gate is removed. Source parity confirms the tested copy matches implementation/tests/configuration except documented local stack addressing. Verification used the newly created disposable `couple-finance-task14` stack, with no preexisting matching volume, API 15521/database 15532. All 15 migrations replayed there; the original 14 are unchanged. No retained, hosted or real database was reset. Only synthetic data were used.

Existing bundle-size/color advisories remain; production JavaScript was 868.42 kB (243.35 kB gzip). Browser coverage is Chromium desktop/mobile emulation, not all engines or physical devices. No required gate was unavailable. Development fixture and locator mistakes were corrected without increasing timeouts, adding retries or weakening assertions.

## Roadmap and handoff

The canonical roadmap now reflects the approved summary: 14 data quality; 15a private-pilot foundation, real recovery and secure operation; 15b practical mobile use; 16a accounts/intake; conditional 16b dynamic FX; 17 goals; 18 deterministic insights; 19a–19b controlled coach; 20a–20b authorized proactive work. Provider research remains parallel. Longer-term investments, pensions, financial independence, comparisons and automation remain preserved. The independently reviewed full replanning document was not available here; no additional approval is invented. Historical reports and the superseded original Task 14 prompt remain identifiable.

`task-15a-prompt.md` is a bounded proposal only. No Task 15 implementation, banking integration, dynamic FX, AI, scheduled evaluation, production deployment or merge is included. Deliver one PR to master and an exact-head Git snapshot ZIP with independently verified blob hashes, decisions/report/prompt, changed-file list, diff, manifest and local/remote verification evidence. Stop for independent review after opening the PR.
