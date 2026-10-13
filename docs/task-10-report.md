# Task 10 — Household dashboard, net worth and reporting

## Delivery and preparation

Implemented Task 10 only on `feature/task-10-dashboard-net-worth`. Fetched master and verified actual PR #8 merge `83253b36d039f5226260369c7d7261f74fb867d5` and its exact successful push [38378434028](https://github.com/maozNachum/couple-finance/actions/runs/38378434028) before implementation. Read applicable root/src/supabase instructions, approved architecture/model/security/provider/portable contracts/roadmap, earlier deliveries/decisions/review fixes and `task-10-prompt.md`. Root AGENTS.md, synced sources and all ten merged migrations remain unchanged.

The Hebrew RTL `/dashboard` provides selected household/date/month/currency, signed net worth/assets/debt, disjoint shared/member attribution, monthly income/consumption/difference, original and converted account positions, measurement dates, coverage and deterministic missing-evidence/reconciliation warnings. It reuses existing navigation/styles, keyboard controls and correction links. No sample household balances, editable aggregates, financial writer, dependencies, live FX, automatic correction, budgets, forecasts or production deployment were added.

## Accounting, FX and coverage

One stable account contributes once. Positive positions are assets and negative positions liabilities regardless of account labels. Shared ownership is one bucket; durable member attribution never distributes it by percentages. Existing ledger anchors/current posted revisions and dated authoritative observations remain the sole balance formulas. OBSERVED never sums movements or adds a ledger component. Missing opening/source/observation evidence remains unknown, not zero. Archived accounts remain included because effective financial closing dates are not modeled.

Requested reporting day and account measurement day are separate from selected FX effective day and recording timestamp. The documented conservative policy selects a unique immutable household-scoped explicit pair **on the exact requested valuation day**, then calls canonical eight-place HALF_UP conversion. There is no latest/current-rate fallback, implicit inversion, triangulation or provider priority guessed from UUIDs. Monthly allocations convert on recognition dates. Multiple eligible evidence records are ambiguous; missing/ineligible evidence retains original Money and prevents a confirmed household total. Historical embedded observation FX is never changed. Carried-forward or PARTIAL observations explicitly prevent complete as-of valuation. See [full policy](task-10-decisions.md).

Monthly income sums signed INCOME; consumption negates signed EXPENSE, so positive refunds reduce consumption. Openings, transfers, debt principal, investments and adjustments are excluded. Pending/voided/noncurrent revisions are excluded. UNCLASSIFIED stays unresolved; categorization alone never changes meaning. Complete means complete computation over registered canonical evidence, not certified external statement/import coverage. Incomplete reports expose available amounts and a null confirmed income-minus-consumption difference; wholly missing conversion amounts remain null.

Reconciliation validity is recomputed against current revisions. Stored EXACT is insufficient after a revision or when actual effects disagree. PARTIAL, STALE, NEEDS_CORRECTION and missing FX remain visible. Linked bank EXPENSE allocations remain in consumption and trigger explicit possible card double-count warnings. Existing separately authorized financial correction remains the remedy. Loan evidence displays actual principal/interest/fee components separately without adding them to totals again. Unlinked explicit transfer/principal evidence is visible without creating counterpart movements.

## Snapshot and authorization

The additive migration introduces only `api.reporting_snapshot()`: STABLE, SECURITY INVOKER, fixed empty search path, authenticated EXECUTE, live-session check, existing household RLS and curated projections. Accounts, sources, observations, complete transaction/allocation history, decisions, members and FX are selected in one MVCC statement snapshot. No Data API pagination or import candidate reference retrieval occurs. Preflight bounds: 100 households; 1,000 members/accounts; 10,000 sources/decisions/rates; 100,000 revisions/allocations/observations/participants; 16 MiB serialized snapshot. Overflow yields a fixed SafeError without partial success. Client schemas verify bounds/counts and portable core verifies graph/household/account/member/FX/decision context. Finance/private schemas remain unexposed and prior grants/security protections unchanged.

Dashboard revalidation clears protected rendered content before requests, guards generations against obsolete responses and clears on sign-out, loss of membership or deleted sessions/users. Transient errors display no previously loaded amounts as freshly verified evidence. Browser sessions and financial data remain memory-only.

## Verification

The complete `npm run verify` chain passed **exit 0**, including the 16 MiB database response-bound test and obsolete-response-after-revocation browser test. A final defensive aggregation check (a COMPLETE label without an available amount must never fabricate zero) and composite rendering identifiers were followed by successful TypeScript/lint/Vitest/Deno/build/architecture checks, all 12 public/portable Chromium tests and all six dashboard desktop/mobile tests. No existing assertion was weakened or removed.

| Check | Final result |
| --- | --- |
| TypeScript / ESLint / exact aliases and boundaries | Passed |
| Vitest | 371 tests, 9 files passed |
| Permission-free cached Deno / generic CSV | 272 / 15 tests passed |
| Import preview/commit Edge typechecks | Passed |
| Production build / portable Chromium corpus | Passed / 12 tests, four timezones |
| Actual PostgreSQL pgTAP/RLS | 458 assertions, 9 files passed |
| Database lint / security advisors | No errors / no issues |
| Auth / accounts / transactions API | 33 / 33 / 118 assertions passed |
| Categorization / CSV Storage / import commit API | 70 / 91 / 195 assertions passed |
| Reconciliation integration/concurrency | 86 assertions passed |
| Reporting API | 23 assertions passed |
| Authenticated desktop/mobile Chromium | All 34 passed; final six dashboard stories passed again |

Reporting coverage includes stable identity/ownership, sign-based assets/debt, known-zero/unknown/partial openings, financial cutoff/current corrections/voids, observed authority cutovers/correction history, missing/older/partial measurements, explicit effects/refunds/principal/interest/fees, stale/partial/wrong card reconciliation, archived history, FX directions/dates/ambiguity, exact decimal precision/overflow, half-open month boundaries and order independence. The shared corpus runs unchanged in browser/Deno/Vitest. Large-history tests prove 1,001+ movements survive the REST row limit. Reporting pgTAP tests exercise anonymous/missing/live/deleted sessions/users, two households, unchanged revoked JWTs, invoker/search-path configuration, count and actual byte overflow. Reporting real API tests verify household FX/reconciliation isolation, forged context arguments, no financial/audit mutation by reads and complete histories. Existing cross-household reference, concurrency, import provenance, categorization and Auth regressions are retained.

All eleven migrations replayed on the configured disposable loopback Docker stack only after confirming **zero households and zero Auth users**. No hosted or real database was reset. Desktop/mobile screenshots were inspected; no horizontal overflow and no axe violations in dashboard review. Ignored local logs: `.artifacts/task10-verify.log`, `.artifacts/task10-final-verify.log`. No verification category was unavailable. Existing large-bundle/terminal-color advisories remain; SQL lint reports the preexisting unused `counter` variable in Task 9, with no errors. Official Supabase RLS/changelog guidance was reviewed against the pinned stack; no upgrade was needed.

## Remote evidence and handoff

The exact implementation commit and push/PR workflow URLs, conclusions and final head evidence are recorded in the published PR description and delivery response after publication, never inferred from local results. This report records the exact successful prerequisite master push and local verification above; GitHub remains the authority for subsequent workflow runs. Do not merge or deploy automatically. [Task 11 prompt](task-11-prompt.md) prepares monthly budgets only; no Task 11 code is included.

## Limitations and future data requirements

- Historical reports use current corrected knowledge, not recorded-time reconstruction. Accounts lack financial effective creation/archive/closing dates; archived positions remain visible and included.
- The immutable FX registry is evidence, not a certified daily rate feed. Exact-day uniqueness is intentionally conservative; weekends, missing daily pairs and competing records stay incomplete. A future provider policy must explicitly approve provenance priority, revisions and freshness before allowing latest-eligible fallback.
- Older OBSERVED measurements carry visible incomplete coverage; there is no invented stale-age threshold or external statement-completeness guarantee.
- No report from an oversized/invalid snapshot is presented. Larger households need a reviewed complete-history protocol or separately designed server reporting, not silent pagination.
- Category absence is counted; category names never determine financial meaning. Unlinked explicit transfer/principal effects remain in the registered ledger with a factual reconciliation warning.
- Chromium desktop/mobile emulation is verified; other engines/physical devices, production hosting, backups, live synchronization and AI remain outside this task.
