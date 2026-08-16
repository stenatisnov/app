# syntax=docker/dockerfile:1
#
# Single container: the app only — Postgres is a separate service reached
# over the network (local `docker compose` service, or Railway's managed
# Postgres plugin in production), so there is no local DB volume here.
# Binds to 0.0.0.0:$PORT — required for Railway (and most container
# platforms) to route traffic in; $PORT is injected at runtime, the value
# below is only the local-dev default.

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `prisma generate` only reads the schema, not a live connection, but it
# still validates that a DATABASE_URL is present — any well-formed value
# works at build time, the real one arrives as a runtime env var.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

RUN apk add --no-cache libc6-compat openssl bash \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 remixapp

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# `messages/*.json` and the `public/` directory are already baked into
# build/client (Vite copies public/ verbatim, and the i18n JSON files are
# statically imported into the bundle, not read from disk at runtime) — so
# only the build output, Prisma schema (for `prisma generate` below), and
# the scheduler script (run standalone, outside the build) need copying.
COPY --from=builder /app/build ./build
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY scripts/scheduler.ts ./scripts/scheduler.ts
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x docker-entrypoint.sh \
  && npx prisma generate \
  && chown -R remixapp:nodejs /app

EXPOSE 3000
USER remixapp
ENTRYPOINT ["./docker-entrypoint.sh"]
