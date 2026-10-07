# Recommended Task 2 prompt

Implement Task 2 only for Couple Finance: money/date primitives and canonical contracts. Use the approved architecture and the existing repository as the source of truth.

First read the applicable AGENTS.md files, README.md, docs/architecture.md, docs/data-model.md, docs/security.md, and docs/roadmap.md. Work directly in the existing repository root; do not create a nested couple-finance directory. Preserve the read-only root AGENTS.md and sources/.

Scope:

1. Implement one decimal arithmetic wrapper under supabase/functions/_shared/core/domain/money using a compatible pinned decimal library. Validate decimal-string API values; no native floating-point financial arithmetic or JSON-number money.
2. Define currency precision, explicit rounding, overflow/invalid-value handling, and rate direction. Preserve the approved PostgreSQL numeric strategy as a contract; do not create SQL.
3. Define date-only financial values separately from UTC timestamps, Asia/Jerusalem calendar boundaries, and explicit month-end recurrence behavior. Supply time as an input rather than accessing an ambient clock.
4. Define shared validated Money, Account, NormalizedTransaction/allocation, ingestion identity, and safe error contracts under core/contracts. Use one consistent validation approach, preferably Zod, after checking current official compatibility. Do not build persistence or ingestion use cases.
5. Keep account identity separate from source modes and keep ledger/observed balance policy explicit. Use relational ownership identifiers and signed-position/transaction-effect conventions from the approved model.
6. Add meaningful precision, rounding, serialization, FX-direction, invalid-input and calendar-boundary tests. Verify the same core in browser tooling and Deno without network/runtime permissions.
7. Extend exact @finance/core-package allowlists only for reviewed portable modules. Keep TypeScript and Vite aliases synchronized. Do not introduce wildcard @finance imports or disable architecture checks.
8. Update the relevant documents and lockfile. Run the appropriate checks and the full existing verification chain before handoff.

Do not implement net-worth, budget, savings, safe-to-spend or forecast formulas. Do not add database migrations, seed data, Supabase connections, authentication, provider adapters, AI, financial UI features, deployment or Task 3 work.

Definition of Done: validated precision-safe contracts and pure primitives; useful edge-case tests pass in both runtimes; browser/server boundaries stay enforced; the existing RTL shell remains working; no financial functionality is presented as implemented.

Report files changed, dependency changes, commands/results, architecture checks, limitations and the recommended next task. Stop after Task 2.
