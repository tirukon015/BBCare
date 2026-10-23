# CLAUDE.md

Instructions for coding agents working on BBCare.

## Binding documents
- `docs/project/07-agent-working-agreement.md` and `docs/project/09-cloud-first-execution-policy.md` are binding.
- `docs/architecture/blueprint.md` describes the architecture; `docs/decisions/` records decisions.
- Track work in `docs/status/progress.md` and blockers in `docs/status/blockers.md`.

## Hard rules
- Never commit secrets. `.env.example` holds placeholders only.
- Synthetic data only in development, tests, and previews.
- No paid AI or third-party services. The mock AI provider is for development and tests only.
- Customer-facing AI stays disabled until the owner approves activation.
- Do not modify the owner's existing server or Flask service.
- No merge to `main`, production deploy, production migration, or DNS change without explicit owner approval.
- Never disable a security control or skip a test to get green.
- Documentation style: plain, professional, no em dashes.

## Commands
See README.md (kept current as tooling is added).
