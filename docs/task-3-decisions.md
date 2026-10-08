# Task 3 implementation decisions

The approved modular monolith remains compatible. Task 3 introduces only local Supabase Auth and household identity/isolation. No financial tables or features are added.

- `finance` owns profiles, households and relational memberships; `private` owns narrow caller/session checks and append-only administrative audit records. Only `api` is exposed by PostgREST, through security-invoker views and a narrow invoker command.
- Membership is provisioned/revoked by an explicit local operator command. There is no self-enrollment, browser invitation endpoint or browser membership mutation. Email links authenticate invited users; they never grant household membership by themselves.
- Authorization reads current database membership and the JWT's server-created session ID against `auth.sessions`; editable metadata is never authoritative. Deleted sessions and revoked memberships lose database access immediately.
- Browser sessions live only in memory. Reloading requires another email sign-in; no authenticated data is stored offline. Confirmations require a user click, remove the token hash from the URL before any request, and show fixed errors only.
- The only new browser dependency is the pinned Supabase SDK, confined to shared browser infrastructure. Runtime environment access is permitted only in its explicit configuration module. New public schemas get exact reviewed aliases; core purity stays enforced.
- The existing public shell remains informational. `/household` is the protected household page; `/sign-in` and `/auth/confirm` implement invitation/email-link sign-in.
- Local services and synthetic tests do not contact real users or financial accounts. Production SMTP, deployment, MFA/recovery rollout, backup and retention remain separately authorized work.
