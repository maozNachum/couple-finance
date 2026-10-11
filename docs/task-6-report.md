# Task 6 delivery — Categories and deterministic rules

Date: 2026-10-11. Scope: Task 6 only, on `feature/task-6-categories-rules`. Master was fetched and fast-forwarded to `1ab7b84d0eb79345609a3bf7e263d5b260f74a56`; PR #3 was confirmed merged, including its category-lock fix. The exact post-merge push [CI run 38140418325](https://github.com/maozNachum/couple-finance/actions/runs/38140418325) completed successfully before implementation. Read-only AGENTS.md and sources were not changed.

## Delivered behavior

- Household categories with stable identity, immutable income/expense kind, Hebrew names, versioned rename and terminal archival. Historical category references and names used by decisions remain available. No speculative hierarchy or name-based financial inference.
- Household rules with stable IDs, immutable historical versions, editable literal description conditions/priority, disabling and terminal archival. Normalization v1 is explicitly ASCII case/whitespace normalization with all other characters preserved.
- Portable deterministic preview, including ordered matches, chosen rule/version/priority, blocked locks, no match, ineligibility and ambiguity. Smaller priority wins; competing categories at the best priority remain ambiguous; identical targets at the best priority select the lowest canonical UUID.
- Explicit single-allocation application, manual assignment with USER lock, clear-and-unlock and unlock-only operations. New uncategorized transactions remain UNCLASSIFIED/false. Rules never infer effects from signs, account types or category names. Positive expense refunds remain EXPENSE.
- Hebrew RTL `/categories` management/preview/history screen, linked from transaction history. Loading, fixed errors, stale-data conflicts and uncertain-delivery exact retry are visible. Definitions and preview do not trigger financial writes. No sensitive persistent browser storage.
- Category-only changes append immutable transaction revisions; transaction/allocation IDs and every financial field remain unchanged. Prior category decisions retain category/rule snapshots and matching evidence. The existing ledger consumes latest revisions without creating a balance change. Financial corrections now preserve allocation IDs and prior category metadata.

The pre-implementation contract review and persistence tradeoff are in [Task 6 decisions](task-6-decisions.md). Policy A was chosen to reuse the existing history, audit, idempotency and concurrency protocol. This creates more full revisions and conservative conflicts between financial/category edits, rather than introducing a second history overlay.

## Database and compatibility

CLI-created forward migration `20261011125039_task6_categories_rules.sql` adds category/rule heads, immutable version snapshots, catalog generation, decision evidence and private receipts. All tables have RLS; household-scoped composite category/rule/version references preserve isolation. The generated allocation category column has a restrictive household/category FK. Prior merged migrations are unchanged.

Only api remains exposed. API wrappers/snapshots are invokers. Private command functions use empty search paths, fixed safe errors, live Auth session checks and active database membership. The internal financial writer has no client EXECUTE grant. Manual financial creation cannot inject a category; corrections can preserve one only when SQL verifies its prior allocation identity/metadata. Categorization constructs its financial payload entirely from stored history; request objects have no financial mutation fields.

Household-before-account locking serializes definition and categorization changes, with the same lock order on manual commands. Catalog generation invalidates stale previews after any definition change; transaction predecessor/version protects concurrent edits. Exact request retries return the original result after fresh authorization. One allocation is the atomic bounded unit: financial revision, allocations, audit, evidence and receipts all commit or roll back together. No partial batch results or historical mass reclassification exist.

Canonical Allocation metadata is reused. Exact contracts/categorization and domain/categorization aliases were added together in policy, TypeScript and Deno. Stored revision validation now accepts authorized RULE/category metadata, and the manual correction contract can carry existing categories. New creation remains restricted. The former form test expecting a categorized correction to fail was updated for this intentional extension; it now additionally asserts exact allocation identity preservation. The original creation-rejection tests and SQL bypass/foreign-key tests remain. No tests were disabled, no dependencies changed, and no financial formulas were duplicated in the frontend.

## Verification results

`npm run verify` completed with exit code 0 after all five migrations replayed on the verified disposable local stack. Before reset, Auth users, households and accounts were each zero and no hosted project was linked. The loopback stack is `127.0.0.1:15421`, using the existing `couple-finance` Docker containers. Only synthetic fixtures were used.

| Check | Exact result |
| --- | --- |
| TypeScript / ESLint / architecture boundaries | Passed |
| Vitest | 280 tests, 8 files passed |
| Cached-only permission-free Deno | 202 passed, 0 failed |
| Production build and isolated portable browser probe | Passed |
| Desktop/mobile shell and four-timezone portable Chromium | 12 passed |
| PostgreSQL pgTAP/RLS | 339 assertions, 5 files passed |
| SQL lint / security advisors | No schema errors / no issues |
| Real Auth/API regression | 33 assertions passed |
| Accounts API regression | 33 assertions passed |
| Transactions API regression | 118 assertions passed |
| Categorization API integration | 70 assertions passed |
| Authenticated desktop/mobile Chromium | 12 tests passed |
| Migration replay | All five migrations applied successfully |

Final Hebrew wording, form spacing and a stronger allocation-ID assertion were checked again with TypeScript, ESLint, Vitest, production build and the authenticated browser suite. Final screenshots were visually inspected for Hebrew RTL, clipping, spacing and overflow. Browser stories also run axe accessibility checks and confirm empty local/session storage.

The 21 new portable cases cover normalization, stable order regardless of input order, same-category ties, conflicting ties, literal matching, locks, archived/disabled targets, positive refunds, explicit income, all excluded effects, foreign context, strict commands and absence of input mutation. They run unchanged in Vitest, Deno and Chromium.

Real integration coverage includes anonymous access, two households, forged category/rule/household references, stale catalogs/revisions, concurrent category changes, five identical concurrent retries, changed-payload reuse, archived references, manual bypass attempts, preserved financial fields/IDs, revoked memberships with unchanged JWTs, deleted sessions/users and an injected late evidence-write failure proving rollback. Desktop/mobile stories include a response lost after commit and an exact retry without duplicate history, user locks/unlocking, rename/archive history, read-only preview and unchanged ledger balance.

Development SQL parameter/alias ambiguities were found by integration tests, corrected, and safe errors restored before the successful runs. No unsafe diagnostics remain in the migration. Logs/screenshots stay ignored under `.artifacts/task6-*`.

## Limits and follow-up

- Matching intentionally supports description plus explicit expense/income effect only. There is no Unicode folding beyond the documented ASCII behavior, regex syntax, merchant infrastructure, taxonomy or AI.
- Application is one allocation at a time; there is no bulk historical reclassification. All household transaction writes now use a conservative household lock, suitable for the current two-user scope; scaling needs measurement and a reviewed finer-grained protocol.
- Archives are terminal. A different category kind requires a new ID. Old archived category references are retained, but new assignments are rejected. Remove a categorized allocation only after an explicit clear operation.
- Full authorized histories/catalogs are loaded. The existing 100,000-revision domain bound and unknown/error balance behavior remain. A future pagination protocol must retain complete correction histories.
- Uncertain commands survive only in page memory. Reloading requires inspecting retained history before recreating a command. Revocation blocks further reads/writes; already rendered offline content cannot be remotely erased.
- Browser coverage uses Chromium desktop/mobile emulation. The existing non-failing Vite chunk-size warning remains (approximately 669 kB main JavaScript), as do terminal color warnings. No production readiness or cross-browser guarantee is claimed.
- No unresolved implementation decision blocks Task 6 review. No deployment, ingestion, reconciliation, budgets, reports, investments, forecast or real financial execution was added.

The [Task 7 prompt](task-7-prompt.md) is prepared for CSV mapping, private upload isolation and preview, after Task 6 review/merge under a separate request. Task 8 retains import commit and duplicate review. The Task 6 PR must remain unmerged for independent human review; remote CI is reported separately from local success.

Final delivery checks: 32 staged files and four built browser assets contained no excluded paths or local server-secret matches. Fixture cleanup returned users, households and accounts to zero; local migration history contains all five migrations. Git whitespace checks passed after removing a trailing blank line.
