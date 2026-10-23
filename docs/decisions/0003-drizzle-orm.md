# ADR 0003: Drizzle ORM with reviewed SQL migrations

**Status:** Accepted, October 2026

**Decision:** Drizzle ORM for typed queries. Migrations are plain SQL files committed under `packages/db/migrations`, applied in order by a small migration runner that records applied files and checksums. Migrations are forward-only; recovery from a failed production migration is a restore from the pre-migration backup.

**Why:** Close to SQL, good TypeScript inference, supports custom types such as `vector`. Plain SQL migrations keep reviews explicit, including extensions, triggers, roles, and partitions that ORMs model poorly.

**Consequences:** Schema definitions in TypeScript and SQL must stay aligned; a CI check verifies that migrations apply on an empty database and that tests pass against the migrated schema.
