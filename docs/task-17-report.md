# Task 17 — Financial Goals v1 delivery

## Product and financial contract

`/goals`, reachable from existing mobile navigation, supports shared and
personally attributed goals without requiring account data. CREATE, EDIT and
terminal ARCHIVE retain complete version history, durable actors and server
timestamps. Target, explicit declared progress, optional deadline/monthly plan,
remaining, surplus, capped percentage, monthly requirement and hypothetical
outcome remain in each goal's own currency. Ownership/currency/identity cannot
be edited. There is no completed state, account allocation, exclusivity claim,
forecast integration, financial transfer, interest, return or AI feature.

Synthetic acceptance: ILS 30,000 target, ILS 6,000 declared, planning date
2026-10-18, target 2027-10-31: 12 future contribution months, ILS 24,000
remaining and ILS 2,000 required monthly. Funding remains NOT_ESTABLISHED.
An explicit ILS 1,500 monthly plan produces ILS 24,000 total and a negative
ILS 6,000 gap. Zero declaration differs from verified zero; absent monthly
planning differs from explicit zero. Over-target declarations retain surplus.
Overdue deadlines have immediate remaining requirements and no fabricated
historical outcome. The exact calendar/rounding policy is in the decisions.

## Implementation and authorization

Two runtime-independent aliases expose strict contracts and pure calculations.
Existing decimal/Money/date functions own arithmetic; upward rounding uses a
rounded quotient, exact multiplication comparison and one eight-place unit
increment only when needed. Existing financial rounding contracts are unchanged.

The CLI-generated forward migration `20261017211305_task17_financial_goals.sql`
adds goal heads/revisions and private receipts/audit only. A STABLE invoker
snapshot reads a bounded household/member/goal graph without loading accounts.
The narrow checked private writer, reached through an invoker API wrapper,
locks household then Auth user/session/member, checks the existing Task 16b
wall-clock live actor predicate after waits and before replay, validates selected
member eligibility and immutable identity, checks expected versions and commits
head/revision/receipt/audit atomically. Complete original payload hashes protect
exact retries; canonical stored Money/UUIDs avoid representation-only conflicts.
Previous revisions cannot be updated and browser DML is denied. Composite FKs
retain household boundaries and attribution through user deletion/revocation.
Audit contains IDs, version, actor, operation and timestamp, not amounts/names.

Browser snapshots/drafts/commands stay in memory; persistSession remains false.
Lost delivery retains the exact pending command/key and blocks new commands.
Definitive rejection requires a new explicit review. Focus, visibility, refresh,
Auth events and unmount invalidate old responses; protected presentation is
cleared before reauthorization. Personal goals are explicitly visible to other
authorized household members. Accessible labels, native controls, progress text,
archive confirmation and complete history reuse existing RTL components/CSS.

## Verification environment and corrections

Baseline: PR #18 merged; clean tree; fetched full master SHA
`87a8f0c82d332ccb6226acf131d3228d6e40339a`; successful verify job
117499007474 in [post-merge run 39067813317](https://github.com/maozNachum/couple-finance/actions/runs/39067813317).
Checkout logs independently identify that exact SHA. Work branched from it.

New lab `cf15a-f53ca6e8deda-source` uses 16121/16132 and newly created,
nonce-labelled database/Storage volumes with recorded identity and empty initial
Auth/household checks. Existing stacks on 15421–16021 were retained unchanged.
The source-copy manifest records only documented local port/project/container
substitutions. No retained resource was adopted, reset, stopped or deleted.
CLI version 2.120.0 and help were inspected; no dependency was upgraded.
Official Supabase changelog and RLS documentation were consulted. The managed
HTTP TLS cipher deprecation does not change this pinned local-only design.

Development findings: an initial sandbox Git ownership/write restriction was
resolved with per-command safe.directory and authorized elevated Git operations.
Docker Desktop was started for the disposable lab. No auto-review rejection
occurred. An initial nonexistent `test:unit` command was replaced by the actual
Vitest command. Lint identified a ref cleanup warning; an explicit invalidation
callback fixed it. Two personal-goal browser cases timed out because exact label
text included select options; accessible role/name selectors passed on rerun.
The first full run found that inserting Goals first in the secondary navigation
changed its existing keyboard contract; Goals now follows the existing first
links, without weakening the old test. Another intermediate run was cancelled
before final verification. Final arithmetic review replaced an exact-integer
ceiling helper with the existing decimal wrapper. Mobile visual review separated
touching action buttons and shortened the initial explanation with expandable
detail. No existing assertion, timeout, retry or CI policy was weakened.

## Final verification evidence

Observed completed foundation checks: 647 Vitest tests, 485 permission-free Deno
cases plus 15 CSV cases, 688 PostgreSQL assertions (including 33 Goals assertions),
14 public browser cases, clean database lint and security advisors. The complete
authenticated browser gate contains 82 cases, including ten Goals cases. Final
API counts and the authenticated/full-chain outcomes are recorded in the exact-
head external manifest and logs, rather than inferred from this gate inventory.
The initial focused Goals API run passed 48 assertions; final validation adds
two raw Unicode-whitespace cases. Initial focused browser results were 8/10,
followed by 2/2 corrected personal-attribution cases. Final keyboard/mobile form
coverage explicitly submits with Enter and checks the form itself at 320px.
Browser fixtures derive a twelve-month deadline from the disclosed Jerusalem
basis without changing Auth's clock; pure acceptance dates remain fixed.

The external exact-head review manifest records the final local full-chain
result, exact test counts, source-copy hashes, final commit/tree, GitHub CI run
identity/result and complete logs. CI evidence is external to avoid embedding a
self-referential final commit hash in its own source. Do not infer a successful
run from this document alone; use that manifest and the retained run/job logs.

Required new tests are in the existing gates: portable goal cases run in Vitest,
permission-free Deno and production-bundled browsers across four timezones;
pgTAP runs through db:test; real authorized journeys through test:auth:e2e;
test:goals is appended after the entire existing verify chain. No existing gate
or CI setting was removed or shortened. API tests include exact retries, changed
payloads, same-ID races, concurrent edits, private access denial, revoked-member
attribution, archival terminality, late audit rollback, session expiry/revocation
under lock waits and equality of retained financial/account/source/FX records.
Browser journeys include no-account personal goals, clear unverified progress,
edit/history/archive, uncertain retry, stale edit, network uncertainty, logout,
revocation and delayed read/write results. Synthetic screenshots and Axe/overflow
checks cover 320, 375, 390 and 1280 pixels.

## Operational considerations and open decisions

Goals do not establish available cash or exclusive funding. No sums across goals
or currencies are shown. Contribution months include the target month under the
documented month-end convention, irrespective of its selected day. The current
partial month is excluded. Eight-place exact requirements can exceed currency
minor-unit precision; they intentionally never understate the plan. Browser
Jerusalem time is a disclosed planning basis, not server/bank-certified evidence.

Reads fail closed beyond 1,000 households, 10,000 members/revisions or 16 MiB;
there is no synchronization/pagination protocol. Long historical collections
remain complete. Money arithmetic overflow yields an explicit unavailable
calculation while original declarations remain visible. Session/tab loss removes
the pending intent; inspect retained authorized history before creating another.
Goals v1 has no completed/reactivated status, account reservation, automated
contribution or ability to prove that two goals reference different savings.

Synthetic backup validation recognizes only the exact new migration plus its
reviewed predecessor and continues rejecting unknown schemas. Old bundles remain
compatible. A fresh full physical backup/restore drill was not part of Task 17;
existing independent operational release gates remain. Real mobile devices,
secure hosting, email/recovery and production operations remain separate gates.
No deployment, merge, real household data or Task 18 implementation occurred.
The proposed next-task prompt is documentation only. Stop for independent code,
financial-model and security review.
