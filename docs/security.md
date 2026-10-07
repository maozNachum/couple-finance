# Security boundaries

Task 1 is a local, unauthenticated shell containing no private financial data. No Supabase client, auth, database, secret store, provider, AI or deployment is configured. Do not expose financial data until the Task 3 security foundation is verified.

## Future authorization requirements

- Supabase Auth with invited users; no public enrollment initially. Production authentication should include tested recovery and MFA.
- Household membership is database-backed. Never authorize from names, frontend state, or editable user metadata.
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

The read-only root AGENTS.md and sources/ remain untouched. sources/ is ignored by Git/lint and denied by the local Vite server. Environment files are ignored and denied. Code boundaries run in local build/dev and CI. Browser tests check that the shell makes no external requests.

Vite is a local development tool, not an authorization boundary or production server. Production hosting/security headers will be addressed in a separate authorized task. This task does not deploy.
