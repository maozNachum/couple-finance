# Task 16a — account inventory and practical intake

## Baseline and policy (before implementation)

Fetched origin/master: `c76c9843844ccf61e816f3855dd334d944ac8119`.
PR #16 is merged at that SHA. Independently read GitHub Actions REST run
[38900202699](https://github.com/maozNachum/couple-finance/actions/runs/38900202699):
push, master, exact SHA, completed/success. Initial working tree clean;
branch `feature/task-16a-account-coverage-intake` starts at this master.
Read root/src/backend instructions, architecture, security, data model,
providers, Tasks 4/5/7/8/9/14 decisions, source-authority review fixes,
15a report/readiness and 15b decisions/report plus the repository 16a prompt.

An account record is a household member's declaration that an account exists.
Its type, ownership, currencies, balance policy and status are known internal
configuration, not independent verification of the outside account. Canonical
opening revisions, transaction revisions, dated authoritative observations and
retained accepted import rows are financial evidence with their existing
provenance. Manual evidence remains user supplied. No manual value becomes a
bank-certified value simply because validation succeeds.

Coverage claims are limited to what each item supports: an opening anchors a
ledger on its date; an observation measures a signed position on its date and
has explicit COMPLETE/PARTIAL component coverage; a transaction records one
movement. Neither two transaction dates nor CSV minimum/maximum dates establish
uninterrupted statement coverage. COMPLETE observation coverage describes the
declared components of that measurement, never all household accounts or a
period of activity. User-declared coverage would remain a declaration; this
task does not collect or persist a new coverage attestation.

External account/activity coverage remains globally UNKNOWN under Task 14,
including when no internal finding exists. Missing openings, partial/missing
observations, unresolved financial effects, missing FX, import review and
reconciliation are separate internal limitations. No percentage or completeness
score combines them. No transaction absence is presented as a proven gap.

| Example | Supported evidence and next action | Claim deliberately withheld |
| --- | --- | --- |
| BANK / LEDGER | An explicit October 1 opening and individually reviewed movements; add opening or review CSV | An October 2 and October 15 movement do not cover the intervening days |
| CREDIT_CARD | Preserve negative debt and explicit purchase/settlement effects; review movements and reconciliation | No credit limit, billing period, future settlement or extra expense inferred |
| CASH / LEDGER | Counted cash can supply a dated opening through the existing writer | Registering a wallet does not imply zero or complete cash movements |
| SAVINGS / OBSERVED | A partial dated measurement remains partial; complete components can be recorded explicitly | A carried measurement is not a new daily balance or statement history |
| INVESTMENT or LOAN / OBSERVED | Signed dated position with original currency and explicit historical FX or missing-FX status | No holdings, return, principal schedule, current FX or future payments invented |

## Minimal implementation choice

Use existing authorized snapshots and canonical pure calculators. Add household
inventory context, concise evidence explanations and account-specific links to
existing writers, CSV review, history and follow-through. Query parameters are
non-authoritative selection hints. Destinations must match household/account
against freshly authorized records; unavailable context must never silently
select another account for a write. Archived records retain read paths only.

No new schema, API, source authority, generic coverage registry, durable
declaration, financial arithmetic, storage policy or persistent sessions.
Therefore no migration/authorization approval dependency is introduced.
Rejected: an editable current balance, a CSV period certification, an inferred
external-account checklist marked complete, a parallel importer and automatic
duplicate suppression. Each would invent evidence or duplicate existing rules.

## Bounded audit and environment

Code inspection: accounts already expose canonical positions but mix inventory
with long editors and do not label outside coverage; transaction links lose
account selection. CSV requires reselecting household/account/source, although
all identities already exist. Mapping/review, invalid rows, explicit duplicate
acknowledgement, exact uncertain-command retry and durable receipts already
exist. Data-quality actions lose the account context. Reconciliation already
has explicit evidence/claim review and must remain its existing workflow.

Docker was initially stopped. After starting Desktop, retained containers
occupied 15621/15721/15921. The first new lab failed binding 15632 before
application initialization; its resources remain retained and are not reused.
Docker published-port inventory then established 15821 was free. New guarded
lab: `cf15a-07bab7161c83-source`; failed lab:
`cf15a-3f556738133f-source`. Both have fresh nonce-labelled volumes and external
ownership state under this chat's visualization directory. No retained database,
volume or backup was adopted/reset/stopped/deleted. Further audit and actual
verification evidence are recorded in the report; startup alone is not a pass.
