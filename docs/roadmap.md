# Roadmap and task boundaries

Implement one bounded task per conversation. Each task must leave a working state and include the relevant checks. Do not create future placeholder code to satisfy a tree diagram.

| Task | Outcome | Main locations |
| --- | --- | --- |
| 1 — complete | RTL shell, contracts compatibility, tooling and enforced boundaries | src/app, pages, shared; core/contracts; scripts; tests; docs |
| 2 — complete | Money/date primitives and canonical contracts, no financial features | core/domain/money, core/domain/dates, core/contracts, portable/runtime tests |
| 3 — complete | Auth, local Supabase, households, RLS and grants | auth/household features, migrations, supabase/tests |
| 4 — complete | Accounts and dated valuations | accounts feature/core, atomic SQL commands |
| 5 — complete | Transactions, allocations, cash ledger and safe commands | transactions and persistence |
| 6 — complete | Categories and deterministic rules | categorization |
| 7 — complete, merged | CSV mapping, upload isolation and preview | imports and CSV adapter |
| 8 — complete, merged (PR #6; CI fix PR #7) | Idempotent import commit and duplicate review | ingestion |
| 9 — reviewed and merged (PR #8) | Transfer/card/loan reconciliation | transaction reconciliation |
| 10 — reviewed and merged (PR #9) | Dashboard and net worth | dashboard/reporting/core |
| 11 — implemented, awaiting independent review | Monthly budgets | budgets/budgeting |
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

Task 3 delivery and verification are in [its report](task-3-report.md). Task 4 requires a separate request after PR review.

Task 4 delivery is in [its report](task-4-report.md). LEDGER account identity exists, but opening/correction entries and balance calculation are reserved for Task 5. Start [Task 5](task-5-prompt.md) only under a separate request after Task 4 review/merge.

Task 6 delivery is documented in [its report](task-6-report.md). Task 7 remains a separately authorized CSV mapping/private upload/preview task after review and merge; [prepared prompt](task-7-prompt.md). No ingestion commit is implemented in Task 6.

Task 6 / PR #4 and Task 7 / PR #5 were reviewed and merged. Task 7 delivery is in [its report](task-7-report.md). Task 8 extends its private CSV workflow with explicit atomic commit, duplicate review and retained provenance; see [delivery](task-8-report.md). [Task 9](task-9-prompt.md) remains a separately authorized reconciliation task after independent Task 8 review and merge.

Task 9 delivery is in [its report](task-9-report.md), with durable relationships and separate financial-correction boundaries in [its decisions](task-9-decisions.md). Task 10 dashboard/net-worth work requires independent Task 9 review/merge and successful exact post-merge master CI, then the [prepared prompt](task-10-prompt.md).

Task 10 financial reporting policy and limitations are in [its decisions](task-10-decisions.md). PR #9 was independently reviewed/merged and exact master CI passed before implementing Task 11 from [its approved prompt](task-11-prompt.md).

Task 11 scope, overlap hierarchy, currency and incomplete-result policies are in [its decisions](task-11-decisions.md). Task 12 requires a separate request after independent Task 11 review/merge and successful exact master CI; see [prepared Task 12 prompt](task-12-prompt.md). No recurring engine or forecasting is part of Task 11.
