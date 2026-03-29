# Multi-stage build for GraphQL Server
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
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

# ── GraphQL Server ──
FROM node:20-alpine
RUN addgroup -g 1001 -S nodejs && adduser -S nestjs -u 1001
WORKDIR /app
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/graphql-server/dist ./apps/graphql-server/dist
COPY --from=builder --chown=nestjs:nodejs /app/packages ./packages
COPY --from=builder --chown=nestjs:nodejs /app/package.json ./
USER nestjs
EXPOSE 3000
CMD ["node", "apps/graphql-server/dist/main.js"]
