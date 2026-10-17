# syntax=docker/dockerfile:1.7
# Two runtime targets from one build:
#   docker build --target web    -t coursemates/web .
#   docker build --target worker -t coursemates/worker .
FROM node:26-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Public configuration is inlined into the browser bundle at build time.
ARG NEXT_PUBLIC_POSTHOG_KEY=""
ARG NEXT_PUBLIC_POSTHOG_HOST="https://us.i.posthog.com"
ARG NEXT_PUBLIC_SENTRY_DSN=""
ARG NEXT_PUBLIC_CONTACT=""
ARG APP_URL="http://localhost:3100"
# Placeholders so configuration validation passes while prerendering; nothing connects during the build.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build \
    REDIS_URL=redis://localhost:6379 \
    AUTH_SECRET=build-time-placeholder-not-a-secret \
    NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY \
    NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_PUBLIC_CONTACT=$NEXT_PUBLIC_CONTACT \
    APP_URL=$APP_URL
RUN npm run build

FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Web: Next.js standalone output, non-root, one process on port 3000.
FROM base AS web
RUN addgroup -S app && adduser -S app -G app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]

# Worker: BullMQ processors and the migration script, run with tsx (a runtime dependency).
FROM base AS worker
RUN addgroup -S app && adduser -S app -G app
ENV NODE_ENV=production
COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app package.json tsconfig.json ./
COPY --chown=app:app src ./src
COPY --chown=app:app drizzle ./drizzle
COPY --chown=app:app scripts ./scripts
USER app
EXPOSE 9465
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 CMD wget -qO- http://127.0.0.1:9465/healthz >/dev/null || exit 1
CMD ["node_modules/.bin/tsx", "src/worker/index.ts"]
