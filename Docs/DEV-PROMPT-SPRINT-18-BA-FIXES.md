# DEV-PROMPT — Sprint 18 BA Fix Cycle

**Date:** 2026-05-18
**Sprint:** 18 — BA Fix Cycle
**Review doc:** `Docs/BA-SPRINT-18-FINDINGS-FOR-PM-2026-05-18.md`
**PM response:** `Docs/PM-RESPONSE-BA-SPRINT-18-FINDINGS-2026-05-18.md`
**Branch:** Continue on `claude/hopeful-haibt-32d778`
**Scope:** 5 fixes (~1.5 SP)

---

## CRITICAL RULES — Same as Sprint 18

1. **Money is NEVER a float.** Use `Decimal` / `DECIMAL(19,4)` / string in API responses.
2. **All tests must pass** — zero regressions.
3. **Idempotency** — all mutations accept `idempotencyKey`. Keys MUST be `crypto.randomUUID()` generated per form mount, NOT derived from timestamps or input fields.

---

## FIX-BA-1: Loan Review Page — UUID Idempotency Keys Per Panel Mount

**Finding:** F-BA-S18-1 + F-BA-S18-6
**File:** `apps/admin-portal/src/app/(portal)/loans/applications/[id]/page.tsx`
**Problem:** Six mutation handlers use `Date.now()` at click time for idempotency keys:

```typescript
// Lines 221, 238, 256, 278 (approve, reject, escalate, modify)
idempotencyKey: `approve-${loanRequestId}-${Date.now()}`
idempotencyKey: `reject-${loanRequestId}-${Date.now()}`
idempotencyKey: `escalate-${loanRequestId}-${Date.now()}`
idempotencyKey: `modify-${loanRequestId}-${Date.now()}`
```

Also check the same file for `restructureContract` and `waivePenalty` handlers — BA finding F-BA-S18-6 reports these use the same `Date.now()` pattern.

`Date.now()` is non-unique under rapid double-clicks (same millisecond) and inconsistent with the FIX-1 pattern on the manual payment panel which uses `crypto.randomUUID()`.

**Required change:**

1. Generate a single UUID on panel/page mount:
```typescript
const [reviewIdemKey, setReviewIdemKey] = useState(() => crypto.randomUUID());
```

2. Use it in all mutation handlers:
```typescript
// In handleApprove, handleReject, handleEscalate, handleModify,
// handleRestructure, handleWaive:
idempotencyKey: reviewIdemKey,
```

3. Regenerate after any successful mutation:
```typescript
setReviewIdemKey(crypto.randomUUID());
```

This is the same pattern as FIX-1 on the manual payment modal. One UUID per page mount, regenerated on success.

**Tests:** Verify the page renders without error and the key changes after a successful action (unit test or existing e2e).

---

## FIX-BA-2: Remove @RequiresPlan('growth') from Billing Invoice Queries

**Finding:** F-BA-S18-2
**File:** `apps/graphql-server/src/graphql/resolvers/billing.resolver.ts`
**Problem:** The PM fix cycle (FIX-4) removed `@RequiresPlan('growth')` from `usageHistory` but missed two sibling read queries:

```typescript
// Line 57
@RequiresPlan('growth')
async billingInvoices(...)

// Line 112
@RequiresPlan('growth')
async billingInvoice(...)
```

Starter tenants can now see usage history (FIX-4) but not their invoices — broken split experience.

**Required change:**

Remove `@RequiresPlan('growth')` from both:

```typescript
// billingInvoices — line 57: DELETE the @RequiresPlan('growth') line
@Query(() => BillingInvoiceConnection)
@Roles('billing:read')
async billingInvoices(

// billingInvoice — line 112: DELETE the @RequiresPlan('growth') line
@Query(() => BillingInvoiceType)
@Roles('billing:read')
async billingInvoice(
```

**Keep** `@RequiresPlan('growth')` on `markInvoicePaid` (~line 132) — that's a write/operator action, appropriate to restrict.

**Tests:**
```typescript
it('allows Starter-tier tenants to query billingInvoices', async () => {
  // Starter tenant context → billingInvoices query → no ForbiddenException
});

it('allows Starter-tier tenants to query billingInvoice by ID', async () => {
  // Starter tenant context → billingInvoice(id) query → no ForbiddenException
});
```

---

## FIX-BA-3: Replace Number() with parseInt in CSV Export

**Finding:** F-BA-S18-3
**File:** `services/analytics-service/src/reports/report-export.service.ts` (~line 121)
**Problem:** Integer column formatting uses `Number()` which produces IEEE 754 floats:

```typescript
case 'int':
  return this.escapeCsv(String(Math.trunc(Number(value))));
```

For large integers or Prisma `Decimal` values, `Number()` can lose precision before `Math.trunc()`.

**Required change:**

```typescript
case 'int':
  return this.escapeCsv(String(parseInt(String(value), 10)));
```

`String(value)` handles both `Decimal` and `BigInt` types safely. `parseInt` with radix 10 extracts the integer part without floating-point intermediate.

**Tests:**
```typescript
it('formats large integer values without precision loss', () => {
  // value = '9007199254740993' (Number.MAX_SAFE_INTEGER + 2)
  // parseInt(String(value), 10) → 9007199254740993
  // Number(value) → 9007199254740992 (wrong!)
});
```

---

## FIX-BA-4: Wire EMI Sync Job in Scheduler

**Finding:** F-BA-S18-4
**File:** `apps/scheduler/src/scheduler.module.ts`
**Problem:** `EmiDataSyncJob` exists in `services/integration-service/src/emi-data/emi-data-sync.job.ts` and is exported from `EmiDataModule`, but the scheduler module doesn't import it. The `@Cron()` decorator never fires — the job is dead code from the scheduler's perspective.

**Required change:**

1. Import `EmiDataModule` in the scheduler:
```typescript
// In scheduler.module.ts imports array
import { EmiDataModule } from '@lons/integration-service';

@Module({
  imports: [
    // ... existing imports
    EmiDataModule,
  ],
})
```

2. If `EmiDataSyncJob` is not directly in `EmiDataModule`'s providers, ensure it is registered and the module exports are correct. The scheduler needs NestJS to construct the job class so the `@Cron()` decorator fires.

3. Verify the cron schedule makes sense for the current environment. If the job syncs EMI data from an external source, ensure the integration-service mock adapter handles the call gracefully in non-production environments (no unhandled connection errors on boot).

**Tests:** Add a test confirming the scheduler module bootstraps without error when `EmiDataModule` is included. If the job has its own spec, ensure it passes. At minimum:

```typescript
it('scheduler module compiles with EmiDataModule', async () => {
  const module = await Test.createTestingModule({
    imports: [SchedulerModule],
  }).compile();
  expect(module).toBeDefined();
});
```

---

## Execution Order

No dependencies between fixes:

1. **FIX-BA-1** (idempotency keys — 6 handlers)
2. **FIX-BA-2** (plan gate removal — 2 queries)
3. **FIX-BA-3** (parseInt — 1 line)
4. **FIX-BA-4** (scheduler wiring — 1 import)

---

## Exit Criteria

1. ✅ All 6 mutation handlers on the loan review page use `crypto.randomUUID()` per mount — no `Date.now()` construction
2. ✅ UUID regenerates after each successful mutation
3. ✅ `billingInvoices` and `billingInvoice` resolvers have no `@RequiresPlan` gate
4. ✅ `markInvoicePaid` retains its `@RequiresPlan('growth')` gate
5. ✅ Starter-tier invoice access has tests
6. ✅ CSV export integer formatting uses `parseInt(String(value), 10)` — no `Number()`
7. ✅ Large-integer precision test passes
8. ✅ `EmiDataModule` imported in `scheduler.module.ts`
9. ✅ Scheduler boots without error with EMI module included
10. ✅ All existing tests pass (zero regressions)
11. ✅ `tsc --noEmit` clean

---

*Sprint 18 BA fix cycle. Expected effort: ~1.5 SP. Branch: continue on `claude/hopeful-haibt-32d778`.*
