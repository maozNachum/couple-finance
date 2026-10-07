# Task 1 delivery report

Task 1 only is complete: a local React/Vite/TypeScript shell, Hebrew RTL layout, portable application-context contract, automated architecture enforcement, documentation and verification tooling. No financial functionality, database, migrations, authentication, provider connection, AI or deployment was added.

## Repository placement and changes

The workspace was a single-project ChatGPT mirror with no existing application or Git repository. Following the latest path rule, the application was created directly in the workspace root; there is no nested couple-finance directory. A local Git repository was initialized.

Every application/configuration/documentation file listed below was newly created in Task 1. The inherited root AGENTS.md and sources/ were preserved untouched and excluded from version control. New scoped rules live at src/AGENTS.md and supabase/AGENTS.md. No empty future feature, provider, migration or database-test directories were created.

## Final source tree

```text
./
├── AGENTS.md                         # existing read-only mirror instructions; ignored
├── sources/                          # existing read-only references; ignored
├── .env.example
├── .gitignore
├── .node-version
├── .npmrc
├── .github/workflows/ci.yml
├── README.md
├── package.json
├── package-lock.json
├── index.html
├── eslint.config.js
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── tsconfig.json
├── tsconfig.core.json
├── tsconfig.tools.json
├── public/
│   └── favicon.svg
├── scripts/
│   ├── aliases.mjs
│   ├── architecture-policy.json
│   └── check-boundaries.mjs
├── src/
│   ├── AGENTS.md
│   ├── app/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── App.test.tsx
│   │   ├── router.tsx
│   │   └── styles/
│   │       ├── global.css
│   │       └── tokens.css
│   ├── pages/
│   │   ├── home/HomePage.tsx
│   │   ├── about/AboutPage.tsx
│   │   └── not-found/NotFoundPage.tsx
│   └── shared/
│       ├── application-context.test.ts
│       ├── layout/AppLayout.tsx
│       └── ui/HomeMark.tsx
├── supabase/
│   ├── AGENTS.md
│   └── functions/_shared/core/contracts/
│       └── application-context.ts
├── tests/
│   ├── setup.ts
│   ├── architecture/boundaries.test.mjs
│   ├── e2e/shell.spec.ts
│   └── runtime/
│       ├── deno.json
│       └── application-context.deno.ts
└── docs/
    ├── architecture.md
    ├── data-model.md
    ├── security.md
    ├── providers.md
    ├── roadmap.md
    ├── task-1-report.md
    └── task-2-prompt.md
```

Generated/ignored: node_modules/, dist/, test-results/ and local .git/ metadata. Screenshots are captured by browser tests in test-results/; no real household data is used.

## Exact dependency versions

Runtime used locally: Node 22.14.0; npm 10.9.2. Deno is installed locally through its pinned npm package. Direct npm dependencies are exact, without caret/tilde ranges; transitive resolutions and integrity hashes are in package-lock.json.

| Dependency | Version |
| --- | --- |
| react | 19.3.0 |
| react-dom | 19.3.0 |
| react-router-dom | 7.18.4 |
| vite | 8.3.3 |
| @vitejs/plugin-react | 6.1.2 |
| typescript | 5.9.3 |
| vitest | 5.0.3 |
| @testing-library/react | 16.3.3 |
| @testing-library/jest-dom | 7.0.1 |
| @testing-library/user-event | 14.6.7 |
| jsdom | 26.1.0 |
| @playwright/test | 1.63.0 |
| @axe-core/playwright | 4.13.0 |
| deno | 2.9.6 |
| eslint | 10.12.0 |
| @eslint/js | 10.0.1 |
| typescript-eslint | 8.71.1 |
| eslint-plugin-react-hooks | 7.1.1 |
| eslint-plugin-react-refresh | 0.5.7 |
| globals | 17.13.0 |
| @types/node | 22.14.0 |
| @types/react | 19.3.0 |
| @types/react-dom | 19.3.0 |

TypeScript 5.9.3 is within typescript-eslint's declared range. jsdom 26.1.0 supports the installed Node runtime. An initially selected deprecated ESLint version was replaced with supported ESLint 10; browser accessibility checks use axe. The final npm dependency tree has no invalid peers or overrides. A clean npm ci completed with zero reported vulnerabilities.

## Verification commands and results

| Executed command | Result |
| --- | --- |
| `node --version`, `npm --version`, `git --version` | Runtime/tool inventory confirmed |
| `npm view ... version engines/peerDependencies --json` | Official registry compatibility checked |
| `npm install` | Pinned dependencies installed; lockfile generated |
| `npm ci` | Clean lockfile installation passed; 0 reported vulnerabilities |
| `npm ls --depth=0` | All direct dependencies resolved; no invalid peers |
| `npx playwright install chromium` | Chromium test browser installed |
| `npm run typecheck` | Passed: browser, ES-only core, tooling/tests |
| `npm run lint` | Passed: zero errors/warnings |
| `npm run check:architecture` | Passed: import rules, core purity, exact alias parity |
| `npm test` | Passed: 3 files, 40 tests |
| `npm run check:deno` | Passed: typecheck and 2 permission-free tests |
| `npm run build` | Passed: guarded Vite production build, 31 modules |
| `npm run test:e2e` | Passed: 4 tests across desktop/mobile Chromium |
| `npm run verify` | Complete chain passed with exit code 0 |

After the full chain passed, the screenshot capture was moved before keyboard focus to record the default visual state. The browser suite was rerun and passed; no production behavior changed.

Browser coverage: initial Hebrew RTL render, shared context reflected in document attributes, current-route navigation, keyboard skip link, main focus after route changes, direct route reload, 404, no horizontal overflow at 320px, no JavaScript errors, no external network requests, and axe scans of home/about. Desktop and mobile screenshots were inspected visually. Initial insufficient text contrast was corrected; no accessibility rule was disabled.

Build output: approximately 266.16 kB JavaScript (84.37 kB gzip) and 6.50 kB CSS (2.02 kB gzip). These are build observations, not performance service-level guarantees.

## Architecture evidence

- Only exact `@finance/contracts/application-context` is currently approved.
- TypeScript and Vite use matching mappings; widening the TypeScript alias fails validation.
- Direct, relative, absolute, type-only, re-export, dynamic, loader-suffixed and unapproved core imports are tested.
- Approved contracts cannot transitively re-export server helpers. Core packages/globals are restricted, and core has an independent ES-only typecheck.
- Actual Vite bundle graph is guarded against server modules.
- AppLayout/React behavior and the same shared contract are exercised in browser-oriented Vitest tests, the built browser, and Deno.
- No provider, application-service or backend-infrastructure module exists in the browser graph.

## Limitations and unresolved issues

No known blocker remains for Task 1. Remote CI is configured but has not run on a hosted repository. Browser tests cover Chromium desktop/mobile emulation, not physical devices, Safari or Firefox. Deno compatibility is local; no Supabase Edge Function was deployed. These boundaries match the requested task.

The install reports a transitive whatwg-encoding deprecation from the DOM-test toolchain; it does not fail installation/tests and npm reported zero vulnerabilities. Test output contains harmless NO_COLOR/FORCE_COLOR environment warnings.

The current shell has no authentication or financial services and must not be described as a ready financial product. Future security isolation remains Task 3 work. No Task 2 implementation was started.

## Next task

Use [the Task 2 prompt](task-2-prompt.md) in a new conversation. It adds pure money/date foundations and canonical contracts only, retaining all current boundaries.
