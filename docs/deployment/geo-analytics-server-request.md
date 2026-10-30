# Server implementation request: geographic analytics

For: the server-side agent (Antigravity) or the owner. Scope: the BBCare Ubuntu host only. Nothing here touches Ollama, the Flask gateway, Cloudflare Tunnel, Nginx configuration or firewall rules. Review before applying. Do not run production migrations or restart services without the owner's explicit approval.

## What ships in the repository (already pushed)

- Migration `packages/db/migrations/0007_analytics_geo_city.sql`: adds `analytics.events.city text`. Additive, no data rewrite, safe to apply with `pnpm db:migrate` during a normal deploy.
- Lookup code `apps/web/src/lib/geo.ts`, converter `infra/scripts/geoip-convert.mjs`, boundaries `apps/web/public/geo/malaysia-states.json`.
- Admin API `GET /api/admin/analytics/geo` (staff only) and the admin page `/admin/analytics/geo`.
- Health: `GET /api/health/ready` now includes `"geo": "configured" | "not_configured"`; readiness is not affected by it.

## Is there an automatic deployment path?

No. The GitHub Actions workflow (`.github/workflows/ci.yml`) builds and tests only. Nothing is installed on the server by a push. Deployment stays the manual, owner-approved procedure in `docs/runbooks/deploy.md` (`infra/scripts/deploy.sh` with the environment file on the host). This request therefore describes steps for a person to apply.

## Steps on the host

1. Pull the approved commit and build the image as in the deploy runbook.
2. Apply migrations as part of that deploy (`0007` is the only new one; it is additive).
3. Obtain the geolocation file (no account needed):
   ```
   mkdir -p /etc/bbcare && cd /tmp
   curl -LO https://download.db-ip.com/free/dbip-city-lite-$(date +%Y-%m).csv.gz
   gunzip dbip-city-lite-*.csv.gz
   node /data/projects/bbcare/infra/scripts/geoip-convert.mjs dbip-city-lite-*.csv /etc/bbcare/geoip.csv
   chown root:bbcare /etc/bbcare/geoip.csv && chmod 640 /etc/bbcare/geoip.csv
   ```
   Licence: CC BY 4.0, attribution "IP geolocation by DB-IP (https://db-ip.com)". Keep the download outside the web root.
4. Add to the BBCare environment file (`/etc/bbcare/*.env`, mode 600): `BBCARE_GEOIP_CSV=/etc/bbcare/geoip.csv`. If BBCare runs in Docker, mount the file read-only and point the variable at the path inside the container.
5. Restart only the BBCare web service (the deploy script does this). The worker needs no change.
6. Health check: `curl -s http://127.0.0.1:<port>/api/health/ready` must return `"status":"ready"` and `"geo":"configured"`. In Admin, Privacy & Tracking Settings must show "Approximate location: Yes" and Geographic Analytics must no longer show the "not configured" warning.
7. Monthly refresh: a root cron entry repeating step 3, for example `0 4 2 * *`, followed by a web service restart during a quiet hour. The loader reads the file once at start.

## Rollback

- Unset `BBCARE_GEOIP_CSV` (or point it at a missing file) and restart the web service: events are stored without location again. No data loss, no migration rollback needed.
- Migration `0007` can stay in place; if it must be reverted: `ALTER TABLE analytics.events DROP COLUMN city;` after stopping the web service, then deploy the previous image.

## Secrets and exposure

No new secrets. The geolocation file is not a secret but should not be world-readable or served by Nginx. No new ports, no new public endpoints beyond the staff-only admin API already behind authentication.

## Before enabling in production

- Owner approval for the deploy.
- Qualified Malaysian privacy review of the customer notice and retention periods (`docs/analytics/geographic-analytics.md`).
