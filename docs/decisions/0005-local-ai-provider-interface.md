# ADR 0005: Local AI through a provider interface to the existing Flask service

**Status:** Accepted, October 2026

**Context:** No paid AI budget. The owner runs an existing Flask-based AI service on their own server, which must not be rebuilt. The cloud development environment cannot reach that server. Customer-facing AI must stay disabled until evaluated and approved.

**Decision:**
- `packages/ai` defines an `AiProvider` interface (`health`, `generate`, `embed`).
- Implementations: `FlaskAiProvider` (HTTP over a private network with bearer-token authentication; endpoint paths configurable because the real routes are unknown until the audit), and `MockAiProvider` (deterministic, used for development, previews, and tests only, and always labelled as mock in the UI and logs).
- No paid hosted provider implementation exists in the codebase.
- AI answers are controlled by database flags per locale and category, default off. The site runs in search-first mode whenever AI is off, unhealthy, or times out.
- All AI output passes validation: citations must reference retrieved published chunks for the resolved model; URLs, prices, stock statements, and firmware versions not present in evidence or catalog data are removed or cause abstention.

**Consequences:** Development proceeds without the server. Live integration is a configuration step plus contract verification once the private link exists.
