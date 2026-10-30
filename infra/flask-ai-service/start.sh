#!/usr/bin/env bash
# Start BBCare AI Gateway service locally
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d ".venv" ]; then
    echo "Virtual environment not found. Please create it first:"
    echo "  python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
    exit 1
fi

if [ ! -f ".env" ]; then
    echo "Configuration file .env not found. Please create it from .env.example:"
    echo "  cp .env.example .env"
    exit 1
fi

# Try systemd user service first if systemd --user is available
if systemctl --user status >/dev/null 2>&1; then
    mkdir -p ~/.config/systemd/user
    cp "$SCRIPT_DIR/bbcare-ai-gateway.service" ~/.config/systemd/user/
    systemctl --user daemon-reload
    systemctl --user enable bbcare-ai-gateway.service
    systemctl --user restart bbcare-ai-gateway.service
    echo "Started bbcare-ai-gateway via systemd --user"
else
    # Fallback to background gunicorn with PID tracking
    PID_FILE="$SCRIPT_DIR/service.pid"
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
        echo "Service is already running with PID $(cat "$PID_FILE")"
        exit 0
    fi
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
    nohup "$SCRIPT_DIR/.venv/bin/gunicorn" \
        --bind "${AI_GATEWAY_HOST:-127.0.0.1}:${AI_GATEWAY_PORT:-5001}" \
        --workers 2 \
        --threads 4 \
        --timeout 120 \
        app:app > "$SCRIPT_DIR/gateway.log" 2>&1 &
    echo $! > "$PID_FILE"
    echo "Started bbcare-ai-gateway in background (PID $(cat "$PID_FILE"))"
fi

sleep 1
bash "$SCRIPT_DIR/status.sh"
