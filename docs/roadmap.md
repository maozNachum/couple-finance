# Roadmap and task boundaries

Implement one bounded task per conversation. Each task must leave a working state and include the relevant checks. Do not create future placeholder code to satisfy a tree diagram.

| Task | Outcome | Main locations |
| --- | --- | --- |
| 1 — complete | RTL shell, contracts compatibility, tooling and enforced boundaries | src/app, pages, shared; core/contracts; scripts; tests; docs |
| 2 — current | Money/date primitives and canonical contracts, no financial features | core/domain/money, core/domain/dates, core/contracts, portable/runtime tests |
| 3 | Auth, local Supabase, households, RLS and grants | auth/household features, migrations, supabase/tests |
| 4 | Accounts and dated valuations | accounts feature/core/application |
| 5 | Transactions, allocations, cash ledger and safe commands | transactions and persistence |
| 6 | Categories and deterministic rules | categorization |
| 7 | CSV mapping, upload isolation and preview | imports and CSV adapter |
| 8 | Idempotent import commit and duplicate review | ingestion |
| 9 | Transfer/card/loan reconciliation | transaction reconciliation |
| 10 | Dashboard and net worth | dashboard/reporting/core |
| 11 | Monthly budgets | budgets/budgeting |
| 12 | Recurring candidates and confirmed obligations | recurring/obligations |
| 13 | Forecast and safe-to-spend | forecasting/cashflow |
| 14 | Deterministic insights and operations | insights/maintenance |
| 15 | MVP acceptance, export and restore | E2E/security/operations |
| 16 | Goals and reproducible monthly review | goals/reports |
| 17 | Investments and justified performance metrics | investments |
| 18 | One verified authorized live provider | selected adapter/sync |
| 19 | Controlled AI and low-noise notifications | AI/assistant/notifications |
| 20 | Long-term sources and scenarios | selected product extensions |

Task 1 acceptance: `npm run verify` passes; RTL desktop/mobile visual review; no server import in browser; read-only mirror files untouched; no financial mock functionality. CI is configured, but remote CI runs are not claimed until a repository is hosted and the workflow executes.

Task 2 must stay pure and offline: decimal strings, one decimal arithmetic wrapper, currency precision, rounding, date-only/instant boundaries, canonical account/transaction/error contracts and shared tests. Do not add database migrations, providers, auth, UI features, net-worth/budget/forecast formulas or Task 3 work.

Task 2 decisions and verification are recorded in [its delivery report](task-2-report.md). Start Task 3 only under a separate request using [the recommended prompt](task-3-prompt.md).
