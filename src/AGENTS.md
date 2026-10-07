# Frontend rules

Follow ../docs/architecture.md and ../docs/data-model.md. The root AGENTS.md is a read-only project-mirror instruction; do not edit it or sources/.

- app owns the shell, routing, providers, and global styles. pages compose screens.
- features/<feature> owns its components, hooks, api, and model. Create only real modules.
- shared owns reusable presentation and frontend infrastructure; no financial formulas.
- Browser imports from Supabase are permitted ONLY through exact @finance aliases listed in scripts/architecture-policy.json, mapped to core/contracts or core/domain.
- Never import server application, infrastructure, providers, secrets, or tools, including type-only imports or re-exports.
- Update policy and exact TypeScript paths together only after reviewing runtime independence. Never introduce a wildcard @finance alias.
- No native floating-point financial arithmetic, business logic in JSX, fake balances, or placeholders presented as functionality.
- PascalCase.tsx components; useName.ts hooks; kebab-case folders and other files; tests beside the subject.
- Run npm run verify for foundation changes. Stop at the current approved task.
