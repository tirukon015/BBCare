#!/usr/bin/env bash
# BBCare deploy with pre-deploy backup, health gate and automatic application rollback.
# Usage: deploy.sh <env-file> <image-tag> [--production]
#   The env file defines COMPOSE_PROJECT_NAME, BBCARE_WEB_PORT, database settings and app secrets.
#   --production requires typed confirmation and is only run with explicit owner approval.
set -euo pipefail
ENV_FILE=${1:?usage: deploy.sh <env-file> <image-tag> [--production]}
IMAGE=${2:?image tag required}
PROD=${3:-}
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a
STATE_DIR=${BBCARE_STATE_DIR:-/var/lib/bbcare}/${COMPOSE_PROJECT_NAME:?COMPOSE_PROJECT_NAME missing}
mkdir -p "$STATE_DIR"
PERM=$(stat -c %a "$ENV_FILE")
[ "$PERM" = "600" ] || [ "$PERM" = "400" ] || { echo "[deploy] env file permissions must be 600 or 400 (found $PERM)"; exit 1; }

if [ "${BBCARE_ENV:-}" = "production" ] && [ "$PROD" != "--production" ]; then
  echo "[deploy] BBCARE_ENV=production requires the --production flag"; exit 1
fi
if [ "$PROD" = "--production" ]; then
  read -r -p "Deploy $IMAGE to PRODUCTION project $COMPOSE_PROJECT_NAME? Type 'deploy production': " A
  [ "$A" = "deploy production" ] || { echo "[deploy] not confirmed"; exit 1; }
fi

PREV=$(cat "$STATE_DIR/current_image" 2>/dev/null || true)
DC=(docker compose --env-file "$ENV_FILE" -f "$HERE/../compose/docker-compose.yml")

if [ -n "$PREV" ]; then
  echo "[deploy] pre-deploy backup"
  BK=$("$HERE/backup.sh" "$ENV_FILE" | tail -1)
  echo "$BK" > "$STATE_DIR/last_backup"
fi

echo "[deploy] starting $IMAGE (previous: ${PREV:-none})"
BBCARE_IMAGE="$IMAGE" "${DC[@]}" up -d --remove-orphans

health() {
  for _ in $(seq 1 30); do
    if curl -fsS -m 5 "http://127.0.0.1:${BBCARE_WEB_PORT}/api/health/ready" >/dev/null 2>&1; then return 0; fi
    sleep 4
  done
  return 1
}
smoke() {
  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' -m 10 "http://127.0.0.1:${BBCARE_WEB_PORT}/en")
  [ "$code" = "200" ] || [ "$code" = "401" ]
}

if health && smoke; then
  echo "$IMAGE" > "$STATE_DIR/current_image"
  [ -n "$PREV" ] && echo "$PREV" > "$STATE_DIR/previous_image"
  echo "[deploy] healthy: $IMAGE"
else
  echo "[deploy] health check FAILED"
  if [ -n "$PREV" ]; then
    echo "[deploy] rolling back application to $PREV"
    BBCARE_IMAGE="$PREV" "${DC[@]}" up -d --remove-orphans
    health && echo "[deploy] rollback healthy. If a migration ran, see docs/runbooks/rollback.md before restoring $(cat "$STATE_DIR/last_backup" 2>/dev/null)."
  fi
  exit 1
fi
