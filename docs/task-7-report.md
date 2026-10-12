# Task 7 delivery — Secure CSV preparation, mapping and preview

Date: 2026-10-12. Scope is **Task 7 only**. PR #4 was verified merged at `7f12a0d6d4c182a22bfe50fd56d3b41912e79968`; exact post-merge master push [CI run 38161119861](https://github.com/maozNachum/couple-finance/actions/runs/38161119861) completed successfully before implementation. Remote master was fetched, local master fast-forwarded, and `feature/task-7-csv-import-preview` created from it. Applicable AGENTS.md and Tasks 2–6 architecture/delivery/decision/review documents were read. Read-only root AGENTS.md and synced sources were not modified.

## Delivered behavior

Hebrew RTL `/imports` lets an authenticated household member select an existing household/account/source, deliberately upload a CSV privately, choose its delimiter, map columns and interpret dates, decimals, signs and currency explicitly. Server-generated previews distinguish valid, invalid and unresolved rows, include exact logical record number and physical line range, and show aggregate counts. UI renders 25 rows per page. Source descriptions, filenames, references and supplementary text are rendered as React text, including formula-like or HTML-looking values.

There is no commit button, transaction import, duplicate detection, categorization persistence or ledger mutation. The interface states that actual import belongs to Task 8. Mapping changes invalidate the displayed preview; refresh clears preview/file data from memory. Cancel/delete reports success only after Storage removal and metadata cleanup. Lost upload responses are recovered by reloading the authoritative staging list; lost processing responses can retry without financial writes.

The selected source is existing context only. MANUAL source identity is neither renamed to FILE_IMPORT nor made authoritative by uploading a file. Task 8 must explicitly resolve import-source provenance before commit. No account identities, ownership, source authority, observations, opening balances, transactions/revisions/allocations, categories or historical locks are changed by preview. Integration tests compare populated retained financial history, including an explicit user category lock, before and after preparation.

## Parsing conventions and bounds

| Item | Implemented policy |
| --- | --- |
| Format | CSV only; UTF-8 with optional BOM, strict invalid-byte rejection. No Windows-1255, UTF-16, XLS or XLSX support |
| Delimiters | Explicit comma or semicolon; no heuristic guessing |
| Headers | First logical record required; blank and whitespace-equivalent duplicate headers rejected; mapping uses column positions |
| Quoting | Double quotes, escaped doubled quotes and multiline quoted fields; CRLF/LF/CR line counting; malformed/unclosed quotes and ragged rows rejected |
| Dates | Explicit YYYY-MM-DD, DD/MM/YYYY or MM/DD/YYYY, valid Gregorian dates; no locale/runtime-timezone interpretation |
| Decimals | Explicit `.` or `,` decimal separator; grouping NONE, `.` or `,`, distinct from decimal. Grouped integers require 1–3 leading digits then groups of exactly three |
| Signed amounts | Explicit positive-increases or positive-decreases convention. Optional leading `+`/`-`; no exponents, parentheses, trailing signs or currency symbols |
| Debit/credit | Two distinct mapped columns, unsigned magnitudes; blanks or zero allowed on unused side; two nonzero sides conflict. Explicit credit-increases or debit-increases convention |
| Currency | Fixed supported ISO code or a mapped currency column, exclusively. ILS/USD/EUR/JPY/KWD only, matching the selected account. Mixed/unsupported currencies produce row errors |
| Money | Existing exact core contract, at most 16 integer and eight fractional digits. No float conversion or implicit rounding, including excess trailing fractional zeros |
| Text | 2,048 UTF-16 units per cell; mapped description must additionally fit the canonical 2,000-character description; optional reference at most 200 |
| File/resources | 1,048,576 bytes, 2,000 data rows, 32 columns, 160-character filename; server enforced as well as frontend early checks |
| Requests | At most 8 KiB mapping request; 15-second Edge I/O deadline, bounded linear CSV scan; no input-derived remote requests |
| Retained staging | 20 records per household; 100 PROCESS authorization checks per file (a successful inspect/preview uses two, failed attempts can use one) |

Numeric/date cells are trimmed at their mapping boundary; descriptions and supplementary text preserve source text. Unknown financial effect is always UNCLASSIFIED, independent of sign. Empty/missing values are unresolved; invalid convention/value/currency conflicts are invalid. Whole-file structural/resource failure returns a fixed SafeError with an allowlisted diagnostic code, never raw exceptions. No records are silently truncated. No CSV export is provided, so no formula-bearing CSV output is emitted. A future export must implement spreadsheet formula-injection protection separately.

The adapter is generic and tested with synthetic representative CSV only. No particular Israeli bank or credit-card export is claimed supported. No live provider, AI, financial transfer, report, budget, dashboard or production deployment was added.

## Architecture, schema and compatibility

- One new exact `contracts/import-preview` alias exposes strict ES-only runtime-independent DTOs. Mapping fields/counts/nullable row values are deliberately different from canonical Transaction. Alias policy, TypeScript and portable Deno configuration remain aligned. Original canonical financial contracts are unchanged.
- `providers/generic-csv/adapter.ts` owns raw rows, decoding and parsing behind a small versioned adapter interface. It reuses the existing Money/date schemas and exact sign negation. No provider code enters the browser bundle or pure core.
- The `import-preview` Edge Function owns bounded request/download orchestration. It uses the caller's JWT, never a service role, to authorize PROCESS, download the database-generated exact path, parse and reauthorize before returning. Parsed rows and mapping are not persisted in the database or browser storage; Task 8 must reparse immutable bytes and retain durable provenance explicitly.
- CLI-created forward migration `20261012054500_task7_import_preview.sql` adds `finance.import_uploads`, `private.import_audit`, the private bucket and curated RPCs. All earlier merged migrations remain unchanged. Only `api` is exposed; `finance` and `private` remain unexposed.
- Staging RLS, restrictive household/account/source/member composite FKs, generated object paths, no direct client DML and narrow private fixed-search-path commands protect ownership/context. API wrappers are invokers. Authorization reads live Auth sessions/users and active database membership, including on retries.
- Existing local Supabase Storage and Edge runtime are enabled. No packages or framework dependencies were added or upgraded; existing pinned Zod/decimal packages are mapped explicitly for the Edge function. The existing CI verification command now includes provider and Storage/API tests.

## Storage, lifecycle and retention

The bucket is private and limits each object to 1 MiB/text-csv. Names stored by users are display data only; actual object paths are generated from household/upload UUIDs and checked against database records. Operation-aware policies authorize standard upload, list/authenticated GET and deletion separately. There is no object UPDATE policy. Cross-household/forged paths, traversal, replacement, move/copy, signed upload and signed download operations are denied.

Lifecycle: local selected → database AUTHORIZED → immutable object UPLOADED → in-memory processing/mapping-required/validated-preview or validation-failure. Metadata derives EXPIRED at 24 hours and persists CANCELLED explicitly. An incomplete upload remains cancellable. Repeated authorization with identical identity/payload returns its original record; mismatched reuse conflicts. Processing has a bounded counter and no financial receipt or commit semantics.

Cancellation and expiry immediately deny upload/download/process while allowing deletion-only access through the Storage API. Raw object insertion/removal and staging actions write minimal private audit containing context/actor/action/time, not contents, filenames, amounts or tokens. Metadata is forgotten only after the object is absent. A failed removal retains metadata so cleanup can retry; uncertain final responses require refreshing the staging list.

`npm run local:cleanup-imports` is an operator-only loopback-verified tool. It processes at most 100 expired/cancelled records, checks exact stored path identity, removes objects using the Storage API, then deletes only eligible metadata with no remaining object. It preserves unrelated active uploads and financial history. Audit retention is 30 days. Expiration is **not** a promise of automatic physical deletion: production scheduling, backups and operational alerting are deferred with deployment. Users can cancel/delete explicitly now.

Signed URLs are deliberately denied, even for authorized members. A short-lived signed URL would remain a bearer capability until expiry and would not recheck membership revocation. This implementation uses authenticated reads instead. Already downloaded or rendered bytes cannot be remotely recalled; active authorization applies to subsequent requests. There is no persistent browser financial/session storage.

## Verification

The complete `npm run verify` chain exited **0** after replaying all six migrations on the verified disposable loopback stack. Before reset, checks confirmed no remote project link and no non-synthetic users/households; only synthetic fixture leftovers existed. No real/non-disposable data was reset. Logs and screenshots remain ignored under `.artifacts/task7-*`.

| Check | Exact result |
| --- | --- |
| TypeScript, ESLint, architecture boundaries | Passed |
| Vitest | 300 tests, 9 files passed |
| Cached-only permission-free Deno core/runtime | 206 passed |
| Permission-free Deno CSV adapter | 15 passed |
| Edge Function typecheck | Passed |
| Production build and portable browser probe | Passed |
| Desktop/mobile shell and four-timezone portable Chromium | 12 passed |
| Real PostgreSQL pgTAP/RLS | 372 assertions, 6 files passed |
| SQL lint / security advisors | No schema errors / no issues |
| Real Auth/API regression | 33 assertions passed |
| Accounts API regression | 33 assertions passed |
| Transactions API regression | 118 assertions passed |
| Categorization API regression | 70 assertions passed |
| CSV/Storage/API integration | 91 assertions passed |
| Authenticated desktop/mobile Chromium | 14 tests passed |
| Migration replay | All six migrations replayed successfully |

Provider cases cover Hebrew/BOM/quoting/multiline attribution, both delimiters, explicit date/decimal/sign rules, precision/overflow, missing/conflicting mapping, debit-credit conflicts, mixed currencies, malformed/truncated/oversized files and inert HTML/formula/URL content. Four portable preview-contract cases run unchanged in Vitest, Deno and Chromium.

Storage/API tests use two independent households and actual anonymous/authenticated calls, not service-role assertions alone. They cover forged context/paths, replacement, signed URL denial, concurrent retries, actual byte/row/cell/column bounds, processing/household quotas, cancellation, expiry and cleanup, unchanged JWTs after member revocation, deleted sessions/users and unchanged retained financial history/category locks. Browser stories exercise lost upload and processing responses, explicit mapping, line-level errors, preview invalidation, cancellation, empty local/session storage, RTL, no viewport overflow and axe accessibility.

After the complete chain, final household/context labels were checked again with TypeScript/lint and the CSV desktop/mobile browser flows. Screenshots are reviewed for Hebrew RTL, spacing, clipping and overflow. Remote PR CI is verified separately against the pushed commit; it is not inferred from local success.

Resolved development failures: missing explicit dynamic label associations in the browser test, a test audit count that initially included prior synthetic fixtures, cleanup missing the new staging FK, and provider Deno configuration needing TextDecoder declarations separately from the ES-only financial core. No existing security assertions were disabled or weakened.

## Limits and handoff

The existing non-failing Vite main-bundle size warning remains (about 687 kB for the authenticated build), as do terminal color warnings. Browser verification covers Chromium desktop/mobile emulation. Production scheduling/backup retention, real-bank format certification, non-UTF-8/Excel support and durable import provenance beyond staging expiry are not implemented or claimed. All requested local verification types were available.

No implementation decision blocks Task 7 review. [Task 8 prompt](task-8-prompt.md) explicitly addresses reauthorization/reparsing, source identity, durable provenance, idempotent commit, duplicate review, cleanup/commit races and historical category-lock preservation. Stop after this PR; do not merge or deploy automatically.
