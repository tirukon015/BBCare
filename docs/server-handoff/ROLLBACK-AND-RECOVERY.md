# Rollback and recovery

Principle: roll the application back first, keep the data, restore data only with a verified backup and owner approval. Existing runbooks: `docs/runbooks/rollback.md`, `backup-restore.md`, `incident-response.md`.

## Failed database migration

- Symptom: the `migrate` service exits non-zero; web and worker do not start; the deploy script reports the failure.
- Effect: the failed file was rolled back by its transaction; earlier files in the same run stayed applied (each is independent and additive).
- Action: read `docker compose -p <project> logs migrate`; fix forward in the repository (Claude Cloud) or, if the cause is environmental (permissions, disk), fix it and rerun the deploy. The previous image keeps running if it was up; otherwise `infra/scripts/rollback.sh`.
- Data restore is not needed for 0007. If a restore is ever required: `infra/scripts/restore.sh check` first, then `replace` with owner approval.

## Missing or broken geolocation database

- Symptom: `"geo":"not_configured"`, every session shown as Unknown location, or the web container fails to start because the mounted file is missing.
- Action: fix the path or file (see `GEOLOCATION-SETUP.md`); or remove `BBCARE_GEOIP_CSV`, `BBCARE_GEOIP_HOST_PATH` and the override from the env file and redeploy. No data loss; location simply stops being recorded until fixed.

## Failed web deployment

- The deploy script rolls back automatically when the readiness or smoke check fails and a previous image exists.
- Manual: `infra/scripts/rollback.sh /etc/bbcare/<env>.env` (previous image, same database).
- Verify: `/api/health/ready` returns ready; `/en` returns 200; logs clean.
- If the previous image also fails: check `/etc/bbcare/<env>.env` for a missing or malformed variable (`Invalid BBCare environment configuration: <names>` in the logs names the variable), disk space and the database container.

## AI gateway unavailable

- Effect on customers: none visible beyond "AI unavailable" states; the assistant falls back to verified guides and staff escalation. Customer-facing AI flags are off in this release anyway.
- Action: `bash infra/flask-ai-service/status.sh`; `systemctl --user restart bbcare-ai-gateway`; `journalctl --user -u bbcare-ai-gateway -n 200`. BBCare's circuit breaker closes 60 s after the gateway answers again; no BBCare restart needed.
- If the gateway must stay down: set `BBCARE_AI_PROVIDER=none` and redeploy, so Admin shows AI as not configured rather than failing.

## Ollama unavailable

- Symptom: gateway health reports Ollama disconnected; chat returns 503.
- Action: `systemctl status ollama`, `journalctl -u ollama -n 200`, check memory and disk for the model directory; restart Ollama only within an approved window. The gateway recovers on the next request. Do not change Ollama's bind address.

## Nginx or Cloudflare integration problems

- Symptom: public hostname fails while `curl http://127.0.0.1:<port>/en` works.
- Action: `nginx -t` and `systemctl status nginx`; `systemctl status cloudflared` and the tunnel route; confirm the tunnel targets `http://127.0.0.1:<BBCARE_WEB_PORT>`. Revert the last edge change (keep a copy of each config before editing). Edge changes are owner-approved; report, do not improvise.
- Never work around an edge problem by publishing the application port, the gateway or the database on a public interface.

## Data protection during recovery

- Backups contain personal data (cases, support messages). Keep them on the host or the approved off-site target, mode 600, and delete scratch restores after a drill.
- Record every recovery action in `docs/decisions/` and in the audit trail where the admin UI was used.
