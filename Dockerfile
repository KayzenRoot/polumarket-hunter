# syntax=docker/dockerfile:1
# node:24-bookworm-slim, pinned by digest for reproducible builds.
FROM node@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/polymarket/package.json packages/polymarket/package.json
COPY packages/persistence/package.json packages/persistence/package.json
COPY packages/testkit/package.json packages/testkit/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --ignore-scripts --no-audit --no-fund
RUN npm rebuild esbuild

COPY tsconfig.json tsconfig.base.json tsconfig.dev.json ./
COPY packages ./packages
COPY apps ./apps
RUN npm run build
RUN npm prune --omit=dev --no-audit --no-fund

# node:24-bookworm-slim, pinned by digest for reproducible builds.
FROM node@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    DATABASE_PATH=/data/polyhunter.db \
    RECORD_DIR=/data/recordings
WORKDIR /app

COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages/core/package.json ./packages/core/package.json
COPY --from=build --chown=node:node /app/packages/core/dist ./packages/core/dist
COPY --from=build --chown=node:node /app/packages/polymarket/package.json ./packages/polymarket/package.json
COPY --from=build --chown=node:node /app/packages/polymarket/dist ./packages/polymarket/dist
COPY --from=build --chown=node:node /app/packages/persistence/package.json ./packages/persistence/package.json
COPY --from=build --chown=node:node /app/packages/persistence/dist ./packages/persistence/dist
COPY --from=build --chown=node:node /app/packages/testkit/package.json ./packages/testkit/package.json
COPY --from=build --chown=node:node /app/packages/testkit/dist ./packages/testkit/dist
COPY --from=build --chown=node:node /app/apps/server/package.json ./apps/server/package.json
COPY --from=build --chown=node:node /app/apps/server/dist ./apps/server/dist
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/api/health').then(function(r){process.exit(r.ok?0:1)}).catch(function(){process.exit(1)})"
CMD ["node", "apps/server/dist/main.js"]
