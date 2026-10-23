#!/usr/bin/env bash
# BBCare restore.
#   restore.sh check <env-file> <backup-dir>     restore into a scratch database, verify, drop it (safe drill)
#   restore.sh replace <env-file> <backup-dir>   replace the live database (DESTRUCTIVE; requires typed confirmation)
set -euo pipefail
MODE=${1:?usage: restore.sh check|replace <env-file> <backup-dir>}
ENV_FILE=${2:?env file required}
BK=${3:?backup directory required}
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a
DC=(docker compose --env-file "$ENV_FILE" -f "$(dirname "$0")/../compose/docker-compose.yml")
( cd "$BK" && sha256sum -c SHA256SUMS ) || { echo "[restore] checksum mismatch, aborting"; exit 1; }
START=$(date +%s)

verify() {
  local db=$1
  "${DC[@]}" exec -T db psql -U "$POSTGRES_USER" -d "$db" -v ON_ERROR_STOP=1 -tA <<'SQL'
SELECT 'migrations=' || count(*) FROM public.schema_migrations;
SELECT 'users=' || count(*) FROM identity.users;
SELECT 'articles=' || count(*) FROM knowledge.articles;
SELECT 'published_revisions=' || count(*) FROM knowledge.revisions WHERE status = 'published';
SELECT 'chunks=' || count(*) FROM knowledge.chunks;
SELECT 'cases=' || count(*) FROM support.cases;
SELECT 'audit_rows=' || count(*) FROM identity.audit_logs;
SQL
}

if [ "$MODE" = "check" ]; then
  SCRATCH="bbcare_restore_check_$(date +%s)"
  "${DC[@]}" exec -T db createdb -U "$POSTGRES_USER" "$SCRATCH"
  trap '"${DC[@]}" exec -T db dropdb -U "$POSTGRES_USER" --if-exists "$SCRATCH" >/dev/null 2>&1 || true' EXIT
  "${DC[@]}" exec -T db pg_restore -U "$POSTGRES_USER" -d "$SCRATCH" --no-owner --exit-on-error < "$BK/db.dump"
  verify "$SCRATCH"
  echo "[restore] drill passed in $(( $(date +%s) - START ))s (scratch database dropped)"
elif [ "$MODE" = "replace" ]; then
  echo "This REPLACES the live database '$POSTGRES_DB' in project '${COMPOSE_PROJECT_NAME:-bbcare}' with $BK."
  read -r -p "Type the database name to confirm: " ANSWER
  [ "$ANSWER" = "$POSTGRES_DB" ] || { echo "[restore] not confirmed"; exit 1; }
  echo "[restore] taking a safety backup first"
  "$(dirname "$0")/backup.sh" "$ENV_FILE" >/dev/null
  "${DC[@]}" stop web worker
  "${DC[@]}" exec -T db pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --exit-on-error < "$BK/db.dump"
  "${DC[@]}" start web worker
  verify "$POSTGRES_DB"
  echo "[restore] replace complete in $(( $(date +%s) - START ))s"
else
  echo "unknown mode $MODE"; exit 1
fi
