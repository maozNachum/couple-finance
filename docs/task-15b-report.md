# Task 15b — secure practical mobile usability

## Scope and delivery status

Focused React/CSS improvements to the existing Hebrew RTL application.
Session persistence remains off. No backend, migration, canonical calculation,
financial revision, source authority, RLS or recovery guard changes. No real-data intake, real-user invitation, deployment, paid infrastructure, merge or Task 16 work.
See `task-15b-decisions.md` for the audit and session decision; the proposed
next task is `task-16a-prompt.md`.

Baseline: clean tree and freshly fetched master
`76c1165ce923821bf898d2c0e64796cd3c81df52`, merged PR #15, successful exact-SHA
post-merge push run 38758824343. Branch:
`feature/task-15b-secure-mobile-usability`.

## Implemented behavior

- Four visible daily destinations; all secondary destinations behind an
  accessible mobile disclosure, visible on desktop. Active-route context,
  Escape dismissal, skip link and main-content focus are preserved. One DOM
  tree means resizing never remounts a financial form.
- Budget/obligation field spacing, 44px controls, 16px input text, bounded
  toolbar fields, logical RTL spacing and legible wrapping. Existing financial
  completeness warnings and original-currency evidence remain visible.
- Explicit sign controls for transaction and allocation entry on decimal
  keyboards, without floating-point arithmetic or changing canonical inputs.
- History/editor jumps, focused correction and 20-revision display pages.
  All history remains available; authoritative calculations see the complete
  graph. Unknown balances and archived/current/superseded status remain intact.
- Accounts/transactions invalidate delayed reads and clear snapshots on hide,
  then reauthorize on visibility. Pending uncertain transaction commands remain
  memory-only and exact retries remain explicit.
- Account creation now accurately directs members to the existing opening
  balance workflow rather than describing it as a future feature.

## Acceptance evidence

Before/after synthetic screenshots and the exact-head review manifest are
external artifacts, excluded from application/source history. Baseline phone
navigation measured 514px at 320 and 390; selected content started at y=582.
The new tests require collapsed mobile navigation below 250px at every tested
phone/tablet width (over 51% less than the measured phone baseline). Desktop
retains visible navigation. No page-level overflow is accepted.

| Journey | Evidence |
| --- | --- |
| A: overview | Synthetic known bank, unknown savings, 24 expenses and monthly budget; dashboard/accounts/budgets/data-quality navigation preserves incomplete conclusions |
| B: transaction | Existing real Auth/SQL browser story creates an account/opening, records split principal/expense ownership and uses the explicit sign control |
| C: uncertain write | Server commits then response is deliberately lost; resize 320/768/390 and menu rerender cause no extra request; retry payload equals original and SQL transaction count stays two |
| D: history/correction | 25 revisions paginate 20+5, every revision stays reachable, correction focuses the editor; existing story checks superseded, voided and pending/posted revisions |
| E: revocation | Existing dashboard/data-quality delayed-response tests retained; new accounts/transactions visibility test holds an authorized response, revokes membership and rejects its late return |
| F: accessibility | 320/375/390/768/1280 CSS-pixel checks, RTL, 44px controls, axe at 320, keyboard menu/Escape/main focus, desktop resize and synthetic screenshots |

Final pass/fail evidence and full head SHA are recorded in the external review
manifest and `verify.log`, avoiding a self-referential source commit. Delivery
requires the final unchanged gate and exact-head standard CI to succeed.

| Gate | Cases/assertions in the verification suite |
| --- | --- |
| Vitest | 600 across 13 files (includes all 20 retained recovery guards) |
| Deno | 458 canonical/permission + 15 CSV |
| Public browser | 14 |
| SQL/RLS | 609 across 14 files |
| Auth/accounts/transactions API | 33 / 33 / 118 |
| Categorization/import preview/import commit API | 70 / 91 / 195 |
| Reconciliation/reporting/budgets/obligations API | 86 / 31 / 50 / 93 |
| Authenticated desktop/mobile browser | 66 |
| Forecast/data-quality API | 15 / 22 |

TypeScript, ESLint, architecture boundaries, production build, database lint
and security advisors are part of the same unchanged gate. Final UI checks
also use touch taps on the mobile navigation disclosure and amount-sign button.
The last archive-shortcut correction requires a complete final rerun; its
focused authenticated transaction story already passed before that rerun.

## Observed failures and corrections

The first new lab startup failed because 15921 was already occupied by a
retained recovery target. No retained container was stopped. The attempt was
left intact and a different fresh guarded source was created on the verified
free 15621 range. The existing Task 15a guarded operator creates fresh nonce
volumes, verifies emptiness, applies migrations and completes owned services.

Initial mobile regressions found (1) the sign button's accessible name included
an input's full label, making partial-label selection ambiguous; distinct
control names fix that, (2) a test incorrectly assumed a particular expense
would occupy the second history page, and (3) random account identities made
the default account nondeterministic. The tests now select the intended bank
explicitly through the toolbar combobox (rather than an exact label match containing option text) and inspect the actual selected page. Assertions were preserved;
no CI timeout, retry or security gate was weakened. Final review also removed
the editor shortcut for archived accounts and added an assertion alongside
the existing archive journey; the focused real-browser transaction story
passed with this correction.

The first full verify passed unit/runtime/public browser gates but failed four
SQL global-count assertions (budget audit/receipt/history counts 5 versus 3;
transactions 50 versus 0). Earlier timed-out browser stories had left synthetic
records in the audit lab. The SQL assertions and cleanup rules were unchanged.
A fresh guarded empty source on port range 15721 was prepared for the complete
rerun; the audit lab and all retained resources were left intact. Both the
failed log and final verification evidence are included for review.

## Test environment and limits

Fresh lab `cf15a-caffeffde580-source` was used for audit/focused tests.
A second fresh lab, `cf15a-cc1ab12991bd-source`, is used for full verification.
Its ignored source copy changes only the existing local project/port
references; the canonical source and standard verification command remain
unchanged. Retained recovery resources, volumes, production credentials and
Task 15a source/guard files were not altered. Fixture accounts are synthetic.
No private lab state, Auth links, tokens or keys belong in review artifacts.

Chromium emulation establishes CSS/layout and scripted behavior, not actual
iOS/Android keyboards, screen readers, biometric/device lock, background OS
suspension or HTTPS deployment. Those remain untested release gates. The
existing large-bundle build warning is not suppressed. Memory-only sessions
still require fresh sign-in after refresh/closure; a valid pending command
cannot survive tab destruction or leaving its current workflow. Do not refresh
or leave a workflow with an uncertain command until it is reconciled.

Persistent sessions require the explicit owner decision and verification
listed in the memo. Hosting, real-device HTTPS and production recovery remain
blocked/pending under the readiness checklist. This task does not declare the
real-data pilot ready. Stop at independent code and UX review; do not merge.
