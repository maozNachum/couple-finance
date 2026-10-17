# Task 16b — missing manual historical FX evidence intake

Status: approved narrow implementation; verification results and final Git/CI
identity accompany the external independent-review package.
See [final contract and security decisions](task-16b-decisions.md).

## Baseline and approved scope

Verified clean working tree, fetched latest origin/master, independently verified
merged PR #17 and successful post-merge push CI on full SHA
`cd2659ef01583017d783414a84761a978f6f7b5c`. Created the requested feature branch
from that SHA. Read required architecture/security/source-authority contracts.
The initial audit changed no application code. The user then explicitly approved
the missing-only writer and forward security migration. sources/ and AGENTS.md
remain untouched. CI, package scripts, dependencies, financial arithmetic,
canonical assertions and test timeouts are unchanged. No source appointment,
provider integration, merge, deployment, real data or Task 17 work.

Focused audit found no standalone historical FX entry command. Genuine
observation evidence is reusable; reconciliation already offers explicit
selection. The baseline evidence INSERT permission and embedded observation path
validated source syntax without checking source existence/household/kind. The
migration closes that client-origin gap. New SQL and authenticated API adversarial
tests verify actual rejection of forged, foreign and mismatched sources.

## Executable synthetic reproduction

Run from repository root with installed locked dependencies and Node 22.14:

```sh
node --experimental-strip-types docs/task-16b-reproduction.mjs
```

This imports the actual unchanged contracts/calculators, asserts the outcomes
and prints JSON. It has no database, network, credential or mutation access.
Captured output is retained in [reproduction JSON](task-16b-reproduction.json).
All numbers/identities are synthetic fixtures, not quoted market rates or real
financial data. A hypothetical eligible observation is supplied in memory;
the script does not claim that an observation command was executed.

| Case | Actual canonical result |
| --- | --- |
| -10 USD expense, recognition October 10; value date October 12, report October 16 | Needs USD -> ILS on October 10, independently of the other dates |
| Available USD/ILS October 9 rate 3.7; ILS/USD October 10 rate 0.25 | MISSING_FX; original -10 USD retained; no ILS consumption result |
| Genuine partial October 9 observation: 250.75 USD with its own rate | Historical observation value 927.775 ILS; cannot convert October 10 expense |
| Hypothetical genuine October 10 observation retaining immutable manual 3.7 rate | Reused by reporting: consumption 37 ILS; exact transaction-date quality finding disappears after reevaluation |
| Additional eligible immutable 3.8 rate | AMBIGUOUS_FX; ILS consumption unavailable; both evidence IDs visible in finding |
| Reconciliation of -10 USD payment and +37 ILS counterpart | No selection: MISSING_FX. Explicit 3.7: EXACT. Explicit 3.8: PARTIAL. Reporting ambiguity remains |
| Rounding and precision | 0.00000001 USD at synthetic 1.5 rounds HALF_UP to 0.00000002 ILS; 9007199254740991.12345678 at 1 retains exact precision |
| Remaining limitations | Missing unrelated ILS opening, partial observation and October 16 position FX remain; outside coverage UNKNOWN; monthly difference unavailable |

Pure checks also reject adjacent dates and reversed direction, exclude a
foreign household rate from selection and assert unchanged original transaction
JSON. These demonstrate calculator behavior, not live RLS authorization.

## Implementation and security migration

When there is no genuine matching observation, using record_balance would
require inventing a balance assertion. The approved create-only command
`api.record_manual_fx` accepts a strict declaration and derives origin and
recording metadata from trusted database context. Its private handler rechecks
live user/session/ACTIVE membership before creation AND exact receipt replay.
It serializes by household with observation FX intake, refusing any existing
exact pair/day rate or reused ID, so concurrent standalone submissions cannot
create competitors. The complete submitted JSONB digest binds the household/key
receipt; lost-response retries preserve server identity/timestamp. Source account
must be active and match the requested base/valuation currencies. That context
does not restrict reuse by other accounts in the household.

The forward migration removes authenticated evidence INSERT and its policy.
The checked definer observation trigger validates live authorization, balance
account/source and pair/date before a private insertion helper validates each
NEW FX origin against an actual same-household stored MANUAL source. That origin
may differ from the balance source. Existing identical snapshots remain reusable,
including legacy declared provenance; conflicting immutable ID contents fail.
The original FX guard still independently validates shape, precision and dates.
No legacy row is updated, reclassified, deleted or automatically replaced.
Private receipts and minimal audit use RLS, withheld DML and immutable-update
guards. Authorization locks include a post-wait wall-clock expiry/ban check.
All helpers use fixed empty search paths; generic helper/trigger EXECUTE is
withheld. Only the independently checked command handler is granted to the
invoker API, following established command patterns. Existing observation audit
and atomic observation/FX behavior remain intact.

The implementation deliberately cannot correct an already accepted wrong registry
rate or resolve existing reporting ambiguity. Adding a second immutable snapshot
does not supersede the old one for reporting. That limitation is explicit in
the design and must remain visible in UX. It needs a separate approved policy
if general historical evidence correction becomes required.

The existing Hebrew RTL quality screen now exposes affected account/pair/date,
eligible household evidence, declared provenance/recording dates, and excluded
wrong-day/direction evidence. Missing reporting FX offers an acknowledged manual
declaration. Observation-only gaps retain their genuine observation-correction
path; standalone registry intake never attaches FX to an old measurement.
Competing evidence shows AMBIGUOUS_FX with no writer/selection control. Exact
retry is explicit; fields stay frozen after uncertain delivery. Refresh/context/
visibility changes or confirmed access loss discard protected state, and delayed
receipts cannot restore it. No persistent session/cache is added. Canonical
recalculation, rather than a local resolved flag, determines remaining findings.
Outside coverage remains UNKNOWN. No Task 17 prompt or implementation was started
under the user's narrowed continuation scope.

## Verification log

- Pure reproduction: PASS, exit 0 on Node v22.14.0. Node emits its expected
  experimental type-stripping warning. No database or Docker resources used.
- Initial unchanged portable regression suite: PASS, exit 0, 455 tests in
  `tests/portable/core.test.ts` via Vitest (the targeted FX/history/reconciliation
  invocation executed all 455 cases). No assertions, timeouts or config changed.
- ESLint on the reproduction script: PASS, exit 0, no warnings.
- `git diff --check`: PASS, exit 0; new files also checked with no-index diff.
- Initial targeted real PostgreSQL suite: 45 assertions passed, including revoked direct
  insertion, helper grants, inline compatibility and atomic rejection.
- Initial targeted authenticated API suite: 43 assertions passed, including concurrent
  same-pair creation, concurrent member revocation and expiry during lock wait.
- Targeted authenticated browser journeys: 4 passed across desktop/mobile, with
  320/375/390px layout and axe checks, before/after/ambiguity screenshots,
  lost-response exact retry, canonical 37 ILS reporting and delayed revoked reply.
- Six new API boundary unit tests and one new portable manual-contract case join
  the unchanged full verification chain. Exact final totals and final-head CI
  identities/URLs are pinned in the external manifest, avoiding a self-referential
  source commit SHA in this report.

The first complete unchanged `npm run verify` passed with exit 0, including all
72 authenticated browser cases, 617 Vitest cases, 474 Deno cases (459 core/runtime
and 15 provider cases), 14 public browser cases, 654 PostgreSQL assertions, all
Auth/API suites, SQL lint and security advisors. Advisors reported no issues;
the retained SQL lint warning about `private.reconcile.counter` is pre-existing.
A final compatibility review then found Task
15a's synthetic backup validator pinned to exactly 15 migrations. It now accepts
the retained 15-migration bundles and exactly the reviewed 16th FX migration;
unknown/future schemas still fail closed. One added regression checks old/current
acceptance and unknown-schema rejection. No backup, restore, retained volume,
archive or production workflow was executed or changed. The final full gate
includes this compatibility regression as an additional Vitest case. Its full
log and exact final-head standard CI evidence accompany the review package.

Development failures: the first new browser run expected fixed-scale -10.00000000
where the retained transaction JSON correctly had -10. The new assertion now
compares the original exact Money object; both desktop/mobile journeys passed.
An unused import failed focused lint and was removed. No canonical assertion,
timeout, retry or CI setting was weakened. The existing 1,001-observation API
fixture now supplies its actual synthetic live session to the strengthened
trigger; its data and assertions are unchanged. Shared cleanup deletes the new
private fixture receipts/audit before their retained evidence/member FKs.

Final security review additionally tests expiry while waiting for an account
lock, after household/Auth locks have already been acquired. Live actor checks
now repeat after that wait in both the observation trigger and FX insertion
helper, immediately before accepting evidence. This adds one PostgreSQL grant
assertion and one real concurrent API regression; final totals are in the
external verification/CI manifest.
The new account-wait regression failed against the prior helper (the expired
request was accepted), then passed against the hardened helper. Targeted final
results: 46 PostgreSQL assertions and 44 authenticated API assertions passed.
Both before/after regression logs are retained in the review package. The
intermediate verification run was superseded by this security fix; only the
subsequent full unchanged gate is labelled final.

The owned lab is `cf15a-30c5af89a4c9-source`, freshly created with nonce-labelled
database/storage volumes and empty initial Auth/household state, at free ports
16021/16032. Existing stacks on 15421–15921 remain untouched. The external state
and source-copy SHA-256 manifest bind this lab; only documented local project,
container and port literals are transformed. Package scripts, tests/timeouts and
CI remain unchanged. A development SQL patch tightened the post-lock expiry
check in this owned lab; final clean migration replay is independently exercised
by standard CI. No retained environment was reset, adopted, stopped or deleted.

Environment notes: Git initially rejected sandbox ownership; per-command
safe.directory handled the known workspace without changing global config.
Sandbox fetch then failed writing FETCH_HEAD; an approved elevated fetch
succeeded. GitHub CLI was unavailable, so connected GitHub REST tools supplied
the independent PR/CI evidence. No automatic approval rejection occurred.
