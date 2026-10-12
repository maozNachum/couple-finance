# Source and AI boundaries — future work

There are no provider adapters or external connections in Tasks 1–2. Task 2 defines portable source/provenance/ingestion identity contracts only; see [portable contracts](portable-contracts.md).

Sources support MANUAL, FILE_IMPORT or LIVE_SYNC. Manual entries use canonical validated commands; they do not pretend to be network providers. Capability-based file/live adapters live exclusively under `supabase/functions/_shared/providers/<provider>/`.

Task 4 now persists provider-neutral `finance.account_sources` relationships with dated authority, but adds no adapters or connection workflow. A future cutover attaches a new source to the existing account, reconciles overlap, and appoints an activation date. Read selection uses that source from activation onward; it never changes the account ID or silently fills missing observations with the prior source. See [Task 4 review fixes](task-4-review-fixes.md).

Future FX adapters normalize rate data to the canonical FxRate contract inside the provider boundary. An application use case will select the latest eligible rate for a requested reporting date, explicit pair and approved provenance policy, then invoke pure core conversion. Eligibility, source priority, revisions, stale/missing handling and authorization belong to that use case, not JSX or a networked core. Return the requested reporting date, balance measurement date and selected rate effective date separately. Current observation FX is immutable historical evidence and must never be silently replaced with the newly selected reporting rate. No live FX client, fixed production rate or unused provider interface is implemented now.

Pipeline: raw input → provider validation → normalization → canonical validation → staging → identity/deduplication → reconciliation → deterministic categorization → atomic commit → derived-summary invalidation.

Provider-specific DTOs never enter the frontend or core model. Capabilities may include accounts, balances, transactions, pending transactions, obligations, holdings, historical snapshots and incremental sync. An adapter must report data dates and coverage honestly; not every institution supplies every capability.

Command keys, source IDs/aliases and reviewed duplicate candidates solve different problems. Fingerprints are not unique transaction identities. Pending-to-posted updates preserve identity when known; user category locks and notes survive refresh. CSV-to-live migration maps onto an existing account, reconciles overlap and records the balance-authority cutover.

Runs persist status, counts, lease, cursor, safe failure codes and attempts. Commit bounded batches; advance cursors after commit. Retry transient failures with bounded backoff/jitter; expired consent requires user action. Credentials are server-only. Restricted raw data is temporary; normalized provenance persists.

Open Banking, Fair and Harel access must be verified rather than assumed. Manual valuations and imports remain useful fallbacks.

AI is deferred. When introduced it runs server-side with controlled read-only tools, minimized inputs, computed evidence, validation and quotas. It receives no credentials, unrestricted SQL or execution capability. Deterministic rules precede AI. No transfers, payments, trades, withdrawals or automatic financial actions exist in this architecture.

## Task 7 generic CSV adapter

`providers/generic-csv` implements the smallest `CsvPreviewAdapter` interface: a versioned adapter ID and bounded preview call. It accepts UTF-8 bytes plus explicit format/mapping and existing account currency. Raw rows and CSV quoting stay inside this adapter. Headers and optional reference/supplementary display values are untrusted text; there are no institution-specific header assumptions or tested claims about Otsar HaHayal/card providers. Future institution adapters must use real/representative fixtures and preserve these isolation and provenance boundaries.

Task 7 never commits, detects duplicates, appoints source authority or runs category rules. Every future import must reauthorize and reparse; browser previews cannot become trusted commit commands.
