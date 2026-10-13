# Task 9 delivery report

Scope: explicit reconciliation only. Baseline master `da41c570da7772cd0c043aec67d4f1244758f122`, merged PR #7, exact post-merge push [38362287666](https://github.com/maozNachum/couple-finance/actions/runs/38362287666) succeeded before implementation. Branch `feature/task-9-reconciliation`. No production deployment, real financial execution, future reporting implementation, sources/ edits or existing migration changes.

## Delivered behavior

The `/reconciliation` Hebrew RTL screen selects household, source account, relationship kind and existing posted evidence. It explains weak similarity, typed supporting evidence, ambiguity and seven-day candidate windows. Explicitly selected card purchases/refunds form a group; pending authorizations stay separate. Loan allocations require the user to select principal, interest and explicit fees individually. Original account/date/Money/effect/USER lock evidence is shown before acknowledgement. One-sided, partial and unequal evidence remains visible. No missing movements or automatic matches are created.

Confirmation writes only relationship decisions. Incorrect existing financial effects produce NEEDS_CORRECTION rather than suppressing consumption. The existing transactions page provides the separate authorized financial revision operation. Correcting an amount/status/effect/allocation appends the original financial history; the previous link is now STALE and must be explicitly replaced or unlinked. Category-only revisions conservatively stale it too. Relationship-only commands never change a ledger, observation, FX record, account source or original transaction.

Card relationships support one bank payment, one optional positive card settlement movement and individual purchases/refunds on a single card. Internal transfers support one outgoing and one optional incoming movement. Loan relationships support a bank payment with explicit principal/interest/fee allocation meanings and one optional positive loan-principal movement. All participants reference stable transaction IDs and exact revision/account versions. A movement can belong to only one active relationship, including a partial or stale one. See [decisions](task-9-decisions.md) for tradeoffs.

Cross-currency payment/counterpart confirmation selects existing immutable household FX evidence: payment base, counterpart quote, effective on the original payment financial date. It explicitly uses eight-place HALF_UP multiplication; never inversion/live lookup. Missing/incompatible evidence cannot be confirmed as a resolved cross-currency link. Unexplained differences remain PARTIAL. Card purchase grouping currently requires payment currency; cross-currency card settlement can link payment/counterpart without fabricating a converted purchase group.

## Persistence and authorization

The CLI-created forward migration `20261013073444_task9_reconciliation.sql` adds household-scoped heads, immutable decision/participant history, exclusive active claims, private receipts and minimal audit. Composite restrictive references retain financial revisions, accounts, durable members and FX evidence. Decisions snapshot complete original revisions, accepted import item/source reference/file hash and selected FX. Explicit UNLINK releases claims but retains all history; REPLACE atomically supersedes the decision with freshly reviewed versions. Auth deletion unlinks login access, retaining durable attribution/evidence.

The exposed coherent snapshot and write wrapper are security invokers. A narrow private definer performs complete validation and live user/session/membership reauthorization, including exact retries, under household, Auth and deterministically sorted account locks. Complete JSONB SHA-256 binds every submitted field and ordered array. Household receipts recover the original committed identity/version after lost responses. Changed payloads under the same key conflict. Late failures roll back heads, claims, decisions, receipts and audit together. All direct financial history/relationship DML is withheld. No finance/private schema exposure or frontend service-role key.

Bounds: 100 participants, 1,000 total selected allocations, 128 KiB command JSONB; bounded 10-second lock wait with fixed conflict response. Native SQL exact numeric arithmetic mirrors the portable validation at the trust boundary; portable core uses the existing decimal wrapper and rejects conversion/sum overflow. No new dependencies, Edge endpoint or financial writer.

The in-memory UI retains the exact uncertain command, disables duplicate/context-changing submissions and reauthorizes on focus. Confirmed revocation/sign-out clears protected content and retry state; transient revalidation failure preserves an uncertain command. Refresh clears old previews. Full reload/navigation drops memory-only commands, so durable history must be checked before a new decision. No success indication precedes the confirmed server result, and no authenticated browser storage is introduced.

## Verification

The final complete `npm run verify` finished with exit **0** on 2026-10-13. Every existing Task 3–8 gate remains enabled. Evidence is the complete local `.artifacts/task-9-verify-final.log` (ignored generated artifact), with these exact results:

| Check | Result |
| --- | --- |
| TypeScript / ESLint / architecture and exact-alias boundaries | Passed |
| Vitest | 332 tests, 9 files passed |
| Permission-free cached Deno portable suite | 235 passed |
| Deno CSV adapter | 15 passed |
| Import preview/commit Edge typechecks | Passed |
| Production build and portable Chromium/shell corpus | Passed; 12 browser tests passed |
| Real PostgreSQL pgTAP/RLS | 436 assertions, 8 files passed |
| SQL lint / security advisors | No errors / no issues |
| Auth / accounts API regressions | 33 / 33 assertions passed |
| Transaction / categorization API regressions | 118 / 70 assertions passed |
| Import Storage/API / import commit regressions | 91 / 195 assertions passed |
| Reconciliation Auth/API/concurrency | 86 assertions passed |
| Authenticated Chromium desktop/mobile | All 28 passed in 3.3 minutes; 8 Task 9 stories included |

Reconciliation coverage includes two households, anonymous/direct/indirect/forged references, unchanged revoked JWTs and deleted users/sessions, current/archived accounts, current/stale revisions, USER locks and category rename/archive, one-sided and partial evidence, repeated/ambiguous candidates, transfers, card purchases/refunds/pending authorizations, explicit loan principal/interest/fee allocations, historical FX, actual CSV provenance after raw cleanup, concurrent identical/incompatible decisions, changed complete payloads, late injected rollback, original-result retry and retained unlink/replacement history. The browser verifies pending-response submission guards, response loss, focus revalidation, transient Auth HTTP 429 retaining the same command, revocation/sign-out clearing data and empty local/session storage. Pure ledger cases prove relationship previews preserve KNOWN/UNKNOWN/OBSERVED behavior and a separately authorized amount revision changes only its account contribution.

Migration replay was performed only on the configured disposable loopback Docker stack after confirming **zero households and zero Auth users**. All ten migrations replayed successfully, and `migration list --local` showed matching local/applied versions through `20261013073444`. All nine merged migration files remain byte-for-byte unchanged in Git. Synthetic fixture cleanup is explicitly limited to generated household IDs. No real/hosted database reset or production deployment occurred.

Desktop/mobile review screenshots were inspected, horizontal overflow assertions passed, and axe reported no violations in transfer and loan review. The final layout uses the existing responsive `.page accounts-page` wrapper; after this presentation-only adjustment, TypeScript/lint/build and all eight reconciliation desktop/mobile stories were rerun successfully. The initial new-browser failures were selector/expected-screen mistakes: a hidden native option was selected instead of history, and exact implicit-label/sign-out-route assumptions were too narrow. They were corrected without widening timeouts, enabling test retries or weakening protected-content assertions. No verification gate was unavailable. The existing large-client-bundle advisory remains; there are no new dependencies.

Remote implementation commit **`2970fd216963b35e261d90fdbe393bae45d6b3b8`** passed both complete Foundation checks runs: [push 38372725169](https://github.com/maozNachum/couple-finance/actions/runs/38372725169) and [pull request 38372768406](https://github.com/maozNachum/couple-finance/actions/runs/38372768406), each `completed / success`. These remote runs include the final responsive page wrapper and every verification gate. [PR #8](https://github.com/maozNachum/couple-finance/pull/8) targets master and remains open for independent review; no automatic merge or deployment was performed. The following evidence-only commit updates this report without code, schema or test changes; final head checks are visible in the [PR checks](https://github.com/maozNachum/couple-finance/pull/8/checks).

## Deliberate limits and review notes

- No subset-sum statement inference, amortization, fee/spread guessing, bulk corrections, new opposite movements, live providers, AI, budgets, dashboards, net worth, forecasts or production deployment.
- Whole movements are exclusive claims. A purchase cannot be partially distributed between several unrelated payments; group justified evidence together, or unlink/replace after reviewing. This avoids speculative many-to-many accounting and unsupported coverage claims.
- Counterpart candidates are settlement movements within seven days. Explicit evidence can be selected outside that window, with a reason. Equal amount/date/text alone stays weak; supporting effects/source references still require human confirmation.
- Loan components refer to existing allocations. Missing principal/interest/fee splits require an explicit existing financial correction before they can be represented distinctly; the reconciliation screen never invents amounts. Opposing-sign allocation offsets are deliberately ineligible for payment/counterpart roles.
- Archived accounts retain historical links; new link/replacement checks reject them. Unlink and authorized exact committed retries remain available. Any later transaction revision requires fresh link review and leaves prior evidence untouched.
- Future reporting must honor actual allocation effects and current revision validity, not use LINK/EXACT labels to silently suppress unresolved expenses. Task 10 preparation is in [its prompt](task-10-prompt.md); no Task 10 code is included.
