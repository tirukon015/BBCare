# BBCare to local AI gateway integration

BBCare side: `packages/ai/src/flask.ts` (`FlaskAiProvider`), factory `packages/ai/src/factory.ts`, contract `docs/integration/flask-gateway-contract.md`, acceptance script `pnpm --filter @bbcare/ai gateway-check`. Gateway side (Antigravity): `infra/flask-ai-service/` with its README, `.env.example`, systemd user unit and `test_gateway.py`. Neither side modifies the other's files.

## Status to confirm on the host

Earlier work recorded the gateway as implemented, hosted at `127.0.0.1:5001` under `systemctl --user`, proxying Ollama at `127.0.0.1:11434`, models `qwen2.5:7b` (primary) and `qwen2.5:3b` (fallback), 26 gateway tests passing. Confirm each item during the inventory and record the result in the issue. BBCare does not assume the gateway or Ollama is up: with `BBCARE_AI_PROVIDER=flask` and an unreachable gateway it falls back to search-first answers and shows "AI unavailable" states; with the provider set to `none` it never calls out.

## Contract as implemented by both sides

| Item | BBCare sends or expects | Gateway (per its README) |
| --- | --- | --- |
| Health | `GET /health`, any 2xx | `GET /health`, 200 with status, ollama, models, concurrency |
| Chat | `POST /api/chat` with `model`, `messages` (system, user, assistant), `format: "json"`, `stream: false`, `temperature`, `max_tokens`, `options.num_predict` | `POST /api/chat`, same shape; response includes `message.content` and top-level `response`, `text`, `model` |
| Embeddings | `POST /api/embed` (not used yet) | `POST /api/embed` |
| Auth | `Authorization: Bearer <BBCARE_FLASK_AI_TOKEN>` on every call | Constant-time bearer check; 401 or 403 otherwise |
| Timeout | `BBCARE_AI_TIMEOUT_MS` (default 30000) then abort | Request timeout 90 s upstream; gunicorn timeout 120 s |
| Concurrency | `BBCARE_AI_MAX_CONCURRENCY` (default 2) per BBCare process; a semaphore queues the rest | Semaphore max 2, queue timeout 5 s, 503 when busy |
| Failure handling | Any non-2xx counts as failure; three consecutive failures open a circuit for 60 s; then search-first | 5xx on internal error, 503 when busy or loading |
| Model | `BBCARE_FLASK_AI_MODEL` (set to `qwen2.5:7b`; must be in `ALLOWED_MODELS`) | Validates against `ALLOWED_MODELS`, falls back to `FALLBACK_MODEL` on primary failure |

The response text must be the model's JSON object with keys `sufficient`, `confirmed`, `possible_causes`, `steps`, `warnings`, `citations`, `product_refs`. BBCare validates it, strips anything not grounded in the evidence and abstains when citations are missing. The gateway must not post-process or truncate it. Set the gateway `max_tokens` handling to honour at least 800 tokens, since BBCare asks for 800.

## Network path decision (record in the issue)

`FlaskAiProvider` refuses any non-private hostname at startup. Choose one:

1. BBCare runs on the host (no Docker): `BBCARE_FLASK_AI_URL=http://127.0.0.1:5001`. Nothing else.
2. BBCare runs in Docker Compose (the repository's default): the container's `127.0.0.1` is itself. Options, in order of preference:
   - Nginx private proxy: render `infra/nginx/ai-proxy.conf.template` with `PRIVATE_IP` = the Docker bridge or a LAN address, `PROXY_PORT` = a free port, `FLASK_PORT=5001`; keep the gateway bound to loopback; set `BBCARE_FLASK_AI_URL=http://<PRIVATE_IP>:<PROXY_PORT>`. Nginx changes need owner approval.
   - Bind the gateway to the Docker bridge address as well (`AI_GATEWAY_HOST`), and set `BBCARE_FLASK_AI_URL=http://host.docker.internal:5001`; the compose file already maps `host.docker.internal` to the host gateway. Firewall rules must keep that port off public interfaces.
   Never bind the gateway or Ollama to `0.0.0.0` on a host with a public interface.

## Configuration on the BBCare host

In `/etc/bbcare/<env>.env` (mode 600): `BBCARE_AI_PROVIDER=flask`, `BBCARE_FLASK_AI_URL`, `BBCARE_FLASK_AI_TOKEN` (the same token as the gateway's `AI_GATEWAY_BEARER_TOKEN`), `BBCARE_FLASK_AI_CHAT_PATH=/api/chat`, `BBCARE_FLASK_AI_EMBED_PATH=/api/embed`, `BBCARE_FLASK_AI_HEALTH_PATH=/health`, `BBCARE_FLASK_AI_MODEL=qwen2.5:7b`, `BBCARE_AI_TIMEOUT_MS=30000`, `BBCARE_AI_MAX_CONCURRENCY=2`. In production `mock` is refused by the application.

## What BBCare does with the gateway

- Knowledge retrieval: lexical search over published articles plus, for a router session, the verified flow of the chosen model and problem (`apps/web/src/modules/router/ai-context.ts`). Only published, verified, sourced content becomes evidence.
- Router context: the prompt carries a "SUPPORT CONTEXT" block with router name, `ECR <code>`, "Support scope: Mesh Connection only", the chosen problem and the current guide step. The system prompt tells the model to stay inside that scope, to offer BBTech staff for anything else and never to invent button names, LED meanings, port labels or pairing sequences.
- Language: English or Malay is detected per message and requested in the prompt.
- Grounding and abstention: fewer than one evidence passage means no model call; invalid JSON or no valid citation means abstain; abstention shows guides and offers staff.
- Escalation: the customer can escalate at any time; abstentions and unavailability both show the escalation path.
- Customer-facing flags `ai_answers.en` and `ai_answers.ms` (Admin, AI) stay off until the owner approves after the router evaluation. Health is shown in Admin, AI regardless.

## Acceptance (after configuration)

```bash
# on the BBCare host, with the BBCARE_FLASK_AI_* variables exported from the env file
pnpm --filter @bbcare/ai gateway-check
```
Expected: configuration sanity, health 2xx with latency, 401 or 403 without token, a chat answer with valid JSON citing `E1`, abstention without evidence. Then `BBCARE_AI_PROVIDER=flask pnpm --filter @bbcare/evals eval:router` against a database seeded with the synthetic samples, reviewed by a bilingual reader. Record results in the issue.
