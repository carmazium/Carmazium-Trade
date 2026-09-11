# Syntax=docker/dockerfile:1

# Node 24 is the single backend runtime. Current dependencies (including
# geoip-lite 2.x) require the newer runtime, so keeping Docker on Node 20 while
# CI/hosting used something else created a latent production-only failure.
ARG NODE_VERSION=24.8.0

# ── Stage 1: Build ──────────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS builder

WORKDIR /app

# Install ALL dependencies (dev included, needed for nest CLI + prisma generate)
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

# Copy source and build
COPY . .
RUN npx prisma generate
RUN npx nest build

# ── Stage 2: Production ────────────────────────────────────────
FROM node:${NODE_VERSION}-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Install postgresql-client for pg_dump (required by weekly backup cron)
RUN apk add --no-cache postgresql16-client

# Install production dependencies only. Schema changes are NEVER pushed here;
# production migrations are an explicit deployment step, not a container boot
# side effect.
COPY package*.json ./
RUN npm ci --omit=dev

# Copy Prisma schema + generated client from builder
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma

# Copy compiled NestJS app
COPY --from=builder /app/dist ./dist

# Static assets bundled with the app
COPY --from=builder /app/assets ./assets

EXPOSE 8080

CMD ["node", "dist/main"]
