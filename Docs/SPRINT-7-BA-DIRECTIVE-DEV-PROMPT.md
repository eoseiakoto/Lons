# Sprint 7 — BA Directive Fix Prompt (Claude Code)

> **Context:** The BA raised 2 directives requiring application code changes. Fix both in order — Fix 1 is Critical and on the deployment critical path.

---

## Fix 1 (Critical): Verify Platform Portal App Readiness

**Monday.com item:** 11632310360

**Problem:** The Platform Portal (`apps/platform-portal/`) is a separate Next.js app (port 3200) that provides the eagle-eye view for Platform Admin across all SPs. Before the DE can deploy it, we must verify it builds and functions correctly.

**Context:** The Platform Portal is a fully built Next.js 14 app with:
- Login page calling `loginPlatformUser` GraphQL mutation
- Dashboard with cross-tenant metrics (total tenants, active tenants, plan distribution)
- Tenant list with search/sort → drill-down to individual tenant detail → products/customers/contracts
- System health check page (GraphQL, REST, Scoring service endpoints)
- Settings page (platform info, API config)
- Apollo Client configured via `NEXT_PUBLIC_GRAPHQL_URL` env var

### Step 1: Verify the platform-portal builds

```bash
cd apps/platform-portal
pnpm build
```

If there are build errors, fix them. Common issues:
- Missing dependencies (check package.json)
- TypeScript errors in components
- Missing environment variables in next.config

### Step 2: Add Dockerfile stage for platform-portal

The root `Dockerfile` has stages for all services EXCEPT platform-portal. Add a stage at the end (after the admin-portal stage at line 85):

```dockerfile
# ── Platform Portal (Next.js) ──
FROM node:20-alpine AS platform-portal
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
WORKDIR /app
COPY --from=builder --chown=nextjs:nodejs /app/apps/platform-portal/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/platform-portal/.next/static ./apps/platform-portal/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/platform-portal/public ./apps/platform-portal/public
USER nextjs
EXPOSE 3200
ENV NODE_ENV=production
CMD ["node", "apps/platform-portal/server.js"]
```

**Important:** The platform-portal's `next.config.mjs` must have `output: 'standalone'` for this to work. Verify and add if missing:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
};

export default nextConfig;
```

Also ensure `apps/platform-portal/public/` directory exists (create it empty if missing — Next.js standalone build expects it):

```bash
mkdir -p apps/platform-portal/public
```

And add a `mkdir -p apps/platform-portal/public` line in the builder stage (right after the existing `mkdir -p apps/admin-portal/public` on line 32):

```dockerfile
RUN mkdir -p apps/admin-portal/public
RUN mkdir -p apps/platform-portal/public
```

### Step 3: Verify Platform Portal environment configuration

The Platform Portal's `lib/apollo-client.tsx` reads `NEXT_PUBLIC_GRAPHQL_URL` with a fallback to `http://localhost:3000/graphql`. For staging, this needs to point to `https://api.staging.lons.io/graphql`.

The settings page (`settings/page.tsx`) has hardcoded localhost URLs. Update them to read from environment variables or display the configured values:

**In `apps/platform-portal/src/app/(portal)/settings/page.tsx`**, replace hardcoded URLs:
- `http://localhost:3000/graphql` → `process.env.NEXT_PUBLIC_GRAPHQL_URL || 'http://localhost:3000/graphql'`
- `http://localhost:3002` → `process.env.NEXT_PUBLIC_REST_URL || 'http://localhost:3002'`
- `http://localhost:8000` → `process.env.NEXT_PUBLIC_SCORING_URL || 'http://localhost:8000'`

### Step 4: Verify loginPlatformUser works end-to-end

Check that the `loginPlatformUser` mutation in `apps/graphql-server/src/graphql/resolvers/auth.resolver.ts` is fully implemented and not a stub. It should:
1. Look up the platform user by email
2. Verify the password hash (Argon2id)
3. Generate JWT with `{ userId, role, type: 'platform' }`
4. Return `{ accessToken, refreshToken }`

If any part is stubbed or incomplete, implement it.

### Step 5: Verify all pages render without errors

Check for any obvious issues in these files:
- `apps/platform-portal/src/app/(portal)/dashboard/page.tsx` — GraphQL query `PLATFORM_DASHBOARD_QUERY` should resolve against existing schema
- `apps/platform-portal/src/app/(portal)/tenants/page.tsx` — `TENANTS_QUERY` must match schema
- `apps/platform-portal/src/app/(portal)/tenants/[id]/page.tsx` — `TENANT_QUERY` must match schema
- `apps/platform-portal/src/app/(portal)/system/page.tsx` — health check endpoints should be configurable

**Verification checklist:**
- [ ] `pnpm --filter platform-portal build` succeeds
- [ ] `next.config.mjs` has `output: 'standalone'`
- [ ] `apps/platform-portal/public/` directory exists
- [ ] Dockerfile has `platform-portal` stage exposing port 3200
- [ ] Dockerfile builder stage creates `apps/platform-portal/public/`
- [ ] Settings page uses env vars instead of hardcoded localhost
- [ ] `loginPlatformUser` mutation is fully implemented (not stubbed)
- [ ] All GraphQL queries in portal pages match the backend schema

---

## Fix 2 (High): Remove Duplicate `superadmin@lons.io` Account

**Monday.com item:** 11632431385

**Problem:** The seed data creates two Platform Admin accounts — `admin@lons.io` and `superadmin@lons.io` — that are **functionally identical**. Both have `role: 'platform_admin'`. There is no `platform_superadmin` role, no code distinguishing them, and no UI difference. This confuses onboarding documentation and SP prospects.

**BA recommendation:** Option A — remove the duplicate. Keep `admin@lons.io` as the single Platform Admin account.

**File to modify:** `packages/database/prisma/seed.ts`

**Remove the superadmin upsert block** around lines 1524-1537:

```typescript
// REMOVE THIS ENTIRE BLOCK:
const stagingAdminHash = await hashPassword('StagingAdmin123!@#');
await p.platformUser.upsert({
  where: { email: 'superadmin@lons.io' },
  update: { passwordHash: stagingAdminHash },
  create: {
    email: 'superadmin@lons.io',
    passwordHash: stagingAdminHash,
    name: 'Staging Super Admin',
    role: 'platform_admin',
    mfaEnabled: false,
    status: 'active',
  },
});
console.log('  Created superadmin@lons.io');
```

**Also check and update these if they reference superadmin@lons.io:**
- `Docs/TENANT-ONBOARDING-RUNBOOK.md` — if it lists superadmin credentials, remove them
- Any test files that use `superadmin@lons.io` for login
- The platform-portal login page placeholder (currently shows `admin@lons.io` — confirm this stays)

**Verification:**
- [ ] `grep -rn "superadmin@lons.io" .` returns zero results (excluding SPRINT-7 prompt docs and git history)
- [ ] `admin@lons.io` / `AdminPass123!@#` remains as the sole Platform Admin account
- [ ] Seed script runs without errors: `pnpm --filter database db:seed`

---

## Execution Order

1. **Fix 1** first — Critical path. The DE is blocked on deploying the Platform Portal until we confirm it builds.
2. **Fix 2** second — Clean up while the DE works on deployment.

## Post-Fix Verification Checklist

- [ ] Platform Portal builds successfully
- [ ] Dockerfile has platform-portal stage
- [ ] No hardcoded localhost URLs in settings page
- [ ] Single Platform Admin account (admin@lons.io)
- [ ] No TypeScript compilation errors: `pnpm build`
