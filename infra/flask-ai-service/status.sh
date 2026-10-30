#!/usr/bin/env bash
# Check BBCare AI Gateway status
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT=5001
TOKEN=""
if [ -f ".env" ]; then
    PORT=$(grep -E '^AI_GATEWAY_PORT=' .env | cut -d '=' -f2 || echo "5001")
    TOKEN=$(grep -E '^AI_GATEWAY_BEARER_TOKEN=' .env | cut -d '=' -f2 || echo "")
fi

echo "=== BBCare AI Gateway Status ==="
if systemctl --user is-active --quiet bbcare-ai-gateway.service 2>/dev/null; then
    echo "systemd --user unit: ACTIVE (running)"
else
    echo "systemd --user unit: inactive or not used"
fi

if [ -f "service.pid" ]; then
    PID=$(cat service.pid)
    if kill -0 "$PID" 2>/dev/null; then
        echo "Background PID: $PID (running)"
    else
        echo "Background PID file exists but process $PID is dead"
    fi
fi

echo -n "Listening port check ($PORT): "
if ss -tln | grep -q ":$PORT "; then
    echo "LISTENING on port $PORT"
else
    echo "NOT listening"
fi

echo "Probe /health endpoint:"
if [ -n "$TOKEN" ]; then
    curl -s -m 3 -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:${PORT}/health" | head -n 30 || echo "Health check failed"
else
    curl -s -m 3 "http://127.0.0.1:${PORT}/health" | head -n 30 || echo "Health check failed"
fi
echo
