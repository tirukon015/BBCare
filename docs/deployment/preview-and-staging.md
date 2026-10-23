# Preview, Staging and Production

| Environment | Purpose | Data | Access | Status |
|---|---|---|---|---|
| Cloud development session | Build and automated tests | Synthetic | Not browser-accessible from other devices | Working |
| Preview / staging | Cross-device testing by the owner | Synthetic only (seed) | HTTPS URL behind the preview gate (HTTP basic auth, credentials set on the host) | **Blocked: needs a host** |
| Production | Customers | Real | Public | Not deployed (owner approval required) |

## Why there is no preview URL yet
The cloud development environment cannot publish a browser-accessible URL for a running server. A preview therefore needs a host. The application, image, compose file, preview gate and seed are ready and were rehearsed end to end in the cloud session (see `docs/status/progress.md`).

## Recommended option (no new cost): the owner's existing server
1. Owner runs the read-only audit (`infra/scripts/audit-server.sh`) to confirm free memory, disk and a free localhost port.
2. Owner creates `/etc/bbcare/preview.env` (`chmod 600`) with `BBCARE_ENV=preview`, `BBCARE_AI_PROVIDER=mock`, `BBCARE_PREVIEW_USER` and `BBCARE_PREVIEW_PASSWORD`, database variables, and secrets generated with `openssl rand -base64 32`.
3. `infra/scripts/deploy.sh /etc/bbcare/preview.env bbcare:<sha>` then seed synthetic data (deploy runbook).
4. Publish through a **Cloudflare Tunnel** to a subdomain such as `preview.bbcare.<domain>`, optionally protected by **Cloudflare Access** (free tier, email one-time PIN) in addition to the preview gate. The DNS/tunnel change is an owner action.
5. Test from Windows, macOS, Android, iPhone and iPad browsers. Report issues with the page URL, device, browser and a screenshot.

## Alternatives (need an account, owner decision)
- A small VPS (roughly USD 5 to 10 per month) running the same compose file.
- Managed platforms: note that free hobby tiers often prohibit commercial use; check terms before choosing.

## Test accounts
Seed staff accounts are `admin@`, `editor@`, `reviewer@`, `agent@`, `analyst@bbcare.test`. Their password is chosen by the owner on the host (`BBCARE_SEED_PASSWORD`) and shared outside chat. Each account enrols its own authenticator app at first sign-in.
