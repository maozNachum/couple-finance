# Task 8 post-merge browser CI investigation

## Failed master gate

Investigated master commit `822935a2fba2a65b329307ab38e932dad1d9ddb3` and [Actions run 38317724536](https://github.com/maozNachum/couple-finance/actions/runs/38317724536), including both job logs and both uploaded `browser-test-results` archives.

| Attempt | Verify job | Authenticated browser result |
| --- | --- | --- |
| 1 | [115038250460](https://github.com/maozNachum/couple-finance/actions/runs/38317724536/job/115038250460) | 19 passed; mobile import revocation timed out at 120 seconds |
| 2 | [115041912324](https://github.com/maozNachum/couple-finance/actions/runs/38317724536/job/115041912324) | 17 passed; desktop import sign-out, desktop import revocation and mobile import revocation timed out at 120 seconds |

Artifacts `11777073405` and `11778740664` contain one and three `error-context.md` files respectively. These include the error and textual accessibility snapshots. There are no trace archives, screenshots or videos in either artifact: `playwright.auth.config.ts` deliberately disables those recordings for authenticated financial flows. The original logs report the overall test timeout without an awaited-operation stack. The snapshots retain the uncertain review, enabled retry button and original household/account, with no refreshed durable import evidence. They do not show completed revocation or sign-out.

## Cause and exact wait

The stalled operation is the first focus-revalidation `page.waitForResponse` for `/rest/v1/rpc/import_evidence`, created at line 27 and awaited at line 28 of `tests/auth-e2e/import-commit.spec.ts` in the merged commit. It occurs before either the sign-out branch or membership-revocation SQL. Its implicit unbounded response wait ends only at the existing 120-second test deadline.

The test waits for the retry button to be **visible**, then immediately switches tabs and dispatches focus. `ImportReviewPanel.send()` stores the pending command before awaiting the commit response, so the button is already visible while disabled and the request is still in flight. `ImportsPanel` intentionally ignores focus while `inFlight.current` is true. Consequently no authorization-refresh request is started, even though the test begins waiting for its response. Once the lost commit response settles, retry becomes enabled, but that does not replay the earlier focus event.

This is a test synchronization race. It is not evidence that confirmed revocation leaves protected content visible: the failed scenarios never reach their revocation/sign-out operation. Slower response delivery or scheduling can expose the race, but CI resource contention is not required to reproduce it. The workflow uses one authenticated browser worker and no test retries.

## Controlled reproduction and fix

On the disposable loopback Supabase stack, the merged test was instrumented temporarily with a 2.5-second delay between `route.fetch()` and aborting the successful commit response, plus a diagnostic 10-second response wait. All three mobile revocation repetitions failed at the first focus-response wait, with the same review snapshot; the revocation branch was never reached. The shorter diagnostic timeout and artificial sleep were removed after reproduction.

The targeted fix changes only `tests/auth-e2e/import-commit.spec.ts`:

- Wait for the retry button to be enabled **before** switching tabs and awaiting focus revalidation.
- Hold the successful server response behind a deterministic promise gate. Assert that exactly two transactions already exist, retry is disabled, and a focus event during the pending request neither enables retry nor sends another commit. Release the response gate in `finally`, then abort the response and wait for retry readiness.
- Name the pending-response, settled-response and confirmed-revocation steps so future timeout output identifies the phase.

All original security assertions remain: authorization is revalidated, confirmed sign-out/revocation removes protected review/content, retry uses the exact original key and payload, no additional transaction is created, and browser persistent storage stays empty. Application code, SQL, workflow concurrency, test retries and the 120-second test deadline are unchanged.

## Verification

The fixed mobile revocation test passed 3/3 repetitions using the normal single-worker configuration (23.5 seconds total). All three recovery stories on both desktop and mobile then passed five repetitions with `CI=true` and two concurrent workers: **30/30 passed in 2.9 minutes**, with no retries. Two workers exceed the committed CI configuration's single-worker concurrency. Both runs finished before the full verification chain started, avoiding interference between unrelated fixture suites.

After building the authenticated test app for the disposable loopback stack, the stress invocation was:

```sh
npx playwright test --config playwright.auth.config.ts tests/auth-e2e/import-commit.spec.ts --repeat-each 5 --workers 2
```

The entire `npm run verify` chain completed successfully, exit **0**:

| Check | Result |
| --- | --- |
| TypeScript, ESLint, architecture boundaries | Passed |
| Vitest | 305 tests, 9 files passed |
| Deno portable runtime / CSV adapter | 210 / 15 tests passed |
| Import preview and commit Edge typechecks | Passed |
| Production build / portable browser tests | Passed / 12 passed |
| Real PostgreSQL security pgTAP | 401 assertions, 7 files passed |
| Database lint / security advisors | No errors / no issues |
| Real Auth / accounts API | 33 / 33 assertions passed |
| Transactions / categorization API | 118 / 70 assertions passed |
| Import Storage/API / import commit API | 91 / 195 assertions passed |
| Authenticated desktop/mobile browser suite | All 20 passed in 2.2 minutes, including all 6 import recovery scenarios |

The existing Task 3–8 suites remain intact. Local results include real database authorization, API concurrency, durable idempotency and revocation checks. Remote verification status is reported on the dedicated fix PR; master must still pass after an approved merge. The only build warning is the existing large client bundle advisory.

## Gate and limitations

No successful rerun of the exact merged master commit existed during initial inspection; both attempts failed. A passing fix-branch/PR run does not retroactively make that master gate green. Task 9 remains blocked until the reviewed fix is merged and verification passes on the resulting master commit (or the exact existing master commit obtains a successful gate).

The original CI artifacts cannot establish historical request timing independently because network traces were deliberately not recorded. The exact wait and race are established by the source, matching snapshots and repeatable controlled reproduction. Stress testing cannot guarantee the absence of every future scheduling or infrastructure failure. No production environment or hosted database was modified.
