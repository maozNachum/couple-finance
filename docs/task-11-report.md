# Task 11 — Monthly household budgets and actual versus plan

## Preparation and delivered scope

Task 10 PR #9 was independently approved and merged at `e29a337819864855fa4eb77f533f0d5d896a2783`. Its exact master push [38393940783](https://github.com/maozNachum/couple-finance/actions/runs/38393940783) was completed/success before implementation. Fetched/synchronized master and created `feature/task-11-monthly-budgets`. Applicable instructions, approved architecture/model/security/providers/portable contracts/roadmap and earlier deliveries/decisions/review fixes informed the [pre-implementation decisions](task-11-decisions.md). Synced references, root instructions and all eleven merged migrations remain unchanged.

The Hebrew RTL `/budgets` screen supports household/month selection, one active planning currency, explicit nonnegative plans including zero, supported category/shared/member scopes, expected-version amount edits, revision history with durable authors and original category labels, and terminal archival. It displays recognized consumption/refunds, remaining/over/utilization when complete, category groups, uncategorized/unbudgeted allocations, original currency and historical conversion evidence, unresolved effects/card settlement warnings and links to existing explicit correction workflows. No persistent browser financial/command storage, recurring engine, automatic rollover, forecast, safe-to-spend, financial execution or production deployment was added.

## Financial and persistence boundaries

TOTAL contains every ownership and is an independent parent benchmark. Child ALL/category, SHARED and MEMBER scopes must be disjoint; overlapping ownership/category sets and mixed active plan currencies conflict under the household lock. Shared spending is one allocation bucket; account ownership never overrides allocation ownership and no percentages are inferred. Parent and child planned amounts are never added together. Expenses outside all active child scopes remain explicitly unbudgeted; the parent does not allocate them.

The unchanged Task 10 eligibility loop now exposes expense details with ownership/category/date and its existing recognition-day conversion. Budget core consumes those canonical lines and coverage, retaining EXPENSE refunds, current revisions, USER locks, explicit effect exclusions, half-open months and reconciliation uncertainty. There is no alternative writer/financial-effect predicate or FX implementation in React/SQL. Missing/ambiguous FX does not silently exclude an expense while claiming success. Incorrect card EXPENSE remains included until a separate explicit correction; unresolved/STALE/NEEDS_CORRECTION evidence prevents confirmed comparisons.

No plan, explicit zero, known zero, unavailable actual, partial actual and archived plan are distinct. Incomplete comparisons expose justified converted expense subtotals only, with null remaining/over/utilization; wholly unavailable evidence is null. Category plans are conservatively incomplete when uncategorized eligible expenses exist. Whole-household actual includes those expenses. All Task 10 monthly issues propagate conservatively to all budget scopes, including unrelated income FX issues. Utilization uses canonical decimal division, explicit two-place HALF_UP and null for zero plan. Remaining is a mathematical plan comparison, not liquidity or spending advice.

The additive CLI-created migration `20261013121840_task11_monthly_budgets.sql` adds unexposed budget heads/revisions plus private receipt/minimal audit. Restrictive composite category/version/member references preserve history and author deletion retention. Browser roles have SELECT RLS only; invoker APIs and a narrow private command reauthorize live user/session and active membership before every replay. Complete-payload SHA-256, household serialization, expected versions and atomic revision/receipt/audit persistence handle duplicates, stale edits and late rollback. Plan commands never change accounts, opening balances, transactions, allocations, observations, FX, categorization or reconciliation.

One STABLE invoker snapshot nests Task 10 reporting with all categories and complete budget revisions under one statement snapshot. Existing financial bounds plus 10,000 categories/revisions and a combined 16 MiB limit fail explicitly instead of returning truncated success. Core validates complete sequential plan histories, immutable scope/currency/month, actor/category/household context and overlap. Two exact ES-only aliases are added consistently to architecture/TypeScript/Deno; no dependencies change.

Browser revalidation clears protected plans/forms before loading, rejects obsolete responses and removes pending commands on confirmed sign-out/access loss. An uncertain exact command survives authorized focus refresh in memory and blocks other saves until its result is recovered. Reload/unmount loses memory; users must inspect durable history before creating a new command. Native labels, keyboard controls, RTL wrapping and accessibility are verified with synthetic data only.

## Verification

The complete `npm run verify` chain passed **exit 0** on October 13, 2026. A final UTC fractional-precision ordering regression and reuse of the existing ledger helper were then verified with TypeScript/ES-only core, ESLint, all Vitest/Deno tests, production build and the portable browser corpus. No database/API/UI command semantics changed in that final helper correction.

| Check | Final result |
| --- | --- |
| TypeScript / ESLint / exact aliases and architecture | Passed |
| Vitest | 411 tests, 9 files passed (410 during full chain, plus final UTC regression) |
| Permission-free cached Deno / generic CSV | 310 / 15 passed (309 plus final UTC regression) |
| Import preview/commit Edge checks | Passed |
| Production build / four-timezone portable Chromium | Passed / 12 tests |
| Actual PostgreSQL pgTAP/RLS | 505 assertions, 10 files passed |
| SQL lint / security advisors | No errors / no issues |
| Auth / accounts / transactions API | 33 / 33 / 118 passed |
| Categorization / CSV Storage / import commit API | 70 / 91 / 195 passed |
| Reconciliation / reporting / budget API | 86 / 23 / 50 passed |
| Authenticated desktop/mobile Chromium | All 42 passed, including eight budget stories |

No required verification category was unavailable. Full-chain log: `.artifacts/task11-final-verify.log`; final portable browser log: `.artifacts/task11-final-portable-browser.log`. A supplementary browser invocation initially found port 4173 occupied by the still-running authenticated suite; it was run sequentially after that suite completed, without changing ports, retries or assertions.

All twelve migrations replayed successfully on the configured disposable loopback Docker database after verifying **zero households and zero Auth users**. No hosted/real financial database was reset. Prior regression tests remain enabled. New portable coverage runs unchanged in Vitest/Deno/Chromium across UTC, Asia/Jerusalem, America/Los_Angeles and Pacific/Kiritimati. It covers no/zero/archived plans, known/unknown/partial actuals, exact refunds/overflow, current revisions/pending/voided, explicit effects/principal/interest/fees, card uncertainty, category rename/archive, disjoint ownership/overlap, exact/missing/ambiguous historical FX, calendar boundaries and order independence.

Real PostgreSQL/API tests include anonymous/two-household/direct/indirect denial, forged members/categories, independent composite FKs, unchanged revoked JWTs, deleted sessions/users, concurrent identical/conflicting commands, old receipt recovery, archival, late audit failure with complete rollback and financial evidence/audit non-mutation. New PostgreSQL limits tests prove both collection overflow and combined byte overflow while the nested financial report alone remains below its bound. Browser stories include exact retry after committed-response loss and focus revalidation, stale edit conflict, incomplete FX/card/category states, archival/history, network clearing, obsolete-response-after-revocation, sign-out and empty browser storage. Desktop/mobile screenshots were inspected and axe/overflow assertions passed.

Development failures were fixture/compile issues: a financial-date fixture preceded its opening, an unused import and category fixture needed canonical schema parsing, and a byte-limit SQL fixture retained household B's claims before testing household A. These were corrected while retaining every assertion. Final logs are ignored under `.artifacts/task11-*`. Existing bundle-size/color advisories and Task 9's unused SQL variable warning remain; no warning is suppressed. Final production JavaScript measured 775.96 kB (222.17 kB gzip). Current [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security) and changelog were reviewed against the pinned stack; no upgrade was needed.

## Limits and handoff

Completeness is over registered canonical evidence, not external statement certification. Budget comparisons inherit Task 10's conservative ledger/reconciliation coverage and exact-day FX policy. Future imported statement coverage and reviewed FX provenance/freshness could support finer scope-specific completeness; none is guessed here. Ownership uses explicit allocation attribution, including durable revoked member identities. Archived categories retain existing plans but reject new scopes. Budget identity/month/scope/currency are immutable; a changed scope requires explicit archival and creation. December 9999 is unsupported because its exclusive end cannot be represented.

Current corrected knowledge is used for historical actuals; this is not a recorded-time report freeze. Plan decisions themselves are retained immutably. Archives are terminal. Snapshots near configured bounds may require future measured scaling and a reviewed complete-history retrieval protocol. Browser verification covers Chromium desktop/mobile emulation, not all engines/physical devices. Production hosting, backups and live integrations remain separately authorized work.

The [Task 12 prompt](task-12-prompt.md) prepares recurring candidates and explicitly confirmed obligations only. No Task 12 code exists. Stop after Task 11; wait for independent review before any merge. Exact feature-head push/PR CI evidence is recorded on the PR and in the delivery response after publication, independently of local results.
