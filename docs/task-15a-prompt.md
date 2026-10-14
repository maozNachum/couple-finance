# Task 15a only — Private pilot foundation, backup and recovery

Implement Task 15a only, after independent Task 14 review, actual merge and successful post-merge master CI on the exact latest remote master SHA. Fetch master, record merge/CI evidence, read all applicable AGENTS.md, architecture, financial contracts, security/provider/database instructions and Tasks 1–14 decisions/reports. Require a clean tree and a separate feature branch. Stop at a missing baseline prerequisite. Do not edit synced references or rewrite merged migrations.

The approved direction is a trustworthy household financial core, followed by secure practical mobile use (15b), account coverage/data intake (16a), justified dynamic FX (16b), Goals (17), deterministic insights (18), a controlled coach (19a–19b) and authorized proactive work (20a–20b). Provider research is parallel. This task does not implement those stages.

## Objective and bounded design

Establish a reviewable private-pilot operating foundation with demonstrated recovery, rather than declaring MVP readiness from passing UI tests. Inspect actual local/hosting/database/Storage/Auth configuration first. Record the proposed pilot scope, operator responsibilities, access boundaries, recovery objectives, retained-data policy, environment separation and remaining release gates before implementing. Do not invent external approvals, hosting entitlements, backup availability or tested recovery guarantees.

Use the existing application and narrow operational tooling. No financial formula, account authority, provenance, immutable revision, date, Money, household attribution or conservative completeness changes. Preserve Task 13 authorization performance and Task 14's distinction between known-data completeness and external coverage UNKNOWN.

## Required work

1. Define a small invitation-only pilot boundary and secure configuration checklist grounded in actual settings. Verify live session/user/membership revocation, least privilege, private Storage and protected frontend/Edge surfaces. Document recovery of an invited user's access without self-enrollment, trusting editable metadata or bypassing household membership. Implement only necessary bounded fixes.
2. Define a real backup/restore procedure covering PostgreSQL data and schema/migration version, required Auth relationships, private Storage objects and metadata, and retained financial/import provenance. Identify what each backup includes and excludes. Keep credentials, encryption keys and raw private data out of Git, browser bundles, logs and review artifacts. Prefer existing supported backup facilities; do not build a generic backup platform.
3. Implement explicit operator-driven commands/runbooks only where existing tools are insufficient. Require validated environment identity and destination, safe defaults and explicit refusal of non-disposable restore targets. No restore/reset/drop against retained, hosted or real financial data. A backup artifact and restored database require appropriately restricted access; public sharing is prohibited.
4. Demonstrate a full synthetic recovery drill into a verified empty disposable environment. Restore database plus Storage as needed, then prove financial parity, immutable revision/provenance relationships, original Money/currency/dates, account ownership, budgets, obligations, reconciliation and reporting/forecast/data-quality behavior. Test Auth recovery/revocation and tenant isolation after restore. Simulate interrupted or incomplete backup/restore and show explicit detection without fabricated success.
5. Record actual measured recovery results, integrity checks, operator steps and unresolved dependencies. Define an incident/recovery and rollback runbook for the bounded pilot. Separate disaster recovery from any user-facing export/import feature; do not add a general financial-data writer or promise portable household export unless separately approved.
6. Assess retention and secure removal of temporary imports/backups under existing policy. Any necessary operator operation must be narrow, auditable and explicitly scoped; no background scheduler, generic job framework or automatic destructive cleanup of real data.

Production deployment, real-user invitations, purchases, external messaging and modifications to a hosted/retained environment require explicit separate authorization. Complete all safe local preparation and disposable testing first. Do not present a pilot as ready when hosting, recovery, delivery, monitoring or other required checks remain unverified.

## Verification and delivery

Run the full unchanged `npm run verify` chain and preserve all existing gates. Add meaningful synthetic security, recoverability, corruption/interruption, restored financial parity and tenant/session isolation regressions. Do not weaken tests, increase timeouts, add blind retries or reset a non-disposable database. Record any unavailable checks precisely and do not claim full success.

Document decisions, the recovery/operations runbook and a Task 15a delivery report with exact commands, backup scope, encryption/access assumptions, restore-target safeguards, parity checks, recovery timings, test counts, limitations and remaining release gates. Prepare a bounded Task 15b prompt for secure daily mobile usability without starting it.

After successful verification, create one focused PR to master with exact commit and local/remote CI evidence and an exact-head review ZIP/manifest. Do not merge or deploy. Stop for independent review and explicit approval.

## Explicit exclusions

No Task 15b mobile redesign or new persistent browser-session/offline model; no Goals, bank/provider synchronization, dynamic FX, AI/LLM calls, proactive coaching, scheduled evaluation, Push, new financial writers, payment/trade execution, generalized workflow engine or unrelated refactoring. Account coverage, pensions, investments, financial independence, product comparisons and automation remain preserved longer-term ambitions, not implementation commitments in this task.
