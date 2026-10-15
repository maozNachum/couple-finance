# Private pilot backup, recovery and incident runbook

Scope: Task 15a **synthetic local lab only**. Read the readiness checklist
before introducing real data. None of these commands accepts a hosted URL or
adopts an existing Docker project. Never run reset, drop, prune, volume rm,
or a restore against `couple-finance`, `couple-finance-task14`, or any unknown
environment. Existing names are context, not proof of disposability.

## Prerequisites and operator boundaries

Use the reviewed source revision, Node matching `.node-version`, `npm ci`,
Docker Desktop Linux containers and the pinned CLI. The operator needs local
Docker privileges; these are effectively administrator privileges. Existing
app keys, Auth sessions, email links and financial records must not be
printed. Do not pipe full CLI status or raw Docker inspect/config to logs.
The tool suppresses raw CLI errors for that reason. Diagnose locally using
safe service status and fixed errors. Never share a private lab directory.

Use a separate encrypted disk or OS-protected directory **outside the Git
checkout** for backup artifacts. On Windows, first create a new directory
and restrict inherited permissions. Example for a new synthetic lab:

```powershell
$lab = Join-Path $env:TEMP ('cf15a-lab-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $lab | Out-Null
$operator = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
icacls $lab /inheritance:r /grant:r "${operator}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F'
New-Item -ItemType Directory -Path "$lab\source","$lab\target" | Out-Null
node scripts/recovery/operator.mjs prepare-source "$lab\source" 15621
node scripts/recovery/operator.mjs start-source "$lab\source"
```

On Linux use a new outside-checkout directory with `umask 077` and mode 700.
Only local Docker socket/named-pipe endpoints are supported. Connection
overrides are refused; do not unset an unexpected value without first
understanding why it is present. Ports 15621/15721/15821/15921 are bounded lab
choices, with DB at API+11 and mail at API+3. A collision fails; never stop an
unrelated service to free a port without separate ownership evidence.

Preparation checks absence of prior project containers/volumes, creates two
new local volumes with a random ownership nonce and records creation times.
It independently mounts each with `volume-nocopy` and verifies no entries.
The state file is a local operation record, not transferable authority to
adopt another environment. Labels, creation identity, attachment checks and
recorded immutable container IDs are also checked at operation time.

## Verification and creating a backup

The returned workdir is an ignored source copy with the same tests and
calculators. `address-transformations.json` enumerates only local project/port
substitutions. In that directory run the unchanged `npm run verify`, capturing
only the normal sanitized test output. With local resource contention,
`$env:VITEST_MAX_WORKERS='1'` limits file concurrency; no assertions, timeouts,
retries or standard CI settings change. Do not seed the recovery household
while that suite is running.

From the reviewed repository root, after the suite succeeds:

```powershell
node --test tests/tools/recovery.test.mjs
node scripts/recovery/fixture.mjs seed "$lab\source"
```

The seed requires an empty owned source, creates synthetic identities and
financial evidence through existing authorized application commands, and
records exact table digests, canonical calculations and private object
hashes. It then stops only its recorded source services, database last,
requires a clean PostgreSQL shutdown and archives all database and Storage
files. External tablespaces/symlinks are unsupported and refused. Source
remains stopped; no automatic cleanup occurs.

Artifacts: `backup.cf15a` (AES-256-GCM ciphertext), `recovery.key` (32 random
bytes), `state.json`, and `fixture-private.json` (synthetic verification
oracle and replay tokens). The latter two are private lab material. The
bundle contains a versioned manifest, image identities, migration versions,
object inventory and archive byte hashes; the whole payload is authenticated.
Reopening the ciphertext verifies the tag and both component digests.
An unauthenticated hash alone is not protection against malicious replacement.

For a genuine retention policy, move the key to separately controlled secure
custody and test retrieval by the authorized recovery operator. The lab
generates key and ciphertext together for the test; that arrangement and a
temporary directory are **not an approved real-data backup policy**.

## Actual captured scope and exclusions

The complete stopped PostgreSQL cluster contains all schemas, indexes,
sequences, constraints, functions, grants, RLS, database roles/password
verifiers, migration history, Auth identities/relationships, finance and
private records, immutable revisions/allocations, source authority, dated FX,
import provenance, receipts/audits, reconciliation claims/decisions, budgets,
obligations and their versioned links. The separate stopped Storage volume
captures bytes corresponding to database Storage metadata. Staging expiry is
preserved; recovery does not extend authorization or reconstruct previously
deleted raw files. Accepted import provenance remains even after raw expiry.

This is whole-cluster recovery on identical images, not selective household
export or logical managed-project migration. It excludes frontend builds,
repository history, container images themselves, Edge runtime caches,
container writable layers, Mailpit messages, host/Docker configuration,
external SMTP, DNS/HTTPS, platform configuration outside the cluster, external
secret custody and monitoring. Repository/config and exact image availability
are independent prerequisites. No provider data, hosted Vault encryption or
external integrations are claimed tested. Existing in-memory sessions and
uncommitted browser drafts cannot be recovered.

## Restore and acceptance

```powershell
node scripts/recovery/operator.mjs prepare-target "$lab\target" 15721
# Copy the exact newly returned project ID into the confirmation:
node scripts/recovery/operator.mjs restore "$lab\source" "$lab\target" 'RESTORE cf15a-RETURNED_ID-target'
node scripts/recovery/operator.mjs start-recovered "$lab\target"
node scripts/recovery/fixture.mjs verify "$lab\source" "$lab\target"
node scripts/recovery/operator.mjs status "$lab\target"
```

Restore requires authenticated complete backup, matching application/migration
source hash, available immutable images, exact confirmation and a newly
created EMPTY target with no attached container and no volume entries.
Tar members are checked before extraction; traversal, links and devices are
refused. No connection-string fallback exists. Intent changes to RESTORING
before writing. Any interruption or nonempty volume causes refusal on retry;
retain that target as failed evidence and prepare a different empty target.
Never edit phase/labels to force reuse.

The restored database starts alone. All recovered sessions, refresh tokens,
one-time tokens, PKCE flow state, MFA challenges and outstanding user email/
phone/reauthentication tokens are invalidated before API services start.
Financial records and membership are not repaired. Fresh sign-in is required.
Image mismatch, missing objects, SQL errors or parity errors are failures.
RESTORED_OFFLINE and VERIFYING are not success. Only the fixture's complete
financial, Storage and authorization checks may set VERIFIED.

The verification compares exact per-table canonical SHA-256 values and the
complete authorized graph, normalizing only the newly captured snapshot
timestamp. It executes the unchanged reporting, budgets, obligations,
forecast and Task 14 calculators and compares full deterministic outputs.
Real Auth/PostgREST/Storage requests test two household boundaries, second
member access, old sessions, revoked membership, denied signed URLs,
reinvitation and explicit new membership. Row counts alone never pass recovery.

## Private invitations and loss of access

For the lab, existing `local:admin` commands operate only in its transformed
workdir. Use synthetic `example.test` addresses and captured mail only.
Global signup/anonymous auth remain disabled. Invitation establishes Auth
identity, not membership. Provision membership explicitly after independently
verifying the intended recipient. Never authorize from editable metadata.

For a compromised account: verify the request through an independent channel;
revoke membership and live sessions, block the compromised Auth identity,
record the time and durable member ID in a protected incident record.
Do not delete financial history. Removing an Auth user retains the original
member attribution as revoked/unlinked. Authorized reinvitation produces a
new identity and requires explicit new membership; it cannot reclaim or
reassign the old member's history. Restoring a backup may predate revocations:
reapply independently recorded revocations **before releasing any real-data
recovery system**. Lost email access and infrastructure-admin MFA recovery
need separately tested production procedures; Mailpit does not prove them.

## Corruption, incidents and rollback

Stop writes by isolating the affected service through its established operator
control; preserve evidence and the current database. Record incident scope,
known-good backup time, suspected compromise and desired recovery point.
Do not overwrite the affected database or rerun imports to fill gaps. Restore
into a separately created isolated target, check financial/Storage parity and
authorization, and compare the recovery point with any later committed work.
An old backup can lose later legitimate changes; application rollback alone
does not reverse a schema/data migration. Escalate unexplained divergence to
the maintainer and household owners. No automatic rollback or cutover exists.

On credential/key compromise, treat backup confidentiality as compromised,
rotate through the authorized provider workflow, invalidate sessions and
review access. Encryption does not protect a bundle once its key is stolen.
On backup loss, use an independently held verified copy; if none exists,
report recoverability as blocked rather than reconstructing invented values.

## Retention and disposal

Proposed policy for approval: encrypted daily backup, seven daily plus four
weekly copies, a separate pre-maintenance copy, off-device storage, separate
key custody, monthly recovery test and explicit failure alerts. Proposed
RPO 24h/RTO 4h are unguaranteed objectives; no scheduler or monitor is created.
Raw staging normally expires after 24h, but bytes inside backups survive until
backup disposal. Approve that retention/privacy tradeoff before real intake.

Lab artifacts remain private and are not review-package attachments. There is
no automatic deletion command. Before manual disposal, enumerate exact lab
paths and nonce-labelled volume identities and confirm ownership, retention
requirements and that a required copy/key is not being destroyed. Never use
Docker prune or wildcard volume removal. File deletion on SSDs is not proof
of secure erasure; encrypted-volume key destruction requires a reviewed
retention decision and platform-specific procedure. Keep only sanitized
counts, timings, hashes and source/CI evidence in the independent-review ZIP.
