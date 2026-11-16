# syntax=docker/dockerfile:1

# ---- deps ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- builder ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Ensure a clean, reproducible build.
RUN npm run build

# ---- runner ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    HLIFT_DB_PATH=/app/data/hlift.db

# Non-root runtime user (TRL 8 hardening).
RUN addgroup -S hlift && adduser -S hlift -G hlift

# Standalone server + static assets.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
# Public dir (if present) — copied conditionally so a missing dir does not fail the build.
RUN if [ -d /app/public ]; then mkdir -p ./public && cp -r /app/public/. ./public/; fi

# Database baseline, migrations and scripts (init-db, seed, verify).
COPY --from=builder /app/db ./db
COPY --from=builder /app/scripts ./scripts

# Production node_modules already included in standalone; ensure sqlite runtime.
RUN mkdir -p /app/data && chown -R hlift:hlift /app

USER hlift
EXPOSE 3000

# Liveness: the health endpoint exercises the DB bootstrap path.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null 2>&1 || exit 1

# Initialize/migrate the database, then start the server.
CMD ["sh", "-c", "node scripts/init-db.mjs && node server.js"]
