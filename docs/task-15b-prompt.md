# Proposed Task 15b — Practical mobile use (not started)

Start only under a separate explicit request, after independent review and
merge of Task 15a and a successful post-merge master CI run whose full SHA
matches a fresh fetch. Read applicable instructions and the Task 15a report,
runbook and readiness checklist. Pending production gates remain pending;
mobile improvements cannot declare the pilot ready for real data.

Inspect the existing Hebrew RTL workflows on narrow/mobile viewports and
realistically test keyboard, touch targets, navigation, forms, money/date
entry, error handling, history review and safe uncertain-command recovery.
Propose narrowly scoped mobile improvements with concrete acceptance stories.
Do not change canonical financial calculations, immutable revisions, source
authority, unknown external coverage, budget attribution or household RLS.

Persistent sessions are a separate security decision within Task 15b: evaluate
device loss, shared devices, logout/revocation, browser storage, recovery and
session expiry before proposing a change. Do not persist financial snapshots
or assume that session persistence was approved by this proposed prompt.
Preserve immediate live authorization checks and test stale responses after
revocation. Keep privileged credentials out of the browser.

Use only newly verified disposable synthetic environments. Do not reset,
stop or delete existing retained resources. Preserve Task 15a safeguards and
run the unchanged full verification plus meaningful mobile/security tests.
Deliver decisions/report, screenshots of synthetic flows, exact-head review
package and one focused PR to master with verified exact-head CI. Do not
merge, deploy, invite real users, provision paid services, start Task 16,
or add integrations, dynamic FX, AI or automation.
