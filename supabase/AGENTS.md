# Backend and shared-core rules

Follow ../docs/architecture.md, data-model.md, security.md, and providers.md.

- functions/_shared/core/contracts: runtime-independent public validation contracts.
- functions/_shared/core/domain: the single pure implementation of financial formulas.
- Core must not import React, runtime environment globals, network/filesystem APIs, database clients, application, infrastructure, or providers.
- functions/_shared/application: authorized use cases and orchestration.
- functions/_shared/infrastructure: database/auth/storage/logging/secrets implementations.
- functions/_shared/providers: source-specific adapters and DTOs; no provider structures outside this boundary.
- Database migrations belong in migrations/ and RLS/constraint tests in tests/ when Task 3 starts. No database setup in Task 1 or Task 2.
- All money crosses API boundaries as decimal strings; dates and signs follow data-model.md.
- Browser access to core is an explicit reviewed allowlist, not access to the entire backend tree.
- Financial tables require household RLS and same-household composite references when implemented.
- Never commit real household data or secrets. No financial execution capabilities.
