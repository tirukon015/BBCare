#!/usr/bin/env bash
# Roll the application back to the previously deployed image (no database change).
# Database recovery, if ever needed, is a separate, confirmed step: restore.sh replace.
set -euo pipefail
ENV_FILE=${1:?usage: rollback.sh <env-file>}
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a
STATE_DIR=${BBCARE_STATE_DIR:-/var/lib/bbcare}/${COMPOSE_PROJECT_NAME:?}
PREV=$(cat "$STATE_DIR/previous_image" 2>/dev/null || true)
[ -n "$PREV" ] || { echo "[rollback] no previous image recorded"; exit 1; }
CUR=$(cat "$STATE_DIR/current_image" 2>/dev/null || true)
echo "[rollback] $CUR -> $PREV"
BBCARE_IMAGE="$PREV" docker compose --env-file "$ENV_FILE" -f "$HERE/../compose/docker-compose.yml" up -d --remove-orphans
for _ in $(seq 1 30); do curl -fsS -m 5 "http://127.0.0.1:${BBCARE_WEB_PORT}/api/health/ready" >/dev/null 2>&1 && break; sleep 4; done
echo "$PREV" > "$STATE_DIR/current_image"; echo "$CUR" > "$STATE_DIR/previous_image"
echo "[rollback] done"
