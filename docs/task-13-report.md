# Task 13 — Cash-flow forecast and conservative safe-to-spend

## Scope and prerequisites

PR #11 was merged into master at `33751ecb0cdf63b1155627b40364dad4e4cdf842`; its exact post-merge [push CI 38443075545](https://github.com/maozNachum/couple-finance/actions/runs/38443075545) completed/success before implementation. Master was synchronized and `feature/task-13-cashflow-safe-to-spend` created. Root instructions, synced references and all thirteen merged migrations remain unchanged.

The read-only Hebrew RTL `/forecast` workflow selects authorized household, closing baseline date, 7/30/60/90 future days, reporting currency, explicit account accessibility and explicit nonnegative buffer. It displays original account balances/measurement dates/ownership, excluded/unresolved accounts, expected evidence, full version-specific obligation names/original planning Money, signed cash evidence, daily ending positions, minimum/date, explicit modeled shortfall and unavailable spending capacity. All amounts retain full fractional precision in planning display. No fabricated balances, guessed contract schedules, financial execution, provider/FX integration, financial advice, production deployment or Task 14 code.

## Financial policy and compatibility

See [pre-implementation decisions and refinements](task-13-decisions.md). Only explicitly accessible ACTIVE BANK/CASH/SAVINGS contribute; every potentially liquid account requires INCLUDE/EXCLUDE, and each stable account/whole owner is counted once. Archived liquid accounts require review. LEDGER/OBSERVED source authority, current revisions, opening coverage, dated measurements and historical FX remain canonical. A shared `reportingPosition` extraction preserves Task 10 reporting semantics while avoiding dependence on unrelated net-worth/monthly totals.

Starting position is closing S; supported cash dates are `(S, S+horizon]`, baseline included in the minimum. evidenceAsOf is an explicit date-only calculation basis; the browser displays its Jerusalem clock date on refresh and disallows future baselines. This browser-clock basis is not an independent certification of bank/server time. Reuse Task 12 monthly clamping, inclusive schedule bounds and version-effective windows. Core has no ambient clock, timezone conversion, network or storage; output order is deterministic. Horizon is 1–90 future days, expected events and posted projected evidence are each bounded to 1,000, and the entire validated graph has inherited collection/16 MiB UTF-8 bounds. Calendar/arithmetic/context overflow fails unavailable rather than truncating.

Known historical actual movements after a historical baseline use exact signed account Money once. Positive receipts after evidenceAsOf, including salary/transfer/refund, cannot inflate capacity and have explicit unavailable future-inflow evidence. There is no approved persistent future income model in this release. Confirmed obligations are planning outflows; candidates never contribute. Whole valid actual associations already reflected in starting balances suppress a second deduction; future actual associations represent the cash once on the actual financial date. Partial/ambiguous/stale links block certainty. Unassociated negative expenses beyond evidenceAsOf are retained as unresolved evidence with null cash. Historical actuals after S, including valid partial/ambiguous associations, affect ledger cash once; uncertain historical payment overlap makes the expectation unresolved with null cash rather than subtracting both. Absence of a link is never proof of nonpayment or an overdue debt.

Card purchases do not become bank cash outflows merely because expense reporting recognized them. Retained reconciliation is reevaluated against current revisions/effects. Unknown/nonzero card or loan exposure and missing future settlement/repayment timing prevent a complete spending amount; a fresh complete zero debt position with no registered future exposure is distinguished from unknown debt. No future settlement calendar or loan amortization is inferred. Pending/unclassified evidence, partial openings, stale observations and differing value/transaction dates propagate uncertainty. Transfers affect included account sides once; excluded sides do not become household cash. Principal, interest/fees, investments and refunds retain separate canonical effects.

Historical exact-day household FX may show a converted starting subtotal, preserving original values and rate/measurement dates. Foreign starting currency exposure and future different-currency movements/obligations prevent combined safe-to-spend even when a historical rate exists. No inversion, live rate, future FX, guessed fallback or silent foreign exposure omission.

Safe-to-spend candidate is the minimum over baseline/every modeled daily ending position minus the explicit buffer. COMPLETE with a nonnegative candidate yields MODELED_AVAILABLE (including true zero). COMPLETE with a negative candidate yields MODELED_SHORTFALL with positive shortfall and null available amount. PARTIAL/UNKNOWN/UNAVAILABLE yield unavailable safe-to-spend; partial daily subtotals are explicitly labeled. Complete means modeled registered records, not certified statements, guaranteed future money or payment authorization.

## Authorization and persistence

Reuse the unchanged STABLE invoker `obligations_snapshot` with current live Auth/session/member checks, RLS, household composite references and complete financial/planning histories. Loader validates the full graph before showing evidence. No new tables, grants, RPC writer, dependency, Edge Function or migration. Forecasts never change account positions, transactions/allocations, budgets, obligation/link history or reconciliation. New command concurrency/idempotency/rollback tests are inapplicable because there are no new commands; all unchanged prior command gates remain in the chain.

Snapshots/accessibility/buffer live only in memory, clear before revalidation and on confirmed sign-out/access loss, and obsolete responses cannot restore protected data. No localStorage/sessionStorage/IndexedDB. Network uncertainty shows fixed errors without stale amounts. Correction/review links use existing authorized workflows.

## Verification

The complete final `npm run verify` passed **exit 0** on October 13, 2026, on the frozen implementation. Log: ignored `.artifacts/task13-verification/.artifacts/task13-verify-delivery.log`. The entire preexisting chain remains intact with the new forecast read API appended; no assertions, timeout or retry limits were weakened. Source parity between the working branch and verification copy was checked; only local stack addressing differs.

| Gate | Actual result |
| --- | --- |
| TypeScript / ESLint / exact aliases and architecture | Passed |
| Vitest | 525 tests, 10 files passed |
| Permission-free cached Deno / generic CSV | 413 / 15 passed |
| Import preview/commit Edge typechecks | Passed |
| Production build / four-timezone portable Chromium and shell | Passed / 12 tests passed |
| Real PostgreSQL pgTAP/RLS | 570 assertions, 12 files passed |
| SQL lint / security advisors | No errors / no issues; existing Task 9 unused-variable warning retained |
| Auth / accounts / transactions API | 33 / 33 / 118 assertions passed |
| Categorization / CSV Storage / import commit | 70 / 91 / 195 assertions passed |
| Reconciliation / reporting / budgets / obligations API | 86 / 23 / 50 / 93 assertions passed |
| New forecast read API | 15 assertions passed |
| Authenticated desktop/mobile Chromium | All 56 passed, including four forecast stories |

Portable coverage includes exact/sub-cent Money and non-rounding display, daily versus final minima, real shortfall/zero/unknown, stable identities/ownership/order, included/excluded/archived accounts, ledger revisions/opening coverage, observed authority/measurement dates, transfers/principal/refunds/investments/pending/voided/unclassified, original currencies/historical FX/unknown future receipts, confirmed versus hypothetical obligations, linked/reflected/replaced/partial/ambiguous/stale actuals, historical actual cash versus unresolved planning overlap, card purchase/settlement duplication, genuine valid-graph UTF-8 overflow, calendar/horizon/event/arithmetic bounds and 28–31/leap/year/version/date windows. The shared corpus runs in browser/Deno/Vitest across UTC, Asia/Jerusalem, America/Los_Angeles and Pacific/Kiritimati.

Read tests prove anonymous/two-household isolation, live/deleted sessions and unchanged revoked JWT denial, preserved full actual/link history and no transaction/allocation/obligation/budget/reconciliation/observation mutation. Existing forged references/FX/members, deleted users, private-history access, command concurrency/idempotency/rollback and import provenance gates remain. Forecast browser tests verify explicit liquidity/buffer/shortfall, partial associations, refresh/network clearing, obsolete response suppression, sign-out/revocation, empty localStorage/sessionStorage/IndexedDB, native keyboard controls, axe and mobile overflow. Synthetic desktop/mobile screenshots were inspected.

No required gate was unavailable. All thirteen migrations remain unchanged and replayed successfully on the verified new disposable stack. Cleanup returned that stack to zero Auth users/households; the original retained its initial 2 users/4 households. No original/hosted/non-disposable database was reset. Existing bundle/color advisories remain; production JavaScript was 838.34 kB (236.79 kB gzip).

Earlier development runs identified a buffer validation refinement throwing for empty input, an exact label selector including option text, and a synthetic December fixture whose evidence date preceded its selected baseline. Each was corrected without weakening assertions, increasing timeouts or enabling retries. Added dedicated empty/invalid/over-precise buffer and future-baseline regressions. Original database contains existing data and was never reset. A new ignored verification copy uses separate disposable `couple-finance-task13` (API 15471/database 15472); no preexisting containers/data volumes existed before startup. All thirteen migrations replayed there; zero Auth users/households verified before tests. Scoped synthetic leftovers from interrupted locator tests were checked and cleaned using the existing fixture cleanup, preserving the original stack.

## Limits and review handoff

Future persistent planning income, future bank/card settlement schedules and contractual principal schedules are unsupported. Unknown exposure therefore prevents spending capacity. Accessibility/buffer are explicit per-session calculation inputs and reset on revalidation/household changes; they are not durable financial configuration or frozen monthly reports. External account/import coverage, future FX and actual intraday funds cannot be certified by this model. Browser-clock evidenceAsOf and current corrected knowledge remain explicit assumptions. Bounded snapshots/graphs may need a separately reviewed scaling protocol. Browser verification targets Chromium desktop/mobile emulation, not every engine/device.

[Task 14 prompt](task-14-prompt.md) is limited to deterministic insights and operations under the approved roadmap after independent Task 13 review, actual merge and exact-master successful CI. No automatic merge or deployment; stop after Task 13.

Remote feature-head CI evidence will be recorded on the PR after publication, independently from local results.
