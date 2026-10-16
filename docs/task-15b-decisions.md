# Task 15b — decisions and focused mobile audit

## Verified baseline and scope

Fresh fetch: `76c1165ce923821bf898d2c0e64796cd3c81df52` on origin/master;
PR #15 merged at that SHA. Post-merge push/master Foundation checks run
[38758824343](https://github.com/maozNachum/couple-finance/actions/runs/38758824343)
completed successfully. Working tree was clean. Implementation branch:
`feature/task-15b-secure-mobile-usability`. Read frontend instructions,
architecture, security, data model, Task 14 decisions, Task 15a report,
recovery runbook/readiness checklist and the repository Task 15b prompt.

Frontend only. No migrations, financial formula changes, persistent browser
storage, dependency upgrades, deployment or retained-resource changes.

## Observed audit and selected fixes

Authenticated Chromium mobile emulation used only a newly owned local lab,
existing synthetic fixtures, 24 expenses, an opening, a deliberately unknown
savings balance and a monthly budget. Baseline screenshots and browser metrics
cover 320, 390, 768 and 1280 CSS pixels. No page overflow was observed in these
baseline screens; that did not establish practical usability.

1. **High: navigation displaces daily work.** The sidebar measured 514px at
   both phone widths; content began at document y=582px. Thirteen equally
   prominent links wrapped into seven rows. At 768px navigation still took
   278px. Keep four daily destinations visible, with a labelled disclosure
   for all secondary routes, including categories previously absent from the
   shell. One DOM navigation tree and route-derived active state; no form
   remount or financial state change on viewport resize. Escape returns focus
   to the trigger, navigation focuses main, desktop retains all destinations.
2. **High: budget form density.** Browser measurement found `gap: normal` on
   its fieldset, versus 16px on transaction fields. Screenshot shows touching
   action buttons and crowded labels. Shared existing CSS now supplies grid
   spacing, bounded fields, 44px controls and 16px input text. No field removed.
3. **High: signed money entry.** Existing decimal hints do not guarantee a
   minus key on mobile keyboards. Add an explicit accessible sign button for
   transaction/allocation amounts. It changes the text prefix only: no float,
   rounding, normalization or implicit financial meaning. Canonical parsing
   still rejects invalid input. Full precision and corrections are preserved.
4. **Medium: history navigation.** The 25-revision transaction page was about
   8,492px tall on desktop and longer on phones. Add in-page jumps and 20-row
   presentation pages over the complete loaded history. All calculations and
   current-head checks still use every revision. Dates, ownership, amounts,
   status, reasons and superseded evidence remain on each card. Correction
   moves focus to the existing editor. No new history API or truncation.
5. **High: background privacy consistency.** Code audit found accounts and
   transactions revalidated on focus but lacked the visibility invalidation
   already used by dashboard/budgets/data quality. Hide clears protected
   snapshots and invalidates in-flight reads; show reauthorizes. A pending
   transaction command remains in memory during uncertainty and is retained
   only while the refreshed authorized account graph still includes it.

Dashboard partial/unknown states, forecast assumptions, budget ownership and
historical FX evidence are retained. Reconciliation cards and quality findings
already provide bounded/collapsible evidence; shared spacing, wrapping and
summary targets improve their existing presentation. No speculative redesign.

## Session persistence decision

**Implement now: retain memory-only `persistSession: false`.** Refresh or tab
closure requires a fresh sign-in. An open tab can refresh its session through
the existing SDK. Memory-only storage reduces residual disk exposure but does
not protect an unlocked running app or against same-origin XSS. No session
storage behavior is silently changed by this task.

**Recommended next option, conditional on explicit approval:** opt-in standard
SDK persistence on a trusted personal device, with an approved maximum session
lifetime, inactivity policy, tested device-loss recovery and explicit logout.
It would make reopening after hours/days practical, but leaves bearer access
and refresh credentials readable by same-origin JavaScript and potentially
available to a thief or another user of the browser profile. It is not ready
for implementation or real-data release merely because RLS passes.

Alternatives considered:

- Tab-scoped sessionStorage would survive refresh but not reliably provide
  reopen-after-days behavior, still exposes tokens to XSS and can be restored
  by browser tab recovery. It adds storage policy without resolving the daily
  use requirement. No custom token store is introduced.
- A server bridge with HttpOnly cookies could reduce direct JavaScript token
  extraction, but requires server-side refresh/proxy, CSRF controls and hosting.
  XSS can still act as the user. This is a material architecture/infrastructure
  change and is not justified for the present frontend task.
- An offline snapshot cache would create additional household-data exposure
  and stale-authorization problems. It is excluded.

Supabase's [session documentation](https://supabase.com/docs/guides/auth/sessions)
was consulted along with its changelog on 2026-10-16. Refresh lifetime is not
identical to access-token expiry. Default sessions need not expire promptly;
provider timeout checks may occur on refresh. A locally valid JWT alone must
never restore access: preserve live Auth session and ACTIVE membership checks.
No SDK or provider configuration change is made here.

Before changing persistence, verify: refresh/reopen after hours and days;
expired/reused refresh credentials; successful and network-failed logout;
remote session and membership revocation with an old JWT; concurrent tabs;
delayed reads/writes during logout/visibility/focus/navigation; no household
snapshots in browser storage; and independently verified lost-device/email
recovery. Failed logout must never be presented as confirmed remote revocation.
Recovery must retain durable financial/member attribution and reconcile any
post-backup revocations under the Task 15a runbook. Hosting/HTTPS, real iOS and
Android keyboards and production recovery remain explicit release gates.

Approval dependency: standard persistence and provider timeout/recovery policy
need an explicit owner decision after this memo. No approval is needed for the
independently safe frontend changes implemented here; persistence stays off.
