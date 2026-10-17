# Task 17 — pre-implementation policy

Baseline: fetched origin/master, clean tree, PR #18 merged at
`87a8f0c82d332ccb6226acf131d3228d6e40339a`. Post-merge master run
[39067813317](https://github.com/maozNachum/couple-finance/actions/runs/39067813317)
has successful verify job 117499007474; checkout logs independently identify
the full matching SHA. Branch: `feature/task-17-financial-goals`.
Read root/src/supabase instructions, roadmap, architecture, data model,
security, providers, Tasks 11–16b decisions and existing planning/UI commands.

Goal identity, household, canonical ownership and currency are immutable.
CREATE (expected version zero), EDIT and terminal ARCHIVE append immutable
revisions with durable actor and server UTC timestamps. No COMPLETED state.
Names: trimmed 1–100 characters. Positive target and nonnegative declared
amount/optional monthly plan use canonical Money (16 integer/8 fractional
digits, ILS/USD/EUR/JPY/KWD). Dates use valid Gregorian 0001–9999 date-only.
No deadline is supported. Initial declared amount defaults to explicitly shown
zero. Member creation requires current ACTIVE same-household eligibility;
historical attribution survives revocation. Ownership grants no privacy.

Pure calculations accept an explicit planning date. Browser captures and labels
Asia/Jerusalem date; it is not a certified clock. Contributions occur once at
month end, in months strictly after the planning month through target month
inclusive. A same-month future deadline has zero contribution opportunities;
remaining is immediately required. Past deadlines are OVERDUE, with no invented
historical outcome. Without a date,
monthly requirement and dated outcome are unavailable. Without an explicit
monthly plan, outcome and projected gap are unavailable, distinct from zero.
Required monthly amount rounds UP to eight fractional digits using only the
existing exact decimal-string wrapper: HALF_UP division, exact multiplication
comparison, and a one-unit increment only when the quotient understated the
remaining amount. Shared rounding policies are unchanged. Percent is two-place
HALF_UP capped at 100 for display; surplus
is retained separately. Bounds/overflow/invalid inputs fail clearly.

Declared money is a planning assertion, never verified bank funding, a new
asset, a ledger write, reserved liquidity or forecast deduction. Multiple goals
can reference the same underlying money; exclusivity is not established.
No aggregation across goals/currencies, interest, returns, future income,
recurring obligation, provider integration or automatic completion.

Use minimal goal heads, immutable revisions, private complete-payload SHA-256
receipts and amount-free audit. Household → Auth user → session → actor/member
locks, wall-clock live check after waits and before receipt replay. No account
lock is needed: no financial table is written. Restrictive composite member
FKs; SELECT-only household RLS; invoker API wrappers and one narrow checked
private writer. Atomic head/revision/receipt/audit. Bounded STABLE invoker
snapshot of authorized households/members/goals only: 1,000 households,
10,000 members/revisions and 16 MiB combined, fail rather than truncate.
Validate complete revision continuity and immutable identity before display.

Reuse memory-only pending command and request-generation patterns. Preserve
exact pending intent on uncertain delivery; conflicts require fresh review.
Refresh/focus/visibility/Auth changes clear protected presentation; delayed
responses cannot restore it. No browser persistence; persistSession stays false.
Hebrew RTL forms, exact amount display, accessible progress, explicit archive
confirmation/history and existing mobile navigation. No new design system.

Rejected alternatives: automatic balance allocation (no exclusivity contract),
financial graph nesting (unnecessary financial data for goals), completed-from-
projection status (unsupported certainty), general planning framework (scope).

Final review: names use a 100 Unicode-code-point bound and canonical trimming;
SQL rejects untrimmed ECMAScript whitespace and normalizes Money/UUIDs before
retention, while receipts digest the complete original submitted payload.
Reuse Task 16b's existing private live-actor predicate (legacy FX name) rather
than changing authorization. Backup validation additionally recognizes only
the exact 17th migration with its FX predecessor; old bundles remain valid and
unknown future schemas remain rejected. A new isolated lab port, 16121, is
allowlisted because every earlier lab port was occupied. No adoption behavior
or destructive operation is introduced.
