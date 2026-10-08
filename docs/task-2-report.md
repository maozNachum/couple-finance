# Task 2 delivery report

Completed 2026-10-08: **Task 2 only**. Money/date primitives and canonical contracts are implemented in the existing repository root. The approved modular-monolith architecture is retained. No concrete architecture incompatibility was found and no redesign was needed. Root read-only AGENTS.md and sources/ were not modified. No nested application directory, database/auth connection, provider, ingestion pipeline, financial UI, reporting calculations, deployment, or Task 3 implementation was added.

## Delivered behavior and decisions

- One decimal.js wrapper, private configuration (80 significant digits, HALF_UP), validated decimal-string operands/results, explicit rounding, overflow and precision rejection. Money's 16 integer/8 fractional digits match planned numeric(24,8); general decimals/rates use 18/12 for numeric(30,12).
- Money always includes amount and currency. Arithmetic checks currency compatibility. Supported ISO codes/minor units: ILS/USD/EUR 2, JPY 0, KWD 3; initial reporting currency ILS. Display rounding preserves the authoritative original amount.
- Historical FX records carry base/quote direction, positive rate, effective date, recorded instant, stable ID and origin. Explicit conversion multiplies, checks target/direction/date and never silently inverts.
- Gregorian date-only/month contracts, UTC timestamp validation, pure month boundaries and movement, deterministic original-day recurrence clamping, leap/century rules. No Date or ambient clock in the core.
- Strict Zod schemas with inferred types, branded normalized UUIDs, separate source/account identities, relational ownership, LEDGER/OBSERVED policy, signed transactions, reporting allocations, ingestion identity and fixed safe error variants. UUIDs normalize to lowercase to prevent case variants bypassing identity checks.
- Allocation IDs are locally unique, currencies match the parent and exact signed totals reconcile; a canonical unknown movement uses one UNCLASSIFIED allocation. General metadata bags were omitted because no concrete need exists.
- Reviewed exact aliases only. No wildcard finance access. Decimal imports are restricted to the canonical wrapper; core package subpaths require review. TypeScript and Deno aliases/pins are checked against the same policy. All original architecture cases and shell tests remain.

Full contract shapes, semantics and failure behavior are documented once in [portable-contracts.md](portable-contracts.md), with permanent architecture/data-model/security/provider/roadmap updates linking to it.

## Files created

```text
docs/portable-contracts.md
docs/task-2-report.md
docs/task-3-prompt.md
scripts/build-core-probe.mjs
supabase/functions/_shared/core/contracts/account.ts
supabase/functions/_shared/core/contracts/allocation.ts
supabase/functions/_shared/core/contracts/currency.ts
supabase/functions/_shared/core/contracts/financial-date.ts
supabase/functions/_shared/core/contracts/fx.ts
supabase/functions/_shared/core/contracts/identity.ts
supabase/functions/_shared/core/contracts/ingestion.ts
supabase/functions/_shared/core/contracts/money.ts
supabase/functions/_shared/core/contracts/ownership.ts
supabase/functions/_shared/core/contracts/safe-error.ts
supabase/functions/_shared/core/contracts/transaction.ts
supabase/functions/_shared/core/domain/dates/calendar.ts
supabase/functions/_shared/core/domain/dates/financial-date.ts
supabase/functions/_shared/core/domain/money/decimal.ts
supabase/functions/_shared/core/domain/money/fx.ts
supabase/functions/_shared/core/domain/money/money.ts
tests/e2e/core.spec.ts
tests/portable/browser-entry.ts
tests/portable/core-cases.ts
tests/portable/core.test.ts
tests/portable/type-contracts.ts
tests/runtime/core.deno.ts
tests/runtime/permissions.deno.ts
```

## Files changed

```text
README.md
docs/architecture.md
docs/data-model.md
docs/providers.md
docs/roadmap.md
docs/security.md
package.json
package-lock.json
scripts/architecture-policy.json
scripts/check-boundaries.mjs
supabase/functions/_shared/core/contracts/application-context.ts
tests/architecture/boundaries.test.mjs
tests/runtime/deno.json
tsconfig.json
vitest.config.ts
```

ApplicationContext now uses Zod while preserving the original immutable output and TypeError parser contract. Application UI files and the existing shell E2E tests are unchanged. Generated dist/, test-results/ and .artifacts/core-probe/ are ignored; the probe is not part of the deployed application bundle.

## Dependencies

| Direct runtime dependency added | Exact version |
| --- | --- |
| decimal.js | 10.6.0 |
| zod | 4.6.5 |

Both already existed transitively in the Task 1 lockfile; they are now explicit pinned runtime dependencies. No other direct versions changed. Node 22.14.0, npm 10.9.2, TypeScript 5.9.3, Deno 2.9.6, Vite 8.3.3 and Vitest 5.0.3 were retained. Deno uses the npm-installed package tree in manual mode and the npm lockfile, with exact imports and cached-only checks/tests. There is no separately resolving Deno dependency lock.

## Contract shapes

| Public model | Principal fields |
| --- | --- |
| Money | amount, currency |
| FxRate | id, base, quote, rate, effectiveDate, recordedAt, origin |
| FinancialDate / FinancialMonth / UtcTimestamp | validated, distinct branded strings |
| MonthlyRecurrence | dayOfMonth, CLAMP_TO_MONTH_END policy |
| Ownership | HOUSEHOLD or MEMBER + memberId |
| Account | id, householdId, name, ownership, type, currency, valuationCurrency, balancePolicy, status |
| Transaction | id, householdId, accountId, transactionDate, valueDate?, money, description, merchant?, status, provenance, allocations |
| Allocation | id, effect, categoryId?, ownership, money, costBehavior?, necessity?, categorization origin/userLocked |
| IngestionIdentity | householdId, accountId, source, externalTransactionId?, fingerprint?, idempotencyKey |
| SafeError | fixed code/kind/safeMessage/retryable, requestId?, correlationId?, optional enumerated field errors for validation |

ReportingEffect is INCOME, EXPENSE, TRANSFER, INVESTMENT_TRADE, DEBT_PRINCIPAL, ADJUSTMENT or UNCLASSIFIED. It is independent of categories and sign; refund/reversal signs remain representable. Account types/statuses and source identities are provider-independent. Fingerprints carry algorithm/version and are candidate evidence only.

## Tests added

One **124-case** portable corpus runs unchanged through Vitest/jsdom, Deno and a real Vite-bundled Chromium script. It covers exact arithmetic, large values, invalid syntax including line terminators, bounded precision/overflow, explicit rounding/zero/negatives, supported currencies and minor units, currency mismatch, FX direction/inversion/date/precision, Gregorian and Israel midnight/DST boundary scenarios, month end/leap centuries, strict ownership/IDs/balance policies, signed effect examples, allocations, ingestion identity and safe errors.

All 16 approved aliases have direct and transitive rejection/acceptance coverage. An additional test enforces decimal-wrapper ownership and rejects unreviewed package subpaths. Compile-only negative tests ensure account/household IDs and dates/instants are not interchangeable, numeric Money is rejected and MEMBER ownership requires an ID. Deno additionally verifies that no read/write/network/environment/process/FFI/system permission is granted.

Chromium executes the corpus with UTC, Asia/Jerusalem, America/Los_Angeles and Pacific/Kiritimati runtime timezones without network requests. The four probes run in both existing Playwright projects. The original four shell checks still verify RTL, navigation, focus, mobile overflow, accessibility, no external requests and direct routes.

## Verification commands and results

| Executed command | Final result |
| --- | --- |
| `node --version`, `npm --version` | 22.14.0 / 10.9.2 |
| `npm view zod version`, `npm view decimal.js version` | 4.6.5 / 10.6.0 |
| `npm install --save-exact decimal.js@10.6.0 zod@4.6.5` | Passed; manifest/lockfile updated |
| `npm ci` | Passed; 250 installed packages; audit reported 0 vulnerabilities |
| `npm ls --depth=0` | Passed; all direct versions resolved, no invalid peers |
| `npm run typecheck` | Passed: strict browser, ES-only core, tools and compile-time negative contracts |
| `npm run lint` | Passed: zero errors/warnings |
| `npm run check:architecture` | Passed: aliases, transitive boundaries, package ownership and Deno/npm parity |
| `npm test` | Passed: 4 files, 181 tests |
| `npm run check:deno` | Passed: checks and 127 tests, cached-only, no runtime permission grants |
| `npm run build` | Passed: guarded production build plus isolated browser probe |
| `npm run test:e2e` | Passed: 12 tests (4 original shell checks + 8 timezone probes) |
| `npm run verify` | **Full chain passed, exit code 0** after clean installation |
| `git diff --check` | Passed; no whitespace errors |
| `git status --short`, `git diff --stat`, `git log -1` | Reviewed scope and baseline; changes remain uncommitted |

Initial development runs exposed a comparison return-type mismatch and ESLint's control-character regex rule. Both were corrected; no check was disabled. The final full-chain run passed after these changes and additional strict-input regressions. The first local sandbox initialization failed; file/process work proceeded through the approved alternative execution path. This did not require repository/runtime permission changes.

Observed production output: JavaScript 352.01 kB (108.66 kB gzip), CSS 6.50 kB (2.02 kB gzip); the isolated test probe is 144.30 kB (45.81 kB gzip). Zod in the presentation-context validation increases the shell bundle relative to Task 1. This is measured output, not a performance guarantee. npm still reports the existing transitive whatwg-encoding deprecation; Vite reports plugin timings; Playwright emits the existing NO_COLOR/FORCE_COLOR warnings. None failed checks.

## Limits and follow-up decisions

No unresolved Task 2 blocker remains. There is no deployed Edge Function or remote CI result. Real browser checks use Chromium, not Safari/Firefox/physical devices. The source of an incorrectly labelled FX number cannot be validated without trusted external data; explicit labels/date/direction checks prevent accidental pair inversion by callers, not false upstream rates.

Runtime schemas do not establish household membership, authorization, foreign-key integrity, stored account-currency consistency, command-payload uniqueness, or atomic database reconciliation. Those remain the assigned future application/database tasks. Strict local allocation checks are already present. UTC projection, holiday/business-day policies and stale-rate selection remain explicit future policies. Supported currencies are an intentional reviewed subset, not a claim to support all ISO currencies.

The initial Git tree was clean at `1c176c4` (`Build Couple Finance Task 1 foundation`). Task 2 leaves **27 new files and 15 modified tracked files**, unstaged and uncommitted. No commit, push or deployment was performed.

Use [the recommended Task 3 prompt](task-3-prompt.md) only in a separately authorized task. This delivery stops after Task 2.
