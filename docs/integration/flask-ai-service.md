# Integration Plan: Existing Flask AI Service

**Status:** Prepared, live integration BLOCKED (no private network path from the cloud development environment to the owner's server; see `docs/status/blockers.md` B-01 to B-03).

## Principles
- The existing server and Flask service are not replaced, reinstalled or modified by BBCare work.
- BBCare calls the Flask service only over a private network with a bearer token. The service is never exposed to the public internet.
- The BBCare website works without the AI service (search-first mode). AI answers stay off until the owner approves activation.
- No customer conversation is used to train models. Only the current session's recent messages and published knowledge are sent.

## Step 1: read-only audit (owner action)
Run on the server as a normal user (no sudo needed):

```bash
curl -fsSLO https://raw.githubusercontent.com/tirukon015/BBCare/<branch>/infra/scripts/audit-server.sh   # or copy the file
less audit-server.sh                                   # review it first: it only reads
bash audit-server.sh /path/to/flask/project > bbcare-audit.txt
```

Review `bbcare-audit.txt` and share it through a private channel (not pasted into chat if it is long). The script prints no environment variable values, redacts credential-like strings and does not dump file contents. It reports hardware, GPU and VRAM, Ollama models, listening ports, firewall summary, Flask routes and authentication hints.

## Step 2: decide the connection (after the audit)
Preferred options, in order:
1. **Same host:** BBCare and Flask on the same machine; BBCare calls `http://127.0.0.1:<port>`.
2. **Private network:** WireGuard or Tailscale between the BBCare host and the AI server; BBCare calls `http://100.x.y.z:<port>` or a `*.ts.net` name. The adapter refuses public hostnames.
3. **Authenticating proxy in front of Flask** (only if Flask has no authentication today): a small Nginx or Caddy site on the AI server listening on the private interface only, checking `Authorization: Bearer <token>` and forwarding to Flask on localhost. This adds a new config file and does not change the Flask code. Template: `infra/nginx/ai-proxy.conf.template`.

## Step 3: contract
`packages/ai/src/flask.ts` (`FlaskAiProvider`) expects:

| Purpose | Default path (configurable) | Request | Response accepted |
|---|---|---|---|
| Health | `GET /health` | none | any 2xx |
| Chat | `POST /api/chat` | `{"model","messages":[{"role","content"}],"format":"json","stream":false,"temperature","max_tokens","options"}` | `{"response"}` or `{"text"}` or `{"answer"}` or `{"message":{"content"}}` or OpenAI-style `{"choices":[{"message":{"content"}}]}` |
| Embeddings (optional) | `POST /api/embed` | `{"model","input":[...]}` | `{"embeddings":[[...]]}` or `{"data":[{"embedding":[...]}]}` |

If the existing Flask routes differ, BBCare is configured, not the server: set `BBCARE_FLASK_AI_CHAT_PATH`, `BBCARE_FLASK_AI_EMBED_PATH`, `BBCARE_FLASK_AI_HEALTH_PATH`, `BBCARE_FLASK_AI_MODEL`. If the payload shape is incompatible, a thin adapter is added to `flask.ts` (BBCare side).

## Step 4: configuration (owner places secrets on the BBCare host, never in chat)
```
BBCARE_AI_PROVIDER=flask
BBCARE_FLASK_AI_URL=http://<private-address>:<port>
BBCARE_FLASK_AI_TOKEN=<set on the host only>
BBCARE_AI_TIMEOUT_MS=30000
BBCARE_AI_MAX_CONCURRENCY=2        # protects the server's existing workloads
```

## Step 5: verification (BBCare side, no server changes)
1. Admin, AI page: provider health shows reachable.
2. Register candidate models in Admin, AI (name, licence from the model card).
3. Run the evaluation: `pnpm --filter @bbcare/evals eval` with `BBCARE_AI_PROVIDER=flask`. Review per-case results, latency and the Malay answers (bilingual reviewer).
4. Move the model through candidate, evaluated, approved, active (Admin, AI).
5. Owner approves activation; then turn on `ai_answers.en` and `ai_answers.ms` (type ENABLE).

## Resource protection
- Concurrency cap and queue in the adapter (`BBCARE_AI_MAX_CONCURRENCY`, queue of 20).
- Circuit breaker: three consecutive failures pause calls for 60 seconds; the site falls back to search.
- Timeouts on every call; requests carry at most four evidence passages and six history messages.

## Router-specialised assistant (prepared, not connected)
The router journey is ready for retrieval-augmented generation. Nothing below is active; AI answers stay off until the owner approves.

**Retrieval (server side only).** `apps/web/src/modules/router/ai-context.ts` returns evidence for one customer's selected model, mode and problem, taken only from the single published, verified, sourced flow (`getVerifiedRouterFlow`). `packages/ai/src/router-evidence.ts` formats one passage per step with its expected result, warning and source. No case, transcript or other customer's data is ever retrieved; conversation history is limited to the caller's own session (existing behaviour in `support/service.ts`).

**Abstain and escalate.** With no verified evidence, `generateGroundedAnswer` abstains without calling the model, and the customer gets the intake questions and staff escalation. Timeouts, connection failures and malformed or unparseable responses map to `unavailable` or `abstain`, never to an answer (tests in `packages/ai/test/ai.test.ts`). The mock provider remains the test double and is refused in staging and production.

**Wiring step (after approval).** In the router scenario page or the support assistant, call `routerEvidence(...)`, pass the evidence to `generateGroundedAnswer`, and render citations from the flow's sources. Add router questions to `evals/datasets` before activation.

**Learning loop (staff-gated).** Customer question, response, outcome recorded on the case (`resolution_flow_id`, `resolution_note`, `resolution_verified`), staff review, then either a knowledge update (new or corrected flow, verified as above) or a curated example in `ai.training_examples`. An example is proposed by staff from a resolved case, scrubbed of personal data and secrets, and approved by a different reviewer after a privacy screen (enforced in SQL). Only approved examples export as JSONL (Admin, AI, Training examples). Customer messages and AI answers are never added automatically. Fine-tuning is a separate decision once enough approved examples and an evaluation baseline exist.

## Model selection (after audit)
Candidates and the evaluation matrix are in the v2/v3 discovery reports summarised in `docs/project/08-local-ai-commerce-and-analytics.md`. Default shortlist when VRAM allows: Qwen3 (Apache 2.0), a SEA-LION variant (verify licence of the exact checkpoint), Sailor2, Gemma 3 (Gemma terms); embeddings bge-m3 (MIT) or Qwen3-Embedding (Apache 2.0). Installing or benchmarking models on the server requires owner approval.
