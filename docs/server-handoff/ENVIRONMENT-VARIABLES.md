# Environment variables

All values live in `/etc/bbcare/<env>.env` on the host (mode 600) and in the gateway's own `.env`. Never in Git, chat or the GitHub issue. Examples below are placeholders. "Restart" means the web and worker containers (or processes) must restart to pick up the change; the deploy script does this.

## BBCare application (web and worker)

| Name | Purpose | Required | Example | Where | Restart |
| --- | --- | --- | --- | --- | --- |
| `BBCARE_ENV` | Environment name; `production` enforces production rules | Required | `staging` | env file | Yes |
| `BBCARE_BASE_URL` | Public base URL for links | Required | `https://support.example.com` | env file | Yes |
| `DATABASE_URL` | PostgreSQL connection (composed by compose from the `POSTGRES_*` values) | Required | `postgres://user:***@db:5432/bbcare_prod` | compose | Yes |
| `BBCARE_ENCRYPTION_KEY` | 32-byte base64 key for encrypted fields | Required | output of `openssl rand -base64 32` | env file | Yes |
| `BBCARE_SESSION_SECRET` | Staff session signing, at least 32 characters | Required | output of `openssl rand -base64 32` | env file | Yes |
| `BBCARE_AI_PROVIDER` | `none`, `flask`; `mock` is refused in production | Required | `flask` | env file | Yes |
| `BBCARE_FLASK_AI_URL` | Private address of the gateway as seen by the BBCare process | Required when provider is flask | `http://127.0.0.1:5001` | env file | Yes |
| `BBCARE_FLASK_AI_TOKEN` | Bearer token shared with the gateway | Required when provider is flask | `<same as AI_GATEWAY_BEARER_TOKEN>` | env file | Yes |
| `BBCARE_FLASK_AI_CHAT_PATH` | Chat route | Optional (default `/api/chat`) | `/api/chat` | env file | Yes |
| `BBCARE_FLASK_AI_EMBED_PATH` | Embedding route (unused for now) | Optional (default `/api/embed`) | `/api/embed` | env file | Yes |
| `BBCARE_FLASK_AI_HEALTH_PATH` | Health route | Optional (default `/health`) | `/health` | env file | Yes |
| `BBCARE_FLASK_AI_MODEL` | Model name sent to the gateway; must be allowed there | Recommended | `qwen2.5:7b` | env file | Yes |
| `BBCARE_AI_TIMEOUT_MS` | Per-request timeout | Optional (default 30000) | `30000` | env file | Yes |
| `BBCARE_AI_MAX_CONCURRENCY` | In-flight AI requests per process | Optional (default 2) | `2` | env file | Yes |
| `BBCARE_STORAGE_DIR` | Private upload directory | Optional (compose sets `/app/storage`) | `/app/storage` | compose | Yes |
| `BBCARE_GEOIP_CSV` | Path of the geolocation file inside the process | Optional; required for geography | `/app/geoip.csv` (Docker) or `/etc/bbcare/geoip.csv` (host) | env file | Yes |
| `BBCARE_LISTING_VERIFICATION_DAYS` | Days a Shopee listing check stays valid | Optional (default 14) | `14` | env file | Yes |
| `BBCARE_SUPPORT_CONTACT_WHATSAPP` | Digits only, shown on escalation | Optional | `60123456789` | env file | Yes |
| `BBCARE_SUPPORT_CONTACT_EMAIL` | Shown on escalation | Optional | `support@example.com` | env file | Yes |
| `BBCARE_PREVIEW_USER`, `BBCARE_PREVIEW_PASSWORD` | HTTP basic gate for preview or staging | Optional | placeholders | env file | Yes |
| `BBCARE_STAFF_LOGIN_DOMAIN` | Lets staff type only the local part of their work address at `/admin/login`; the domain is appended server side | Optional; leave empty to require full addresses | `example.com` form, no `@` | env file | No |
| `BBCARE_HEALTH_TOKEN` | Reserved for a protected health endpoint; not read by any route today | Optional, unused | leave empty | env file | No |
| `BBCARE_LINK_CHECK` | `1` enables the worker's outbound listing link check | Optional | `0` | env file | Worker |
| `LOG_LEVEL` | Application log level | Optional (default info) | `info` | env file | Yes |
| `NEXT_TELEMETRY_DISABLED` | Keep Next.js telemetry off | Recommended | `1` | env file | Yes |

## Compose and deploy scripts

| Name | Purpose | Required | Example | Where | Restart |
| --- | --- | --- | --- | --- | --- |
| `COMPOSE_PROJECT_NAME` | One project per environment | Required | `bbcare-prod` | env file | n/a |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Database container credentials | Required | `bbcare_prod`, `bbcare`, `***` | env file | DB restart |
| `PGVECTOR_IMAGE` | Database image | Optional (default `pgvector/pgvector:pg16`) | default | env file | n/a |
| `BBCARE_IMAGE` | Image tag; set by the deploy script | Set by script | `bbcare:<sha>` | script | n/a |
| `BBCARE_ENV_FILE` | Path of the env file itself (compose `env_file`) | Required | `/etc/bbcare/prod.env` | env file | n/a |
| `BBCARE_WEB_PORT` | Localhost port published for Nginx or the tunnel | Required | `3100` | env file | Yes |
| `BBCARE_STATE_DIR` | Where deploy state and backups are kept | Optional (default `/var/lib/bbcare`) | default | env file | n/a |
| `BBCARE_COMPOSE_OVERRIDES` | Extra compose files, space separated, relative to the repository | Optional | `infra/compose/docker-compose.geoip.yml` | env file | Yes |
| `BBCARE_GEOIP_HOST_PATH` | Host path of the geolocation file mounted by the override | Required with the override | `/etc/bbcare/geoip.csv` | env file | Yes |
| `BBCARE_OFFSITE_CMD` | Command run by `backup.sh` to copy backups off the host | Optional | `restic backup ...` | env file | n/a |
| `BBCARE_SEED_PASSWORD`, `BBCARE_SEED_SAMPLES` | Synthetic seed only; never in production | Staging only | placeholder, `1` | one-off command | n/a |

## Gateway (Antigravity's service, `infra/flask-ai-service/.env`)

| Name | Purpose | Required | Example |
| --- | --- | --- | --- |
| `AI_GATEWAY_HOST`, `AI_GATEWAY_PORT` | Bind address; loopback or Docker bridge only | Required | `127.0.0.1`, `5001` |
| `OLLAMA_BASE_URL` | Private Ollama endpoint | Required | `http://127.0.0.1:11434` |
| `AI_GATEWAY_BEARER_TOKEN` | Token BBCare presents | Required | `openssl rand -hex 32` |
| `DEFAULT_MODEL`, `FALLBACK_MODEL`, `ALLOWED_MODELS` | Model policy | Required | `qwen2.5:7b`, `qwen2.5:3b`, both |
| `MAX_CONCURRENCY`, `QUEUE_TIMEOUT_SECONDS`, `REQUEST_TIMEOUT_SECONDS`, `LOG_LEVEL` | Resource protection and logging | Optional | `2`, `5.0`, `90.0`, `INFO` |
