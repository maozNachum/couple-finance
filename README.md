# Couple Finance

Private household finance application for Maoz and Shachar. **Tasks 1–2:** a Hebrew RTL application shell, pure money/date primitives, portable validated contracts, enforced code boundaries, and verification tooling. No financial UI, reporting calculations, authentication, database, live providers, or AI is implemented.

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
| `npm run check:deno` | Offline Deno typecheck and permission-free shared-contract tests using installed npm packages |
| `npm run build` | Guarded production browser build plus isolated test-only core browser bundle |
| `npm run test:e2e` | Built-site desktop/mobile, keyboard, accessibility, route and overflow tests |
| `npm run preview` | Preview the most recent production build |

`test:e2e` expects a current `dist/` and `.artifacts/core-probe/`; `verify` builds both first. The probe never enters the app distribution. Browser tests own port 4173 and do not reuse an unknown running server. Screenshots/traces are local ignored artifacts under `test-results/`. One financial test corpus runs in Vitest, Deno, and Chromium with UTC, Jerusalem, Los Angeles, and Kiritimati timezones.

## Where code belongs

Read [architecture](docs/architecture.md), [financial model](docs/data-model.md), [security](docs/security.md), [providers](docs/providers.md), and [roadmap](docs/roadmap.md). Scoped instructions are in `src/AGENTS.md` and `supabase/AGENTS.md`.

The root is the application root; there is no nested `couple-finance/` directory. The inherited root `AGENTS.md` and `sources/` are read-only mirror material and must remain untouched. Synced references are excluded from Git, tooling, and browser serving.

This is a local foundation, not a deployed or authenticated financial application. See [Task 2 contracts](docs/portable-contracts.md), [delivery report](docs/task-2-report.md), and [recommended Task 3 prompt](docs/task-3-prompt.md). Task 3 introduces database/auth isolation.

## Git workflow for future tasks

1. Implement one bounded, explicitly requested task at a time.
2. Run `npm run verify` and any additional checks required by that task; all checks must pass.
3. Review `git status`, the complete diff, and new files. Stage only relevant project files and inspect `git diff --cached`.
4. Never commit secrets, credentials, real financial information, local databases, generated builds, dependencies, or unrelated workspace files. Keep `sources/` and the inherited root `AGENTS.md` excluded and untouched; environment examples must contain placeholders only. Review relevant history before the first push.
5. Commit with a meaningful message, verify a clean working tree, and push the current branch to the private `couple-finance` repository only after checks pass. Confirm the remote owner and PRIVATE visibility before the first push; inspect existing remote history before connecting to an existing repository.
6. Check the push result and any GitHub Actions run. Never force-push or rewrite shared history without explicit approval.
