# Server acceptance tests

Run after the deploy. Record each result (pass, fail, not applicable) in the GitHub issue with the command output, never with secrets. Use synthetic test addresses and the staging environment; in production, use only your own real visit and do not fabricate traffic.

## A. Geographic analytics

| # | Test | Command or action | Expected |
| --- | --- | --- | --- |
| A1 | Geo file loaded | `curl -s http://127.0.0.1:<port>/api/health/ready` | `"geo":"configured"` |
| A2 | Readiness | same | `"status":"ready"`, `"migrations":7`, `"routerModels":7` |
| A3 | Real event ingestion | Visit `/en` from a phone on mobile data and from the office connection, choose "Essential only"; then Admin, Overview, "Refresh now" | Sessions count rises; Privacy & Tracking Settings shows events in the last 24 h |
| A4 | State aggregation | Admin, Geographic Analytics, Today | At least one Malaysian state shaded (your own visits); the table lists it as "under 10" until ten sessions |
| A5 | City with consent | Repeat A3 choosing "Allow analytics" from a fixed-line connection; drill into the state | A city row appears (as "under 10"); the essential-only visit added no city |
| A6 | Map API | While signed in as a staff user with analytics permission, open `/api/admin/analytics/geo?range=today` and `...&region=MY-10` in the browser | JSON with `states`, `geo.configured: true`; region JSON with `name` and counts |
| A7 | Unknown location | Send one event batch from an address outside the file, for example with `curl -H 'x-forwarded-for: 233.252.0.9'` to `/api/e` (synthetic session id); refresh | Unknown location count rises by one; no state changes |
| A8 | Consent rejection | In a private window choose "Essential only"; check browser storage | No `bbcare_vid` in localStorage; events still accepted (state only) |
| A9 | Retention | After the worker has run overnight: `select min(received_at) from analytics.events` | Not older than 90 days; `ops.jobs` shows a completed `retention` job |
| A10 | Role permission | Sign in as an agent-role account; open `/admin/analytics/geo` and the API | Redirect with `denied=1`; API 403 |
| A11 | Audit | Admin, Audit log after A6 | Entry `analytics.geo.region` with region and period |

## B. AI integration

| # | Test | Command or action | Expected |
| --- | --- | --- | --- |
| B1 | Gateway health | `curl -s http://127.0.0.1:5001/health` on the host | 200, `"status":"healthy"`, Ollama connected, models listed |
| B2 | Authentication | `curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:5001/api/chat -d '{}'` without a token | 401 or 403 |
| B3 | Ollama | `curl -s http://127.0.0.1:11434/api/tags` | Lists `qwen2.5:7b` and `qwen2.5:3b`; bound to loopback only (`ss -tlnp`) |
| B4 | Model response | `pnpm --filter @bbcare/ai gateway-check` on the BBCare host with the env exported | All checks pass; JSON answer citing `E1`; latency recorded |
| B5 | Router context | With a staff-only test: `BBCARE_AI_PROVIDER=flask pnpm --filter @bbcare/evals eval:router` on a synthetic-seeded database | Answers reference the chosen model and problem; no invented steps |
| B6 | Mesh scope | Ask the assistant (flags still off for customers: use the evaluation set) an Access Point question with a router context | The answer says BBCare covers Mesh Connection only and offers staff |
| B7 | Grounding and abstention | Evaluation item with no evidence | Abstention, no model call logged, escalation shown |
| B8 | Timeout and recovery | Stop the gateway (`stop.sh`), send a support message on `/en/support` with the flag on in staging, start it again | "AI unavailable" fallback with guides; after 60 s the circuit closes and answers resume |
| B9 | Concurrency | Two simultaneous `gateway-check` runs | Both complete; gateway logs show queueing, no 5xx storm |

## C. Infrastructure

| # | Test | Command | Expected |
| --- | --- | --- | --- |
| C1 | PostgreSQL | `docker compose -p <project> exec db pg_isready` or `pg_isready` | accepting connections; no public port |
| C2 | Web service | `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:<port>/en` | 200 (401 behind the preview gate) |
| C3 | Cloudflare Tunnel | `systemctl status cloudflared`; open the public hostname | Tunnel healthy; page served over HTTPS; `/admin` reachable only to staff |
| C4 | Nginx | `nginx -t`; `curl -I http://127.0.0.1` | Configuration valid; proxy answers; AI proxy, if used, listens on the private address only |
| C5 | Logs | `docker compose -p <project> logs --since 1h web worker` | No stack traces; worker shows rollup and retention jobs |
| C6 | Existing applications | Their own health URLs and ports from the inventory | Unchanged |
| C7 | Backups | `ls -lt /var/lib/bbcare/<project>/` and the backup directory | Pre-deploy backup present, checksums valid (`infra/scripts/restore.sh check`) |

## Tests the application side already ran (for reference, not to repeat on the server)

Typecheck, lint, production build, 110 core, 15 web, 20 AI unit tests, 27 database integration tests, and the Playwright suite including `geo.spec.ts` (synthetic address pipeline), `assistant.spec.ts`, `analytics.spec.ts` and `security.spec.ts`. CI runs 20 and 21 are green; the handoff commit's run number is in the issue.
