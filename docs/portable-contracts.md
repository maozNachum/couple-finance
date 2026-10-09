# Portable financial contracts — Task 2

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

`AccountRecord` wraps the unchanged canonical `Account` with a positive integer version and an independent `manualSourceId`. Create commands require ACTIVE status/version 1 and LEDGER for CASH. Updates carry household/account IDs, expected version, name and status; account financial identity is not an editable payload.

`ObservationInput` is `{ id, householdId, accountId, sourceId, date, money, coverage, supersedesId, note, fx }`. Coverage is COMPLETE/PARTIAL; predecessor and FX are explicit nullable fields. Corrections require a nonblank reason and a different predecessor ID. Stored `Observation` additionally has the server `recordedAt` UTC instant. Money, financial date and embedded FxRate reuse the Task 2 schemas. Database checks enforce stored account context and same-household/date predecessor references; UUID validation alone does not authorize access.

`valueAccount(record, history, asOf)` returns LEDGER_UNAVAILABLE, MISSING, MISSING_FX or VALUED. It filters by household/account, rejects source/currency mismatch and ambiguous same-day survivors, excludes future measurements and follows supersession by removing replaced observations. VALUED retains the source observation, date and coverage alongside Money. Historical conversion delegates to `convertMoney` with explicit eight-place HALF_UP rounding; overflow or invalid FX context fails rather than producing a guessed total. A view after a correction reflects current knowledge about the effective date, not knowledge as recorded at an earlier timestamp.
