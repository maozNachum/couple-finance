# Couple Finance

Private household finance application for Maoz and Shachar. **Task 1 only:** a Hebrew RTL application shell, a portable presentation contract, enforced code boundaries, and verification tooling. No financial functionality, authentication, database, live providers, or AI is implemented.

## Run locally

Use Node 22.14.0 (`.node-version`) and npm 10.9.2. No environment file is required.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Routes: `/`, `/about`, and an unknown-route fallback. The site contains no mock balances. Public configuration guidance is in `.env.example`.

## Verify

```sh
npx playwright install chromium
npm run verify
```

On Linux CI use `npx playwright install --with-deps chromium`. Deno is pinned as a project-local development dependency; no global Deno installation or runtime permissions are required for the contract tests.

Individual commands:

| Command | Purpose |
| --- | --- |
| `npm run typecheck` | Strict browser, ES-only core, and tool TypeScript checks |
| `npm run lint` | ESLint, TypeScript, React hooks and refresh rules |
| `npm run check:architecture` | AST-based dependency and alias validation |
| `npm test` | React behavior, shared contract, adversarial architecture tests |
| `npm run check:deno` | Deno typecheck and permission-free shared-contract tests |
| `npm run build` | Guarded production browser build |
| `npm run test:e2e` | Built-site desktop/mobile, keyboard, accessibility, route and overflow tests |
| `npm run preview` | Preview the most recent production build |

`test:e2e` expects a current `dist/`; `verify` builds it first. Browser tests own port 4173 and do not reuse an unknown running server. Screenshots/traces are local ignored artifacts under `test-results/`.

## Where code belongs

Read [architecture](docs/architecture.md), [financial model](docs/data-model.md), [security](docs/security.md), [providers](docs/providers.md), and [roadmap](docs/roadmap.md). Scoped instructions are in `src/AGENTS.md` and `supabase/AGENTS.md`.

The root is the application root; there is no nested `couple-finance/` directory. The inherited root `AGENTS.md` and `sources/` are read-only mirror material and must remain untouched. Synced references are excluded from Git, tooling, and browser serving.

This is a local foundation, not a deployed or authenticated financial application. Task 2 adds money/date contracts and pure primitives only; Task 3 introduces database/auth isolation.
