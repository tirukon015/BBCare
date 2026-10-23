# ADR 0001: Modular monolith with Next.js and a worker

**Status:** Accepted, October 2026

**Context:** One team, one database, modest traffic, strong need for maintainability and low operating cost.

**Options:** microservices; separate frontend and API services; modular monolith.

**Decision:** One Next.js App Router application (TypeScript strict) for customer UI, admin UI, and API, plus one Node worker process for asynchronous jobs. pnpm workspaces with `apps/web`, `apps/worker`, and shared packages. Module boundaries live in `apps/web/src/modules` and in Postgres schemas.

**Consequences:** Single deployable plus worker; fewer network failure modes; extraction of a module remains possible. Requires discipline about cross-module imports (enforced by lint rules and review).
