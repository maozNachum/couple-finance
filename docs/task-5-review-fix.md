# Task 5 final review fix — category metadata

The manual form previously replaced every allocation's categorization on submit with a user lock, deriving USER origin from the financial effect. This incorrectly made a category decision where none existed.

## Exact production changes

In `src/features/transactions/components/TransactionForm.tsx`, replace:

```ts
categorization: { origin: kind === 'MOVEMENT' && form.get(`effect-${i}`) === 'UNCLASSIFIED' ? 'UNCLASSIFIED' : 'USER', userLocked: true }
```

with:

```ts
...(s.categoryId !== undefined ? { categoryId: s.categoryId } : {}),
categorization: s.categorization
```

New and added splits already initialize UNCLASSIFIED/false without a category ID. Those values now survive submission regardless of effect selection, including openings. Corrections preserve existing category metadata and any category ID without changing the historical revision. Legacy locks are deliberately not inferred away or bulk rewritten.

In `supabase/functions/_shared/core/contracts/allocation.ts`, add an eligibility-only validation contract:

```ts
export const ruleCategorizationCandidateSchema = allocationSchema.refine((a) =>
  !a.categorization.userLocked && (a.effect === 'EXPENSE' || a.effect === 'INCOME'));
```

This explicitly excludes openings/ADJUSTMENT, transfers, trades, principal and unknown effects. It performs no financial or categorization writes. Existing allocation and manual-command schemas remain unchanged. No SQL, grants, RLS, audit, receipts, correction lineage or migrations changed.

## Regression evidence

- Nine new form tests exercise all seven effects, unchanged legacy locks and preservation of an explicit canonical user category. They check form output against portable contracts and confirm Task 5 still rejects category persistence.
- Two portable cases run unchanged in Vitest, Deno and the browser: explicit eligibility for every effect, no financial mutation, and an explicitly user-assigned category that can be locked and is then ineligible.
- Desktop/mobile authenticated stories parse actual outgoing form commands through the portable command schema and compare every allocation with persisted PostgreSQL JSON. They cover default UNCLASSIFIED, selected INCOME/EXPENSE, opening ADJUSTMENT, principal, transfer, corrections and a retry after a committed response is lost. All new allocations omit categoryId and have UNCLASSIFIED/false metadata; financial effects remain intact.

Complete `npm run verify` exited 0 on 2026-10-11:

| Verification | Exact result |
| --- | --- |
| TypeScript, ESLint, architecture | Passed |
| Vitest | 257 passed, 8 files |
| Deno | 181 passed, 0 failed |
| Production build | Passed |
| Core/shell browser | 12 passed |
| PostgreSQL pgTAP | 295 passed, 4 files |
| SQL lint / security advisors | No schema errors / no issues |
| Auth/API | 33 assertions passed |
| Accounts API | 33 assertions passed |
| Transactions API | 118 assertions passed |
| Authenticated desktop/mobile | 10 passed (54.5 seconds) |

Existing opening, correction, idempotency, concurrency, ledger and authorization regressions remain included. The non-failing Vite bundle-size warning remains. Test logs are local ignored artifacts at `.artifacts/task5-review-verify.log`.

## Remaining limits

Task 5 has no category assignment UI, category persistence or rule execution. An explicit category can be represented and locked by the canonical allocation contract, but Task 5 manual commands still reject category IDs and RULE/SOURCE origins. The future rule-application command must enforce the eligibility contract and permit only category metadata changes, never effects, money/currency, ownership, state or dates; no rule write path exists to bypass that boundary today. This requirement is carried into the existing next-task prompt without implementing Task 6.

Historical uncategorized allocations with legacy locks remain unchanged, including during correction. Deciding whether a particular historical lock was artificial requires a separate explicit, audited decision; this fix does not guess. No database reset was needed because the schema is unchanged. All work remains on the existing Task 5 feature branch and PR #3, with no automatic merge or deployment.
