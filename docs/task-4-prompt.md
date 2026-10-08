# Recommended next request — Task 4 only

Start only after Task 3's PR is reviewed and merged, under a separate implementation request. Implement manual household financial accounts and dated valuations according to the approved roadmap, canonical Task 2 contracts and Task 3 identity/RLS foundation.

First verify master CI, read all scoped instructions and delivery reports, and create a bounded feature branch. Preserve exact core aliases, safe errors, invited-user authentication, live session checks, household RLS and composite same-household references. Test as real anon/authenticated users, including cross-household reads/writes and removed membership.

Do not add transaction ingestion, live bank/provider connections, transfers/payments/trades, reporting dashboards or later tasks. Use synthetic fixtures only. Run the complete verification chain and actual PostgreSQL security tests, document limitations, commit and open a review PR. Do not merge automatically.
