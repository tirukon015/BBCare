#!/usr/bin/env bash
# Stop BBCare AI Gateway service locally
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if systemctl --user is-active --quiet bbcare-ai-gateway.service 2>/dev/null; then
    systemctl --user stop bbcare-ai-gateway.service
    echo "Stopped bbcare-ai-gateway via systemd --user"
fi

PID_FILE="$SCRIPT_DIR/service.pid"
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if kill -0 "$PID" 2>/dev/null; then
        kill "$PID" || true
        echo "Stopped background process with PID $PID"
    fi
    rm -f "$PID_FILE"
fi
