# Task 5 delivery — Transactions, allocations and cash ledger

Implemented on `feature/task-5-transactions-ledger` from verified master `266e9caf636180944c2315aac46c232c8d4bd962`. Task 4 / PR #2 was merged and its exact post-merge CI run [37918229576](https://github.com/maozNachum/couple-finance/actions/runs/37918229576) succeeded. Scope ends at Task 5; no merge, production deployment or remote database migration is part of this delivery.

## Delivered behavior

- Manual canonical transactions with exact, same-currency allocation reconciliation and explicit financial effects and durable ownership.
- Immutable, sequential corrections and voids, expected-version concurrency control and retained history. Financial date changes require voiding and creating a new movement. Opening anchors retain their date but support reasoned amount, coverage, void and restoration revisions.
- Cash ledger opening balances and inclusive dated balances from the current posted revisions only. Missing/voided openings remain unknown; partial coverage remains visibly incomplete. Archived accounts remain readable. Observed accounts retain their existing valuation behavior.
- PostgreSQL atomic validation, transaction/revision/allocation writes, server-derived payload digest, receipt and minimal audit. Identical retries return the committed result; conflicting payloads or stale versions fail safely. Authorization is rechecked even for retries.
- RLS and least-privilege invoker read surfaces; a narrow private command independently validates live sessions, household membership and every context reference. No browser direct financial writes or private receipt/audit reads.
- Hebrew RTL desktop/mobile entry, allocation splitting, correction, void, history and date selection, plus ledger balances on the account screen. An uncertain response retains the exact command for retry in memory. Refresh/revocation clears stale financial content and editors.

Detailed contracts and tradeoffs are in [task-5-decisions.md](task-5-decisions.md). Core financial logic stays runtime-independent; browser access uses the reviewed exact aliases. Existing canonical Transaction/Allocation contracts and dependencies are unchanged.

## Verification

Full `npm run verify` passed on the disposable local stack (2026-10-10); final TypeScript, lint, architecture and production-build checks passed again on 2026-10-11 after the final access-clearing edit. That edit was already included in the successful authenticated browser run.

| Check | Result |
| --- | --- |
| TypeScript, ESLint, architecture boundaries | Passed |
| Vitest | 246 passed across 7 files |
| Deno portable/runtime tests | 179 passed |
| Production build and core browser probe | Passed; 12 browser tests passed |
| PostgreSQL/pgTAP | 295 assertions across 4 files passed |
| SQL lint and security advisors | No schema errors or advisor issues |
| Real Auth/API integration | 33 assertions passed |
| Accounts integration regression | 33 assertions passed |
| Transactions integration | 118 assertions passed |
| Authenticated desktop/mobile browser | 10 tests passed |
| Desktop/mobile visual review | Hebrew RTL screenshots inspected; no clipping or horizontal overflow observed |

Integration coverage includes five concurrent identical retries, mismatched receipts, competing corrections, atomic rollback after injected audit failure, exact split/offset arithmetic, malformed requests, cross-household references, archived accounts, revoked membership with unchanged JWT, deleted sessions/users, and a 1,001-command history exceeding the default Data API row cap. Browser coverage includes an aborted response after commit and successful exact retry without duplication, principal/interest allocations, pending-to-posted, voids, opening corrections, missing/partial openings, accessibility, revocation and no sensitive browser persistence.

All four migrations replayed successfully using `supabase db reset --local --yes` only after checking the configured loopback stack, absence of a linked remote project and absence of non-synthetic users/households. Existing migrations were not edited. Synthetic fixtures clean up their own generated records. Local logs and screenshots remain ignored under `.artifacts/`.

## Limits and remaining decisions

- Dates use currently corrected knowledge, not recorded-time snapshots. The opening date is fixed. COMPLETE coverage is a user's declaration, not external reconciliation evidence.
- Balances remain in account currency; this task adds no transaction FX conversion or automatic opposite-account transfer entry.
- Complete history is read coherently. The core rejects more than 100,000 revisions and decimal-envelope overflow instead of returning a partial balance. A future pagination protocol must preserve completeness.
- Receipt hashes ignore JSON object-key ordering but preserve array ordering and string representations. The UI sends canonical parsed commands.
- Uncertain commands survive only in the mounted page's memory. After reloading, users should inspect history before recreating a movement; no offline financial storage was introduced.
- Browser tests use Chromium desktop/mobile emulation. The build retains a non-failing bundle-size warning (about 648 kB minified main JavaScript); broader device testing and bundle splitting remain future work.
- No ingestion, providers, reconciliation, reporting, budgets or categorization rules were implemented. No real financial data or production system was modified.

The bounded next-task request is [task-6-prompt.md](task-6-prompt.md); start it only after Task 5 review and merge.
