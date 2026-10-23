# Runbook: Backups and Restore Drills

- **Schedule:** nightly `infra/scripts/backup.sh /etc/bbcare/prod.env` from the `bbcare` user's crontab (for example `17 2 * * *`), plus automatic pre-deploy backups.
- **Contents:** PostgreSQL custom-format dump, private storage archive, SHA-256 checksums, manifest.
- **Retention:** 14 local backups; off-site copies via `BBCARE_OFFSITE_CMD` (for example restic to object storage or a second owned machine). Off-site target is an owner decision.
- **Targets (proposed):** recovery point 24 hours, recovery time 4 hours.
- **Monthly drill:** `infra/scripts/restore.sh check <env> <latest-backup>`; record duration and counts in `docs/status/progress.md`.
- **Verified:** a drill was run in the cloud rehearsal environment on 2026-10-23 (restore into scratch database, integrity counts, 2 seconds for synthetic data). A drill on the real server is still required before launch.
