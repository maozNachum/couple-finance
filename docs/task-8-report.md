# Task 8 delivery — Secure import commit, duplicate review and durable provenance

Date: 2026-10-13 (independent review fixes). Scope: Task 8 only. Task 7 PR #5 was verified merged at `f95767844f34209fb4ca57b89cf8cbd01b140dec`; exact master push [CI run 38276792541](https://github.com/maozNachum/couple-finance/actions/runs/38276792541) succeeded before implementation. Remote master was fetched, local master fast-forwarded and `feature/task-8-import-commit-dedup` created. Applicable AGENTS.md, architecture/security/model/provider/portable/roadmap and Tasks 2–7 reports/decisions/review fixes were read. Read-only root instructions and synced sources are unchanged.

## Delivered workflow

The existing `/imports` upload, explicit mapping and preview remain. A separate server review reparses the original private CSV and displays all valid/invalid/unresolved/exact-prior-import/candidate rows. Inclusion defaults to false. Users choose each accepted row, its independent financial effect and POSTED/PENDING status, acknowledge candidate warnings and confirm a summary explicitly labelled financial persistence. Unknown meaning stays UNCLASSIFIED; neither sign nor category rules infer meaning. No opening, category, opposite-account movement or reconciliation is created.

The confirmation/result identifies household, selected account, file fingerprint, resolved FILE_IMPORT source and review. Success appears only after a committed server result. On uncertain delivery, row decisions are frozen and the exact command remains in parent page memory for retry. Ordinary focus revalidates access and preserves that same command/review; confirmed access loss or sign-out clears protected state. Explicit refresh loads durable evidence and clears memory; file/context/mapping changes invalidate review. Rows render in pages of 25 without dropping source rows. The RTL desktop/mobile interface has native labelled controls, explicit duplicate reasons, candidate references and truthful committed/skipped/invalid/unresolved counts. No authenticated financial/session/upload data is written to browser persistent storage.

## Server authorization and provenance

`import-commit` uses the original reviewed `generic-csv-v1` adapter, not a new parser. It accepts only a review request or review-ID/decisions command, never browser rows, amounts, account/source/path/hash overrides. Current session and active membership are verified in the database; upload/account/source eligibility and immutable object size/path are checked. Original bytes are downloaded with the caller JWT and reparsed under complete stored options (adapter plus explicit version 1, mapping and format). Server SHA-256 binds exact bytes and the full interpreted preview, including row coordinates, issues and counts. Commit reparsing must match the review hash and version/options exactly.

An authorized non-authoritative FILE_IMPORT relationship is resolved under the existing account lock. MANUAL stays distinct; account ID, household/member ownership, dated authority, observations and FX evidence are preserved. No imported source is appointed as a balance authority. Generic CSV has no certified bank external ID semantics: references remain source-scoped evidence, not forced uniqueness constraints. LIVE_SYNC/unsupported source contexts cannot become file commits. A server-only account binding pins the exact generic CSV relationship, with an operator-controlled enabled flag. An explicitly selected FILE_IMPORT source must equal that binding. Disabled or authoritative relationships reject new work; existing authorized receipts remain recoverable. No provider consent workflow is introduced.

Durable jobs retain byte/preview fingerprints, `generic-csv-v1` and exact mapping/format options, counts and uploader/committer durable member FKs. Immutable accepted rows retain logical row, physical line range, interpreted row digest, adapter-interpreted source description/reference, explicit decision and transaction/revision/ingestion-item IDs. Canonical financial content stays in existing revisions/allocations. Supplementary cells and full raw CSV are not retained. Existing canonical description trimming remains; the adapter-interpreted source description is retained separately as evidence. Auth user/session deletion revokes access and preserves member attribution and accepted evidence.

Temporary uploads remain removable after 24 hours/cancellation. Accepted jobs/rows/receipts have no cascading upload FK and survive raw deletion. Abandoned review metadata is removed when staging metadata is forgotten/cleaned. No permanent public or signed URLs are introduced.

## Duplicate rules and limitations

Command idempotency and financial duplicate review are separate mechanisms. The interface distinguishes exact prior source identity, strong similarity (same reference or financial values) and weak similarity (date/amount or in-file repetition). Similarity is not expressed as probabilistic certainty.

| Evidence | Behavior |
| --- | --- |
| Same account/source, byte hash and logical source row, same interpreted row digest | Exact prior import; inclusion blocked |
| Same original file row with a changed interpretation | INTERPRETATION_CHANGED; blocked, cannot evade identity by changing signs/mapping |
| Equal nonempty, non-whitespace-only source reference within actual FILE_IMPORT source | Possible candidate requiring acknowledgement |
| Same original date, exact signed amount/currency and normalized description | Possible financial-values candidate requiring acknowledgement |
| Same date and exact signed amount/currency with differing description | Weak possible candidate requiring acknowledgement |
| Repeated date/amount/currency within this file | In-file warning requiring acknowledgement; distinct physical rows can both be accepted |

Description normalization reuses documented v1: ASCII case folding and ASCII whitespace collapse; other characters/punctuation remain unchanged. Current non-VOIDED manual/import transactions in the same account participate. Different files can flag the same underlying movement. Exact prior evidence remains blocked even if its financial transaction was subsequently corrected or voided; users correct retained history instead of silently recreating it. Candidate lists display up to 10 transaction IDs and the full candidate count explicitly. No cross-account matching or automatic suppression/overwrite is performed.

False positives are expected for legitimate identical purchases, repeated references or recurring amounts. False negatives remain possible when date, amount, description or reference differs. There is no bank-specific identity certification, Unicode/fuzzy/AI matching or automatic reconciliation.

## Atomicity, idempotency and races

One review consumes one atomic batch of 1–100 explicitly selected rows. Decisions cover every parsed logical row, including exclusions. Larger files can be reviewed again for remaining rows while raw authorization remains valid; each batch has its own durable result. No partial success is reported. A late failure rolls back canonical transactions, allocations, accepted evidence, receipts and audits together. A retry after rollback can use the same key.

PostgreSQL derives SHA-256 over the normalized complete command and stored household/account/source/content/preview/adapter/options context. Browser hashes do not authorize persistence. Keys are scoped to household/account/actual FILE_IMPORT source. Ordered row decisions are normalized on the server; JSON object key order is immaterial. Exact committed retries freshly authorize and return the original result before requiring raw bytes or active account status. Key reuse with a changed review/selection/effect/status/acknowledgement conflicts. Another key cannot consume an already committed review. Household/account locks plus the database history digest reject stale or incompatible review decisions; concurrent identical commands return one durable receipt and create one batch.

The narrow server-only parser-result RPC is invoker-facing; its private fixed-search-path handler derives actor/session from the stored lease, never a caller-supplied actor. It checks live Auth/membership and holds SHARE locks on the actual user, session and active member while writing, ordering persistence with revocation/deletion. The existing Task 6 financial writer is reused internally. Its two-argument import capability is not executable by authenticated/service-role clients. Public financial creation remains MANUAL; authorized corrections/category commands preserve FILE_IMPORT provenance and historical category metadata. Stored readers/ledger validation recognize genuine account FILE_IMPORT relationships and retain unknown/incomplete opening semantics.

Preparation/commit has a 45-second nonrenewable lease, at most eight simultaneous leases per upload and the existing 100 processing-check budget. New work rejects expired/cancelled/cleanup-reserved uploads and archived accounts. An acquired lease allows only its actor/session to read original evidence across the upload expiry boundary. Cancellation and forgetting return CONFLICT while a lease is active; once released/expired, cancellation wins and no new commit can start. Finalization re-reads and locks the source-bound lease after acquiring the upload lock; release takes that same lock, so an already-started finalization cannot use a released cached token. Cleanup reserves eligible upload metadata under lock before using the privileged Storage API, so it cannot delete evidence needed by an active commit or allow a new lease during deletion. The Edge I/O deadline is 15 seconds; finalization declares a 20-second SQL timeout and verifies lease time before success, rolling back expired work. No lease is extended to resurrect cancellation.

## Security and compatibility

Three forward migrations are CLI-created: `20261012180706_task8_import_commit.sql`, `20261012204927_task8_review_hardening.sql`, and `20261012215904_task8_independent_review_fixes.sql`. All six merged migrations and both previously pushed Task 8 migrations are unchanged. The hardening migration backfills only unambiguous job source identities and refuses an upgrade during active leases or conflicting source history rather than rewriting financial provenance. Forgotten upload IDs referenced by durable jobs cannot be reused. RLS, household-scoped restrictive source/account/member/transaction/revision/job FKs, invoker APIs and least privileges apply to evidence. Private leases/receipts/audit and finance remain unexposed. Duplicate searches are explicitly household/account/source-scoped; no foreign financial records/hashes/receipts are returned. Audit contains context/action/actor/time, not financial descriptions, amounts, raw bodies or credentials. Financial revisions/provenance cannot be directly mutated by browser roles.

One exact ES-only portable alias adds import review/commit/result contracts; architecture policy, TypeScript and Deno maps stay aligned. Stored revision and ledger source validation intentionally extend MANUAL-only assumptions without rewriting old records. The transaction correction form preserves the original provenance. No dependencies or CSV adapter implementation changed.

## Verification

The full verification chain passed on the final hardened implementation after all nine migrations replayed on the empty verified disposable loopback database. No real/hosted database was reset. The local reset refuses any Auth users/households or a remote project link. Synthetic fixtures delete only their generated households.

| Check | Result |
| --- | --- |
| TypeScript, ESLint, architecture | Passed |
| Vitest | 305 tests, 9 files passed |
| Permission-free cached-only Deno core/runtime | 210 passed |
| Permission-free CSV adapter Deno | 15 passed |
| Preview and commit Edge typechecks | Passed |
| Production build / portable browser probe | Passed |
| Desktop/mobile shell and four-timezone corpus | 12 passed |
| Real PostgreSQL pgTAP/RLS | 401 assertions, 7 files passed |
| SQL lint / security advisors | No schema errors / no issues |
| Real Auth/API regression | 33 assertions passed |
| Accounts regression | 33 assertions passed |
| Transactions regression | 118 assertions passed |
| Categorization regression | 70 assertions passed |
| Existing CSV/Auth/API/Storage regression | 91 assertions passed |
| Import commit/Auth/API/Storage adversarial integration | 195 assertions passed |
| Authenticated desktop/mobile Chromium | 20 passed |
| Migration replay | Nine migrations replayed |

Portable additions cover strict commands/batch bounds, genuine FILE_IMPORT source validation, exact eight-place ledger effects, missing openings and immutable source lineage. Integration covers forged/foreign/anonymous requests, direct parser-RPC denial, invalid/unresolved/mixed currencies, modified mapping/version/context, repeated legitimate rows, manual/cross-file candidates, five identical concurrent requests, incompatible commands, changed-key payloads, stale history, exact reimport, network-result recovery, late injected failure/rollback, expiry/cancellation/cleanup leases, archived accounts, unchanged revoked JWTs, deleted sessions/Auth users and stable attribution. Existing transaction/category-lock regressions remain enabled.

Browser stories include explicit exclusion/default unknown meaning, pending status, required warning acknowledgement, actual confirmed counts, frozen uncertain commands, a lost committed response, exact retry, evidence after raw deletion, unknown opening, posted-only ledger calculation and FILE_IMPORT correction with retained history. Desktop/mobile axe checks, no-overflow checks and empty local/session storage pass. Screenshots were inspected for RTL layout and clipping. Logs/screenshots stay ignored under `.artifacts/task8-*`.

The readiness follow-up additionally verifies source pinning despite a lower alternate UUID, explicit source mismatch, disabled-source receipt recovery, versionless stale review rejection, forgotten-ID reuse rejection, Unicode description compatibility, third-row injected rollback, and a real finalization waiting on a household lock while lease release wins. Browser stories verify that mapping changes remove the review before rebuilding it. Submission uses a synchronous guard; definite authorization/validation/conflict rejection requests a refreshed review, while uncertain delivery preserves the exact retry command. Native checkbox layout and evidence-strength labels were improved. After the full chain, the final checkbox class adjustment was checked with a rebuilt browser app and all four desktop/mobile import stories; no financial or server code changed.

## Remaining limits and handoff

No deployment, live provider, AI, reconciliation, investment analytics, budget/forecast/dashboard/reporting or financial execution was implemented. Production cleanup scheduling/backup/purge policy remains deployment work; retained financial evidence is deliberately not automatically purged. Browser coverage is Chromium desktop/mobile emulation, not physical devices/all engines. The existing non-failing Vite bundle-size and terminal-color warnings remain. Complete-history generation checks conservatively invalidate reviews even for category-only edits; large-scale history/evidence pagination is future work. No server key is in frontend code or the browser bundle.

The feature branch is committed/pushed and its PR targets master; it must remain unmerged for independent review. Remote PR CI is tracked separately and is not inferred from local success. [Task 9 prompt](task-9-prompt.md) is prepared for explicit transfer/card/loan reconciliation only. Stop after Task 8.

Implementation references: [Supabase database function privileges](https://supabase.com/docs/guides/database/functions), [Storage access controls](https://supabase.com/docs/guides/storage/security/access-control), [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html).


## Independent review fixes

PR #6 identified false reference candidates for blank cells and loss of an uncertain command on ordinary focus refresh. Both are addressed without modifying previously pushed migrations, introducing another PR or extending Task 9. The forward SQL changes only three reference-evidence predicates: blank/null/Unicode-whitespace-only references are absent evidence, usable references remain exact, and durable original text plus independent financial-value predicates are preserved. The parent retains the exact uncertain command in memory while focus revalidates live household/account/source access. Confirmed sign-out/revocation clears protected state; explicit resets/navigation/reload discard memory and require durable-evidence recovery/fresh review.

Expanded real Auth/Edge/PostgreSQL tests cover six reference cases, counts/IDs, original text and independent financial matching. Desktop/mobile browser scenarios compare identical COMMIT payloads after a real tab round trip, retain the original ledger/evidence story, and verify global sign-out from another authenticated tab and unchanged-JWT revocation clear protected content. No persistent browser storage is introduced. Exact changed files, SQL, results and limitations are recorded in [Task 8 review fixes](task-8-review-fixes.md).
