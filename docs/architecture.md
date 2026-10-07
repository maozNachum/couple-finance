# Architecture and placement

Status: approved design; Task 1 foundation implemented. Use a modular monolith, one React/Vite client and one future Supabase backend. Financial functionality is not implemented yet.

## Dependency ownership

| Location | Owns | Must not own |
| --- | --- | --- |
| `src/app` | Entry, shell, routing, providers, global styles | Financial formulas |
| `src/pages/<page>` | Route composition | Database queries or provider payloads |
| `src/features/<feature>` | Feature components, hooks, api, local models | Other feature internals |
| `src/shared` | Reusable UI, layout, formatting, browser infrastructure | Features, pages, application orchestration |
| `supabase/functions/_shared/core/contracts` | Public, runtime-independent validated contracts | Secrets or runtime clients |
| `supabase/functions/_shared/core/domain` | Single canonical pure financial implementation | React, environment, I/O, database, network, ambient time |
| `supabase/functions/_shared/application` | Authorization, load/calculate/persist use cases | Duplicated formulas |
| `supabase/functions/_shared/infrastructure` | Auth, database, storage, logging, secrets | UI and business formulas |
| `supabase/functions/_shared/providers` | Source payloads, normalization, capabilities | Financial reporting logic |
| `supabase/migrations` | Future schema, grants and RLS | Untracked dashboard-only changes |
| `supabase/tests` | Future database/RLS/command tests | Real household data |

Future folders are created only with real work. Do not create empty feature trees, generic `utils`/`services` dumping grounds, placeholder providers, or speculative frameworks. No microservices, event streaming, or full event sourcing.

## Automated boundary

`scripts/architecture-policy.json` contains exact approved `@finance` modules. Initially only `@finance/contracts/application-context` is approved. `@/*` maps to `src/*`. No wildcard `@finance` mapping is permitted.

The frontend may access only explicitly approved files in core/contracts and core/domain, and only through the approved alias. Relative paths into Supabase, alternate aliases, server type imports, re-exports, raw imports, runtime loaders and nonliteral dynamic imports are rejected. Core local dependencies are checked recursively by scanning every core source, including unused helpers. Core third-party packages require an explicit review and allowlist update; none are currently approved.

The TypeScript AST checker covers imports, exports, import types, dynamic imports, prohibited runtime capabilities and CSS imports. TypeScript paths must match the policy. Vite uses the same aliases, runs the guard at startup/build/hot updates, and checks the actual bundle graph for server modules. Core is independently typechecked with ES-only libraries and no ambient Node/DOM types.

Architecture tests include malicious direct/indirect imports. This guards accidental architecture drift; it is not a sandbox against malicious edits to the checker, package dependencies, or policy. Policy/config changes require review. All code loading must remain statically analyzable. Add runtime capabilities deliberately in their owning layer rather than disabling a failing rule.

## Frontend choices

React Router owns the two actual routes and 404 state. Shared layout owns skip navigation, landmarks, route focus, responsive navigation, and footer. CSS uses logical properties for Hebrew RTL. No external fonts, analytics, network requests, or UI state library. TanStack Query/auth context/forms are deferred until real server data, authentication, or forms exist.

ApplicationContext is a real public presentation contract: locale, direction, and timezone. The browser uses it to set document language/direction; the identical parser runs under Vitest and Deno. It has no financial behavior. Task 2 may introduce Zod and Decimal through reviewed, pinned dependencies. Future deployed Edge Functions receive their own Deno dependency configuration; the test-only Deno config is not a deployment config.

## Names and tests

- Directories: kebab-case. Components: PascalCase.tsx. Hooks: useName.ts. Other TypeScript: kebab-case.ts.
- Types: PascalCase. Functions: camelCase. SQL: snake_case. Migrations: CLI-generated timestamps.
- Unit/components: colocated `.test.ts(x)`. Architecture: `tests/architecture`. E2E: `tests/e2e`. Runtime compatibility: `tests/runtime`.
- Future cross-module integration/provider tests: `tests/integration` and `tests/providers`; synthetic fixtures only.
- Before handing off: `npm run verify`. Document any check that could not run; never report it as passed.

## Tooling references

Compatibility checked against official [Vite](https://vite.dev/guide/), [Vitest](https://vitest.dev/guide/), [Deno TypeScript](https://docs.deno.com/runtime/fundamentals/typescript/), [Playwright](https://playwright.dev/docs/intro), and [Supabase dependencies](https://supabase.com/docs/guides/functions/dependencies) documentation. Exact versions are recorded in package.json and package-lock.json. TypeScript stays on 5.9.3 within typescript-eslint's declared compatibility; no peer dependency overrides are used.
