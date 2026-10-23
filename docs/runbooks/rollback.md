# Runbook: Rollback and Recovery

## Application rollback (no data change)
`infra/scripts/rollback.sh /etc/bbcare/<env>.env` switches back to the previously deployed image and waits for health. Migrations are written to be backward compatible for one release (expand, then contract), so the previous image works with the new schema.

## When a migration itself failed
Migrations run in a transaction per file, so a failed migration leaves the schema unchanged; roll back the application and fix forward.

## When data must be restored (destructive, owner approval required)
1. Identify the backup: `cat /var/lib/bbcare/<project>/last_backup` (taken automatically before each deploy).
2. Drill first: `infra/scripts/restore.sh check <env-file> <backup-dir>`.
3. Replace: `infra/scripts/restore.sh replace <env-file> <backup-dir>`; it takes another safety backup, stops web and worker, restores, verifies counts and restarts.
4. Record the incident in the decision log and audit trail.
