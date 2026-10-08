# Recommended next request — Task 3 only

Implement Task 3 only for Couple Finance: local Supabase, invited-user authentication, households/membership, and database isolation with RLS and least-privilege grants.

Work directly in the existing repository root. Preserve read-only root AGENTS.md and sources/. First read all applicable AGENTS.md files, README, architecture, data-model, security, providers, roadmap, portable-contracts, and Task 1/2 reports. Inspect existing code and enforcement. Use the approved architecture and canonical Task 2 money/date/ownership/ID/error contracts. Document any concrete incompatibility before changing architecture or contracts.

Use local Supabase and reproducible migrations. Implement only the identity/household/auth foundation needed by Task 3. Keep financial tables/features, accounts UI, transaction ingestion, reports, providers and Task 4+ work out of scope. Do not deploy or connect to real financial accounts.

Use invited users with no public enrollment initially. Store authoritative household membership in the database. Do not authorize using names, frontend state or user-editable metadata. Keep api/finance/private schema boundaries, RLS, least-privilege grants, fixed-search-path narrow helpers and appropriate WITH CHECK policies. Use canonical UUID identifiers and UTC audit instants; document the auth-session and invited-user flow.

Test anonymous access, valid users from households A and B, removed membership, cross-household references, privilege escalation, views/RPCs, invitation/session failures, and unauthorized commands. Do not use service-role-only tests as evidence of user isolation. No secrets in browser bundles/logs or committed files. Server failures must use the safe error contract, never raw exceptions.

Keep exact browser aliases and transitive architecture checks intact. Run the full existing verification chain (clean install if dependencies change, typecheck, lint, architecture, Vitest, permission-free offline Deno, production build, browser core probe, shell E2E) plus migrations/database security and authenticated-flow checks appropriate to Task 3. Do not weaken tests to make them pass.

Report created/changed files, exact dependencies, migrations/policies, architectural decisions, all executed checks and results, limitations, Git status/commit if applicable, and a recommended Task 4 prompt. Stop after Task 3.
