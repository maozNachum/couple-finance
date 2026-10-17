# Couple Finance — proposed Task 18: deterministic insights

Do not begin until Task 17 has independent code, financial-model and security
review, a merged PR, and successful post-merge master CI on the exact fetched
full SHA. Confirm a clean tree, read all instructions, roadmap and Tasks 10–17
decisions/reports, then branch from verified master. Stop if evidence is missing.

Design the smallest explainable, read-only insight set from existing validated
reporting, budget, obligation, forecast, data-quality and goal read models.
Perform a bounded product audit and write pre-implementation decisions first.
Prefer a few useful deterministic findings over a scoring framework or a large
catalogue. Every finding needs exact household evidence/version/date references,
original currencies, a fixed explanation, uncertainty and a supported next action
that requires the user's fresh explicit decision in the owning module.

Potential goal insights: an explicit monthly plan falls short of its target,
an overdue deadline requires review, or a same-month deadline has no future
contribution opportunities. Use the existing goal calculator unchanged. Declared
amounts remain unverified, potentially overlapping planning assertions. Do not
claim that the household can afford the required contribution. Never treat goal
plans as actual transfers, assets, forecast deductions or recurring obligations.

Do not infer outside coverage, future salary, investment returns, FX conversion,
reserved cash, settlement schedules or external debt. Incomplete evidence must
remain visible. No cross-currency aggregation without explicitly eligible
conversion evidence. Reuse canonical calculators rather than copying formulas.
Any material change to a financial or authorization contract requires separate
explicit approval; stop with a concrete design if one proves necessary.

Keep Hebrew RTL mobile UX, accessible explanations and narrow existing-module
links. Destination modules independently authorize their context. Preserve live
user/session/ACTIVE membership checks, RLS, bounded coherent snapshots, stale
response guards and persistSession:false. No browser financial storage.

Exclude AI, advice generation, recommendations to buy/sell products, provider
connections, financial execution, background jobs, push notifications, automatic
corrections, dismissal workflows and a general insights platform. Implement no
Task 19 scope. Use synthetic disposable resources only; never adopt retained
volumes or databases by name. No deployment, real household data or merge.

Deliver decisions/report, meaningful pure/security/accessibility/browser tests
inside the preserved verification gates, full npm run verify, exact-final-head
GitHub CI, one focused PR and an independent-review package with exact source
ZIP, Git identity, SHA-256 manifests, diff, screenshots and logs. Stop for review.
