# Portable financial contracts — Task 2

Task 13 adds exact `contracts/forecast` and `domain/forecast` aliases. `ForecastRequest` contains householdId, start (closing baseline), explicit evidenceAsOf, horizon (1–90 future days), nonnegative exact buffer Money and unique account INCLUDE/EXCLUDE accessibility choices. A start after evidenceAsOf is unavailable; browser orchestration captures/displays the Jerusalem date when evidence is refreshed, without introducing a clock in pure core. `forecastCalendar` produces baseline plus bounded future dates through year 9999. `householdForecast` validates the complete Task 12 financial/planning graph and UTF-8 serialized bounds, reuses canonical `reportingPosition`, generates/deduplicates supported signed cash evidence and computes daily minimum before buffer comparison. Coverage is COMPLETE/PARTIAL/UNKNOWN/UNAVAILABLE. SafeToSpend is MODELED_AVAILABLE (exact nonnegative Money), MODELED_SHORTFALL (negative candidate/positive shortfall, null available amount) or UNAVAILABLE (null amounts). Events retain original currency, account/obligation/actual identities and explicit projected/reflected/replaced/unresolved states. `displayExactMoney` preserves all fractional digits without rounding. No persistent planning or transaction command is added; see [Task 13 policy](task-13-decisions.md).

Task 12 adds exact `contracts/obligations` and `domain/obligations` aliases. Existing canonical Money, date, ownership and financial contracts are unchanged. Monthly schedules reuse the existing clamped Gregorian recurrence primitive. Commands distinguish explicit confirmation/edit/archive/cancel, rejection and actual evidence link/unlink. Strict immutable DTOs retain current revision/allocation identities, durable authors, server timestamps and original currency. Complete graph validation precedes deterministic candidates and bounded expected events; active links are checked against version occurrence windows. Expected-event state is UNRESOLVED, ASSOCIATED, PARTIAL, AMBIGUOUS or STALE, never inferred from similarity. No future FX, balance or budget calculation is added. See [Task 12 decisions](task-12-decisions.md).

Task 11 adds exact `contracts/budgets` and `domain/budgets` aliases. Strict nonnegative Money commands create/edit/archive immutable-scope monthly plans; snapshots retain complete sequential revisions, authors and category labels. Budget reporting consumes Task 10 expense lines/coverage and rejects invalid context, gaps, overlap and mixed active plan currencies. Confirmed comparison metrics are absent when incomplete or archived; no plan differs from explicit zero. Utilization uses explicit two-place HALF_UP and is undefined for zero plan. Months through November 9999 are supported; December 9999 has no representable exclusive end. See [policy](task-11-decisions.md).

Task 10 adds exact `contracts/reporting` and `domain/reporting` aliases. Inputs require complete bounded account/source/revision/observation/rate/decision context and exact snapshot counts. Results distinguish COMPLETE/PARTIAL/UNKNOWN/UNAVAILABLE, nullable confirmed totals versus available subtotals, original Money, measurement dates and immutable reporting FX evidence. Reporting FX requires one same-household explicit-direction record on the exact valuation day; monthly conversions use recognition days. Current corrected knowledge, shared ownership without percentages, signed assets/debt, half-open periods, explicit allocation effects and current reconciliation validity are pure and deterministic. See [Task 10 policy](task-10-decisions.md).

Task 9 adds the exact reconciliation contract/domain aliases. Commands identify household, stable relationship, expected version, complete explicit participant allocation meanings, optional stored historical FX ID, reason and acknowledgement. Each participant identifies its account/version and transaction/revision/version. Limits: 100 distinct movements and 1,000 total existing allocations. Decision snapshots retain original revisions/import references/FX and independent counterpart/purchase differences. Deterministic candidates are weak or supporting evidence, never certainty. Missing FX, partial evidence and incorrect actual effects remain unresolved; subsequent transaction revisions stale confirmed evidence. LINK never changes canonical financial contracts or ledger inputs. See [Task 9 decisions](task-9-decisions.md).

Task 8 adds exact `contracts/import-commit`: strict review/commit requests, per-row inclusion/effect/status/duplicate acknowledgement, versioned preview and hash evidence, deterministic duplicate reasons and committed references. Selected batches are 1–100 rows; decisions are unique and bounded to all 2,000 source rows. No browser row/amount/context override field exists. Stored revision validation now accepts FILE_IMPORT MOVEMENT provenance with an ingestion item; manual creation stays MANUAL, corrections retain provenance. Ledger validation checks account source relationships and rejects source changes across revisions. Earlier MANUAL history is unchanged.

Canonical schemas live under `supabase/functions/_shared/core/contracts`; pure operations live under `core/domain/money` and `core/domain/dates`. Use exact aliases from `scripts/architecture-policy.json`. There are no second frontend/backend schemas. Types are inferred from Zod; parse unknown inputs at boundaries. UUID/date/decimal brands are compile-time safeguards, not security claims. Strict objects reject additional fields.

## Decimal and Money

`DecimalString` is a validated base-10 string: optional minus, integer digits, optional fractional digits. No exponent, whitespace, plus sign, separators, leading integer zeros, NaN, Infinity or JSON numbers. Raw input is limited to 18 integer and 12 fractional digits (the numeric(30,12) envelope); trailing fractional zeros normalize away and negative zero becomes `"0"`. Excess raw precision, including excess zeros, is rejected rather than truncated.

`Money = { amount: DecimalString, currency: CurrencyCode }` additionally restricts amount to 16 integer/8 fractional digits, matching future PostgreSQL `numeric(24,8)`. No API money field is a bare decimal or number. The generic decimal wrapper is dimensionless arithmetic; monetary entry points carry Money and reject different currencies before combining or comparing them. Scaling/dividing Money accepts a dimensionless factor, not another Money. Results are reparsed against Money bounds. Decimal instances and mutable configuration never leave the wrapper.

decimal.js **10.6.0** has one private cloned constructor configured to **80 significant digits, ROUND_HALF_UP**. Bounded 30-digit operands have exact sums/products inside this working precision; a sum is limited to 1,000 terms and validated at the end to allow signed cancellation. Public results must still fit the 18/12 envelope. No money arithmetic uses native numeric operations. Native integers are used only for calendar parts, counts and precision metadata.

Operations: `add`, `subtract`, `multiply`, `divide`, `sumDecimals`, `compare`, `absolute`, `negate`, `isZero`, `isPositive`, `isNegative`, `roundDecimal`, `fixedDecimal`. Default arithmetic is exact or throws. Nonterminating/over-precise division requires an explicit `{ scale: 0..12, mode: "HALF_UP" }`. Multiplication and FX may also receive an explicit policy; no implicit money-scale rounding occurs. HALF_UP means nearest with ties away from zero. A caller may deliberately round a tiny result to zero; it never happens silently. Finite/range checks reject overflow. Malformed contract inputs raise Zod validation errors; invalid arithmetic (including division by zero) raises RangeError. Never serialize either raw error type.

Money operations: `addMoney`, `subtractMoney`, `compareMoney`, `scaleMoney`, `divideMoney`, `roundMoney`, `displayMoney`. Display includes both fixed decimal amount and ISO code; it does not mutate the posted amount. Report/display rounding and future persistence rounding must be deliberate caller decisions. Do not convert arithmetic outputs through `Number` or `parseFloat`.

## Currencies and FX

Supported ISO 4217 codes are explicit: ILS/USD/EUR (2 minor digits), JPY (0), KWD (3). Unsupported or lowercase codes fail rather than silently defaulting to ILS or two digits. ILS is the initial reporting policy only. Adding a supported currency means reviewing its minor-unit metadata and tests, not changing the contract shape. Calculations preserve up to Money's eight fractional digits regardless of minor units; minor units apply to display/explicit currency rounding.

`FxRate = { id, base, quote, rate, effectiveDate, recordedAt, origin: { sourceId, kind } }`. Rate is positive numeric(30,12)-compatible text, currencies must differ, and direction is always **1 base = rate quote**. Thus 100 USD at USD/ILS 3.72 produces 372 ILS by multiplication. `convertMoney(money, target, valuationDate, rate, optionalRounding)` rejects mismatched source/target direction and effective date. No silent inversion, lookup, stale-rate fallback, live FX or rate selection exists. Historical records retain a stable rate ID, effective financial date, recorded UTC instant and source origin. Later valuation records must retain the chosen rate reference/version. A wrongly *labelled* numerical rate cannot be identified without trusted external data; input direction must be normalized by a future adapter.

## Dates and timestamps

FinancialDate is a Gregorian `YYYY-MM-DD` for years 0001–9999. FinancialMonth is `YYYY-MM`. Neither is a timestamp or midnight UTC; domain code never constructs a JavaScript Date or reads a clock. UTC timestamp inputs require `YYYY-MM-DDTHH:mm:ss[.fraction]Z` with at most six fractional digits, valid Gregorian dates, hours 00–23 and seconds 00–59. Offset forms and leap-second notation must be normalized by future runtime adapters. PostgreSQL persistence will use `date` and `timestamptz` respectively.

`monthOf`, `compareFinancialDates`, `firstDayOfMonth`, `lastDayOfMonth`, `moveFinancialMonth`, and `monthBoundaries` are pure calendar operations. Bounds are `[start, endExclusive)`; December 9999 has no representable next month and throws. Callers supply all dates/months explicitly. Household timezone is Asia/Jerusalem, independent of the machine timezone. Instant-to-household-date conversion belongs at a future runtime boundary with an explicit instant/timezone; it is not used to reinterpret dates supplied by a financial source.

Monthly recurrence is `{ dayOfMonth: 1..31, overflow: "CLAMP_TO_MONTH_END" }`. `recurrenceDate(month, rule)` always uses the original configured day: Jan 31 → Feb 28/29 → Apr 30 → May 31. Century leap rules apply (1900/2100 are not leap years, 2000 is). There is no recurring detection, weekend movement or Israeli-holiday policy.

## Contract shapes and local invariants

| Contract | Shape and purpose |
| --- | --- |
| Ownership | `{ kind: "HOUSEHOLD" }` or `{ kind: "MEMBER", memberId }`; household form rejects memberId; no personal-name enum |
| Account | `{ id, householdId, name, ownership, type, currency, valuationCurrency, balancePolicy, status }`; stable internal ID, no source/provider fields or editable current balance |
| BalancePolicy | `LEDGER` derives from opening/correction plus posted movements; `OBSERVED` uses authoritative dated observations. Never silently combine incomplete imports and observations |
| AccountType | BANK, CREDIT_CARD, CASH, SAVINGS, INVESTMENT, PENSION, PROVIDENT_FUND, DEPOSIT, LOAN, OTHER_ASSET, OTHER_LIABILITY |
| Transaction | `{ id, householdId, accountId, transactionDate, valueDate?, money, description, merchant?: { id?, name }, status, provenance[], allocations[] }` |
| TransactionStatus | PENDING, POSTED, VOIDED; contract validation never turns pending/voided into posted |
| Allocation | `{ id, effect, categoryId?, ownership, money, costBehavior?, necessity?, categorization: { origin, userLocked } }` |
| Allocation flags | FIXED/VARIABLE and ESSENTIAL/DISCRETIONARY are optional; absent means unspecified |
| Categorization | origin USER/RULE/SOURCE/UNCLASSIFIED plus explicit userLocked; later refresh must respect locks |
| SourceIdentity | `{ sourceId, kind: MANUAL/FILE_IMPORT/LIVE_SYNC }`; an internal source identity, not account identity |
| TransactionProvenance | `{ source, externalTransactionId?, ingestionItemId? }`; normalized references only, multiple historical sources allowed |
| IngestionIdentity | `{ householdId, accountId, source, externalTransactionId?, fingerprint?, idempotencyKey }` |
| Candidate fingerprint | `{ algorithm: "SHA256", version: positive integer, digest: 64 lowercase hex digits }`; only candidate evidence, never a unique transaction key |
| SafeError | fixed `{ code, kind, safeMessage, retryable, requestId?, correlationId?, fieldErrors? }` variants; no arbitrary messages, stacks, raw responses or secret fields |

Financial-effect selection is independent of category selection. New Task 5 allocations omit `categoryId` and retain `{ origin: UNCLASSIFIED, userLocked: false }`, including explicitly selected INCOME/EXPENSE and opening ADJUSTMENT entries. Corrections preserve existing category IDs and metadata, including historical user locks; there is no bulk unlocking or rewriting of history. The canonical allocation contract supports an explicitly assigned category with USER/true, but Task 5 commands still reject category IDs until category persistence is implemented.

`ruleCategorizationCandidateSchema` is an eligibility-only contract: only unlocked EXPENSE/INCOME allocations qualify. ADJUSTMENT (including openings), TRANSFER, INVESTMENT_TRADE, DEBT_PRINCIPAL and UNCLASSIFIED effects are excluded explicitly, regardless of category locks. Validation returns the unchanged allocation; it does not infer or change effects. No categorization rules execute in Task 5. Future rule application must separately enforce this eligibility and may write only category metadata through an authorized audited command; it must never modify financial effects, amounts/currency, ownership, transaction state or financial dates. Selecting an effect remains an explicit financial edit, not a categorization action.

External IDs are scoped by household/account/source, not globally unique. Idempotency keys (16–128 ASCII alphanumeric/underscore/hyphen characters) identify a command retry in that same scope; they are not fingerprints or external transaction IDs. Future persistence must store/check the command payload digest and reject reuse for a different payload. This task supplies contracts, not deduplication, hashing, ingestion, uniqueness constraints or reconciliation.

Allocation currencies must all equal the transaction currency, IDs must be unique within the transaction, and their signed amounts must sum exactly to the parent's signed amount. Complete canonical transactions always have at least one allocation: use UNCLASSIFIED for unknown reporting meaning. Intermediate incomplete staging payloads belong to a future ingestion adapter. Offsetting positive/negative splits are allowed. DB enforcement, category existence, ownership membership and same-household/account references remain later responsibilities.

## Signed position and reporting effects

Positive account positions are assets; negative positions are liabilities. A positive movement increases the signed position, including reducing a negative card/loan balance. Effect is carried by allocations independently of categories and sign. The following are contract examples tested in all runtimes, not a categorization engine:

| Event | Signed movement and effect |
| --- | --- |
| Bank income | positive INCOME |
| Bank/card purchase | negative EXPENSE (card liability increases) |
| Card settlement | negative bank TRANSFER; positive card TRANSFER; no second expense |
| Internal household transfer | outgoing negative/incoming positive TRANSFER; neither income nor expense |
| Investment contribution | negative bank/positive investment TRANSFER; not profit |
| Loan proceeds | positive bank/negative loan DEBT_PRINCIPAL; not income |
| Principal repayment | negative bank/positive loan DEBT_PRINCIPAL; not ordinary expense |
| Interest/fees | negative EXPENSE, split from principal when combined |
| Refund | positive EXPENSE; reduces expense in future reporting |
| Opening/correction | signed ADJUSTMENT |
| Investment trade | INVESTMENT_TRADE, independent of household spending |
| Unrealized investment movement | observed valuation change, not household income; if represented as a corrective movement, ADJUSTMENT |
| Unknown meaning | signed UNCLASSIFIED, never guessed from category |

No schema infers these meanings from merchant text, account type or sign alone; reversal movements remain representable. No net worth, savings rate, budget, reconciliation or forecast calculation is implemented.

## Validation/dependency compatibility

Zod **4.6.5** is pinned with decimal.js **10.6.0** in package.json/package-lock.json. Official [Zod requirements](https://zod.dev/) support modern browsers and TypeScript 5.5+; this repository uses strict TypeScript 5.9.3. [Deno npm compatibility](https://docs.deno.com/runtime/fundamentals/node/) supports the selected ESM npm packages using the npm-installed tree. [decimal.js documentation](https://mikemcl.github.io/decimal.js/) defines cloned constructors, significant-digit precision and rounding. Runtime compatibility is established by the shared verification corpus, not solely by documentation.

Every reviewed public module is explicitly listed in the architecture policy. Deno imports and TypeScript mappings must match it. Keep domain imports free of React, environment, I/O, networking, clocks and backend clients. Monetary wrapper ownership and direct/type/re-export/transitive restrictions remain checked. Dependencies need installation once; Deno checks/tests then use cached-only resolution without runtime permission grants.

## Task 4 observation contracts

Task 5 extends persistence through the separate ledger envelope described below; existing canonical Money, Transaction, Allocation, ownership and date shapes remain unchanged.

`AccountRecord` wraps the unchanged canonical `Account` with a positive integer version, derived `manualSourceId` and `sources`. Each source has `{ id, householdId, accountId, kind, authoritativeFrom }`, with a nullable canonical financial activation date. Validation rejects foreign context, duplicate identities, competing activation dates and an inconsistent manual projection. Create commands retain the existing account/version/manualSourceId input and create a separate source atomically; callers cannot inject a sources array. Create requires ACTIVE/version 1 and LEDGER for CASH. Updates carry household/account IDs, expected version, name and status; account financial identity is not editable.

`ObservationInput` is `{ id, householdId, accountId, sourceId, date, money, coverage, supersedesId, note, fx }`. Coverage is COMPLETE/PARTIAL; predecessor and FX are explicit nullable fields. Corrections require a nonblank reason and a different predecessor ID. Stored `Observation` additionally has the server `recordedAt` UTC instant. Money, financial date and embedded FxRate reuse the Task 2 schemas. Database checks enforce stored account context and same-household/date predecessor references; UUID validation alone does not authorize access.

`valueAccount(record, history, asOf)` returns LEDGER_UNAVAILABLE, MISSING, MISSING_FX or VALUED. It validates source/currency context and correction lineage, rejecting missing predecessors, cross-source/date corrections, competing successors and cycles. It selects the latest eligible source activation, then the latest unsuperseded observation within that authority's date range. Independent sources may observe the same date without ambiguity. Missing authority data does not fall back to another source. VALUED includes `basis: HISTORICAL_OBSERVATION`, the source observation/date/coverage and Money. Historical conversion delegates to `convertMoney` with explicit eight-place HALF_UP rounding. Rate provenance need not equal balance-source provenance. A view after a correction reflects current knowledge about the effective date. Reporting-date dynamic FX requires the future application selection boundary documented in [review fixes](task-4-review-fixes.md).

## Task 5 manual ledger contracts

`ManualTransactionCommand` wraps the unchanged canonical `Transaction` with `revisionId`, nullable `supersedesRevisionId`, integer `expectedVersion` (0 for creation), scoped `idempotencyKey`, `entryKind` (MOVEMENT/OPENING), nullable `openingCoverage` (COMPLETE/PARTIAL) and a bounded correction `reason`. Manual provenance is exactly one MANUAL account source; merchant/category/provider fields and RULE/SOURCE categorization are rejected until their assigned persistence tasks. Opening allocations must all be ADJUSTMENT and opening state cannot be PENDING. Corrections require a different predecessor revision and nonblank reason. SQL independently validates all command invariants.

`TransactionRevision` contains that financial content plus a positive sequential `version` and server-generated `createdAt`/`recordedAt`; it has no client receipt key or digest. Stable `transaction.id` identifies the movement across revisions; revision IDs identify immutable evidence. Allocations are stored atomically as relational rows, including restrictive durable-member and currency references, then reconstructed in original order. No editable current balance exists.

`currentTransactions(record, fullHistory)` validates context, identities, consecutive predecessor chains, state transitions, timestamps and immutable date/source/role before selecting latest revisions. `ledgerBalance(record, fullHistory, asOf)` returns KNOWN or INCOMPLETE with exact account-currency Money, opening date and posted count; UNKNOWN with NO_OPENING/BEFORE_OPENING; NOT_LEDGER for observed policy; or ERROR for invalid history/date/overflow. Opening is start-of-day; cutoff inclusive. Only posted current revisions contribute. A partial opening cannot become known merely because there are later movements. Complete zero is explicit. Historical results use corrected knowledge, not recorded-time snapshots; void removes a movement from those calculations while retaining all prior evidence.

Calculation accepts at most 100,000 revisions and delegates arithmetic to the existing bounded decimal sum/add operations. Arithmetic envelope overflow is an explicit ERROR, never a partial sum. The database snapshot is one coherent statement with no row-cap pagination; no client may silently pass a paginated subset as complete history. Future scale requires a reviewed complete-history protocol.

Accounts now choose `ledgerBalance` for LEDGER and retain `valueAccount` for OBSERVED. The latter's LEDGER_UNAVAILABLE result remains an intentional guard against using observations to calculate a ledger; it is no longer the UI's ledger implementation. No reporting FX, transfers matching or spending-report totals are implemented.

## Task 6 extensions and compatibility

Category, Rule, Catalog, DefinitionCommand and CategorizeCommand live in the exact contracts/categorization alias. The domain/categorization alias exports normalization v1 and previewCategorization. These are ES-only pure modules, with no new packages. Canonical Allocation retains categoryId and categorization origin/userLocked; no parallel category state is introduced.

Stored transaction revisions now accept RULE metadata and category IDs. Manual creation still cannot inject categories; a financial correction may carry existing category metadata, and SQL verifies exact preservation against the predecessor allocation ID. This intentionally extends the old Task 5 command validation for corrections. Old records remain parseable and are not rewritten. The DB household/category FK replaces the former blanket persistence prohibition at the authorized categorization boundary. Financial form corrections retain allocation identity; newly added splits still receive new IDs.

Preview requires matching household/allocation context. It excludes archived accounts, VOIDED transactions and non-EXPENSE/INCOME effects. Locks return LOCKED with any proposed rule explanation; no mutation occurs. Literal EQUALS/CONTAINS use ASCII case folding and ASCII whitespace collapse, preserving all other characters. Lowest priority wins; differing best-priority targets are AMBIGUOUS, identical targets choose smallest canonical UUID. Disabled/archived rules and archived categories never match.

Explicit ASSIGN uses USER/true. CLEAR removes categoryId and uses UNCLASSIFIED/false. UNLOCK preserves origin/category and changes only userLocked. RULE requires unlocked eligibility and returns RULE/false. Applying does not change amount, currency, effect, dates, ownership, state, source or FX evidence. The command carries current transaction version/predecessor plus catalog generation; stale commands conflict. Exact retries retain one immutable result and recheck authorization. See [Task 6 decisions](task-6-decisions.md) for persistence tradeoffs.

## Task 7 preview contract

`contracts/import-preview` is one exact reviewed alias with ES-only Zod contracts for limits, explicit delimiter/encoding, unique column mapping, nullable row fields, fixed issue codes, logical/physical source coordinates, lifecycle display metadata and aggregate counts. Valid rows require date/Money/description and no errors; unresolved rows contain missing-field issues only. Preview records deliberately cannot parse as canonical transactions. No original canonical financial contract changes.

Supported mapping conventions are detailed in [Task 7 delivery](task-7-report.md). UTF-8 decoding/CSV scanning remain outside portable core; provider tests run separately in Node and permission-free Deno with TextDecoder available. The preview-contract cases join the unchanged portable Vitest/Deno/Chromium corpus. Money remains exact decimal text with 16 integer/8 fractional digits and explicit sign convention; excess precision is rejected without rounding.
