# Task 4 delivery report — Accounts & Dated Valuations

This report records the initial Task 4 delivery at `0b49ab9`. Its source-persistence, uniqueness and FX limitations below are superseded by the [architecture review-fixes report](task-4-review-fixes.md), which contains the current design and verification results. Original test counts remain historical evidence.

Scope: Task 4 only. Local manual accounts and dated valuations, preserving the modular monolith, Task 2 contracts and Task 3 invited-user/session/household isolation. No Task 5 implementation, ingestion, external provider, live integration, dashboard, financial execution or deployment.

## Baseline

Fetched origin and fast-forwarded master to `58fae2360e01f108d305d6709f3dbd99ade6d30b`, the merge of Task 3 / PR #1. Verified the push-triggered [post-merge master CI run](https://github.com/maozNachum/couple-finance/actions/runs/37813863610) completed successfully before implementation. Created `feature/task-4-accounts-balances` directly from that commit. Read root/scoped AGENTS.md, architecture, data model, security, providers, roadmap, portable contracts, delivery/review decisions and the approved Task 4 prompt.

Root AGENTS.md and synced sources remain untouched. No dependencies were added or upgraded. The normal sandbox process runner could not initialize, so authorized commands used the alternate execution path. Usage-limit interruptions delayed work without changing scope.

## Delivered behavior

- Hebrew RTL `/accounts` screen with household selection, account creation, member/household attribution, versioned rename and archival. Supported types: BANK, CREDIT_CARD, CASH, SAVINGS, INVESTMENT, PENSION, PROVIDENT_FUND, DEPOSIT, LOAN, OTHER_ASSET, OTHER_LIABILITY.
- Account identity remains the Task 2 `Account` DTO. A separate record envelope carries revision and independent manual-source identity; no provider identity or editable current balance enters Account. Account ID, household, ownership, type, currencies and policy are immutable after creation. Archived records/history remain readable; no client deletion or reopening command exists.
- LEDGER and OBSERVED stay distinct. CASH requires LEDGER. **LEDGER balances are explicitly unavailable in Task 4** because Task 5 owns opening/correction entries and posted movements. No fake zero, observation substitution or premature transaction table was introduced.
- OBSERVED accounts accept signed Money, a financial date, COMPLETE/PARTIAL coverage, optional note and optional historical FX snapshot. A negative position remains a liability regardless of product type. Missing data and partial coverage stay visible.
- As-of selection takes the latest unsuperseded observation on or before the requested date. Earlier measurement dates remain visible. Same-day corrections append a new observation with a reason and same-household/account/date predecessor. Original values remain in history; competing corrections conflict.
- Cross-currency observations preserve a complete immutable canonical FX snapshot: stable rate ID, base/quote direction, effective date, recorded instant and manual origin. Missing FX stays explicit. Conversion uses existing `convertMoney` with explicit eight-decimal HALF_UP rounding; display uses existing currency-minor-unit formatting. No current-rate fallback, implicit inversion, net-worth total or duplicate financial formula.
- Observation date differs from server-generated recording time. The historical as-of view uses currently corrected knowledge, not a frozen recorded-time report; frozen monthly reports remain later work.
- One invoker `account_snapshot` statement reads coherent account/history data, avoiding concurrent partial correction chains and the Data API row cap. Tests cover more than 1,000 observations. The browser stores no financial/session data offline and clears/refetches on focus; sign-out removes protected data.

## Persistence and security

Forward migration: `supabase/migrations/20261008171219_accounts_valuations.sql`, created with the Supabase CLI. Task 3's merged migration is unchanged. Tables: `finance.accounts`, `finance.balance_observations`, `private.account_audit`. No transaction, provider or ingestion tables.

All new tables have RLS. Existing database membership/live-session checks remain authoritative. Only `api` is exposed, with security-invoker views and commands; authenticated grants restrict columns and operations. UPDATE has USING and WITH CHECK. Commands return fixed SafeError variants, never SQL/SDK diagnostics.

Composite restrictive foreign keys protect durable member ownership and observation household/account/source/currency identity. Correction references additionally include effective date. Unique roots/successors forbid ambiguous same-day roots and competing branches. Account-row locks serialize observation insertion against archival; row versions reject stale account changes. Stable IDs support matching-payload retries and reject changed-payload reuse. This is scoped command behavior, not Task 5's general command-receipt framework.

Money inputs must be decimal JSON strings within raw numeric(24,8) bounds before casting; excess precision is rejected rather than rounded. FX validates direction/date/source and positive numeric(30,12)-compatible decimal text. Canonical UUID validation precedes PostgreSQL's more permissive casts. History has no client UPDATE/DELETE grants; an update guard adds defense in depth. Audit inserts occur atomically through one narrow fixed-search-path private definer trigger without copying names, notes, amounts or tokens.

Ownership references durable membership, not Auth/profile identity. Auth deletion revokes access while preserving attribution; household/member deletion cannot cascade into retained finance history. Database owners can deliberately alter constraints or delete data; the application does not grant those powers.

## Architecture and changed areas

- `src/features/accounts/{api,components,model}` owns data access, forms, history and presentation helpers. `src/pages/accounts` composes the screen; app routing/styles and shared navigation expose it. The household placeholder now links to accounts.
- `core/contracts/valuation.ts` adds strict observation/command envelopes. `core/domain/money/valuation.ts` selects and values observations through Task 2 functions. Exact reviewed aliases are added to the architecture policy, TypeScript and permission-free Deno mappings; no wildcard access.
- Atomic authorization/persistence uses SQL invoker commands. No unused TypeScript application/infrastructure framework or provider layer was created. Core remains independent of runtime, network, clock, database and React.
- PostgreSQL, real API and authenticated browser tests join the existing verification chain. Synthetic cleanup deletes only the fixture's generated households and their financial rows using local operator privileges.

## Verification

The complete `npm run verify` chain passed locally with exit code 0 on 2026-10-09 after a clean `npm ci` (267 installed packages, zero reported vulnerabilities). The verification log is retained locally under ignored `.artifacts/task4-verify.log`.

| Check | Result |
| --- | --- |
| TypeScript / ESLint / architecture | Passed |
| Vitest | 206 tests, 7 files passed |
| Cached-only, permission-free Deno | 141 passed |
| Production build / portable browser probe | Passed |
| Existing shell / four-timezone browser corpus | 12 passed |
| Actual PostgreSQL pgTAP | 172 assertions passed: 100 accounts + 72 identity |
| SQL lint / security advisors | No schema errors / no issues |
| Existing GoTrue/PostgREST identity integration | 33 assertions passed |
| Accounts API integration | 28 assertions passed |
| Authenticated desktop/mobile browser suite | 8 passed, including 2 complete accounts flows |
| Migration replay/history | Both migrations replayed and listed; no hosted project linked |
| Schema comparison | No differences; CLI reported already in sync |
| Staged/browser credential review | 33 staged paths and 6 browser assets scanned; no excluded files or local server secret matches |
| Fixture cleanup | Auth users, households, accounts and observations each returned to zero rows |
| Git whitespace check | Passed |

Account browser coverage includes individual ownership, negative liabilities, dated FX conversion, pre-observation as-of dates, append-only corrections, missing FX, partial coverage, archival, CASH/LEDGER unavailable state, revoked membership with unchanged session, no persistent storage, accessibility and overflow. Synthetic desktop/mobile screenshots were visually reviewed. The final screenshot-only adjustment scrolls to the page top before capture to avoid including an offscreen fixed skip link; the two affected browser cases were rerun separately.

The authenticated build measured 627.67 kB JavaScript (186.75 kB gzip) and 8.11 kB CSS (2.37 kB gzip). Existing large-chunk and color-environment warnings are retained, not suppressed. PR CI is verified separately against the pushed commit rather than inferred from local results.

Development checks established migration replay on a verified disposable local stack, 172 PostgreSQL assertions, 28 real account API assertions, desktop/mobile account flows, no SQL lint errors and no security-advisor issues. A local schema comparison reported `DbPullInSyncError: No schema changes found`: the database already matched both migrations, so no additional migration was generated. This is distinct from the subsequent complete verification chain.

Resolved development failures: readonly-schema shape access in TypeScript; SQL JSON-operator precedence and parameter ambiguity; FK tests initially hitting duplicate-date constraints first; an audit assertion initially counting retained records from other test households; ambiguous browser selectors; missing shared page padding found in visual review. The audit assertion now scopes its own household, preserving prior audit history. No check was disabled or weakened.

## Limits and handoff

This remains a local synthetic-data implementation. Production hosting, SMTP/MFA/recovery, backups/retention and real financial data are outside this PR. The existing Vite large-chunk warning remains. Browser tests cover Chromium desktop/mobile emulation rather than all browsers/devices.

The manual source is currently fixed per account with independent identity in the record envelope. Future provider/source-mapping tasks must add reviewed authority cutovers while retaining account/observation identities. No FILE_IMPORT/LIVE_SYNC behavior or institution integration is implied. FX snapshots are per-observation evidence, not a reusable rate catalogue. FX `recordedAt` is source metadata; the observation's server timestamp is authoritative persistence audit time.

The snapshot loads complete authorized histories. Large histories will eventually need a bounded protocol that preserves correction consistency. Focus refresh rechecks access, but offline rendered content cannot be remotely erased. No arbitrary stale-age threshold is invented; measurement dates and earlier-date warnings are displayed.

Use [the recommended Task 5 prompt](task-5-prompt.md) only after review and merge under a separate request. Stop after Task 4; do not merge automatically.
