# Architecture and placement

Status: approved design; Tasks 1–4 implemented locally. Use a modular monolith, one React/Vite client and one Supabase backend. Canonical primitives/contracts, invited-user identity and manual accounts/dated observations exist; transactions and other financial features remain later work.

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

`scripts/architecture-policy.json` contains exact approved `@finance` modules. Task 2 adds reviewed contracts and money/date primitives alongside application-context. Each path has an acceptance and direct/indirect rejection test. `@/*` maps to `src/*`. No wildcard `@finance` mapping is permitted.

The frontend may access only explicitly approved files in core/contracts and core/domain, and only through the approved alias. Relative paths into Supabase, alternate aliases, server type imports, re-exports, raw imports, runtime loaders and nonliteral dynamic imports are rejected. Core local dependencies are checked recursively by scanning every core source, including unused helpers. Reviewed core packages are Zod 4.6.5 and decimal.js 10.6.0. Package subpaths require separate review, and only `domain/money/decimal.ts` may import decimal.js. Its private clone/configuration cannot escape. Browser source cannot import either package directly under the current policy.

The TypeScript AST checker covers imports, exports, import types, dynamic imports, prohibited runtime capabilities and CSS imports. TypeScript paths must match the policy. Vite uses the same aliases, runs the guard at startup/build/hot updates, and checks the actual bundle graph for server modules. Core is independently typechecked with ES-only libraries and no ambient Node/DOM types.

Architecture tests include malicious direct/indirect imports. This guards accidental architecture drift; it is not a sandbox against malicious edits to the checker, package dependencies, or policy. Policy/config changes require review. All code loading must remain statically analyzable. Add runtime capabilities deliberately in their owning layer rather than disabling a failing rule.

## Frontend choices

React Router owns the two actual routes and 404 state. Shared layout owns skip navigation, landmarks, route focus, responsive navigation, and footer. CSS uses logical properties for Hebrew RTL. No external fonts, analytics or UI state library. The public shell makes no external requests. Task 3 identity routes use the pinned Supabase SDK through shared browser infrastructure; sessions stay in memory.

ApplicationContext is a real public presentation contract: locale, direction, and timezone. The browser uses it to set document language/direction; its Zod schema follows the same validation strategy as other contracts. Its Task 1 parser retains its immutable return and TypeError behavior. Future deployed Edge Functions receive their own Deno dependency configuration; the test-only Deno config is not a deployment config.

## Task 2 decisions

No incompatibility with the approved architecture was found; no redesign was needed. Schemas are strict, portable Zod definitions with inferred output types. Branded decimal/date/ID types prevent accidental mixing, while every exported arithmetic/date entry point revalidates runtime inputs. Objects/arrays at contract boundaries are readonly; no library arithmetic instance enters a DTO. Generic metadata bags are deliberately omitted until a concrete semantic field is needed.

One shared corpus tests the exact aliases through Vitest/jsdom, Deno (cached-only module loading and no runtime permissions), and an isolated Vite browser probe. The probe runs on a blank Chromium page without network requests in four timezones and is excluded from `dist/`. Original shell E2E checks remain intact. Exact test-only Deno imports map to the same installed npm versions; npm's lockfile and `npm ci` are the dependency authority, without a second independently resolved dependency graph.

See [portable contracts](portable-contracts.md) for numeric bounds, error behavior, signs, ownership and historical FX semantics. Task 2 added no application service, persistence, provider, reconciliation, reporting feature or runtime clock. Task 3 adds local identity persistence only; see [decisions](task-3-decisions.md) and [auth boundaries](local-auth.md).

## Names and tests

Task 4's bounded accounts feature uses core/contracts/valuation and core/domain/money/valuation through exact reviewed aliases. Pure as-of selection/FX calls remain in core. Atomic persistence and authorization use curated SQL invoker commands; no unused TypeScript application service is introduced. A single invoker snapshot reads coherent account/observation history without the Data API row cap. See [Task 4 decisions](task-4-decisions.md).

- Directories: kebab-case. Components: PascalCase.tsx. Hooks: useName.ts. Other TypeScript: kebab-case.ts.
- Types: PascalCase. Functions: camelCase. SQL: snake_case. Migrations: CLI-generated timestamps.
- Unit/components: colocated `.test.ts(x)`. Architecture: `tests/architecture`. E2E: `tests/e2e`. Runtime compatibility: `tests/runtime`.
- Future cross-module integration/provider tests: `tests/integration` and `tests/providers`; synthetic fixtures only.
- Before handing off: `npm run verify`. Document any check that could not run; never report it as passed.

## Tooling references

Compatibility checked against official [Vite](https://vite.dev/guide/), [Vitest](https://vitest.dev/guide/), [Deno TypeScript](https://docs.deno.com/runtime/fundamentals/typescript/), [Playwright](https://playwright.dev/docs/intro), and [Supabase dependencies](https://supabase.com/docs/guides/functions/dependencies) documentation. Exact versions are recorded in package.json and package-lock.json. TypeScript stays on 5.9.3 within typescript-eslint's declared compatibility; no peer dependency overrides are used.
