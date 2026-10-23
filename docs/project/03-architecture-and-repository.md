# 03. Architecture and Repository

## Proposed architecture, pending approval
- `apps/web`: Next.js App Router, TypeScript, Tailwind.
- `apps/worker`: background imports, parsing, indexing.
- `apps/analytics`: Python Dash/Plotly; Plotly Cloud optional.
- `packages/database`: schema, migrations, database access.
- `packages/ai`: provider-neutral model adapter, retrieval, prompt and response validation.
- `packages/shared`: shared types and Zod schemas.
- `packages/ui`: reusable UI components if useful.
- PostgreSQL for application data; pgvector if selected and supported.
- Private object storage for documents and media.
- Restricted reporting API or sanitized aggregate data for analytics.

Use a modular monolith plus a worker only where asynchronous work is needed. Do not create microservices without a demonstrated need.

## Candidate technology
Next.js, TypeScript, Tailwind, PostgreSQL, Drizzle ORM, pgvector, Zod, Vitest, Playwright, Python Dash/Plotly. Verify current versions, compatibility, hosting, licensing, and costs before selecting dependencies. Authentication, AI provider, and file storage remain undecided.

## Proposed repository
```text
bbcare/
  apps/web/
  apps/worker/
  apps/analytics/
  packages/database/
  packages/ai/
  packages/shared/
  packages/ui/
  docs/project/
  docs/architecture/
  docs/api/
  docs/security/
  docs/deployment/
  docs/decisions/
  tests/integration/
  tests/e2e/
  tests/security/
  tests/ai-evaluation/
  data/samples/       # synthetic data only
  infra/nginx/
  infra/systemd/
  infra/scripts/
  .env.example
  .gitignore
  package.json
  pnpm-workspace.yaml
  README.md
```
This is a proposal. Start with the minimum required structure.

## API principles
Validate all untrusted inputs, enforce authorization server-side, rate-limit public AI endpoints, use consistent safe errors, paginate results, and protect internal records and files.

Candidate routes: `GET /api/health`, `GET /api/routers`, `GET /api/routers/:id`, `POST /api/support/sessions`, `POST /api/support/sessions/:id/messages`, plus protected admin endpoints.

## Integration boundaries
Plotly Cloud must use a restricted reporting API or sanitized aggregate export. Existing BBTech systems stay untouched unless an integration proposal is separately approved. Production credentials must not be used locally. AI provider keys stay server-side.
