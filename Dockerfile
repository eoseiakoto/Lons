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
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

FROM base AS graphql-server
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/graphql-server/dist ./apps/graphql-server/dist
COPY --from=builder /app/packages ./packages
EXPOSE 3000
CMD ["node", "apps/graphql-server/dist/main.js"]

FROM base AS rest-server
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/rest-server/dist ./apps/rest-server/dist
COPY --from=builder /app/packages ./packages
EXPOSE 3001
CMD ["node", "apps/rest-server/dist/main.js"]
