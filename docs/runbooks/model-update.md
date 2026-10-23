# Runbook: AI Model Install, Update and Rollback

Installing or benchmarking models on the owner's server requires owner approval.

1. Register the candidate in Admin, AI (name, purpose, quantization, licence verified from the model card).
2. Install on the server (owner or approved operator), outside busy hours; confirm memory headroom for existing workloads.
3. Run `BBCARE_AI_PROVIDER=flask BBCARE_FLASK_AI_MODEL=<name> pnpm --filter @bbcare/evals eval` from a host that can reach the private endpoint. Bilingual reviewer checks Malay answers.
4. Move status: candidate, evaluated, approved (owner), active. Activation demotes the previous active model to approved, which keeps it ready for rollback.
5. Monitor latency, abstention rate and feedback for a week (Admin, Analytics and AI).
6. Rollback: activate the previous approved model; or turn off `ai_answers.*` to return to search-only mode immediately.
