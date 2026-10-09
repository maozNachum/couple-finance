# Task 4 architecture review fixes

Scope: corrections to existing PR #2 on `feature/task-4-accounts-balances`. No new PR, merge, Task 5 implementation, ingestion, provider connection, live synchronization or live FX API. This report supersedes the source-persistence and FX limitations in the original [Task 4 report](task-4-report.md).

## Migration safety and identity preservation

Inspected local migration history before editing: `20261008104827_household_auth.sql` and `20261008171219_accounts_valuations.sql` were already applied. The local database had zero users, accounts and observations, with no hosted project link. The state of every other developer environment cannot be established, so both existing migrations remain unchanged. A CLI-created forward migration, `20261009100715_task4_source_authority_fx.sql`, carries the correction.

Before applying it, a synthetic pre-upgrade household, USD account and historical FX observation were inserted using the old schema and API. After migration, account `50000000-0000-4000-8000-000000000003`, source `70000000-0000-4000-8000-000000000003` and observation `60000000-0000-4000-8000-000000000010` retained their identities; currency USD, version 1 and amount -100.00000000 were unchanged. The observation FX JSON exactly matched the backfilled evidence. Only these synthetic fixtures and their audit rows were removed afterward. No real data was discarded.

The forward migration copies every old manual source before removing the account column, and every existing FX snapshot before adding the new reference. Existing root/successor history remains valid under the source-scoped constraints. Account ownership, currencies, balance policy, status, versions and recording timestamps are not rewritten.

## Exact persistence changes

| Area | Change |
| --- | --- |
| `finance.account_sources` | UUID source ID, household/account IDs, MANUAL/FILE_IMPORT/LIVE_SYNC kind, nullable `authoritative_from`, server creation time. Restrictive `(household_id, account_id)` FK to accounts and unique `(household_id, account_id, id)` referenced key. Source ID differs from its account ID. |
| Source uniqueness | `account_manual_source_idx` allows one MANUAL relationship per household/account. `account_source_authority_idx` forbids tied non-null activation dates for an account. Source identity/kind/context and appointed activation dates are immutable. |
| Source authorization | Household RLS for SELECT; authenticated INSERT permits only the initial MANUAL relationship with baseline date `0001-01-01`. No client UPDATE/DELETE grants. The existing narrow audit trigger records source insertion/activation without copying raw financial data. |
| Accounts | Remove persisted `manual_source_id`; retain canonical Account identity. Add `(household_id,id,currency)` key for the separate currency FK. Replace the immutable-account guard without the removed field and retain account UUID validation. |
| Observations | Source FK becomes `(household_id,account_id,source_id)` to `account_sources`; separate `(household_id,account_id,currency)` FK preserves account currency. Predecessor FK becomes `(household_id,account_id,source_id,observation_date,supersedes_id)`. |
| Observation uniqueness | Rebuild `observation_root_idx` on household/account/source/date for roots. Retain `observation_successor_idx`, so exactly one successor can correct a predecessor. Same-date observations from independent sources coexist. |
| FX references | Drop globally unique `observation_fx_identity_idx`. Add `finance.fx_evidence`, keyed by `(household_id,id)`, holding immutable canonical snapshots. Generated observation `fx_rate_id` references that household-scoped key; `observation_fx_reference_idx` supports the FK. |
| FX validation | Evidence insertion validates canonical keys, UUIDs, supported pair, positive decimal-string rate, financial date, UTC timestamp and source provenance. Updates are rejected. Observation insertion additionally validates account direction and historical effective date, inserts/reuses evidence atomically, and rejects any mismatch under an existing ID. |
| Read/write compatibility | `api.accounts` projects `manualSourceId` from the relationship and includes `sources`. `api.create_account` atomically inserts account plus MANUAL source using the existing input; matching retries compare the command fields without the read-only source list. The coherent snapshot RPC and safe-error vocabulary remain intact. |

FX evidence has household RLS and authenticated SELECT/INSERT only. Its origin is the rate's canonical provenance, not an FK to the account's balance source. Multiple observations/accounts can reference the same unchanged rate evidence even when their balance-source IDs differ. Observation IDs remain financial measurement identities. Embedded FX is retained for the existing wire contract; the evidence registry enforces consistency rather than serving as a reporting-rate catalogue. Both the stored observation and evidence are immutable to clients.

## Deterministic authority and future cutover

1. Select the source with the greatest non-null activation date on or before the requested as-of date. Database uniqueness and contract validation prohibit a tie.
2. Consider only that source's observations with measurement date at/after its activation and at/before the requested date.
3. Apply same-source/date corrections, then choose the latest surviving measurement. Missing data returns MISSING; never use an older source as an implicit fallback.
4. Preserve COMPLETE/PARTIAL coverage, measurement date and archived-account readability. LEDGER remains explicitly unavailable; observations do not supply a ledger balance.

Example: MANUAL has the baseline activation; FILE_IMPORT starts on October 2. Both can retain October 2 observations. A report for October 1 uses MANUAL; a report from October 2 uses FILE_IMPORT. If FILE_IMPORT has no eligible observation, the result is missing even if MANUAL has a newer value. The account ID never changes.

A future authorized cutover use case will attach a new source to the existing account, reconcile overlap, and appoint its activation once. Source rows may overlap; earlier observations are retained and never overwritten. Current clients cannot provision imports/live sources or appoint authority. A source currently has one activation and an account one manual source; reactivation of a previously used source or repeated return-to-manual periods would require an explicitly designed append-only authority schedule. No such workflow, provider credentials or speculative connection framework is implemented here.

## Historical evidence versus dynamic reporting FX

Historical observation FX records the evidence applicable to that observation's measurement date. Future financial activity must retain the rate applicable to its original recognition/settlement date. Correcting or producing a later report must not mutate that evidence.

Dynamic reporting is a different calculation: for a USD balance reported in ILS as of October 9, select the latest eligible USD/ILS rate whose effective date is on or before October 9, even when the authoritative balance was measured October 1. A future application use case must define approved origins, deterministic priority/revision rules, freshness limits and missing-rate behavior. It must return the requested reporting date, balance measurement date, selected rate date and reference separately. No arbitrary stale-age limit is chosen now.

The future provider adapter belongs under `_shared/providers/<provider>/` and normalizes provider DTOs to canonical FxRate. The application layer authorizes and selects eligible evidence; pure core converts Money. `convertMoney` continues to validate the selected rate's effective date: the application passes that date to conversion, preserving the distinct requested reporting date in its result. No provider/network/clock code enters core or JSX.

Current `valueAccount` deliberately returns historical observation conversion with `basis: HISTORICAL_OBSERVATION`. It does not claim to implement reporting-date FX. The Hebrew UI labels the amount “המרה היסטורית לתאריך התצפית” and explicitly says it is not a current-rate valuation. Missing historical FX remains visible. No fixed production rate, live API or unused rate-provider interface was introduced; numeric rates in tests are synthetic fixtures only.

## Code and regression changes

- `core/contracts/valuation.ts`: separate account-source schema, read envelope with validated source context/unique IDs/activation dates, unchanged create-command shape. Canonical Account, Money, Currency, FX and Date contracts remain the Task 2 contracts.
- `core/domain/money/valuation.ts`: date-based authoritative source selection; validation of predecessor presence, same-source/date lineage, single successors, unique observation IDs and cycles; explicit historical conversion basis. Rate provenance is independent of balance provenance.
- `AccountDetails.tsx`: truthful historical conversion labels and correction controls restricted to the manual source. Existing forms, account ownership, currency, policy and archive behavior remain functional.
- `tests/portable/core-cases.ts`: five additional portable cases covering overlapping sources, before/after cutover, inactive sources, missing authority gaps, foreign context, competing activation dates, invalid correction graphs, reusable historical FX and archived-account reading. The CASH boundary test also verifies a valid LEDGER command.
- `supabase/tests/sources-fx-rls.test.sql`: 47 new real PostgreSQL assertions for independent atomic source creation, source RLS/grants, cross-household composite references, source-ID reuse rejection with rollback, multiple modes for one account, unique activation, immutable source identity, same-date roots across sources, correction lineage/competition, shared FX evidence, mutation rejection, referenced deletion restrictions, revoked membership and anonymous access.
- Existing 100 account and 72 identity pgTAP assertions remain. Two direct account fixture inserts stop referencing the removed column; invalid FX provenance now tests an unsupported kind rather than rejecting a legitimate independent rate origin. No security assertion was disabled.
- `scripts/test-accounts.mjs`: five additional checks over real Auth/PostgREST for projected source metadata, independent second-account creation, shared FX reuse, conflicting rate rejection and unchanged-rate correction. Existing concurrent correction/version and 1,000-row snapshot regressions remain; expected snapshot size includes the new observations.
- Desktop/mobile browser tests assert the historical label and current-rate disclaimer. Fixture cleanup includes source and FX evidence rows, scoped only to generated synthetic households. Architecture/security/model/provider/handoff documentation reflects the revised boundaries.

## Verification

Complete `npm run verify` passed locally with exit code 0 on October 9, 2026, after clean `npm ci` (267 packages; zero reported vulnerabilities). No dependency or lockfile changes.

| Check | Result |
| --- | --- |
| TypeScript, ESLint, architecture | Passed |
| Vitest | 211 tests across 7 files passed |
| Cached-only permission-free Deno | 146 passed |
| Production build and portable browser probe | Passed |
| Desktop/mobile shell and four-timezone browser corpus | 12 passed |
| Real PostgreSQL pgTAP/RLS | 219 assertions passed: 100 accounts + 72 identity + 47 source/FX |
| SQL lint / security advisors | No schema errors / no issues |
| Auth/API integration | 33 assertions passed |
| Accounts API integration | 33 assertions passed, including concurrency and FX reuse |
| Authenticated desktop/mobile browser suite | 8 passed, including complete accounts flows and historical-FX labels |
| Forward upgrade with existing synthetic data | Identity, amount, currency, version and FX evidence preserved |
| Clean migration replay | All three migrations replayed; migration history matched; all 219 database assertions passed again |
| Fixture cleanup | Users, households, accounts, observations, sources and FX evidence all returned to zero |

Local logs: ignored `.artifacts/task4-review-verify.log` and `.artifacts/task4-review-replay.log`. Desktop/mobile account screenshots are retained locally and visually reviewed. Pushed-commit CI status is reported separately in PR #2 and the delivery response, rather than inferred from local checks.

## Remaining limits

This is still a synthetic local implementation. Source cutover scheduling and live/reporting FX are defined boundaries, not current end-user capabilities. Historical as-of results use currently corrected knowledge rather than recorded-time snapshots. Full authorized histories are loaded coherently; a future bounded history protocol must preserve correction completeness. No arbitrary freshness threshold, net-worth reporting or ledger calculation was added. Existing build chunk-size and terminal color warnings remain. Browser verification covers Chromium desktop/mobile emulation.

Continue only under a separate approved Task 5 request after review/merge, using the updated [Task 5 prompt](task-5-prompt.md). Stop after these Task 4 fixes.
