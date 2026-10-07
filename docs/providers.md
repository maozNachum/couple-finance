# Source and AI boundaries — future work

There are no provider adapters or external connections in Task 1.

Sources support MANUAL, FILE_IMPORT or LIVE_SYNC. Manual entries use canonical validated commands; they do not pretend to be network providers. Capability-based file/live adapters live exclusively under `supabase/functions/_shared/providers/<provider>/`.

Pipeline: raw input → provider validation → normalization → canonical validation → staging → identity/deduplication → reconciliation → deterministic categorization → atomic commit → derived-summary invalidation.

Provider-specific DTOs never enter the frontend or core model. Capabilities may include accounts, balances, transactions, pending transactions, obligations, holdings, historical snapshots and incremental sync. An adapter must report data dates and coverage honestly; not every institution supplies every capability.

Command keys, source IDs/aliases and reviewed duplicate candidates solve different problems. Fingerprints are not unique transaction identities. Pending-to-posted updates preserve identity when known; user category locks and notes survive refresh. CSV-to-live migration maps onto an existing account, reconciles overlap and records the balance-authority cutover.

Runs persist status, counts, lease, cursor, safe failure codes and attempts. Commit bounded batches; advance cursors after commit. Retry transient failures with bounded backoff/jitter; expired consent requires user action. Credentials are server-only. Restricted raw data is temporary; normalized provenance persists.

Open Banking, Fair and Harel access must be verified rather than assumed. Manual valuations and imports remain useful fallbacks.

AI is deferred. When introduced it runs server-side with controlled read-only tools, minimized inputs, computed evidence, validation and quotas. It receives no credentials, unrestricted SQL or execution capability. Deterministic rules precede AI. No transfers, payments, trades, withdrawals or automatic financial actions exist in this architecture.
