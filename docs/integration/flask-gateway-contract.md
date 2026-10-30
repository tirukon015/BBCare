# Flask AI Gateway Contract (BBCare side)

**Status:** Prepared 2026-10-30. The gateway itself is implemented, hosted and tested by Antigravity on the owner's server and pushed to `claude/festive-einstein-3g612s`. This document states exactly what BBCare's existing adapter (`packages/ai/src/flask.ts`, `FlaskAiProvider`) sends and accepts, so the two sides meet without either changing the other's infrastructure.

BBCare does not create a Flask service and does not modify the gateway's files. If the gateway's shape differs from this contract, BBCare adjusts through configuration first (paths, model name), and only then through a thin adapter change on the BBCare side.

## Transport
| Item | BBCare behaviour | Gateway must |
|---|---|---|
| Address | `BBCARE_FLASK_AI_URL`, refused unless the host is private (`localhost`, `127.x`, `10.x`, `192.168.x`, `172.16-31.x`, `100.64-127.x` Tailscale, `*.ts.net`, `*.internal`, `*.local`, `host.docker.internal`, or a single-label Docker service name). HTTPS public hostnames are rejected at startup. | Listen on a private interface only. Never expose to the internet. |
| Authentication | Every request carries `Authorization: Bearer <BBCARE_FLASK_AI_TOKEN>`. | Reject requests without a valid bearer token with HTTP 401 or 403. The token is set on the BBCare host and the gateway host only, never in Git or chat. |
| Headers | `content-type: application/json`, `accept: application/json`. | Respond with `content-type: application/json`. A non-JSON body is read as plain text and treated as the answer, which is not wanted for chat. |
| Timeout | `BBCARE_AI_TIMEOUT_MS` (default 30000) per request, then abort. | Answer within the timeout or BBCare marks the service unavailable for that request. |
| Concurrency | At most `BBCARE_AI_MAX_CONCURRENCY` (default 2) in-flight requests from one BBCare process; extra requests queue. | Nothing required; this protects the server's other workloads. |
| Failures | Three consecutive failures open a circuit breaker for 60 seconds; BBCare falls back to search-first mode. Any non-2xx status counts as a failure. | Return 2xx only for a real answer. Use 5xx for internal errors, 503 when the model is loading or busy. |

## Health: `GET {BBCARE_FLASK_AI_HEALTH_PATH}` (default `/health`)
- Request: bearer token, no body.
- Response: any 2xx. Body is ignored. Shown in Admin, AI as reachable or not, with latency.

## Chat: `POST {BBCARE_FLASK_AI_CHAT_PATH}` (default `/api/chat`)
Request body sent by BBCare:
```json
{
  "model": "<BBCARE_FLASK_AI_MODEL or omitted>",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "format": "json",
  "stream": false,
  "temperature": 0.1,
  "max_tokens": 800,
  "options": { "temperature": 0.1, "num_predict": 800 }
}
```
Notes:
- `messages` is OpenAI style. The system message holds the BBCare rules; evidence passages are inside the final user message between `<<EVIDENCE En>>` and `<<END En>>` markers. The gateway must pass messages to the model unchanged and must not add its own instructions that conflict with them.
- `format: "json"` asks for a JSON object reply (Ollama semantics). If the backend does not support it, the gateway may drop it; BBCare still parses the text as JSON and abstains if it cannot.
- Both `max_tokens` and `options.num_predict` are sent so either an OpenAI-style or an Ollama-style backend can read the limit.
- `stream` is always `false`. Streaming responses are not accepted.

Response body: any one of these shapes is accepted (checked in this order):
1. `{"response": "<text>"}` (Ollama generate)
2. `{"text": "<text>"}`
3. `{"answer": "<text>"}`
4. `{"output": "<text>"}`
5. `{"message": {"content": "<text>"}}` (Ollama chat)
6. `{"choices": [{"message": {"content": "<text>"}}]}` (OpenAI chat)
7. `{"choices": [{"text": "<text>"}]}`

Optional: a top-level `"model": "<name>"` is recorded with the answer for evaluation and audit. Recommended.

The `<text>` must be the model's reply only. BBCare expects it to be a JSON object with the keys `sufficient`, `confirmed`, `possible_causes`, `steps`, `warnings`, `citations`, `product_refs`. BBCare validates it, removes anything not grounded in the evidence (invented URLs, prices, stock, firmware versions), and abstains when it is not valid JSON or has no valid citations. The gateway should not post-process, truncate or wrap the text.

## Embeddings (optional): `POST {BBCARE_FLASK_AI_EMBED_PATH}` (default `/api/embed`)
Request: `{"model": "<name or omitted>", "input": ["text 1", "text 2"]}`.
Response: `{"embeddings": [[...], [...]]}` or `{"data": [{"embedding": [...]}, ...]}` with exactly one vector per input, same order, fixed dimension. Optional `"model"`. Not needed for the first router milestone; search stays lexical until an embedding model is approved.

## What BBCare never sends
- Customer contact details, case records, other customers' messages, staff identities, or secrets. The chat request contains: the system rules, up to six recent messages from the same customer's own session (already scrubbed of personal data and anything that looks like a password or code), the customer's question, up to four verified evidence passages, and product names.

## Acceptance checks (run by BBCare once the gateway is up)
`pnpm --filter @bbcare/ai gateway-check` with the gateway's URL and token in the environment (the `BBCARE_FLASK_AI_*` block in `.env.example`). It performs, in order:
1. Rejects a public URL and an empty token (configuration sanity).
2. `GET` health: expects 2xx, reports latency.
3. Rejects a request without a token: expects 401 or 403 (gateway authentication works).
4. Chat with a fixed router evidence passage: expects a parsable text field, valid JSON with the expected keys, and a citation of `E1`.
5. Chat with no evidence: BBCare abstains without calling the gateway (confirms the safety path).
6. Reports the response shape detected, the model name returned, and latency, and prints a pass or fail summary. Nothing is written to the database and no flag is changed.

## After the checks pass
1. Place the environment values on the BBCare host (never in Git): the `BBCARE_FLASK_AI_*` block in `.env.example` lists them.
2. Admin, AI: register the gateway's chat model (name, licence note), confirm health shows reachable.
3. Run `pnpm --filter @bbcare/evals eval` with the Flask provider on the router evaluation set and review English and Malay answers with a bilingual reviewer.
4. Move the model to approved, then active. Customer-facing flags (`ai_answers.en`, `ai_answers.ms`) stay **off** until the owner approves activation after the router-support evaluation.
