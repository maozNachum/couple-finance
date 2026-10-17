# Task 16b — historical FX intake design review

Status: narrow implementation approved by the user's conditional approval.
The approved missing-only manual writer, forward security migration and focused
quality-screen intake are implemented. General FX correction, ambiguity
selection and external providers remain excluded. Verification is recorded in
the report and exact-head external review manifest.

## Verified baseline

Fetched origin/master on 2026-10-16. Exact full SHA:
`cd2659ef01583017d783414a84761a978f6f7b5c`.
[PR #17](https://github.com/maozNachum/couple-finance/pull/17) is merged at that SHA.
[Post-merge run 38911752601](https://github.com/maozNachum/couple-finance/actions/runs/38911752601)
was independently read through GitHub REST: `push`, `master`, exact SHA,
`completed/success`, attempt 1, updated `2026-10-16T14:09:25Z`.
Initial working tree was clean. Branch
`feature/task-16b-historical-fx-evidence` starts from this verified master.
Read root/src/supabase instructions, architecture, security, data model,
providers, portable FX contracts, Task 4 source-authority decisions/review
fixes, Task 16a decisions/report and the repository Task 16b prompt.
The attached user prompt is the controlling scope and approval boundary.

## Bounded audit and shortest existing recovery

| Area | Existing behavior and consequence |
| --- | --- |
| FX contract and pure conversion | `contracts/fx.ts` and `domain/money/fx.ts`: 1 base unit = rate quote units. Exact positive decimal string; direction and effective date must match. No inversion or fallback. |
| Observation intake | `ObservationForm.tsx` supplies MANUAL origin using the account's manual source; effective date is the observation date. `api.record_balance` retains a measurement, not a standalone rate. Its trigger inserts/reuses the exact immutable FX snapshot. |
| Observation valuation | `valueAccount` uses only the selected observation's embedded rate. A registry rate does not attach itself to a missing-FX observation. A genuine manual observation correction must explicitly retain its original measurement/date/coverage and give a correction reason. |
| Reporting | `reportingConversion` selects all household rates with exact pair/date; zero is MISSING_FX, more than one is AMBIGUOUS_FX, even if numerical values agree. Monthly allocations use transactionDate, not valueDate or requested asOf. Positions use requested asOf, not observation measurement date. |
| Reconciliation | Existing UI explicitly selects household rate ID; preview and SQL require exact payment transactionDate and direction. LINK/REPLACE snapshots that ID. This approved selection affects only the relationship; it cannot resolve reporting ambiguity. |
| Data quality | `financialDataQuality` already groups pair/date with affected revisions, accounts and modules. Transaction/report FX findings have no action; manual missing-observation-FX findings can lead to accounts. Wrong-day/direction evidence is not explained beside the finding. |
| Read boundaries | `reporting_snapshot` and `reconciliation_snapshot` include household registry rates under RLS. Accounts load embedded observation rates, not the independent registry. Existing bounded snapshots suffice for diagnostic UX; no read RPC is needed. |

Shortest legitimate recovery:

1. Reevaluate the authorized report. If exactly one retained household rate is
   eligible, reporting already uses it without a new write or selection.
2. For a relationship needing conversion, explicitly choose an existing eligible
   rate in reconciliation and preview/confirm through its existing command.
3. If a genuine OBSERVED measurement exists for the needed day and pair, its
   normal entry or reasoned correction can retain manually declared FX. That
   evidence becomes reusable in reporting. Do not manufacture a measurement,
   amount, account or coverage assertion merely to insert a rate.
4. With no genuine matching observation/evidence, there is no supported
   standalone intake path. With competing rates, reporting has no approved
   selection/correction contract. A new rate is not a safe remedy for ambiguity.

## Baseline authorization gap (static source evidence, now closed for client intake)

Before Task 16b, the forward Task 4 migration granted authenticated SELECT/INSERT on
`finance.fx_evidence`; RLS checks `private.is_household_member(household_id)`.
That helper includes a live Auth user/session and ACTIVE membership check.
`private.guard_fx_evidence` validates snapshot shape, UUID syntax, pair, positive
18/12 decimal bounds, financial date and nonfuture recorded timestamp. It does
**not** look up `origin.sourceId`, check source household/kind, or require an
authorized ingestion origin. An invented UUID or foreign source UUID with a
declared LIVE_SYNC/FILE_IMPORT kind is not disproved by this guard.
`validateReportingContext` also validates household and unique rate identity,
not source provenance. Canonical parsing cannot establish source authorization.

The table is unexposed (`config.toml` exposes api only), so these grants do not
establish a standalone REST table endpoint today. Nevertheless the invoker
observation trigger inserts the submitted FX into this registry, and
`api.record_balance` accepts the embedded snapshot without that origin lookup.
The browser form's correct MANUAL default is not a server security boundary.
This is a source-attribution weakness, not evidence of a cross-household row
read or a demonstrated database exploit. Existing row RLS and composite
observation/reconciliation references still protect household containment.

Updates are rejected, authenticated UPDATE/DELETE are not granted, and reuse of
an existing rate ID with different JSON is rejected by the observation trigger.
But direct evidence INSERT has no standalone command receipt or FX audit
trigger. Observation inserts have observation audit, not a separate FX command
receipt. Caller-provided recordedAt is currently bounded, not server-generated.
The existing INSERT grant was insufficient for the client workflow. The new
forward migration revokes it without modifying the Task 4 migration or retained
snapshots. Privileged synthetic/legacy fixture setup is not a client API.

## Final approved contract

One create-only `api.record_manual_fx(payload)` invoker wrapper, calling a narrow
private fixed-search-path handler, following existing financial command patterns:

```ts
type RecordManualFx = {
  householdId: UUID;
  sourceAccountId: UUID;
  id: UUID;                  // stable evidence identity generated once per intent
  idempotencyKey: string;     // existing 16–128 ASCII command-key contract
  base: CurrencyCode;
  quote: CurrencyCode;
  rate: string;              // positive exact decimal, <=18 integer/12 fractional
  effectiveDate: FinancialDate;
  acknowledge: true;         // explicit user declaration, no external verification
};
// Success: {ok:true,evidence:{householdId,rate:FxRate}}; existing SafeError on failure.
// Server derives origin from the stored source and recordedAt from server UTC.
```

Do not accept origin kind/sourceId, actor, recordedAt, arbitrary metadata,
verified flags, inverse rates or a replacement ID from the browser.
Require an ACTIVE source account in the authorized household with base currency
and quote valuation currency matching the request. Derive its existing MANUAL
source ID. Source account is attribution context, not ownership of the reusable
household rate. No source creation, activation or account rewrite occurs.
This restriction deliberately limits the first writer to supported account pairs.

Forward migration `20261016144109_task16b_manual_fx_evidence.sql`:

- Retain immutable `finance.fx_evidence` identity/snapshot and existing references.
  Add private scoped receipts and minimal audit; no new rate engine or public table.
- Revoke authenticated direct evidence INSERT. Introduce one private evidence
  insertion helper used by the new handler and the existing observation trigger.
  Merely revoking INSERT would break the invoker observation writer; both changes
  must ship atomically and be tested together.
  The observation trigger must become a narrow SECURITY DEFINER with an empty
  search path and explicit live actor/household/source validation before any
  privileged lookup/insert; otherwise its current invoker role cannot call a
  private helper after EXECUTE/INSERT revocation. Trigger invocation itself does
  not require exposing the trigger function or helper as a client RPC. Keep
  table RLS/composite checks, observation shape/date/account validation and
  immutable-ID comparison in addition to the explicit trigger authorization.
- Harden NEW evidence from client observation intake as well: its origin must
  reference an existing same-household MANUAL source with matching stored kind.
  The observation's own account validates the FX pair and measurement date;
  the origin's account need not be the balance-source account or share its pair.
  The rate origin may still differ from the observation's balance source.
  Do not grant the new endpoint permission to declare FILE_IMPORT/LIVE_SYNC.
  Existing identical snapshots may be referenced without rewriting/reclassifying
  legacy provenance; their historical kind alone must never be labelled verified.
  Existing provider commands currently create no FX; future provider FX requires
  its own authorized path. No bulk provenance cleanup/backfill is proposed.

## Safeguards and affected invariants

| Threat or invariant | Implemented safeguard |
| --- | --- |
| Live authorization/revocation | Reuse established database-backed live user/session/ACTIVE member checks before insert AND receipt replay. Coordinate locks in existing household -> Auth user -> session/member -> account order, including observation-trigger entry before its current account lock. Revocation and writes must serialize; a revoked request cannot reuse a receipt. Explicitly test concurrent revocation. |
| Household and source spoofing | Look up household/account/manual source in trusted rows; enforce same-household context and source kind at every new client insertion boundary. ID validation or a route hint is never authorization. Internal lock/insertion/trigger helpers have no PUBLIC/anon/authenticated EXECUTE. As in existing financial commands, authenticated EXECUTE on the independently authorized private command handler is necessary for the invoker API wrapper; private is unexposed. |
| Definer privilege | Empty search path, no dynamic SQL, explicit actor/session/context checks, least privilege and no raw table writes from browser. Validate observation path after evidence INSERT revocation. |
| Precision | Existing canonical validation plus independent raw SQL validation before numeric casts. Reject overflow, JSON numbers, zero/negative/unsupported/same-currency rates and excess precision; no implicit rounding of the submitted rate. Keep 8-place HALF_UP conversion. |
| Duplicate/uncertain delivery | Household + key receipt with complete submitted JSONB payload SHA-256 and stored immutable response. Browser contracts normalize decimal text before submission; SQL digest preserves the complete submitted value and ignores only JSON object-key order. Reauthorize before replay. Stable rate ID and command payload remain in memory; exact retry returns the original server timestamp/ID. Different payload under same key or same ID conflicts. No automatic new-ID retry. After tab loss, inspect authorized evidence before explicitly starting another intent. |
| Competing evidence | Household serialization shared with observation insertion. New standalone create refuses any already eligible pair/date evidence, returning CONFLICT, except authorized exact receipt replay. Concurrent first submissions cannot both win. Existing observations may still retain a different explicitly declared rate: preserve existing ambiguity, never silently suppress real observation evidence or make it authoritative. |
| Immutability/corrections | No UPDATE/DELETE/replacement. Before an accepted submission the form may be edited. After acceptance, wrong manual evidence has no reporting correction command under this proposal; stop and explain that limitation. An observation correction may retain a fresh snapshot but does not remove the old registry rate, so reporting can become ambiguous. Existing reconciliation REPLACE can choose a retained rate for that relationship only. A general correction/retirement/report-selection contract needs a separate explicit design approval. |
| Audit | Atomic immutable receipt/evidence/minimal audit, durable actor member, household/rate/command identity, operation and server timestamp. No rate values, descriptions, raw payloads or tokens in audit/logs. Failed transactions roll back all three. Existing observation audit remains. |
| UI privacy | Existing getUser + RLS snapshots, clear protected state on refresh/auth loss, generation guards discard delayed responses, dispose pending commands on sign-out. Memory-only `persistSession:false`; no privileged browser credential or persistent cache. |

Canonical Money/Transaction/Allocation, recognition dates, signed values,
ownership, authority activation and rounding remain unchanged. Adding one
eligible registry rate changes reporting monthly allocation conversions and
requested-date position conversions through existing functions; budgets and
data quality consume those results. Forecast must retain its currency,
coverage and timing limitations. Observation valuation changes only if a
genuine explicitly corrected observation embeds FX; registry intake alone does
not repair it. Reconciliation changes only after its explicit existing command.
Retained decisions keep their original FX snapshots. No outside coverage claim
or other missing-data finding disappears merely because FX becomes available.

## Focused UX and acceptance boundary

In the existing Hebrew RTL quality/report context, show pair, exact needed date,
recognition versus asOf/measurement context, affected account/revision and
MISSING_FX versus AMBIGUOUS_FX. Expand eligible IDs, declared origins, effective
dates and recording timestamps. Show household wrong-date/direction evidence
separately with the rejection reason; never show foreign household records.
Links carry hints only; destinations validate against a fresh authorized graph.

When no eligible rate exists for a reporting MISSING_FX finding, the existing
quality screen offers the writer with a user-declaration/external-unverified
label and explicit acknowledgement. Financial inputs remain decimal strings.
When rates compete, show the limitation and the existing reconciliation action
only where relevant; no global selector or false resolved status. After any
authorized write, reload and run the canonical calculation before showing a
result. Retain unknown outside coverage and unrelated missing evidence.

Tests cover standalone and observation-path source spoofing, cross-household
references, source-kind mismatch, expired/revoked sessions, concurrent membership
revocation and expiry during a lock wait, double create, immutable ID/key
conflicts, lost-response exact replay, delayed revoked UI responses and untrusted
route hints. Real browser journeys cover 320/375/390px RTL, accessible labels,
canonical reporting/data-quality reevaluation and retained competing evidence.
Pure numeric/date/direction/precision regressions run across the existing
Vitest/Deno/browser corpus. Actual full verification/CI evidence is in the report
and external manifest, not inferred from this design.

## Approval and remaining boundaries

The user explicitly approved this create-only command and security migration,
including validation on new observation FX, private audited idempotent insertion
and direct INSERT revocation with observation compatibility. No wider source
authority change proved necessary. New standalone metadata is server-derived;
inline observation recording metadata follows the retained existing contract.
The actor lock checks session expiry and user ban against wall-clock time after
waiting. The observation trigger and internal insertion helper repeat the live
actor check after account-lock waits, immediately before accepting evidence,
rather than relying solely on the transaction's starting time.
The existing synthetic backup validator additionally recognizes this exact
reviewed 16th migration while retaining prior 15-migration compatibility; no
arbitrary future schema or environment adoption is enabled.

This approval does not authorize automatic rates, provider integration,
rewriting legacy evidence, resolving existing ambiguity, merging, deployment,
real-data use or Task 17. General correction/report selection remains a separate
review dependency. Browser pending intents cannot survive tab destruction,
visibility/context changes or confirmed authorization loss; the UI requires
inspection of retained evidence before a new intent, and the database's
missing-only check prevents competing standalone records even after intent loss.
