# Server inventory requirements

Read-only. Record the answers in the GitHub issue (names and versions, never secrets) before any change. The repository's audit script does most of this safely: `bash infra/scripts/audit-server.sh > bbcare-audit.txt` (no installs, no restarts, redacts credential-looking lines; review the file before sharing).

The items below are things to inspect, not assumptions about the current state. Earlier reports mention a gateway on `127.0.0.1:5001`, Ollama on `127.0.0.1:11434`, a project path `/data/projects/bbcare` and models `qwen2.5:7b` and `qwen2.5:3b`; confirm or correct each.

## Operating system and resources

| Item | How to check | Record |
| --- | --- | --- |
| Ubuntu version and kernel | `cat /etc/os-release; uname -srm` | Version |
| CPU and instruction sets | `lscpu` (look for avx2) | Cores, flags relevant to Ollama |
| Memory | `free -h` | Total, available, swap |
| Storage | `df -h /, /data, /var/lib/docker` and the Ollama model directory | Free space (the DB-IP city file is about 100 MB downloaded, about 20 MB converted) |
| Time and timezone | `timedatectl` | Timezone (rollups run on UTC days) |

## Running services

| Item | How to check | Record |
| --- | --- | --- |
| systemd services | `systemctl list-units --type=service --state=running` | Names |
| systemd user services | `systemctl --user list-units --type=service` as the service user | Gateway unit present or not |
| Docker | `docker --version; docker compose version; docker ps` | Installed or not, running containers and their ports |
| Listening ports | `ss -tlnp` | Every port and the owning process, in particular 5001, 11434, 5432, 80, 443, any BBCare port |
| Cron | `crontab -l` for root, the deploy user and the service user | Backup and refresh jobs |

## PostgreSQL

| Item | How to check | Record |
| --- | --- | --- |
| Instance | `pg_lsclusters` or `docker ps` (compose service `db`) | Host install, container or none |
| Version and pgvector | `psql -c "select version()"`, `\dx` | 16 with pgvector expected by the compose file |
| Databases | `psql -l` | Any existing BBCare database and its name suffix |
| Migrations applied | `select filename, applied_at from public.schema_migrations order by 1` | Highest applied (0001 to 0006 expected before this handoff; 0007 pending) |
| Backups | `ls /var/lib/bbcare/*/` and the backup target in `infra/scripts/backup.sh` | Last backup time and location |

## Existing BBCare deployment

| Item | How to check | Record |
| --- | --- | --- |
| Checkout path and branch | `git -C <path> rev-parse --abbrev-ref HEAD; git log -1` | Path, branch, commit |
| Environment files | `ls -l /etc/bbcare/` (names and modes only) | Which env files exist; mode must be 600 |
| Compose project | `docker compose ls` | Project names |
| Current image | `cat /var/lib/bbcare/<project>/current_image` | Tag |
| Web port | `BBCARE_WEB_PORT` in the env file (name only) and `ss -tlnp` | Port bound to 127.0.0.1 |
| Health | `curl -s http://127.0.0.1:<port>/api/health/ready` | JSON status |

## Edge: Cloudflare Tunnel and Nginx

| Item | How to check | Record |
| --- | --- | --- |
| cloudflared | `systemctl status cloudflared; cloudflared tunnel list` (if installed) | Tunnel name, routes (hostnames only) |
| Nginx | `nginx -T 2>/dev/null \| grep -E "server_name\|listen\|proxy_pass"` | Sites, upstreams; whether `infra/nginx/ai-proxy.conf.template` is in use |
| TLS termination | From the above | Cloudflare, Nginx or none |

## Local AI

| Item | How to check | Record |
| --- | --- | --- |
| Ollama | `systemctl status ollama; curl -s http://127.0.0.1:11434/api/tags` | Version, bind address (must be loopback), installed models |
| Gateway | `systemctl --user status bbcare-ai-gateway; curl -s http://127.0.0.1:5001/health` | Running, bind address, health JSON (no token in the issue) |
| Gateway configuration names | `grep -oE '^[A-Z_]+=' infra/flask-ai-service/.env` | Variable names only |
| Gateway tests | `python3 infra/flask-ai-service/test_gateway.py` | Pass count |

## Network path for the BBCare process

Decide and record which applies, because it determines `BBCARE_FLASK_AI_URL` (see `BBCare-AI-INTEGRATION.md`):

- BBCare runs directly on the host (Node process or systemd): `http://127.0.0.1:5001` works.
- BBCare runs in Docker Compose: `127.0.0.1` inside the container is not the host. Either the Nginx private proxy from `infra/nginx/ai-proxy.conf.template` on a private address, or the gateway bound to the Docker bridge address and `http://host.docker.internal:5001`.

## Output

Attach the redacted audit file to the GitHub issue or store it on the host and summarise the table rows above in the issue. The issue is the record Claude Cloud will read to adjust configuration defaults if the host differs from the documentation.
