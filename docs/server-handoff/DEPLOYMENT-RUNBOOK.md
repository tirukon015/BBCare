# Deployment runbook (server side)

Scope: one BBCare environment (staging or production) on the existing Ubuntu host, using the repository's compose file and scripts. The general runbook in `docs/runbooks/deploy.md` still applies; this one adds the steps this handoff introduces. Protect every existing workload: do not stop Ollama, the gateway, cloudflared, Nginx or other applications.

## 0. Approvals

- Staging with synthetic data: owner confirmed the host.
- Production: explicit owner approval naming the commit. Production migrations run only inside that approved deploy.

## 1. Pre-deployment backup

```bash
infra/scripts/backup.sh /etc/bbcare/<env>.env            # dump + storage archive + checksums
cat /var/lib/bbcare/<project>/last_backup                 # path recorded by the previous deploy, if any
```
Verify the dump exists and is non-empty before continuing.

## 2. Environment validation

- `/etc/bbcare/<env>.env` exists, mode 600 (the deploy script refuses otherwise), owned by the deploy user.
- Every required variable in `ENVIRONMENT-VARIABLES.md` present; `BBCARE_ENV` matches the target; `BBCARE_AI_PROVIDER` is `flask` or `none` in production (never `mock`).
- `BBCARE_WEB_PORT` free on 127.0.0.1 (`ss -tlnp`).
- If geolocation is to be enabled: the three geolocation variables set and the file readable (see `GEOLOCATION-SETUP.md`).

## 3. Build

```bash
git -C /path/to/bbcare fetch origin && git -C /path/to/bbcare checkout <approved-commit>
docker build -t bbcare:<sha> /path/to/bbcare
```
CI must be green for the same commit (links in the issue).

## 4. Deploy (migration, geolocation mount, restart, health gate)

```bash
infra/scripts/deploy.sh /etc/bbcare/<env>.env bbcare:<sha>              # staging
infra/scripts/deploy.sh /etc/bbcare/prod.env bbcare:<sha> --production  # production, typed confirmation
```
The script: takes a pre-deploy backup when a previous image exists; brings up `db`, runs `migrate` (applies 0007 and anything earlier that is missing), then `web` and `worker` with any `BBCARE_COMPOSE_OVERRIDES`; waits up to two minutes for `/api/health/ready`; smoke-tests `/en`; rolls the application back to the previous image automatically if either fails.

## 5. Health checks

```bash
curl -s http://127.0.0.1:<port>/api/health          # {"status":"ok"}
curl -s http://127.0.0.1:<port>/api/health/ready    # status ready, migrations 7, routerModels 7, geo configured|not_configured
```

## 6. Smoke tests (browser, through the public edge if one exists)

1. `/en` and `/ms`: seven router cards with `ECR` identifiers; floating assistant launcher appears after the consent choice.
2. A router: `/en/routers/tp-link-ex510` redirects to `/mesh`, eleven problems, no Access Point content.
3. A problem page shows the "no verified instructions" notice and the escalation form (until verified guides exist).
4. `/en/support`: assistant answers in search-first mode; AI disclosure shown.
5. Admin sign-in with second factor; Customer Analytics & Intelligence, Overview, "Refresh now"; Geographic Analytics renders the map.
6. Admin, AI: provider health shows reachable when the gateway is configured.

## 7. Log checks (15 minutes)

```bash
docker compose -p <project> logs -f --since 15m web worker
```
Look for: migration lines, "worker started", no repeated `support message failed`, no `Invalid BBCare environment configuration`. Gateway and Ollama logs: `journalctl --user -u bbcare-ai-gateway -f`, `journalctl -u ollama -f`.

## 8. Post-deployment verification

Run `SERVER-ACCEPTANCE-TESTS.md` and record the results in the GitHub issue. Confirm the previous applications on the host still answer (their own health URLs or ports from the inventory).

## 9. Rollback

`infra/scripts/rollback.sh /etc/bbcare/<env>.env` returns to the previous image without touching the database. Full procedures and data recovery: `ROLLBACK-AND-RECOVERY.md`.
