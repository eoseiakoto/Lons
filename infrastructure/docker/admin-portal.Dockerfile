# Multi-stage build for Admin Portal (Next.js)
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
COPY apps/admin-portal/package.json apps/admin-portal/
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY apps/admin-portal ./apps/admin-portal
COPY packages ./packages
WORKDIR /app/apps/admin-portal
RUN pnpm run build

# ── Admin Portal ──
FROM node:20-alpine
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
WORKDIR /app
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin-portal/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin-portal/.next/static ./apps/admin-portal/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin-portal/public ./apps/admin-portal/public
USER nextjs
EXPOSE 3100
ENV NODE_ENV=production
CMD ["node", "apps/admin-portal/server.js"]
