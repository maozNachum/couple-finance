# Security boundaries

Task 3 adds a local Supabase Auth/database foundation containing synthetic test data only. See [local auth](local-auth.md) for invitation, session, grant, RLS and audit boundaries. No financial tables, provider, secret store, AI or deployment is configured.

## Authorization requirements

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
