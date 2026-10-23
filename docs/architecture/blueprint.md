# BBCare Architecture Blueprint

**Status:** Approved direction (owner policy, October 2026). Individual decisions are recorded in `docs/decisions/`.

## 1. Shape of the system
A modular monolith: one Next.js (TypeScript) application serving the customer site, the admin area, and the HTTP API, plus one background worker process. Both share a single PostgreSQL database. AI inference runs on the owner's existing server behind a private, authenticated API and is optional at runtime.

```
Internet -> [edge: Cloudflare Tunnel or Nginx, TLS, limits]
              |
        +-----+----------------------------- BBCare host --------------------------+
        | web (Next.js)                            worker (Node, ops.jobs queue)          |
        |  customer UI en/ms, admin UI (RBAC+MFA)   ingest, chunk, embed, rollups  |
        |  route handlers, server actions           link checks, retention, evals  |
        |            \__________ PostgreSQL (private) __________/                   |
        |            schemas: identity catalog commerce knowledge support           |
        |                     analytics ai ops                                      |
        +---------------------------------|---------------------------------------+
                                          | private network only
                               [existing Flask AI service on owner server]
```

Trust boundaries: TB1 internet to app (all input untrusted); TB2 app to AI service (AI output and retrieved text untrusted); TB3 reporting (aggregates only).

## 2. Why a modular monolith
Single team, single database, modest traffic. Separate processes exist only where work is genuinely asynchronous (worker) or needs different hardware (AI server). Module boundaries are enforced by folder structure, service interfaces, and Postgres schemas, so extraction stays possible.

## 3. Modules
| Module | Owns |
|---|---|
| identity | staff users, roles, permissions, MFA, sessions |
| audit | append-only audit log |
| catalog | categories, brands, models, variants, aliases, firmware |
| commerce | sellable products, specs, compatibility, listings, verifications, recommendations |
| knowledge | sources, articles, locale revisions, review workflow, applicability, chunks, troubleshooting flows |
| search | normalization (English, Malay, model numbers), hybrid retrieval over published content |
| support | sessions, messages, feedback, cases, unresolved questions |
| ai | provider interface (Flask, mock), prompts, output validation, flags, evaluations |
| analytics | consent, events, scrubbing, geo, rollups, dashboards |

Rules: UI and routes call module services; only a module touches its own tables; `ai` receives evidence only from `search`, which returns published content only.

## 4. Data
PostgreSQL 16+ with `pg_trgm`, `unaccent`, and `pgvector` (when available). postgres.js with reviewed SQL migrations (ADR 0003). UUID keys, `timestamptz`, explicit foreign-key delete rules. Database roles: owner (migrations), app (data only, insert-only on audit), reporting (aggregates only). See `docs/architecture/erd.md`.

## 5. Search and AI
1. Normalize input (spelling, colloquial Malay, model numbers).
2. Resolve product model; ask a clarifying question if ambiguous.
3. Retrieve published content filtered by applicability (lexical full-text plus trigram; vectors when embeddings exist), fused by reciprocal rank.
4. Below an evidence threshold: abstain and offer escalation.
5. If AI is enabled and available: generate a structured answer, validate citations, strip any URL, price, stock or firmware claim not present in evidence or catalog data, attach the AI disclosure.
6. If AI is disabled or unavailable: return ranked articles and troubleshooting flows (search-first mode).

AI answers are off by default. Model changes follow candidate, evaluated, approved, active, retired.

## 6. Commerce
Recommendations are rendered from the database, never from model output. A listing is eligible only when active, verified within the configured window, compatibility-verified, and on an allowlisted domain (`www.bbtech.shop`, `shopee.com.my`). Outbound clicks pass through `/go/r/{id}`, which logs a referral and redirects to the stored URL. Prices are hidden unless an authorized fresh source exists.

## 7. Analytics
First-party events with a common envelope, schema validation, personal-data scrubbing (email, phone, MyKad patterns), state-level geo with raw IP discarded, consent-gated visitor identifiers, nightly rollups, small-area suppression, separate short-lived security log. Raw events 90 days, aggregates 25 months (pending legal review).

## 8. Environments
| Env | Purpose | Data |
|---|---|---|
| dev | cloud session | synthetic |
| ci | GitHub Actions | synthetic |
| preview/staging | browser-accessible testing | synthetic only |
| production | live | real, backed up |

## 9. Operations
Docker Compose deployment (web, worker, postgres) behind the edge proxy. Nightly `pg_dump` plus off-site encrypted copy, monthly restore drill, image-based rollback, pre-migration backups. Structured logs with redaction. Health endpoints: liveness, readiness (database), AI status (informational).

## 10. Safety gates
No production deploy, production migration, DNS change, data deletion, paid service, external publication, customer-facing AI activation, real customer data import, or merge to `main` without explicit owner approval. Inference and database services are never public.
