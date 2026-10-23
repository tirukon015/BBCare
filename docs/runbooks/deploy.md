# Runbook: Deploy

Applies to staging and production. Production requires explicit owner approval for each release.

## Prerequisites (one-time, owner)
- Docker Engine and the Compose plugin on the host; a dedicated `bbcare` system user in the `docker` group.
- `/etc/bbcare/<env>.env` created by the owner from `.env.example` plus the compose variables below, `chmod 600`, owned by `bbcare`. Never paste these values into chat.
- Nginx site from `infra/nginx/bbcare-site.conf.template`, or a Cloudflare Tunnel route to `http://127.0.0.1:<BBCARE_WEB_PORT>`.

Compose variables in the env file: `COMPOSE_PROJECT_NAME` (for example `bbcare-staging`), `POSTGRES_DB` (`bbcare_staging` or `bbcare_prod`), `POSTGRES_USER`, `POSTGRES_PASSWORD`, `BBCARE_ENV_FILE` (path of the env file itself), `BBCARE_WEB_PORT` (a free localhost port verified with `ss -tlnp`), plus all app variables.

## Steps
1. Confirm CI is green for the commit and the release notes are approved.
2. Build or pull the image tagged with the commit: `docker build -t bbcare:<sha> .`
3. `infra/scripts/deploy.sh /etc/bbcare/staging.env bbcare:<sha>`
   - takes a pre-deploy backup (database dump plus storage archive, checksummed),
   - runs migrations (the `migrate` service) before web and worker start,
   - waits for `/api/health/ready` and a page smoke test,
   - rolls the application back automatically if checks fail.
4. Staging smoke test: home page in both languages, search, an article, support chat, admin sign-in with MFA.
5. Production (owner approved): `infra/scripts/deploy.sh /etc/bbcare/prod.env bbcare:<sha> --production`
6. Watch logs for 15 minutes: `docker compose -p bbcare-prod logs -f web worker`.

## First-time staging data
Synthetic only: `docker compose ... run --rm -e BBCARE_SEED_PASSWORD=<chosen on host> migrate tooling/packages/db/node_modules/.bin/tsx tooling/packages/db/src/cli.ts seed`.
Never run the seed against production.
