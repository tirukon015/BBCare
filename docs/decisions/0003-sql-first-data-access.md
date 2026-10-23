# ADR 0003: SQL-first data access with postgres.js

**Status:** Accepted, October 2026 (supersedes the initial Drizzle ORM proposal)

**Context:** The schema relies heavily on Postgres features that ORMs model poorly: separate schemas per module, generated `tsvector` columns, custom text-search configuration, triggers enforcing revision immutability, partitioned analytics tables, `pgvector`, and `NULLS NOT DISTINCT` constraints. Keeping a TypeScript schema definition and SQL migrations in sync would create two sources of truth.

**Options:** Drizzle ORM; Prisma; Kysely; SQL-first with `postgres` (postgres.js).

**Decision:**
- Plain SQL migrations in `packages/db/migrations/NNNN_name.sql` are the single source of truth.
- A small runner (`packages/db/src/migrate.ts`) applies files in order inside transactions and records file name and SHA-256 checksum in `public.schema_migrations`; a changed checksum on an applied file is an error.
- Queries use postgres.js tagged templates, which always parameterize values. Each module has a repository file with explicit TypeScript row types.
- Integration tests run every repository against a real migrated Postgres database.

**Consequences:** No ORM dependency or drift. Row types are maintained by hand and protected by integration tests.
