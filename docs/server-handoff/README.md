# BBCare server handoff for Antigravity

Prepared by the application side (Claude Cloud) on 2026-10-30 from branch `claude/festive-einstein-3g612s`. Application commits this handoff refers to: `bf2d140` (customer experience), `ee7a696` (geographic analytics) and the handoff commit itself (see the GitHub issue for the hash).

## Purpose

Everything that can be built, tested and documented without access to the Ubuntu server is done and green in CI. What remains needs the server: the offline geolocation file, environment variables, running migration 0007 as part of a deploy, connecting the BBCare process to the local AI gateway, and the acceptance tests that only a real host can answer. This directory is the complete, ordered package for that work.

Nothing in this package is executed by GitHub. The CI workflow builds and tests only; a push changes nothing on the server. Every step below is applied by a person or by Antigravity on the host, after the owner approves it.

## Division of responsibilities

| Claude Cloud (done, in this repository) | Antigravity (this handoff) | Owner |
| --- | --- | --- |
| Next.js application, admin, analytics, APIs, migrations, tests, documentation, GitHub commits | Server inspection, geolocation file, environment configuration, migration execution during deploy, service configuration, AI gateway connection, Nginx or Cloudflare changes where approved, server-side acceptance tests | Approvals: production deploy, production migration, DNS or tunnel changes, enabling customer-facing AI, enabling geolocation in production after the privacy review |

## Task order

1. `SERVER-INVENTORY-REQUIREMENTS.md`: inspect and record the actual server state. Do not change anything yet.
2. `ENVIRONMENT-VARIABLES.md`: prepare the environment file on the host (never in Git or chat).
3. `DATABASE-MIGRATION.md`: back up, then let the deploy apply migration 0007 (additive).
4. `GEOLOCATION-SETUP.md`: download, convert and mount the DB-IP Lite file; set `BBCARE_GEOIP_CSV`.
5. `BBCare-AI-INTEGRATION.md`: decide the network path from the BBCare process to the gateway, configure, run `gateway-check`. Customer-facing AI flags stay off.
6. `DEPLOYMENT-RUNBOOK.md`: deploy in the documented sequence with health gates.
7. `SERVER-ACCEPTANCE-TESTS.md`: run every test and record the result in the GitHub issue.
8. `ROLLBACK-AND-RECOVERY.md`: keep at hand during every step.

## Approval requirements

| Action | Approval |
| --- | --- |
| Reading the server (inventory) | None; read-only |
| Staging or preview deploy on the existing server, with synthetic data | Owner confirmed the host (blocker B-04) |
| Production deploy, production migration | Explicit owner approval per release |
| Nginx, Cloudflare Tunnel, DNS, firewall changes | Explicit owner approval |
| Enabling `BBCARE_GEOIP_CSV` in production | Owner approval after the Malaysian privacy review (`PRODUCTION-PRIVACY-CHECKLIST.md`) |
| Switching `ai_answers.en` or `ai_answers.ms` on | Owner approval after the router evaluation |

## Rules that always apply

- Inspect before changing. Record what you find; do not assume this package describes the live host.
- Preserve Ollama, the Flask gateway, Cloudflare Tunnel, Nginx, PostgreSQL and every other application already on the host.
- Never expose Ollama, the gateway or PostgreSQL on a public interface.
- Secrets live in `/etc/bbcare/*.env` (mode 600) or the gateway's `.env`; never in Git, chat or the issue.
- No destructive command without a backup and the owner's approval. Migration 0007 is additive; nothing in this package drops data.
- Synthetic data only outside production; never seed production.
