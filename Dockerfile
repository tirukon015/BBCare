# syntax=docker/dockerfile:1.7
# Multi-stage build for the BBCare web app and worker (same image, different commands).
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
# Optional: builds behind a TLS-intercepting proxy can pass its CA as a BuildKit secret
#   docker build --secret id=extra_ca,src=/path/ca.crt --build-arg HTTPS_PROXY=... .
# Without the secret these steps behave normally.
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/ai/package.json packages/ai/
COPY evals/package.json evals/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @bbcare/web build

FROM base AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 bbcare && useradd --system --uid 1001 --gid bbcare --home /app bbcare \
 && mkdir -p /app/storage && chown bbcare:bbcare /app/storage
# Web (Next.js standalone output)
COPY --from=build --chown=bbcare:bbcare /app/apps/web/.next/standalone ./
COPY --from=build --chown=bbcare:bbcare /app/apps/web/.next/static ./apps/web/.next/static
# Worker, migrations and tooling (source run with tsx; small and shares packages)
COPY --from=build --chown=bbcare:bbcare /app/node_modules ./tooling/node_modules
COPY --from=build --chown=bbcare:bbcare /app/packages ./tooling/packages
COPY --from=build --chown=bbcare:bbcare /app/apps/worker ./tooling/apps/worker
COPY --from=build --chown=bbcare:bbcare /app/evals ./tooling/evals
USER bbcare
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
