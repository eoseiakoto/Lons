# Dev Prompt: Fix Cooling-Off Expiry Job Tests

**Date:** 2026-05-03
**Priority:** Low — broken test mock, not broken production code
**Effort:** ~10 minutes
**File:** `apps/scheduler/src/jobs/cooling-off-expiry.job.spec.ts`

---

## Problem

All 3 tests in `cooling-off-expiry.job.spec.ts` fail with:

```
TypeError: this.prisma.enterTenantContext is not a function
```

The production job (`cooling-off-expiry.job.ts`) calls `this.prisma.enterTenantContext()` twice — once with `{ isPlatformAdmin: true }` to fetch all active tenants, and once per-tenant with `{ tenantId: tenant.id }` to run the cooling-off expiry logic. But the test's `PrismaService` mock (lines 22–27) only stubs `tenant.findMany` — it doesn't include `enterTenantContext` at all.

This is a pre-existing issue introduced when the job was upgraded to use `enterTenantContext` for proper RLS scoping (Sprint 10B) but the test mock wasn't updated to match.

---

## Fix

Replace the `PrismaService` mock (lines 22–27 of the spec file) with one that stubs `enterTenantContext`:

```typescript
{
  provide: PrismaService,
  useValue: {
    enterTenantContext: jest.fn().mockImplementation(
      async (_ctx: any, fn: () => Promise<any>) => fn(),
    ),
    tenant: {
      findMany: jest.fn(),
    },
  },
},
```

The real `enterTenantContext` signature is:

```typescript
async enterTenantContext<T>(
  ctx: { tenantId?: string; isPlatformAdmin?: boolean },
  fn: () => Promise<T>,
): Promise<T>
```

It sets a PostgreSQL session variable for RLS then calls `fn()` inside a transaction. The mock just needs to call `fn()` and return the result — the RLS layer isn't relevant in unit tests.

**That's the only change needed.** The existing test assertions are correct — `findMany` and `expireCoolingOffContracts` are called inside the `fn` callbacks, so once `enterTenantContext` actually invokes `fn()`, those assertions will pass.

---

## Verification

```bash
pnpm --filter scheduler test -- cooling-off-expiry
```

All 4 tests should pass:
1. `should be defined`
2. `should call expireCoolingOffContracts for each active tenant`
3. `should continue processing other tenants if one fails`
4. `should handle no active tenants gracefully`

No changes to production code. No Prisma migration. No schema impact.
