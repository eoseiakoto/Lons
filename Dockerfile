# Multi-stage build for NestJS services
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/database/package.json packages/database/
COPY packages/common/package.json packages/common/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/event-contracts/package.json packages/event-contracts/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY services/entity-service/package.json services/entity-service/
COPY services/process-engine/package.json services/process-engine/
COPY services/repayment-service/package.json services/repayment-service/
COPY services/notification-service/package.json services/notification-service/
COPY services/settlement-service/package.json services/settlement-service/
COPY services/reconciliation-service/package.json services/reconciliation-service/
COPY services/integration-service/package.json services/integration-service/
COPY services/recovery-service/package.json services/recovery-service/
COPY apps/graphql-server/package.json apps/graphql-server/
COPY apps/rest-server/package.json apps/rest-server/
COPY apps/scheduler/package.json apps/scheduler/
COPY apps/admin-portal/package.json apps/admin-portal/
COPY apps/platform-portal/package.json apps/platform-portal/
RUN pnpm install --frozen-lockfile

FROM base AS builder
RUN apk add --no-cache openssl
COPY --from=deps /app ./
COPY . .
RUN mkdir -p apps/admin-portal/public
RUN pnpm run build

# ── GraphQL Server ──
FROM node:20-alpine AS graphql-server
RUN apk add --no-cache openssl
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001
WORKDIR /app
COPY --from=builder --chown=nestjs:nodejs /app ./
USER nestjs
EXPOSE 3000
CMD ["node", "apps/graphql-server/dist/main.js"]

# ── REST Server ──
FROM node:20-alpine AS rest-server
RUN apk add --no-cache openssl
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001
WORKDIR /app
COPY --from=builder --chown=nestjs:nodejs /app ./
USER nestjs
EXPOSE 3001
CMD ["node", "apps/rest-server/dist/main.js"]

# ── Scheduler ──
FROM node:20-alpine AS scheduler
RUN apk add --no-cache openssl
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001
WORKDIR /app
COPY --from=builder --chown=nestjs:nodejs /app ./
USER nestjs
EXPOSE 3002
CMD ["node", "apps/scheduler/dist/main.js"]

# ── Notification Worker ──
FROM node:20-alpine AS notification-worker
RUN apk add --no-cache openssl
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001
WORKDIR /app
COPY --from=builder --chown=nestjs:nodejs /app ./
USER nestjs
EXPOSE 3003
CMD ["node", "services/notification-service/dist/main.js"]

# ── Admin Portal (Next.js) ──
FROM node:20-alpine AS admin-portal
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
WORKDIR /app
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin-portal/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin-portal/.next/static ./apps/admin-portal/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin-portal/public ./apps/admin-portal/public
USER nextjs
EXPOSE 3100
ENV NODE_ENV=production
CMD ["node", "apps/admin-portal/server.js"]
