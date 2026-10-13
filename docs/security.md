# Security boundaries

Task 13 introduces no database grants, tables, commands or migrations. Its forecast loader reuses the live-authorized invoker `obligations_snapshot` and validates the entire graph before showing evidence. Pure read-only calculations fail closed on invalid context, collection/UTF-8-size/calendar/arithmetic overflow. Browser revalidation clears protected snapshots/accessibility/buffer and obsolete responses cannot restore revoked or signed-out evidence. No persistent browser storage, server credential exposure or financial mutation. Existing adversarial snapshot/command tests remain, with new read non-mutation and browser revocation/sign-out coverage.

Task 12 planning tables use household SELECT RLS and no authenticated DML. The invoker read RPC nests reporting under one STABLE statement snapshot and fails on combined decision/byte bounds. One private fixed-search-path command rechecks live Auth user/session/member before complete-payload receipt replay, serializes by household then account, checks expected head/link and current financial revision identities, and atomically retains decisions, exclusive evidence claims and minimal audit. Helpers are withheld from clients. Original confirmation evidence has exclusive allocation references to prevent duplicate candidate approvals. Financial history, provenance, categorization locks, reconciliation and budgets are not changed. See [decisions](task-12-decisions.md).

Task 11 planning tables have household SELECT RLS and no browser DML grants. Invoker snapshot/API wrappers use current live-session authorization; one private fixed-search-path command locks household then Auth user/session/member, reauthorizes before complete-payload receipt replay, checks expected versions/scopes/currency and atomically appends plan history, receipt and minimal audit. Restrictive composite category/version/member references preserve history. No financial writer is invoked. See [budget decisions](task-11-decisions.md).

Task 10 adds only a STABLE read-only invoker reporting RPC with an empty search path and authenticated EXECUTE. It checks live sessions and inherits household/member RLS from every underlying projection/table; no household/member/account IDs are accepted as authorization arguments. Collection/response limits fail explicitly rather than truncate history. Revalidation removes protected dashboard content before requests, rejects obsolete responses and clears on confirmed sign-out/revocation. Browser evidence stays in memory. See reporting pgTAP/API/browser tests.

Task 9 relationship commands independently reauthorize live Auth user/session and active durable membership, including exact retries, before returning household-scoped complete-payload SHA-256 receipts. Household then sorted account locks coordinate with financial/categorization/import commands; user-before-session share locks avoid reversing Auth deletion order. Expected relationship/account/transaction versions and exclusive claims reject stale/incompatible writes. Private minimal audit, immutable decisions and receipts commit or roll back together. Invoker snapshots use RLS; new financial history DML grants remain withheld, finance/private stay unexposed, and no browser persistent cache or second financial writer exists. See [Task 9 report](task-9-report.md).

Task 8 accepts no browser financial rows. The server reparses exact authenticated private bytes, checks interpretation/hash/version and obtains a database-backed 45-second actor/session lease. Only the server credential may call the narrow parser-result API; the private handler derives live identity from the stored lease and locks the Auth user/session and active membership before persistence. Household/account/upload ordering, history-generation checks, atomic receipts and late lease-expiry rollback protect races. Direct client mutation of history/provenance/receipts is denied. Raw cleanup reserves metadata under lock, excludes active leases and removes abandoned review metadata; committed evidence persists. See [Task 8 decisions](task-8-decisions.md).

Task 3 adds a local Supabase Auth/database foundation containing synthetic test data only. See [local auth](local-auth.md) for invitation, session, grant, RLS and audit boundaries. Task 4 extends those same controls to manual accounts and immutable observations; see [its delivery report](task-4-report.md). No provider, secret store, AI or deployment is configured.

Task 4 review fixes add RLS-protected `account_sources` and immutable household-scoped `fx_evidence`. Observation source references include household/account/source; predecessor references additionally include date. Authenticated users may establish only an initial MANUAL authority and cannot update/delete sources or FX evidence. Future source activation requires a separately authorized server use case; no current client command appoints imports/live sources. Source creation and account creation are atomic. Reusable FX IDs bind identical evidence within a household, without exposing another household's evidence. See [review-fixes evidence](task-4-review-fixes.md).

## Authorization requirements

Task 5 uses invoker reads/RPC wrappers and a private `record_transaction` definer with an empty search path, no dynamic SQL and explicit live-session/household/context checks. Clients have SELECT only on transaction tables; no direct financial history INSERT/UPDATE/DELETE. Per-account locks serialize commands with archival. Expected version/predecessor checks, scoped SHA-256 receipts and audit writes commit atomically with allocations. Replay still requires current authorization. Private audit excludes descriptions, amounts and raw command bodies. See [Task 5 decisions](task-5-decisions.md) for the exact replay and correction policy.

- Supabase Auth with invited users; no public enrollment initially. Production authentication should include tested recovery and MFA.
- Household membership is database-backed. Never authorize from names, frontend state, or editable user metadata.
- Login deletion/unlinking preserves durable membership history and its display snapshot while atomically revoking access. NULL user associations cannot be ACTIVE, reassigned or implicitly reclaimed. Clients have no member INSERT/UPDATE/DELETE grants. Households cannot cascade-delete membership history; future financial FKs must preserve that retention boundary.
- `api`: curated exposed reads/commands; `finance`: unexposed household tables with RLS; `private`: unexposed server operations/secrets references.
- RLS plus least-privilege grants, same-household composite FKs, update WITH CHECK policies, and invoker views/RPCs where possible.
- Security-definer helpers require a fixed search path, explicit privileges, narrow scope and tested caller checks.
- Service-role jobs bypass RLS: load trusted stored household/job context and apply explicit household predicates. User-supplied household IDs do not authorize access.
- Test anonymous, household A/B, removed users, privilege escalation, cross-household references, views/RPCs, and storage. Service-role-only tests cannot establish isolation.

## Secrets, logs, privacy

- Browser: public configuration only. VITE_* variables are bundled; never put service-role/provider/AI secrets there.
- Provider tokens remain in restricted encrypted server storage. No banking login credential collection. Never send secrets to AI.
- Logs contain safe codes, counts, timings and request IDs; not tokens, account numbers, raw imports, merchant descriptions, or unnecessary PII.
- Audit important changes in the same commit; audit data cannot be user-modified. Version checks prevent lost updates; idempotency makes retries safe.
- No authenticated offline cache by default. Future storage is private and household-scoped.
- Raw ingestion retention, household export/purge, and database plus upload backup/restore must be defined and tested before real use.

## Current repository controls

The read-only root AGENTS.md and sources/ remain untouched. sources/ is ignored by Git/lint and denied by the local Vite server. Environment files are ignored and denied. Code boundaries run in local build/dev and CI. Browser tests check that the public shell makes no external requests; separate authenticated tests contact only local Supabase.

Vite is a local development tool, not an authorization boundary or production server. Production hosting/security headers will be addressed in a separate authorized task. This task does not deploy.

## Portable validation and safe errors

Task 2 uses strict canonical Zod schemas; no provider payloads or unrestricted metadata bags are accepted. UUID validation and ownership shape checks do not establish authorization, household membership, referential integrity or account-currency consistency with a stored account. Those checks need trusted application/database context in later tasks.

Only the `SafeError` contract belongs on error responses: fixed code/kind/message/retryability variants, optional UUID request/correlation IDs, and enumerated validation-field errors. Unexpected keys and arbitrary messages are rejected. Never serialize caught exceptions, Zod issues, stack traces or provider responses; validation diagnostics are internal. `internalSafeError` accepts no exception or arbitrary message. This is an output boundary, not a mechanism to detect secrets hidden in legitimate business descriptions.

## Task 6 command boundaries

Category/rule heads, immutable definition versions, catalog generation and decision evidence are unexposed finance tables with household SELECT RLS and no client DML grants. Receipts remain private. API wrappers/snapshots are security invokers. Narrow private definers recheck live Auth sessions and active membership, including on successful-command retries; fixed safe errors and empty search paths remain mandatory. The internal financial writer has no PUBLIC/anon/authenticated EXECUTE grant.

Definition and decision commands lock the household before the account; manual financial commands use the same ordering. Catalog generation rejects any preview predating a definition edit. Account archival is rechecked in the existing writer. One allocation is the bounded atomic application unit; no mixed success or hidden background write exists. Every financial history mutation, decision evidence, audit and receipt either commits together or rolls back. Archived targets cannot be newly assigned; old references remain valid. See Task 6 RLS and real Auth/API tests.

## Task 7 staging and private Storage

`finance.import_uploads` retains generated household/UUID object paths, original display filename, declared bytes, existing account/source, durable uploader member, expiration/cancellation and bounded processing-check count. Composite restrictive FKs retain context and ownership. Only curated invoker API wrappers call narrow private definers with empty search paths, live session/member checks and minimal atomic audit. No client staging DML grants; canonical financial grants and commands are unchanged.

The `import-preview` bucket is private with a 1 MiB server cap and text/csv MIME. Operation-aware INSERT/SELECT/DELETE policies require an exact database-backed path. No UPDATE or signing policy exists; signed upload, signed download, replacement, move/copy and traversal attempts are denied. Cancellation/expiry blocks reads and processing, while deletion-only SELECT remains available for Storage API deletion. Authenticated downloads recheck current sessions/membership; already downloaded bytes cannot be recalled. A future short-lived signed URL would remain a bearer capability until its expiry, so Task 7 does not issue or allow minting one.

Raw files and staging metadata expire after 24 hours but physical removal requires explicit cancellation/cleanup. `npm run local:cleanup-imports` is an operator-only loopback tool: remove at most 100 eligible objects through Storage API, then metadata only after object absence; retain minimal audit for 30 days. Failures leave retryable metadata. Production scheduling and backup deletion need separate deployment work. No raw contents, tokens or filenames enter audit/logs; preview never goes to persistent browser storage. See the [Task 7 report](task-7-report.md).
