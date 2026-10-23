# 09. Cloud-First Execution Policy

**Status:** Confirmed (owner instruction, October 2026).

## Environment
- Development and automated testing run in the Claude cloud development session.
- GitHub (`tirukon015/BBCare`) is the durable source of truth. Work is pushed to the dedicated development branch at verified checkpoints.
- `main` is the intended primary branch. Merging to `main` requires owner approval.
- The owner's ThinkPad is used only to manage the existing server when required. It is not a build machine.
- No paid APIs, credits, or subscriptions may be activated.

## Existing server
- The owner's server runs an existing Flask-based AI service. It must not be replaced, reinstalled, or modified by BBCare work.
- First deliverable for the server: a read-only audit script (`infra/scripts/audit-server.sh`) and an integration plan (`docs/integration/flask-ai-service.md`).
- Live integration happens only over a private, authenticated connection. Until then, BBCare uses a provider interface and a mock provider, and the live integration is recorded as blocked.

## Autonomy
Autonomous: file changes, dependency management, development SQL, migrations on disposable databases, tests, builds, bug fixing, documentation, commits and pushes to the development branch.

Requires explicit approval: merging to `main`, production deployment, production migrations, DNS or firewall exposure changes, overwriting real data, enabling paid services, external publication, activating customer-facing AI, importing real customer data, installing or benchmarking large models.

## Human blockers
Record in `docs/status/blockers.md`, prepare instructions or configuration, continue independent work, batch requests at checkpoints, resume when resolved. Secrets are never requested in chat.

## Cross-device testing
- BBCare must be testable from Windows, macOS, Android, iPhone, and iPad browsers without local tooling.
- Preview, staging, and production are distinct. Staging uses synthetic data only.
- Remote testing is not declared ready until a browser-accessible environment is deployed and verified.
