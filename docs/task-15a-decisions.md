# Task 15a decisions

Baseline gate passed before branch creation: fetched `origin/master` at
`29c3622bf79d27411f81ad4eb341eadc26184b7c`. PR #14 is merged at that exact
SHA. Authenticated Edge inspection of [post-merge push run 38642294172](https://github.com/maozNachum/couple-finance/actions/runs/38642294172)
showed Success, master, the full matching commit hyperlink, 14m37s duration
and successful verify (14m33s). GitHub connector returned 404; success was
observed in the authenticated browser, not inferred. Working tree was clean.
Branch: `feature/task-15a-private-pilot-recovery`. Root/scoped instructions,
architecture, security, data model, providers and Task 1–14 decisions/reports
were read. Historical migrations and synced references are immutable.

## Bounded recovery choice

Use a **local synthetic lab cold physical backup**, not a hosted-project
backup service. PostgreSQL documents whole-cluster filesystem backup only
with a stopped database (or coordinated filesystem snapshots). Docker
documents volume archive/restore. Stop every service of the newly owned
source before stopping its database; require `pg_controldata` clean shutdown,
reject external tablespaces, capture complete database and Storage volumes.
This avoids partial logical exports of managed Auth/Storage schemas and
preserves grants, policies, roles, migrations and all financial evidence.
It requires identical platform images and downtime. It is not portable to
managed Supabase, a different PostgreSQL major version or architecture.

Supabase CLI 2.120.0/Node 22.14.0 are installed; start/help was inspected.
No upgrade is part of this task. Existing `couple-finance` and
`couple-finance-task14` containers/volumes are retained/unknown and must not
be backed up, stopped, reset or cleaned by these tools. A new random project,
new labelled volumes, recorded immutable container/image IDs, local Docker
endpoint, creation evidence and actual empty-volume checks establish scope.
A name, environment variable or `.test` address alone never establishes it.

The tool offers no adoption, destructive reset, database URL, arbitrary
destination, automatic deletion or browser endpoint. Every restore writes
intent before its first byte; interrupted/failed targets cannot be reused.
Encrypted authenticated bundles are written outside the repository. The
operator protects the directory with OS ACLs and separates the key for
retention. The automated lab initially generates the key beside ciphertext;
this is explicitly not a production key-custody arrangement.

Recovery initially starts the database only, invalidates restored sessions,
refresh tokens and outstanding email-link tokens, then starts API services.
Fresh authentication and existing relational membership are both required.
Backups can predate revocations: reconciliation against a separately protected
incident/revocation record remains a release prerequisite, never automatic
reactivation. No membership is silently repaired or financial evidence rewritten.

## Pilot architecture and threat model

Two explicitly invited members share household visibility; allocation
ownership attributes values without granting narrower visibility. Frontend
holds public configuration and memory-only sessions. Auth identifies the
caller; live database checks and ACTIVE membership plus RLS authorize each
request. Private Storage paths use the same authorization. The operator is
privileged and must have separate, protected infrastructure credentials.

Risks and controls: stolen sessions require live revocation; compromised
email requires independently verified recovery and new explicit membership;
tenant confusion requires real cross-household API/Storage denial tests;
operator mistakes require newly created empty targets and identity checks;
corruption requires authenticated encryption plus full restored parity;
missing objects require object-by-object hashes, not row counts; backup loss
requires an independently accessible encrypted copy and separate key custody;
host loss requires tested off-device recovery. Local development services
and default keys are not a secured hosting plan. Host/Docker administrators
remain trusted and can bypass local tooling. Docker mounts and OS paging may
contain plaintext; encryption of the artifact is not full-disk encryption.

No hosting, SMTP delivery, monitoring, paid service, real invitation or real
data is authorized here. Proposed pilot RPO: 24 hours, with an additional
backup before maintenance; proposed RTO: 4 hours after access to a verified
backup, keys and compatible infrastructure. These are objectives, not SLAs
or measurements. Real pilot readiness remains blocked pending secure hosting,
email/recovery, off-device key/backup custody and measured recovery there.

References: [PostgreSQL cold backups](https://www.postgresql.org/docs/17/backup-file.html),
[Docker volumes](https://docs.docker.com/engine/storage/volumes/),
[Supabase backup scope](https://supabase.com/docs/guides/platform/backups),
[logical migration caveats](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
The official changelog was fetched; recent managed HTTP TLS deprecation does
not change this pinned local cold-backup approach. No managed backup guarantee
is inferred from those documents.
