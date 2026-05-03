# DE Note: BNPL REST Module — Missing Dependency Fix

**Date:** 2026-05-02
**Applied by:** DE (Deployment Engineer)
**Severity:** Service startup blocker

---

## Issue

The REST server (`apps/rest-server`) failed to start with:

> Nest can't resolve dependencies of the ApiKeyGuard (?). Please make sure that the argument ApiKeyService at index [0] is available in the BnplRestModule context.

## Root Cause

`apps/rest-server/src/bnpl/bnpl.module.ts` was missing the `EntityServiceModule` import. The `BnplController` uses `@UseGuards(ApiKeyGuard)`, which depends on `ApiKeyService` — provided by `EntityServiceModule`. Without it, NestJS couldn't resolve the dependency and the entire REST server failed to start.

## Fix Applied

Added `EntityServiceModule` to the imports array in `BnplRestModule`:

```diff
- imports: [PrismaModule, ProcessEngineBnplModule],
+ imports: [PrismaModule, ProcessEngineBnplModule, EntityServiceModule],
```

---

## Issue 2: CORS Default Ports Wrong

**File:** `apps/graphql-server/src/main.ts` (lines 44–45)

The CORS origin defaults pointed to the wrong ports:
- `ADMIN_PORTAL_URL` defaulted to `http://localhost:3001` (REST server port)
- `PLATFORM_PORTAL_URL` defaulted to `http://localhost:3002` (unused port)

Correct ports are 3100 (admin portal) and 3200 (platform portal). This caused "Failed to fetch" on both portal login pages.

```diff
- const adminOrigin = process.env.ADMIN_PORTAL_URL || 'http://localhost:3001';
- const platformOrigin = process.env.PLATFORM_PORTAL_URL || 'http://localhost:3002';
+ const adminOrigin = process.env.ADMIN_PORTAL_URL || 'http://localhost:3100';
+ const platformOrigin = process.env.PLATFORM_PORTAL_URL || 'http://localhost:3200';
```

## Note for Dev & PM

These were quick fixes applied by the DE to unblock local development. Dev team should:
1. Verify no other new modules have similar missing imports (any module using `@UseGuards(ApiKeyGuard)` must import `EntityServiceModule`)
2. Review CORS and port configurations across all services for consistency
