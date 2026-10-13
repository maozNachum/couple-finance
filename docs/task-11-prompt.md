# Task 11 only — Monthly budgets

Begin only after Task 10 passes independent review, is merged, and the exact post-merge master push CI succeeds. Fetch master, verify the merge and successful SHA/run, read applicable AGENTS.md, approved architecture/model/security/providers/portable contracts/roadmap, Tasks 2–10 reports/decisions/review fixes and this prompt. Stop if the gate is missing. Create `feature/task-11-monthly-budgets` from verified master. Keep synced references and merged migrations unchanged.

## Objective

Implement explicit household monthly expense budgets using the approved Task 11 roadmap. A budget is a plan; it is never a transaction, opening balance, account observation, financial effect or reconciliation decision. Deliver a useful Hebrew RTL monthly budget interface and deterministic actual-versus-plan comparisons from Task 10 reporting evidence. Do not implement Tasks 12+.

Review and document contract/schema compatibility before implementation. Define exact financial-date calendar month boundaries, canonical decimal-string Money, currency and category/ownership scope. Use durable household/member/category IDs, no inferred ownership percentages and no duplicated shared spending. Reject overlapping plan scopes that would double-count consumption unless an explicit reviewed hierarchy defines their meaning. Unknown categories/effects remain unresolved rather than being allocated by name, sign or account type. Define whether plans have an explicit household total or category targets; avoid storing competing editable totals.

Use current canonical posted EXPENSE allocations for actual consumption, including refunds that reduce consumption. Exclude TRANSFER, DEBT_PRINCIPAL, INVESTMENT_TRADE, ADJUSTMENT, opening balances, PENDING and VOIDED. Respect immutable revision/categorization history, user locks and date cutoffs. Reconciliation is evidence only: never hide incorrectly classified card expenses or silently correct effects. Preserve Task 10 uncertainty, missing/ambiguous FX, current revision validity and completeness. An incomplete actual amount cannot become a confirmed remaining allowance or a green success indicator. Remaining budget is a comparison against a plan, not a safe-to-spend prediction or liquidity forecast.

Define and document a budget-currency/FX policy consistent with Task 10. Do not mix reporting-day account valuation with allocation recognition-day conversion. No hardcoded/live rates or implicit inversion. Missing evidence remains visible; avoid unsupported currency aggregation. No historical FX rewrites.

## Persistence and authorization

Implement the smallest durable household-scoped budget model and versioned explicit commands necessary for creating/editing/archiving monthly plans. Use additive migrations only, restrictive same-household references, RLS, live Auth sessions, active membership, least privileges, invoker-facing APIs, fixed SafeError outputs, atomic expected-version checks and household-scoped full-payload idempotency. Retain historical plan evidence and author attribution. Edits must not rewrite actual financial history or automatic categorization/reconciliation. No frontend service credentials or sensitive persistent browser storage.

Reuse coherent bounded authorized snapshots and portable reporting formulas. Fail explicitly on overflow/truncation, invalid context or incomplete graph. Define category rename/archive behavior and plan correction history. Keep financial calculations in pure ES-only core through reviewed exact aliases; no duplicate formulas in React or SQL reporting queries. No speculative generic planning framework or new dependencies without justification.

## Interface and tests

Provide responsive accessible Hebrew RTL month selection, explicit plan controls, category/ownership attribution, recognized actuals, refunds, differences and actionable completeness explanations. Preserve honest loading/error/empty states, stale-response invalidation and clearing of protected content after sign-out/revocation. Do not generate sample financial data in household UI.

Test known-zero versus unknown, no-plan/archived plans, month boundaries in four timezones, refunds, partial/unclassified data, immutable revisions, internal transfers, corrected/stale card payments, principal/interest/fees, shared/member attribution without duplication, mixed currency and missing/ambiguous FX, exact precision/overflow, ordering, bounded histories, concurrent plan edits, identical retries and conflicting payloads. Use synthetic fixtures only. Verify anonymous/two-household/forged ID/cross-household category/member access, unchanged revoked JWTs, deleted users/sessions and no mutation of financial evidence by budget reads/writes.

Run the full existing `npm run verify` chain, without weakening prior tests, including permission-free Deno, provider/portable browser tests, production build, actual PostgreSQL pgTAP/RLS, SQL lint/advisors, all Auth/accounts/transactions/categories/import/reconciliation/reporting regressions, Edge checks and authenticated desktop/mobile Chromium/axe review. Replay migrations only after confirming a disposable local database with no real data; report unavailable verification honestly.

## Scope and delivery

Exclude recurring obligations, forecasts, safe-to-spend, goals, investment performance, AI, automatic matching/classification, live synchronization/FX, payments and production deployment. Do not implement Task 12 or later.

After successful verification, commit/push the feature branch and open a PR to master without merging. Deliver `docs/task-11-decisions.md`, `docs/task-11-report.md` and the next Task 12 prompt limited to recurring candidates and explicitly confirmed obligations. Record exact local/remote CI evidence and limitations. Stop for independent review.
