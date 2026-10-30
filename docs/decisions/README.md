# Architecture Decision Records

Each significant decision has a numbered record. Status values: Proposed, Accepted, Superseded.

| ID | Title | Status |
|---|---|---|
| [0001](0001-modular-monolith.md) | Modular monolith with Next.js and a worker | Accepted |
| [0002](0002-postgresql-search-and-vectors.md) | PostgreSQL for data, full-text search, and vectors | Accepted |
| [0003](0003-sql-first-data-access.md) | SQL-first data access with postgres.js (supersedes Drizzle) | Accepted |
| [0004](0004-staff-authentication.md) | Self-hosted staff authentication with mandatory TOTP | Accepted |
| [0005](0005-local-ai-provider-interface.md) | Local AI through a provider interface to the existing Flask service | Accepted |
| [0006](0006-first-party-analytics.md) | First-party analytics, third-party tools off by default | Accepted |
| [0007](0007-git-workflow.md) | Git workflow and checkpoints | Accepted |
| [0008](0008-router-first-verified-guidance.md) | Router-first catalogue and verified-only model guidance | Accepted |
| [0009](0009-customer-demand-intelligence.md) | Customer demand intelligence and resource library | Accepted |
| [0010](0010-mesh-only-customer-release.md) | Mesh Connection only in the customer release, floating assistant on shared infrastructure | Accepted |

Template for new records: Context, Options, Decision, Consequences (cost, privacy, operations), Follow-up.
