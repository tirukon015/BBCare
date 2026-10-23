# 05. Security, Testing, and Deployment

## Security baseline
- Secure authentication and role-based authorization.
- Server-side access checks for every private resource.
- Secrets never in source control, browser bundles, or logs.
- `.env.example` contains placeholders only.
- Validate inputs and uploaded file types/sizes.
- Private file storage with controlled access.
- Rate-limit public search and AI endpoints.
- Treat retrieved documents as untrusted data, not instructions.
- Protect against prompt injection and data exfiltration.
- Prevent cross-customer session access.
- Minimize personal data and define retention/deletion.
- Log sensitive admin actions.
- Keep dependencies updated.
- Never expose PostgreSQL publicly.
- Review privacy and provider terms before sending customer data to external AI.

## Tests
- Unit: validation, permissions, model applicability, deduplication.
- Integration: migrations, repositories, authorization, uploads, import failure handling.
- E2E: browse/search, support chat, article review/publish, admin restrictions.
- Security: access control, XSS/SQL injection, prompt injection, unsafe uploads, rate limiting, secret leakage.
- AI evaluation: versioned reviewed expected answers and abstention cases.
- Performance and recovery: latency, concurrency, backup restoration, rollback.

## Environments
Local uses synthetic/sanitized data. Staging has isolated resources and non-production secrets. Production uses approved knowledge, access controls, backups, monitoring, and a gradual release.

## Proposed production topology
Cloudflare/Tunnel if appropriate -> Nginx -> Next.js Node service on a verified free localhost port -> PostgreSQL on localhost/protected network; worker managed by systemd; private file storage. Optional Plotly Cloud dashboard uses restricted reporting data.

Do not assume a port is free. Inspect actual server services, tunnel routes, firewall, disk, memory, and backup state before proposing changes.

## Deployment procedure
1. Confirm approved commit and release notes.
2. Run lint, typecheck, unit, integration, security, and build checks.
3. Back up database and confirm restore procedure.
4. Review migration and rollback compatibility.
5. Deploy to staging and smoke-test.
6. Obtain explicit production approval.
7. Deploy using a documented script.
8. Verify health, logs, and key user journeys.
9. Monitor; roll back if critical checks fail.

No production release until critical tests pass, high-severity security issues are resolved, backup restoration is tested, AI evaluation meets approved thresholds, access isolation is verified, and the owner approves.
