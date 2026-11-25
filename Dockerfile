# syntax=docker/dockerfile:1.7
#
# Production image for the shop (Phase 3.6): the Next.js web app and the background worker run from
# this one image with different commands (see deploy/compose.yml). Built on the server itself:
#
#   docker compose -f deploy/compose.yml build
#
# `next build` prerenders store pages from the database, so the build step gets the settings file as a
# BuildKit secret (never stored in the image) and reaches MongoDB on the server's own 127.0.0.1.

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 COREPACK_HOME=/corepack
WORKDIR /app
# pnpm is fetched once, into the image, so containers start without the internet.
COPY package.json ./
RUN corepack enable && corepack install && chmod -R a+rX /corepack

# Chromium prints invoice PDFs (FR-OR-03); the Bangla font comes from node_modules (@fontsource).
FROM base AS runtime-os
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN --mount=type=secret,id=env,target=/app/.env.production.local,required=true \
  set -e; \
  build_mongo="$(sed -n 's/^MONGODB_BUILD_URI=//p' .env.production.local)"; \
  build_redis="$(sed -n 's/^REDIS_BUILD_URL=//p' .env.production.local)"; \
  [ -n "$build_mongo" ] || { echo "MONGODB_BUILD_URI is missing from the settings file" >&2; exit 1; }; \
  MONGODB_URI="${build_mongo:-}" REDIS_URL="${build_redis:-redis://127.0.0.1:6379}" pnpm build

FROM runtime-os AS app
ENV NODE_ENV=production CHROMIUM_PATH=/usr/bin/chromium PORT=3000 HOSTNAME=0.0.0.0
# The worker runs TypeScript with tsx, so the full dependency set comes along.
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node_modules/.bin/next", "start"]
