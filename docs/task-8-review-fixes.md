# Task 8 independent review fixes

Scope: the two findings in PR #6, on `feature/task-8-import-commit-dedup`. No new PR, merge, deployment or Task 9 implementation.

## Blank references

Forward migration: `supabase/migrations/20261012215904_task8_independent_review_fixes.sql`. Previously pushed migrations remain unchanged. It replaces only `private.import_duplicates`; function signature, security-definer/search-path settings and existing execution grants remain intact.

Each of the three reference-evidence predicates (candidate ID lookup, SAME_REFERENCE aggregation, and candidate-count lookup) now requires:

```sql
nullif(btrim(ir.source_reference,
 E' \t\n\r\f'||chr(11)||
 U&'\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), '') is not null
and ir.source_reference = row->>'reference'
```

NULL, empty, ASCII whitespace and Unicode whitespace/BOM-only references cannot provide identity evidence. Trimming is only a presence check: nonempty references are still compared exactly, and original reference text remains in immutable accepted-row provenance. Date/amount/currency/description predicates remain byte-for-byte unchanged. No fuzzy matching or certified-bank-ID assumption is added.

Real Auth/Edge/PostgreSQL regressions in `scripts/test-import-commit.mjs` cover empty, ASCII whitespace, Unicode whitespace, null, equal nonempty and different references. They assert SAME_REFERENCE, candidate counts and candidate IDs, unchanged durable text, and independent financial-value matching. New temporary files are cancelled/deleted through the existing lifecycle so the 20-upload quota is preserved.

## Uncertain commands across focus

`ImportsPanel` owns the exact pending command in page state plus a synchronous in-memory context ref. `ImportReviewPanel` receives that command and retries it unchanged. Ordinary browser focus revalidates the live user and RLS-backed household/account/source context without unmounting a valid pending review. Retry controls are disabled while that check runs. A transient failure retains the command; the server reauthorizes every retry. Confirmed missing access, confirmed NOT_AUTHORIZED and SIGNED_OUT clear pending commands, previews, files, mapping and protected context.

`loadImports` distinguishes confirmed 401/403 or an absent authenticated user from uncertain transport failures. Explicit context/file/mapping changes, explicit refresh, navigation away and full reload discard pending memory and stale reviews. Authenticated durable evidence can then recover completed work; fresh server review is required for a new command. No localStorage, sessionStorage, IndexedDB or other persistent command store is introduced.

Browser regressions in `tests/auth-e2e/import-commit.spec.ts` retain the original story and add desktop/mobile scenarios for exact retry after a real second-tab round trip, confirmed global sign-out from another authenticated tab while imports remains mounted, and unchanged-JWT membership revocation. The retry test compares both entire COMMIT request bodies, verifies one durable result/two selected movements without duplicates, and retains the existing ledger/correction/evidence checks. Protected-content assertions and empty browser storage checks cover access loss.

## Exact changed files

- `supabase/migrations/20261012215904_task8_independent_review_fixes.sql`
- `src/features/imports/components/ImportsPanel.tsx`
- `src/features/imports/components/ImportReviewPanel.tsx`
- `src/features/imports/api/imports.ts`
- `scripts/test-import-commit.mjs`
- `tests/auth-e2e/import-commit.spec.ts`
- `docs/task-8-decisions.md`
- `docs/task-8-report.md`
- `docs/task-8-review-fixes.md`

## Verification

The entire npm run verify chain passed on the final review fixes. Previously pushed migrations were unchanged, and all nine migrations replayed successfully on the verified empty disposable local database. Synthetic fixtures were removed after testing. No batch/quota limits or existing security assertions were reduced.

| Check | Final result |
| --- | --- |
| TypeScript / ESLint / architecture | Passed |
| Vitest | 305 passed, 9 files |
| Permission-free Deno core/runtime | 210 passed |
| Permission-free generic CSV Deno | 15 passed |
| Both Edge Function typechecks | Passed |
| Production build / portable browser | Passed |
| Desktop/mobile portable browser stories | 12 passed |
| Real PostgreSQL pgTAP/RLS | 401 assertions, 7 files passed |
| SQL lint / security advisors | No schema errors or issues |
| Auth API | 33 assertions passed |
| Accounts API | 33 assertions passed |
| Transactions API | 118 assertions passed |
| Categorization API | 70 assertions passed |
| Existing CSV Auth/API/Storage | 91 assertions passed |
| Import commit Auth/API/PostgreSQL/Storage | 195 assertions passed |
| Authenticated desktop/mobile Chromium | 20 passed, including six import recovery stories |
| Verified disposable migration replay | Nine migrations passed |

CI is checked independently on the pushed fix commit; its exact run URLs/status are reported on PR #6 and in the delivery response. Local verification is not used as a substitute for remote CI. Logs remain ignored under .artifacts/task8-review-*. The existing non-failing Vite bundle-size and terminal-color warnings remain.

## Remaining limits

Pending commands survive focus only while the imports page remains mounted with valid access. Explicit reset/navigation/reload intentionally loses memory; recovery uses durable evidence and renewed authorization. Generic CSV references remain fallible candidate evidence. Browser coverage uses Chromium desktop/mobile emulation. No production cleanup/deployment scheduling is introduced. Stop for independent review; PR #6 remains open and unmerged.
