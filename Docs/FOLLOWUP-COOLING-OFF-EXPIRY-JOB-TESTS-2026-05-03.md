# Follow-up: cooling-off-expiry job tests fail (pre-existing)

**Date:** 2026-05-03
**Discovered during:** Sprint 12 batch verification
**Priority:** Low — broken test, not broken production code
**Owner:** PM to assign (likely the cooling-off feature owner)

---

## What's broken

`apps/scheduler/src/jobs/cooling-off-expiry.job.spec.ts` has **3 failing tests**:

1. `should call expireCoolingOffContracts for each active tenant`
2. `should continue processing other tenants if one fails`
3. `should handle no active tenants gracefully`

All three fail with the same root cause:

```
TypeError: this.prisma.enterTenantContext is not a function

  at CoolingOffExpiryJob.handleCron (src/jobs/cooling-off-expiry.job.ts:22:39)
```

## Why it's not blocking Sprint 12

These tests were already failing before Sprint 12 work began. Both files are
**untracked in git** (never committed), introduced by a prior session that
landed the production-ready job code without a corresponding test fixture
update. The failure is in the test mock — `PrismaService` exposes
`enterTenantContext` in production but the test mock doesn't stub it.

Verification: running `git stash` then `pnpm --filter scheduler test --
cooling-off-expiry` reproduces the same failure on a clean Sprint 11 baseline.

## Fix sketch (~15 minutes)

In `apps/scheduler/src/jobs/cooling-off-expiry.job.spec.ts`, the
PrismaService mock needs `enterTenantContext` stubbed:

```typescript
const mockPrisma = {
  enterTenantContext: jest.fn().mockImplementation(async (_ctx, fn) => fn()),
  tenant: { findMany: jest.fn().mockResolvedValue([...]) },
  // ...
};
```

The signature is roughly `enterTenantContext(context, fn)` — the production
implementation in `packages/database/src/prisma.service.ts` sets a Postgres
session variable for RLS and calls `fn()`. The mock just needs to invoke `fn`.

After fixing the mock, all 3 tests should pass without any changes to the
production job code.

## Action

PM: assign to the cooling-off feature owner. Trivially small — 1 mock
addition + re-run tests. No Prisma migration, no new code, no schema impact.
