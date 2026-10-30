# BBCare Local AI Gateway (`flask-ai-service`)

A lightweight, secure, and resource-bounded Flask API gateway that integrates BBCare with the local Ollama inference service on the host.

---

## 1. Architecture Overview

```
BBCare (Next.js Web / Worker)
  └─► FlaskAiProvider (packages/ai/src/flask.ts)
        │
        ├─► [Circuit Breaker (3 fails / 60s cooldown)]
        ├─► [Concurrency Semaphore (max 2)]
        └─► [Bearer Token Authorization]
              │
              ▼ HTTP (Private Network / Loopback)
Flask AI Gateway (infra/flask-ai-service)
  │ Port: 127.0.0.1:5001 (or Docker gateway)
  ├─► Constant-time Bearer Token Validation
  ├─► Concurrency Limiter (Threading Semaphore: max 2)
  ├─► Request Validation & Payload Sanitization
  ├─► Safe Structured JSON Logging (Redacts PII, Prompts, Secrets)
  └─► Upstream Health & Model Aggregator
        │
        ▼ HTTP (Private Host Loopback Only)
Ollama Inference Daemon (systemd)
  │ Port: 127.0.0.1:11434
  ├─► Primary Model: qwen2.5:7b (GGUF Q4_K_M, CPU AVX2)
  └─► Fallback Model: qwen2.5:3b (GGUF Q4_K_M, CPU AVX2)
```

### Security & Privacy Guarantees
- **Ollama Isolation:** Ollama listens strictly on `127.0.0.1:11434` and is never exposed to external or Docker interfaces.
- **Authentication:** All inference endpoints require `Authorization: Bearer <token>` validated using `hmac.compare_digest`.
- **Zero PII Logging:** Request bodies (user messages, customer information, support cases) and Bearer tokens are strictly excluded from logs.
- **Workload Protection:** Enforces a concurrency semaphore (max 2 simultaneous inference requests) and maximum payload limit (256 KB) to prevent CPU starvation on the host.

---

## 2. Installation & Prerequisites

The service runs in an isolated Python virtual environment without modifying system packages.

```bash
cd /data/projects/bbcare/infra/flask-ai-service

# Create virtual environment
python3 -m venv .venv

# Install dependencies
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
```

---

## 3. Configuration

Configuration is loaded from environment variables or a local `.env` file (permissions `600`, gitignored):

```ini
# Address and port (strict loopback)
AI_GATEWAY_HOST=127.0.0.1
AI_GATEWAY_PORT=5001

# Ollama Private Endpoint
OLLAMA_BASE_URL=http://127.0.0.1:11434

# Security: Shared Bearer Token (generate with openssl rand -hex 32)
AI_GATEWAY_BEARER_TOKEN=<generated-token>

# Models
DEFAULT_MODEL=qwen2.5:7b
FALLBACK_MODEL=qwen2.5:3b
ALLOWED_MODELS=qwen2.5:7b,qwen2.5:3b

# Resource Protection
MAX_CONCURRENCY=2
QUEUE_TIMEOUT_SECONDS=5.0
REQUEST_TIMEOUT_SECONDS=90.0
LOG_LEVEL=INFO
```

---

## 4. Local Hosting & Process Management

The service is managed as a systemd user unit (`systemctl --user`), requiring no `sudo` privileges.

### Management Commands
```bash
# Start service
bash /data/projects/bbcare/infra/flask-ai-service/start.sh

# Check status and health probe
bash /data/projects/bbcare/infra/flask-ai-service/status.sh

# Stop service
bash /data/projects/bbcare/infra/flask-ai-service/stop.sh
```

### Systemd User Unit Control
```bash
systemctl --user status bbcare-ai-gateway
systemctl --user restart bbcare-ai-gateway
journalctl --user -u bbcare-ai-gateway -f
```

---

## 5. API Endpoints

### `GET /health`
Probes the gateway and upstream Ollama status.
- **Auth:** Public or Bearer token
- **Response (200 OK):**
```json
{
  "status": "healthy",
  "service": "bbcare-ai-gateway",
  "version": "1.0.0",
  "ollama": {
    "status": "connected",
    "version": "0.40.2",
    "endpoint": "http://127.0.0.1:11434"
  },
  "models": {
    "primary": "qwen2.5:7b",
    "fallback": "qwen2.5:3b",
    "allowed": ["qwen2.5:7b", "qwen2.5:3b"],
    "installed": ["qwen2.5:7b", "qwen2.5:3b"]
  },
  "concurrency": {
    "max": 2,
    "active": 0
  }
}
```

### `POST /api/chat`
Proxies chat completions to Ollama.
- **Auth:** `Authorization: Bearer <token>`
- **Request Body:**
```json
{
  "model": "qwen2.5:7b",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "format": "json",
  "stream": false,
  "temperature": 0.1,
  "max_tokens": 500
}
```
- **Response (200 OK):** Includes both Ollama format (`message.content`) and top-level fields (`response`, `text`, `model`, `eval_count`) compatible with BBCare's `FlaskAiProvider`.

### `POST /api/embed`
Proxies embedding generation or returns standard fallback if embeddings are disabled in backend.
- **Auth:** `Authorization: Bearer <token>`

### `GET /api/models`
Returns list of installed and allowed models.
- **Auth:** `Authorization: Bearer <token>`

---

## 6. Restart, Recovery & Rollback

### Process Recovery
- If the gateway crashes, `systemd --user` automatically restarts it within 5 seconds (`Restart=always`, `RestartSec=5`).
- If Ollama restarts, the gateway detects it on the next request and health probe without requiring a restart.

### Rollback Procedure
If the gateway needs to be deactivated or rolled back:
```bash
# 1. Stop service
bash /data/projects/bbcare/infra/flask-ai-service/stop.sh
systemctl --user disable bbcare-ai-gateway.service

# 2. Reset BBCare provider to mock or none
# Update BBCARE_AI_PROVIDER=mock in environment
```
