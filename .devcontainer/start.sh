#!/usr/bin/env bash
# Start the BBCare dev server in the background on port 3000 (Codespaces forwards it privately).
cd "$(dirname "$0")/.."
if ! curl -s -o /dev/null http://localhost:3000/api/health; then
  nohup pnpm dev > /tmp/bbcare-dev.log 2>&1 &
  for _ in $(seq 1 90); do curl -s -o /dev/null http://localhost:3000/api/health && break; sleep 2; done
fi
if curl -s -o /dev/null http://localhost:3000/en; then
  echo "BBCare is running on port 3000. Open the Ports tab and click the globe icon next to 3000."
else
  echo "BBCare did not start. See /tmp/bbcare-dev.log, or run: bash .devcontainer/setup.sh && bash .devcontainer/start.sh"
  exit 1
fi
