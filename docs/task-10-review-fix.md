# Task 10 final independent-review fix

Scope: existing `feature/task-10-dashboard-net-worth` and PR #9 only, from `82310cf0de07c700c3a5dc20e8c9d5a7dc43d2e4`. No Task 11, new PR, migration or automatic merge.

## Exact change

Move the existing `uncategorizedCount` increment in `core/domain/reporting.ts` below its existing INCOME/EXPENSE eligibility guard. Missing categories are counted only for those two effects. UNCLASSIFIED retains its separate financial-meaning count/warning. TRANSFER, DEBT_PRINCIPAL, INVESTMENT_TRADE and ADJUSTMENT no longer contribute to the missing-category count. No additional production eligibility predicate, categorization-domain changes or formula is introduced.

Seven portable reporting cases cover all seven effects, compare eligibility with `previewCategorization`, preserve USER locks and separately verify UNCLASSIFIED. They assert exact income, consumption, difference and net worth, immutable input evidence and (for eligible effects) identical financial reports before/after assigning categories except the category count. The existing shared corpus runs them in Vitest, permission-free Deno and Chromium in four timezones.

Money, balances, financial totals, categorization locks and reconciliation decisions are unchanged. Only the missing-category diagnostic changes.

## Verification and handoff

The complete `npm run verify` chain passed **exit 0** on October 13, 2026. No assertions or checks were weakened.

| Check | Result |
| --- | --- |
| TypeScript, ESLint, architecture/alias boundaries | Passed |
| Vitest | 378 tests, 9 files passed |
| Permission-free cached Deno / CSV | 279 / 15 tests passed |
| Import preview/commit Edge typechecks | Passed |
| Production build / public and portable Chromium | Passed / 12 tests in four timezones |
| PostgreSQL pgTAP/RLS | 458 assertions, 9 files passed |
| SQL lint / security advisors | No errors / no issues |
| Auth / accounts / transactions API | 33 / 33 / 118 assertions passed |
| Categorization / CSV / import commit API | 70 / 91 / 195 assertions passed |
| Reconciliation / reporting API | 86 / 23 assertions passed |
| Authenticated desktop/mobile Chromium | 34 passed |

Local log is ignored at `.artifacts/task10-review-fix-verify.log`. No migration replay/reset was needed. Existing bundle/color and Task 9 SQL unused-variable advisories remain non-failing. Exact final head and push/PR CI runs are recorded in the existing PR description and delivery response after publication. Keep PR #9 open and unmerged; stop after this fix.
