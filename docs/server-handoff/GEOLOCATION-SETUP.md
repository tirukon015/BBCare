# Geolocation setup (offline DB-IP Lite)

Locally hosted lookup, no account, no API, no recurring cost. The BBCare process reads one CSV at start, resolves each incoming event's address in memory and discards the address. Application code: `apps/web/src/lib/geo.ts`; converter: `infra/scripts/geoip-convert.mjs`; design and privacy notes: `docs/analytics/geographic-analytics.md`.

## Source and licence

- Download page: https://db-ip.com/db/download/ip-to-city-lite (city edition, preferred) or https://db-ip.com/db/download/ip-to-country-lite (country only). Direct file pattern: `https://download.db-ip.com/free/dbip-city-lite-YYYY-MM.csv.gz`.
- Licence: Creative Commons Attribution 4.0. Required attribution, to appear on the customer privacy page footer or an "About" line: "IP geolocation by DB-IP (https://db-ip.com)". The application side will add the line once the owner confirms the file is in use.
- No MaxMind or IP2Location account is needed. If the owner later prefers GeoLite2, the converter would need an MMDB reader; not part of this handoff.

## CSV formats accepted by BBCare

| Format | Columns | Note |
| --- | --- | --- |
| DB-IP city lite as downloaded | `ip_start,ip_end,continent,country,stateprov,city,latitude,longitude` | Accepted directly, but large (several hundred MB in memory). Use the converter for production. |
| DB-IP country lite as downloaded | `ip_start,ip_end,country` | Country only; the map shows Malaysia as one block |
| Compact BBCare file (recommended) | `start,end,country,region_code,city` | Produced by the converter: ISO 3166-2:MY codes for Malaysian ranges, city only for Malaysia, country only elsewhere, adjacent IPv4 ranges merged |

IPv4 and IPv6 ranges are both read. Coordinates are never used or stored.

## Procedure (host)

```bash
# 1. Download (as the deploy user, outside any web root)
cd /tmp && curl -fLO "https://download.db-ip.com/free/dbip-city-lite-$(date +%Y-%m).csv.gz"
gunzip -f dbip-city-lite-*.csv.gz

# 2. Convert to the compact file. The converter is a single Node script in the repository checkout
#    (infra/scripts/geoip-convert.mjs); it is not inside the runtime image. Use whichever is available:
#    a) Node 22 on the host:
node /path/to/bbcare/infra/scripts/geoip-convert.mjs /tmp/dbip-city-lite-*.csv /tmp/geoip.csv
#    b) no Node on the host (Docker only), same result:
docker run --rm -v /path/to/bbcare/infra/scripts:/scripts:ro -v /tmp:/work node:22-alpine \
  node /scripts/geoip-convert.mjs /work/dbip-city-lite-YYYY-MM.csv /work/geoip.csv
sudo mkdir -p /etc/bbcare
sudo install -o root -g bbcare -m 0640 /tmp/geoip.csv /etc/bbcare/geoip.csv
rm -f /tmp/dbip-city-lite-*.csv /tmp/geoip.csv

# 3. Configure (in /etc/bbcare/<env>.env, mode 600)
#    Host process:  BBCARE_GEOIP_CSV=/etc/bbcare/geoip.csv
#    Docker Compose: BBCARE_GEOIP_HOST_PATH=/etc/bbcare/geoip.csv
#                    BBCARE_GEOIP_CSV=/app/geoip.csv
#                    BBCARE_COMPOSE_OVERRIDES=infra/compose/docker-compose.geoip.yml
```

The deploy user in the group that owns the file must be able to read it; inside Docker the file is mounted read-only at `/app/geoip.csv` by `infra/compose/docker-compose.geoip.yml`.

## Startup and health verification

1. Restart the web service (the deploy script does this; otherwise `docker compose ... up -d web` or the service restart the owner approved).
2. `curl -s http://127.0.0.1:<BBCARE_WEB_PORT>/api/health/ready` must include `"geo":"configured"`. `"not_configured"` means the variable is unset, the path is unreadable or the file has no valid rows; the application still serves traffic.
3. Admin, Customer Analytics & Intelligence, Privacy & Tracking Settings: the row "Approximate location (state, country)" shows Enabled: Yes. Geographic Analytics no longer shows the "not configured" warning.
4. Startup time: the converted file loads in a few seconds; the raw city file can take tens of seconds and several hundred MB of memory. If memory is tight, use the converter.

## Monthly update

DB-IP publishes a new file each month. A root cron entry, for example `0 4 2 * *`, repeating steps 1 and 2 followed by a web restart during a quiet hour keeps the data current. The loader reads the file once per process start; without a restart the old file stays in use, which is safe.

## Failure handling

| Symptom | Cause | Action |
| --- | --- | --- |
| `"geo":"not_configured"` | Missing variable, unreadable file, empty or malformed file | Check the path inside the process (container path for Docker), file mode and group; re-run the converter |
| Every session shows as Unknown location after a deploy | Mount or variable lost in the new env file | Restore the three variables and redeploy; no data was lost |
| All Malaysian traffic shows one state | Country lite file in use | Switch to the city lite file and reconvert |
| Web container fails to start with a mount error | `BBCARE_GEOIP_HOST_PATH` points at a missing file | Create the file or remove the override from `BBCARE_COMPOSE_OVERRIDES` |

## Rollback

Unset `BBCARE_GEOIP_CSV` (and remove the compose override) and restart the web service. Events are stored without location again. Nothing else changes; migration 0007 stays in place and is harmless.
