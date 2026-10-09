# Recommended next request — Task 5 only

Start Task 5 — Transactions, Allocations, Cash Ledger and Safe Commands — only after Task 4 is reviewed and merged. Do not implement later roadmap tasks.

Before implementation:

1. Fetch and synchronize master; verify post-merge master CI passed for the actual commit.
2. Read all applicable AGENTS.md files, architecture/data-model/security/portable-contracts documentation, roadmap and Tasks 2–4 delivery, decision and review reports.
3. Create a separate feature branch from verified master. Preserve modular-monolith directory boundaries and exact core aliases.
4. Review canonical Transaction, Allocation, Money, Currency, FX, Date, Ownership, provenance and SafeError contracts. Identify necessary contract extensions explicitly before changing them.

Implement only manual transaction persistence and the LEDGER behavior intentionally unavailable in Task 4:

- A transaction is one signed account movement. Persist canonical dates, Money, description, state and allocations atomically. Keep PENDING, POSTED and VOIDED distinct; only eligible posted movements affect the ledger.
- Build explicit opening/correction ADJUSTMENT entries and dated ledger calculation, including CASH accounts. Never write an editable current balance, infer zero from incomplete history or substitute OBSERVED valuations for a ledger. Define and test opening-date/cutoff, correction/reversal, archived-account and missing-history behavior.
- Preserve household/member attribution using durable members and restrictive composite references. Allocation currencies must match the account/transaction; exact signed totals must equal the parent. Unknown meaning remains a complete UNCLASSIFIED allocation. Do not infer effects from categories or signs.
- Preserve approved effects for refunds, transfers, debt principal, interest, investment contributions and adjustments. Do not implement matching/reconciliation, category engines, investment calculations or reports early. Internal movements do not become household income/expense merely because of their sign.
- Implement the required safe manual commands: atomic writes, live database membership/session authorization, optimistic concurrency, immutable/reversible financial history, atomic audit and idempotency with payload-digest mismatch rejection. Define retry/concurrency behavior rather than relying on the UI to prevent duplicates.
- Use canonical decimal-string Money/Date contracts and the single pure arithmetic implementation. Enforce numeric/date invariants at trusted database boundaries, not only in the client. Keep financial formulas out of JSX and browser infrastructure.
- Add PostgreSQL RLS, least-privilege grants, restrictive composite foreign keys, invoker reads/commands where possible and fixed safe errors. Keep finance/private unexposed. Test real anon/authenticated roles, two households, removed members, deleted sessions/users, forged metadata, cross-household writes, direct table/view/RPC access, immutable history and concurrency.
- Provide the bounded Hebrew RTL UI needed to create/review manual movements and ledger balances, with truthful missing/error/pending states and no persistent authenticated browser cache. Preserve Task 4 observation corrections and historical FX behavior.
- Preserve independent `account_sources`, household-scoped source references and deterministic observed-source activation. Do not restore source fields on Account or globally unique FX IDs on financial observations. Historical recognition/settlement FX remains immutable and reusable; future reporting-date FX selection is separate. Read the Task 4 architecture review-fixes report before extending persistence. Dynamic FX providers remain outside Task 5 unless separately approved.

Do not add CSV/file ingestion, external/live providers, connections, transfers/payments/trades execution, category automation, reconciliation, dashboards/net worth, budgets, forecasts or deployment. Avoid unrelated refactoring and speculative abstractions.

Run every existing/new verification check, including full `npm run verify`, real PostgreSQL security tests, API concurrency/idempotency tests, migration replay on a verified disposable local database, portable browser/Deno tests and desktop/mobile UI/accessibility review. Use synthetic fixtures and safe logs; report limitations honestly.

Commit, push and open a PR targeting master. Do not merge automatically. Deliver a detailed Task 5 report with exact verification evidence, unresolved decisions and a recommended Task 6 prompt. Stop after Task 5.
