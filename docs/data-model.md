# Financial model

Task 2 implements [canonical contracts and pure primitives](portable-contracts.md). Task 3 adds profiles, households and durable household_members. Task 4 adds accounts and immutable balance_observations; transactions, ledger entries and reporting totals remain later work. See [Task 4 decisions](task-4-decisions.md).

## Invariants

- Every financial record belongs to a household, with RLS and composite `(household_id, id)` references when the database is built.
- Ownership is `HOUSEHOLD` or `MEMBER` plus a relational member ID, never the hardcoded names Maoz/Shachar. Initial household members share visibility; ownership is attribution.
- `household_members.id` and its household are immutable durable attribution identities. The optional `user_id` is only a login association: profile deletion sets it to NULL and atomically revokes membership. Each member retains a required display-name snapshot independently of profile changes. Unlinked rows cannot be reassigned or reactivated; a newly invited identity needs a new explicitly provisioned membership. Future history references `(household_id, id)`, never the Auth user/profile. Household deletion is restricted while members exist.
- Accounts have stable internal identity independent of `MANUAL`, `FILE_IMPORT`, and `LIVE_SYNC` source mappings. Sources are replaceable; accounts may retain multiple historical sources and one authoritative observed-balance source at a time.
- Supported account types: BANK, CREDIT_CARD, CASH, SAVINGS, INVESTMENT, PENSION, PROVIDENT_FUND, DEPOSIT, LOAN, OTHER_ASSET, OTHER_LIABILITY. Product subtype is separate from institution identity.
- LEDGER account balances derive from explicit opening/correction entries plus posted movements. OBSERVED accounts use authoritative dated observations, not a sum of incomplete imported transactions. Never combine the two silently. Cash is a normal ledger account.
- Positive positions are assets; negative positions are liabilities. Net worth sums converted signed positions. No editable current balance on accounts and no duplicated editable dashboard totals.
- One transaction is one account movement. Allocations carry explicit effects: income, expense, transfer, investment trade, debt principal, adjustment, or unclassified. Categories do not define accounting meaning.
- Internal transfers and card settlements are not extra income/expenses. Refunds reduce expenses. Loan principal is separate from interest/fees. Investment contributions are not profit. Holdings/cash components are not added again to portfolio totals.
- Pending, posted and voided states remain distinct. Source identities and idempotency protect retries. Similarity fingerprints suggest duplicates but cannot prove identity.
- Installment spending is recognized per posted installment; future installments remain commitments. Full contractual debt coverage is separately reconciled for net worth. Partial debt observations are marked incomplete.
- Obligations are separate from actual transactions, with reconciliation links. An actual matched payment resolves the expected event. A card settlement must not also count underlying purchases as bank cash outflows.
- Safe-to-spend will use the minimum projected daily eligible liquidity above a buffer, not merely a month-end balance. Missing/stale inputs must remain visible.

## Numeric and calendar strategy

- PostgreSQL money: `numeric(24,8)`; quantities/rates/prices: `numeric(30,12)`.
- API money/quantity/rate values: validated decimal strings, never JSON numbers.
- TypeScript arithmetic: one Decimal wrapper; no native floating-point financial arithmetic. Use explicit ROUND_HALF_UP at report/display boundaries and preserve authoritative imported posted amounts.
- Supported currency codes and minor units are explicit metadata. Reporting currency starts at ILS; changes later require a controlled reporting-policy migration.
- FX direction: one base-currency unit equals rate quote-currency units. Store origin/effective/recorded dates; no current-rate rewrites of past spending.
- Financial transaction/value/settlement dates are date-only. Audit/sync timestamps are UTC instants. Household calendar is Asia/Jerusalem; never interpret a financial date as midnight UTC.
- Month boundaries are half-open intervals. Month-end recurrence clamps explicitly; holiday shifts are not guessed.

Implemented precision rules: decimal operands have at most 18 integer and 12 fractional digits; Money is restricted to 16 integer and 8 fractional digits. Addition/subtraction/multiplication are exact or fail. Division must be exact within those bounds or receive an explicit HALF_UP rounding policy. Display uses supported currency minor units without mutating posted values. Bounds are validated before normalization, including excess trailing zeros. Overflow never becomes truncation or a JSON number.

Transactions carry one signed account movement and one or more allocations whose signed Money sums exactly to the parent in the same currency. An unknown categorization uses a full-amount UNCLASSIFIED allocation. Categories do not determine effects. The schema enforces these local invariants now; later database tasks must enforce them atomically with household-scoped references and membership checks.

## Future table families

Task 4 persists manual source identity separately from the canonical Account DTO, inside its record envelope. There is one immutable manual authority per account; future source mapping/cutovers must preserve the stable account ID. Observations retain exact signed Money, date, coverage, server recording timestamp and optional same-date predecessor. FX is an immutable canonical snapshot embedded in each observation rather than a mutable global rate lookup. Current as-of views use corrected knowledge; they are not frozen recorded-time reports. LEDGER accounts have no calculated balance until Task 5 supplies the ledger.

Identity: profiles, households, household_members, currencies. Accounts: institutions, financial_connections, accounts, account_sources, balance_observations, fx_rates. Activity: transactions, transaction_allocations, transaction_sources, transfer_links, categories, merchants, categorization_rules. Planning: budgets, budget_allocations, recurring_series, obligations, obligation_matches. Ingestion: ingestion_runs, ingestion_items, import_profiles. Private operations: connection_credentials, audit_logs, command_receipts. Derived insights: financial_insights.

Later features add investment_account_details, instruments, portfolio_snapshots, holding_snapshots, goals, goal_allocations, goal_contributions, report_snapshots and notifications only when used. Do not implement these early.

Financial records are archived, superseded or reversed with traceability. Audited corrections and immutable observations/reports avoid full event sourcing. Derived summaries are calculated; retained monthly reports freeze inputs, FX references and calculation version for reproducibility.
