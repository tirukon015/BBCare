#!/usr/bin/env bash
# One-time setup for a Codespaces/dev-container preview with SYNTHETIC data only.
set -euo pipefail
cd "$(dirname "$0")/.."
sudo corepack enable >/dev/null 2>&1 || corepack enable
corepack prepare pnpm@10.28.0 --activate
pnpm install --frozen-lockfile

if [ ! -f .env ]; then
  SEED_PASSWORD="preview-$(openssl rand -hex 6)"
  cat > .env <<ENV
BBCARE_ENV=preview
BBCARE_BASE_URL=http://localhost:3000
DATABASE_URL=postgres://bbcare:bbcare-dev-only@localhost:5432/bbcare_dev
BBCARE_ENCRYPTION_KEY=$(openssl rand -base64 32)
BBCARE_SESSION_SECRET=$(openssl rand -base64 32)
BBCARE_AI_PROVIDER=mock
BBCARE_ALLOWED_ORIGINS=*.app.github.dev,*.preview.app.github.dev
BBCARE_SEED_PASSWORD=$SEED_PASSWORD
NEXT_TELEMETRY_DISABLED=1
ENV
  chmod 600 .env
fi
ln -sf ../../.env apps/web/.env

echo "Waiting for PostgreSQL..."
for _ in $(seq 1 60); do (echo > /dev/tcp/127.0.0.1/5432) >/dev/null 2>&1 && break; sleep 1; done
set -a; . ./.env; set +a
pnpm db:migrate
pnpm db:seed
cat > .devcontainer/.preview-login.txt <<TXT
BBCare preview staff logins (synthetic data, this codespace only)
  admin@bbcare.test, editor@bbcare.test, reviewer@bbcare.test, agent@bbcare.test, analyst@bbcare.test
  password: ${BBCARE_SEED_PASSWORD}
Each account asks you to set up an authenticator app (Google/Microsoft Authenticator) at first sign-in.
TXT
chmod 600 .devcontainer/.preview-login.txt
echo "Setup complete. Staff login details: .devcontainer/.preview-login.txt"
