# Task 16a — financial account coverage and practical intake

## Implemented scope

Hebrew RTL account inventory now selects an authorized household and optionally
one account, explains declared inventory versus financial evidence, counts only
registered records, and keeps external coverage explicitly unknown. All eleven
existing types, signed positions, original/valuation currencies, ownership,
LEDGER/OBSERVED policy and archive status retain their canonical semantics.
Registration follows the selected household and focuses the newly registered
account after server confirmation. Unavailable requested context shows an
explicit limitation instead of exposing another account's editor.

Account cards expose opening dates when supported by the canonical calculation,
distinguish a cutoff before opening from a missing opening, retain partial and
missing observation/FX states, explain correction-inclusive evidence counts,
and expose source identities and dated authority without changing them.
COMPLETE observations explicitly mean the reporter's component declaration.
No transaction count/date range certifies continuous activity coverage.
Archived accounts retain read links and no new intake actions.

Account-specific transaction and CSV links carry household/account selection
hints; destination snapshots independently authorize and validate them. A valid
CSV hint preselects household, active account and its existing manual staging
context. Mapping/sign/currency decisions, upload and financial commit remain
explicit. Invalid, foreign, mismatched or archived hints do not select a writable
default. Data-quality balance findings preserve account context in supported
account/transaction links. Import completion links to the actual account history;
additional existing routes lead to reconciliation, quality and dashboard review.

No migrations, APIs, financial arithmetic, canonical writers, provenance,
source appointment, RLS, grants, dependencies or session persistence changed.
No bank/provider integration, new coverage registry, external discovery,
deployment, real-data intake or Task 16b implementation. See the decisions
document for the evidence policy and rejected alternatives.

## Audit and before/after evidence

Baseline clean master `c76c9843844ccf61e816f3855dd334d944ac8119`, merged PR #16
and successful exact-SHA post-merge push run 38900202699 were independently
verified. Existing synthetic browser stories passed before implementation:
mobile overview/history at 320/375/390/768/1280, CSV mapping/duplicate review/
lost-response retry/correction/durable evidence, and reconciliation/uncertainty/
immutable history/revocation. Baseline screenshots were retained externally.

| Friction before | Result after |
| --- | --- |
| Account-to-transaction route loses selection | Correct authorized account selected from its card or quality finding |
| CSV requires three context selections | Valid account link supplies all three from authorized records; no file or mapping submitted automatically |
| Inventory and outside coverage not explained together | Registered count explicitly differs from unknown outside inventory/activity |
| COMPLETE measurement can sound globally complete | Reporter-declared measurement components explicitly distinguished from periods and external coverage |
| Opening absence and cutoff-before-opening share one message | Canonical UNKNOWN reason gets the appropriate explanation |
| Import completion loses account context | Confirmed receipt leads to that account's financial history |

The new acceptance story provisions a synthetic two-member household, shared
bank/card/cash and partner-owned USD savings, plus a foreign household account.
It follows existing authorized opening and observation writers, then server CSV
preview/review/atomic commit. Two identical-looking -10 ILS rows require explicit
separate acknowledgements; an invalid date stays excluded. Lost response causes
no success claim, and retry sends exactly the same command. The final snapshot
has exactly one opening and two imported movement revisions for the bank,
FILE_IMPORT provenance, explicit EXPENSE effects and HOUSEHOLD allocations.
The second authorized member can read the same immutable revision identity.

| Evidence | Before | After |
| --- | --- | --- |
| Bank | No opening; unknown balance | October 1 opening 1000 ILS; two October 4 movements; 980 ILS |
| Partner savings | Missing observation | October 3 250.75 USD measurement, still PARTIAL and missing FX |
| Card | Signed -300 ILS opening | Unchanged negative position; no invented limit/schedule |
| Cash | Missing opening | Still unknown; remains a data-quality finding |
| Outside accounts/activity | UNKNOWN | Still UNKNOWN |

The bank's missing-opening finding disappears after reevaluation. Dashboard
retains its partial available-value heading. This establishes improvement in
known internal evidence, not full household completeness. Screenshots use only
synthetic data. New intake layout checks cover 320/375/390/1280 and axe; retained
mobile overview also covers 768. Chromium emulation does not establish behavior
of physical iOS/Android keyboards, screen readers or OS suspension.

## Verification and failures

Focused component verification: ten tests covering absent/partial/before-opening
evidence, negative original-currency card balance, dated partial/complete
observations with missing FX, archived actions, unavailable/mismatched context,
authorized household switching, registration context and failed refresh privacy.
New desktop/mobile synthetic intake journey passed; the final full gate also
executes it. Existing financial, authorization, RLS, Deno and provider regressions
are retained without assertion, timeout or CI changes. No new backend behavior
needed a duplicate backend contract or additional financial implementation.

Full verification and exact-head CI results are recorded in the external review
manifest/logs, including the source-copy hash verification, final Git HEAD/tree,
CI run URLs and SHA-256 archive hashes. This avoids a self-referential source SHA.
Do not treat an in-progress run as success.

Observed development failures and resolution:

- Docker initially stopped. Starting Desktop made retained stacks' published
  ports visible. Fresh lab on 15621 failed binding 15632 before initialization;
  no retained resource was stopped. Docker's published-port inventory established
  15821 was free. New guarded lab `cf15a-07bab7161c83-source` reached RUNNING.
- Initial browser wrapper used the repository cwd for a local-status query; its
  identity guard rejected the original stack address before tests ran. Setting
  the owned lab cwd fixed it. No original-stack financial operation occurred.
- Initial new TypeScript checks found an unused import and a household-name
  property absent from the transaction DTO. Both were removed; no API expanded.
- New browser selector matched both observation date and historical-rate labels;
  exact-label selection fixed the test. A raw observation amount assertion then
  encountered PostgreSQL's `250.75000000`; parsing the snapshot with the UI's
  canonical contract preserves exact decimals and compares `250.75` correctly.
  Both failed logs remain in the review evidence.
- A new Testing Library assertion incorrectly supplied Playwright's `exact`
  option to a role query. TypeScript rejected it; removed the unsupported option.
- Full-gate preparation commands initially used paths relative to the lab rather
  than the repository. Corrected preparation verified ownership and zero users,
  households, transactions, import rows and receipts before database suites.
  Final source synchronization completed before runtime/browser/database gates.
  Final TypeScript was independently checked as well.

## Environment ownership and remaining limits

Only newly identified disposable synthetic labs were used. Their fresh random
project IDs, nonce-labelled volume identity and external state are verified by
the unchanged Task 15a guards. The failed lab `cf15a-3f556738133f-source` and
working lab `cf15a-07bab7161c83-source` remain retained for review, with ownership
state in this chat's visualization directory. No automatic cleanup/adoption,
reset, backup overwrite or deletion of retained environments was performed.
The ignored test source copy substitutes only documented local project/ports;
standard package scripts, assertions, retries, timeouts and workflow are unchanged.
Review artifacts exclude all lab credentials, Auth links, database volumes,
private files and raw statement content.

Historical FX has no independent transaction-date entry workflow; the proposed
Task 16b prompt scopes that verified limitation. No provider dependency is
assumed. Existing statement coverage, additional outside accounts, unsupported
holdings/loan schedules and real-provider evidence remain unknown/unavailable.
Full bounded histories are still loaded; no new scalability or sync protocol.
Memory-only sessions and pending commands cannot survive tab destruction;
explicit navigation away from an uncertain write still requires receipt review.
Task 15a real-data hosting/HTTPS/recovery/backup gates remain pending or blocked.
Stop for independent review. Do not merge or deploy.
