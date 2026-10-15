# Task 15a — private pilot foundation and recovery evidence

## Scope and release decision

This change adds a bounded local synthetic recovery drill, fail-closed target
guards, adversarial tests and operator documentation. No application,
canonical calculator, historical migration, existing test assertion,
package script or standard CI gate changes. Real-data pilot readiness remains
**BLOCKED**; see `private-pilot-readiness.md`. No deployment, real invitation,
paid infrastructure, merge or Task 15b implementation is authorized.

Baseline: freshly fetched master
`29c3622bf79d27411f81ad4eb341eadc26184b7c`, Task 14 PR #14 merged, successful
post-merge push run [38642294172](https://github.com/maozNachum/couple-finance/actions/runs/38642294172)
verified against its full commit link before implementation. The run initially
was in progress; work waited for success. Branch:
`feature/task-15a-private-pilot-recovery`.

## Actual backup and safeguards

The physical backup captures the complete cleanly stopped PostgreSQL cluster
and separate private Storage volume. This includes database roles, RLS,
functions, constraints, Auth identities, migration history, finance/private
schemas, revisions, allocations, original dated FX, durable receipts, import
provenance, reconciliation, budgets and obligations. The manifest records
immutable image IDs, source hash, 15 migration versions, object bytes/hashes
and both archive hashes. AES-256-GCM authenticates the complete bundle.

The synthetic fixture contains two households, an explicitly invited second
member, a previously revoked member, immutable transaction and budget edits,
different account/allocation ownership, historical USD/ILS evidence, linked
obligation payment, reconciliation and an actual Edge CSV import with private
bytes. Seeding passed 26 assertions. The oracle covers 48 complete
finance/private/migration tables and one private object.

Encrypted artifact: 57,226,959 bytes; SHA-256
`fe47dfd08e3f4cf5e1aaf9c3c82c416a4b22c7c831e6f3a4304872be7b443a0d`.
Compressed database: 42,918,454 bytes; Storage: 410 bytes.
Private artifacts and replay credentials reside outside Git in an
inheritance-restricted operator/SYSTEM lab directory. Key co-location is
allowed only for this synthetic drill, not approved real-data custody.

Fresh random project IDs, nonce labels, volume names/creation times, local
driver without bind options, actual empty-directory and attachment checks,
container IDs and image IDs establish target identity. Exact target
confirmation is mandatory. No target adoption, URL input, reset/drop or
automatic disposal command exists. A one-attempt claim and durable RESTORING
intent precede writes; interrupted targets cannot be reused. Archives are
authenticated, hashed and checked for traversal, links/devices before writes.
Recovered sessions/tokens are invalidated with only the database running.

Excluded: images themselves, repository history, frontend builds, Edge caches,
container writable layers, Mailpit mail, host configuration, external SMTP,
HTTPS/DNS, platform configuration and external secret custody. This is not a
host-loss or managed-Supabase restore. Exact image/source availability and
trusted host/Docker administration are prerequisites. See the runbook for
complete commands, incident handling, retention and disposal responsibilities.

## Verification and corrections

The full unchanged `npm run verify` passed in a new isolated source project
`cf15a-04d0e48151dc-source`. Only local project/port references were transformed
in its ignored source copy; the transformation manifest records before/after
hashes. `VITEST_MAX_WORKERS=1` reduced local concurrency. Assertions, timeouts,
retries and `.github/workflows/ci.yml` remain unchanged.

| Gate | Final result |
| --- | --- |
| TypeScript, ESLint, production build | Passed |
| Vitest | 579 existing tests / 11 files; final head adds 20 guards (599 / 12) |
| Deno canonical / import tests | 458 + 15 |
| Public browser | 12 |
| SQL | 609 / 14 files |
| Auth / accounts / transactions API | 33 / 33 / 118 |
| Categorization / import preview / import commit | 70 / 91 / 195 |
| Reconciliation / reporting / budgets / obligations | 86 / 31 / 50 / 93 |
| Authenticated desktop/mobile browser | 62 |
| Forecast / data quality API | 15 / 22 |
| New recovery guards | 20, using the existing Vitest Node environment |
| Actual wrong target/confirmation/corrupt/incomplete backup | 5 |
| Actual interrupted restore and quarantine | 3 |
| Actual missing private object blocks acceptance | 3 |

The first source startup exposed a CLI behavior: pre-created empty volumes
skip application migrations. The corrected source starts without PostgREST,
checks emptiness, applies existing migrations, then completes services. An
initial full verification stopped at Auth because CLI start does not add
previously excluded services to a running project. The correction explicitly
stops **only the owned project**, retaining its volumes, then starts its full
stack and verifies PostgREST. Focused Auth passed 33 assertions, followed by
the full successful verify above. No test weakening or blind retries.

Initial head `b109582` failed remote verify because the new Node-runner test
file also matched Vitest's existing include pattern. Local reproduction
confirmed the `node:test` bundling error. The correction uses the existing
Vitest Node-environment convention without changing any assertion. The
redundant newly added workflow was removed: all 20 guards now run inside the
unchanged standard `npm run verify` gate. The complete corrected Vitest run
passed 599 tests / 12 files in 27.47s; ESLint also passed. Standard exact-head
CI verification is recorded in the review manifest.

The missing-object adversary initially tripped the complete table comparison
because authorized Storage removal also writes the private import audit.
The object-byte check now precedes table parity, retaining both checks and
reporting the intended missing-byte failure. The adversary then passed;
its target is FAILED_MISSING_OBJECT, never VERIFIED. The deliberately
interrupted target remains RESTORING. Neither is reused.

Final fresh target `cf15a-a9bbd0319353-target` reached VERIFIED after 31
acceptance checks. Exact 48-table parity, the complete authorized snapshot,
private bytes and all canonical calculator outputs matched. The full
calculation JSON SHA-256 is
`36c2fc17c47032a989e53d393cef6c65f6fca576e90e69a9e2924803af58d4cc`.
Auth checks covered pre-backup JWT rejection, fresh sign-in, previously revoked
membership, second-member access, foreign/anonymous denial, forbidden signed
URLs, exact durable import retry, immediate revocation with an unchanged JWT,
identity deletion retaining revoked attribution, reinvitation requiring new
explicit membership and live-session deletion. Final financial history parity
still held after identity recovery (only identity/membership/audit tables were
excluded from that final post-mutation comparison; all 48 matched beforehand).

Measured with Node monotonic timers: archive restore 19.701s; service startup
and session invalidation 57.063s; complete acceptance 28.486s; total 105.250s.
This measures local already-installed images and local available key/backup,
not host-loss recovery, operator response or off-device retrieval.
Exact final-head CI and archive identities belong in the external review
manifest to avoid a self-referential Git SHA.

## Remaining release gates

Proposed RPO 24h / RTO 4h and seven daily/four weekly retention require owner
approval and off-device testing. Local elapsed time is not a production RTO.
Hosting isolation/HTTPS, production SMTP delivery and recovery, admin MFA,
independent backup/key custody, failure alerts and a protected record of
revocations since the backup point remain unproven. A restored old backup
must not revive access revoked later; reconcile that record before real
service exposure. The checklist assigns each pending/blocked action.

Existing retained projects/volumes were not reset, stopped, restored or
deleted. Failed and successful synthetic lab resources are retained for
review under the runbook's explicit disposal procedure. Source ZIPs and
review evidence must exclude all lab files, keys, backups and tokens.
