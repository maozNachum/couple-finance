# Proposed Task 16a — financial account coverage and practical data intake

Start only after Task 15b independent code/UX review, merge and exact fetched
master post-merge CI success. This is a proposal, not authorization to start.
Read architecture/security, Task 14 data-quality decisions, Task 15a recovery
runbook/readiness and Task 15b decisions/report. Preserve pending release gates.

Audit the supported manual account, opening/observation and CSV intake flows
with synthetic household members. Propose the smallest workflow that helps
members inventory their household accounts, identify missing historical periods
and choose an existing supported intake method. Clearly distinguish a user's
coverage declaration from verified source evidence and from unknown external
coverage. Do not infer that the absence of findings proves complete coverage.

Prioritize supported bank/cash/savings/card/loan/investment account semantics,
explicit opening dates and coverage, original currencies and ownership,
CSV mapping/review/duplicate decisions and reconciliation follow-through.
Reuse canonical writers, historical revisions, live authorization, source
provenance and existing uncertain-command recovery. No direct data edits,
financial engine rewrite, automated source activation or invented balances.

Before adding schema or APIs, present a focused evidence/coverage policy with
concrete examples and authorization implications. Keep intake deliberately
bounded and reviewable. Bank/card integrations, external synchronization,
dynamic FX, AI coaching, Goals, push/automation, production hosting and real
financial data are outside this proposed scope unless separately authorized.

Acceptance should follow a member from a deliberately incomplete synthetic
inventory through manual/CSV intake, review, safe retry, corrected history and
an honestly improved dashboard/data-quality result. Include cross-household,
revocation/stale-response, personal/shared attribution and mobile accessibility
regressions. Use a fresh guarded disposable lab; preserve retained resources.

Deliver decisions/report, before/after evidence and tests, unchanged full
`npm run verify`, one focused PR against master, exact-head standard CI and
an independent-review package with hashes and diff. Do not merge or deploy.
