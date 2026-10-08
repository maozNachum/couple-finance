# Task 3 review corrections

Scope: durable household membership and safe Auth diagnostics on `feature/task-3-household-auth`, updating existing PR #1. No Task 4, financial account features, new PR or automatic merge.

## Migration decision and exact SQL changes

Before editing, local migration history contained only `20261008104827`. Local `auth.users`, `finance.profiles`, `finance.households` and `finance.household_members` each contained zero rows; `supabase/.temp` contained only CLI metadata and no linked project reference. Existing documentation and CI use disposable local stacks, and PR #1 was open/unmerged. No non-disposable applied environment was identified. Corrected the original unmerged migration and successfully replayed it with `supabase db reset --local --yes`; no hosted database or real data was reset.

- `profiles.id → auth.users.id ON DELETE CASCADE` remains intentionally ephemeral. It no longer cascades into durable attribution.
- `household_members.user_id` is nullable and references `profiles(id) ON DELETE SET NULL`.
- `household_members.household_id → households.id` changes from CASCADE to RESTRICT, preventing accidental household deletion from removing members.
- Required `household_members.display_name` stores a bounded nonblank attribution snapshot supplied during provisioning, independent of profile rename/deletion. The invoker view and public contract expose `displayName`; `userId` is nullable.
- `member_active_requires_identity` CHECK enforces `status <> 'ACTIVE' OR user_id IS NOT NULL`.
- `private.guard_member_identity()` is an invoker trigger function with an empty search path and no client EXECUTE grant. BEFORE INSERT/UPDATE, it normalizes NULL user associations to REVOKED, including FK SET NULL updates. On UPDATE it rejects changing member ID/household or changing the user association to any different non-NULL value. Once unlinked, a row cannot be relinked, even through ordinary privileged DML.
- Existing membership touch/audit triggers still execute in the transaction. Unique `(household_id, user_id)` and `(household_id, id)` keys remain; multiple historical NULL associations are valid. The user/household index now covers revoked rows too, supporting FK unlinking without scanning retained history.
- All existing grants, RLS and live-session checks remain. Clients still cannot INSERT, UPDATE, reassign or DELETE memberships. Retention probes use a rolled-back test table, not a financial table.

All application-schema cascades were reviewed: the ephemeral Auth-to-profile cascade is the only remaining one. Private audit IDs intentionally have no cascading foreign keys. Future financial tables must reference durable `(household_id, member_id)` with restrictive deletion, not Auth/profile identity. PostgreSQL superusers can still deliberately drop constraints/triggers; this is not protection against database-owner tampering.

## Auth diagnostics

Provider OTP response suppression is intentional: a delivery infrastructure error can occur only for an existing address, so exposing a distinct failure can become an enumeration oracle. The conditional browser result now also masks thrown transport/SDK errors, without logging per-email results or raw diagnostics. Unit tests compare success, account failure, server failure and interruption.

`npm run local:auth-diagnostics` provides an independent health check and operator-only aggregate service error/HTTP 5xx counts from bounded local Auth logs. Only allowlisted fixed codes and numeric counts leave the process; provider strings, email addresses, tokens and IDs are discarded. Tests cover sentinel private data and malformed records. This requires local Docker operator access; it adds no public diagnostic endpoint. Counts cannot prove email delivery or diagnose failures outside the last ten minutes/1,000 entries; hosted observability remains future work.

## Verification

The complete `npm run verify` chain passed locally with exit code 0 after migration replay. No dependencies changed and no existing assertions were removed or relaxed.

| Check | Result |
| --- | --- |
| TypeScript / ESLint / architecture | Passed |
| Vitest | 193 tests, 7 files passed |
| Offline permission-free Deno | 130 passed |
| Production build / portable browser probe | Passed |
| Existing shell/core Playwright | 12 passed |
| Actual PostgreSQL pgTAP | 72 assertions passed (previously 44) |
| SQL lint / security advisors | No errors / no issues |
| Real GoTrue/PostgREST/email integration | 33 assertions passed (previously 26) |
| Authenticated desktop/mobile Playwright | 6 passed |
| Local diagnostic command | AUTH_HEALTH_OK; fixed aggregate counts only |
| Staged files / generated browser credential scan | 21 staged files, 6 browser files; no detected secrets or excluded tracked paths |
| Fixture cleanup | Auth users, profiles, households and memberships all returned to zero rows |

New coverage includes durable Auth deletion with existing/future composite FKs, immutable member identity, explicit unlinking with a live session, orphan claiming/relinking denial, preserved display identity, restrictive household deletion, and recreated Auth identity denial. Real GoTrue/PostgREST tests also delete an Auth user, replay the original signed JWT, invite the same email again and reject implicit access/reclaim. Existing invitations, expiry, logout, network logout and desktop/mobile tests remain in the full chain. SQL assertions run under actual anon/authenticated roles; privileged fixture operations separately establish database integrity.

The full verification log is ignored at `.artifacts/repo-setup/task3-review-verify.log`. The existing Vite chunk-size warning remains (authenticated build 576.56 kB, gzip 166.90 kB), as do the existing color-environment warnings. Remote CI must pass separately on the pushed commit; its links/status are recorded in PR #1 and the delivery message rather than inferred from local success.

## Remaining limits

This remains a local foundation with synthetic data. No production environment or financial persistence was introduced. Display names are retained provisioning snapshots; rename synchronization, anonymization/purge policy and member relinking are not implemented. A replacement identity requires an explicitly provisioned new membership, never reassignment of old attribution. Any previously applied non-disposable database needs a forward migration/backfill plan instead of a reset. The PR stays open for human review.

Design references: [PostgreSQL foreign-key deletion actions](https://www.postgresql.org/docs/17/ddl-constraints.html#DDL-CONSTRAINTS-FK), [Supabase user deletion and JWT lifetime](https://supabase.com/docs/guides/auth/managing-user-data).
