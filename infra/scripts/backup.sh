#!/usr/bin/env bash
# BBCare backup: PostgreSQL custom-format dump + private file storage archive, with checksums.
# Usage: backup.sh <env-file> [backup-dir]
# Optional off-site copy: set BBCARE_OFFSITE_CMD in the env file, e.g.
#   BBCARE_OFFSITE_CMD='restic -r s3:... backup'   (the backup directory path is appended)
set -euo pipefail
ENV_FILE=${1:?usage: backup.sh <env-file> [backup-dir]}
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a
DIR=${2:-${BBCARE_BACKUP_DIR:-/var/backups/bbcare}}/${COMPOSE_PROJECT_NAME:-bbcare}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$DIR/$STAMP"
DC=(docker compose --env-file "$ENV_FILE" -f "$(dirname "$0")/../compose/docker-compose.yml")
umask 077
mkdir -p "$OUT"

echo "[backup] database dump"
"${DC[@]}" exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner > "$OUT/db.dump"
echo "[backup] storage archive"
"${DC[@]}" exec -T web tar -C /app/storage -czf - . > "$OUT/storage.tgz"
( cd "$OUT" && sha256sum db.dump storage.tgz > SHA256SUMS )
"${DC[@]}" exec -T db pg_restore --list < "$OUT/db.dump" > /dev/null || { echo "[backup] dump verification FAILED"; exit 1; }
echo "[backup] verified dump table of contents"
echo "{\"created\":\"$STAMP\",\"project\":\"${COMPOSE_PROJECT_NAME:-bbcare}\",\"image\":\"${BBCARE_IMAGE:-}\"}" > "$OUT/manifest.json"

if [ -n "${BBCARE_OFFSITE_CMD:-}" ]; then
  echo "[backup] off-site copy"
  eval "$BBCARE_OFFSITE_CMD \"$OUT\""
fi
# Local retention: keep the newest 14 backups.
ls -1d "$DIR"/*/ 2>/dev/null | sort | head -n -14 | xargs -r rm -rf
echo "[backup] done: $OUT"
echo "$OUT"
