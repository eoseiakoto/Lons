# Dev Prompt: Sprint 11 Track A — Gaps & Fixes

**Date:** 2026-05-02
**Priority:** MUST complete before starting Track B (BNPL)
**Effort:** ~45 minutes total (1 P0, 2 P1s, 7 minor fixes)
**Reference:** PM review of Sprint 11 Track A delivery

---

## Context

Track A items A0-A3, A7-A9, A11, A12 passed review. Items A4, A5, A6, A10 have gaps ranging from a financial correctness blocker (P0) down to minor polish. This prompt covers all 10 fixes.

---

## FIX 1 (P0 — BLOCKER): Reset Accrued Amounts After Cycle Crystallization

**File:** `services/overdraft-service/src/interest/interest.service.ts`
**Lines:** 238-245 (inside `closeCyclesDue`)

**Problem:** When a billing cycle closes, the accrued `interestAccrued`, `feesOutstanding`, and `penaltiesAccrued` are snapshotted into the `BillingCycleHistory` row (lines 223-236) but are **never reset to zero** on the credit line itself. The `creditLine.update` at lines 238-245 only sets `currentCycleStart`, `currentCycleEnd`, and `dueDate`.

This means:
1. The next day's `accrueDaily` adds new interest on top of already-crystallized interest.
2. The next cycle's `closeCyclesDue` snapshots the same charges again plus the new ones.
3. **Customers are double-billed.** This compounds every cycle — a 3-cycle-old credit line would have 3x the actual interest in `interestAccrued`.

**Fix:** Add the three resets to the `creditLine.update` data block:

```typescript
// Current (lines 238-245):
this.prisma.creditLine.update({
  where: { id: cl.id },
  data: {
    currentCycleStart: newCycleStart,
    currentCycleEnd: newCycleEnd,
    dueDate,
  },
}),

// Replace with:
this.prisma.creditLine.update({
  where: { id: cl.id },
  data: {
    currentCycleStart: newCycleStart,
    currentCycleEnd: newCycleEnd,
    dueDate,
    interestAccrued: '0',
    feesOutstanding: '0',
    penaltiesAccrued: '0',
  },
}),
```

**Why reset fees too?** The `BillingCycleHistory` row records `feesCharged` and `penaltiesCharged` for the cycle. If these balances carry into the next cycle without being reset, they appear in both the crystallized history AND the live credit line — the customer sees them twice in their statement and the repayment waterfall allocates against stale values.

**Note:** `outstandingAmount` (principal) is NOT reset — it carries across cycles. Only the non-principal obligation buckets (interest, fees, penalties) are crystallized per cycle.

**Test:** Update the existing test `"writes a BillingCycleHistory row inside the cycle-close transaction"` (lines 167-186 of `interest.service.spec.ts`) to also verify the credit line update includes the three resets:
```typescript
const updateArgs = prisma.creditLine.update.mock.calls[0][0];
expect(updateArgs.data.interestAccrued).toBe('0');
expect(updateArgs.data.feesOutstanding).toBe('0');
expect(updateArgs.data.penaltiesAccrued).toBe('0');
```

---

## FIX 2 (P1): Watch-Bucket Reminders Must Fire on Each Configured DPD Day

**File:** `services/overdraft-service/src/aging/overdraft-aging.service.ts`
**Lines:** 150-179 (inside `classifyPortfolio`) and 211-224 (inside `runTransitionActions`)

**Problem:** Reminder logic is gated behind the bucket-transition check at line 176:
```typescript
if (previousBucket !== bucket) {
  transitioned.push(...);
  await this.runTransitionActions(...);
}
```

Once a credit line enters `watch` at DPD 1, subsequent aging runs at DPD 3, 5, 7 see `watch → watch` (same bucket, no transition) and skip `runTransitionActions` entirely. The configured `reminderSchedule.afterOverdueDays: [1, 3, 7]` is effectively useless beyond the first day. Customers get one reminder on DPD 1 and then silence until the line degrades to `substandard` at DPD 8.

**Fix:** Extract the reminder check out of `runTransitionActions` and run it on every `watch`-bucket iteration, regardless of whether a bucket transition occurred. Move it into the main `classifyPortfolio` loop:

```typescript
// After updating DPD and bucket on the credit line (line 162),
// and after emitting CREDITLINE_AGED (line 167-174):

// --- Reminder check: runs every day while in watch bucket, ---
// --- not only on bucket entry.                              ---
if (bucket === 'watch') {
  const config = (cl.product?.overdraftConfig as Record<string, unknown> | null) ?? {};
  const reminderSchedule =
    ((config.reminderSchedule as Record<string, unknown> | undefined)
      ?.afterOverdueDays as number[] | undefined) ?? [1, 3, 7];
  if (reminderSchedule.includes(dpd)) {
    this.eventBus.emitAndBuild(EventType.CREDITLINE_OVERDUE_REMINDER_DUE, tenantId, {
      creditLineId: cl.id,
      customerId: cl.customerId,
      daysPastDue: dpd,
      totalOwed,
    });
  }
}

// Bucket-transition actions (freeze, recovery, NPL) still
// only fire on actual bucket changes:
if (previousBucket !== bucket) {
  transitioned.push({ creditLineId: cl.id, from: previousBucket, to: bucket, dpd });
  await this.runTransitionActions(tenantId, cl, previousBucket, bucket, dpd, totalOwed);
}
```

Then remove the `case 'watch':` block from `runTransitionActions` (lines 212-225) — reminders are now handled in the main loop. `runTransitionActions` should only handle `substandard`, `doubtful`, and `loss` transitions.

**Test:** Add a new test case:
```typescript
it('emits reminder on DPD 3 even when already in watch bucket (no bucket transition)', async () => {
  const cl = makeCreditLine({
    dueDate: new Date('2026-05-01'),
    daysPastDue: 1,
    agingBucket: 'watch', // already in watch from yesterday
  });
  const { prisma, eventBus, creditLineService } = makeMocks([cl]);
  const service = new OverdraftAgingService(prisma as any, eventBus as any, creditLineService as any);
  // DPD = 3 (May 1 → May 4), still watch bucket, no transition
  await service.classifyPortfolio(TENANT, new Date('2026-05-04'));

  const reminderCalls = eventBus.emitAndBuild.mock.calls.filter(
    (c) => c[0] === 'creditline.overdue.reminder_due',
  );
  expect(reminderCalls).toHaveLength(1);
  expect(reminderCalls[0][2].daysPastDue).toBe(3);
});
```

Also update the existing test `"emits CREDITLINE_AGED on every change and CREDITLINE_OVERDUE_REMINDER_DUE on configured DPD"` (line 130) — its setup uses `agingBucket: null` (initial transition), which still works. But add a comment noting it tests the entry-into-watch path, distinct from the new intra-watch-reminder test.

---

## FIX 3 (P1): Create `WalletAccountMapping` Row During Activation

**File:** `services/overdraft-service/src/credit-line/credit-line.service.ts`
**Method:** `activateCreditLine`

**Problem:** The `activateCreditLine` method creates a `CreditLine` and a `CreditLimitChange` audit row but does NOT create a `WalletAccountMapping` row. New customers onboarded after the backfill script runs will always hit the legacy O(n) `customer.metadata.walletId` scan in the webhook controller's `resolveWallet()`. The dedicated lookup table — the entire point of A10 — is bypassed for every new customer.

**Fix:** After the `creditLimitChange.create` call (around line 202), add:

```typescript
// 6e — populate wallet account mapping for webhook resolution.
// Customer's wallet info lives in customer.metadata.walletId /
// customer.metadata.walletProvider. If present, create the mapping
// so inbound webhooks can resolve to this customer in O(1).
const customerMetadata = (customer.metadata as Record<string, unknown> | null) ?? {};
const walletId = customerMetadata.walletId as string | undefined;
const walletProvider = customerMetadata.walletProvider as string | undefined;
if (walletId && walletProvider) {
  await this.prisma.walletAccountMapping.upsert({
    where: {
      provider_walletId: { provider: walletProvider, walletId },
    },
    create: {
      tenantId,
      customerId: input.customerId,
      walletId,
      provider: walletProvider,
      isPrimary: true,
    },
    update: {}, // no-op if already exists (idempotent)
  });
}
```

Use `upsert` instead of `create` for idempotency — if the backfill already created the row, the upsert is a no-op.

**Alternative:** If `walletId`/`walletProvider` are not in `customer.metadata` but come from a different source (e.g., the subscription activation input), add `walletId` and `walletProvider` as optional fields to `ActivateCreditLineInput` and use those. Either approach works — the key is that a mapping row exists by the time the first drawdown webhook arrives.

**Test:** Add a test in `credit-line.service.spec.ts`:
```typescript
it('creates a WalletAccountMapping row when customer has wallet metadata', async () => {
  const { prisma, eventBus, cache } = makeMocks();
  prisma.customer.findFirst.mockResolvedValue({
    ...baseCustomer,
    metadata: { walletId: 'WALLET_123', walletProvider: 'mtn_momo' },
  });
  prisma.product.findFirst.mockResolvedValue(baseProduct);
  prisma.creditLine.findUnique.mockResolvedValue(null);
  prisma.creditLine.create.mockImplementation(async (args: any) => ({
    ...args.data, id: CREDIT_LINE_ID,
  }));
  prisma.walletAccountMapping = { upsert: jest.fn() };

  const service = new CreditLineService(prisma as any, eventBus as any, cache as any);
  await service.activateCreditLine(TENANT, {
    customerId: CUSTOMER_ID,
    productCode: 'OD_BASIC',
    recommendedLimit: '500',
  });

  expect(prisma.walletAccountMapping.upsert).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { provider_walletId: { provider: 'mtn_momo', walletId: 'WALLET_123' } },
    }),
  );
});
```

---

## FIX 4 (Minor): Add Test for `gracePeriodDays = 0`

**File:** `services/overdraft-service/src/interest/interest.service.spec.ts`

**Problem:** Existing test only covers `gracePeriodDays = 7`. Products with no grace period (`gracePeriodDays = 0` or unset) are the default configuration, where `dueDate` should equal `cycleEnd` exactly.

**Fix:** Add test case:
```typescript
it('sets dueDate equal to cycleEnd when gracePeriodDays is 0', async () => {
  const cl = makeCreditLine({ product: { ...baseProduct, overdraftConfig: { gracePeriodDays: 0, billingCycleDays: 30 } } });
  const { prisma, eventBus } = makeMocks([cl]);

  const service = new InterestService(prisma as any, eventBus as any, null as any);
  await service.closeCyclesDue(TENANT, new Date('2026-05-01'));

  const updateArgs = prisma.creditLine.update.mock.calls[0][0];
  // cycleEnd is 2026-04-30, grace = 0, so dueDate = 2026-04-30
  expect(updateArgs.data.dueDate).toEqual(new Date('2026-04-30'));
});
```

---

## FIX 5 (Minor): Guard Against Null `currentCycleStart`

**File:** `services/overdraft-service/src/interest/interest.service.ts`
**Line:** 194

**Problem:** Line 194 uses a non-null assertion `cl.currentCycleStart!` but the query at line 178 only filters on `currentCycleEnd: { lte: today }`. There is no filter on `currentCycleStart IS NOT NULL`. If a credit line somehow has `currentCycleEnd` set but `currentCycleStart` is null, this throws an uncaught error.

**Fix:** Add `currentCycleStart` to the query filter:
```typescript
// Line 174-180:
const dueLines = await this.prisma.creditLine.findMany({
  where: {
    tenantId,
    status: CreditLineStatus.active,
    currentCycleEnd: { lte: today },
    currentCycleStart: { not: null },  // ← add this
  },
  include: { product: true },
});
```

---

## FIX 6 (Minor): Include `openingBalance` and `cycleNumber` in `CREDITLINE_CYCLE_CLOSED` Event

**File:** `services/overdraft-service/src/interest/interest.service.ts`
**Lines:** 248-255

**Problem:** The `CREDITLINE_CYCLE_CLOSED` event payload includes `cycleStart`, `cycleEnd`, `dueDate`, and `closingBalance`, but omits `openingBalance` and `cycleNumber`. Downstream consumers (analytics, reporting, notifications) need these to render a complete cycle summary without having to query `BillingCycleHistory` separately.

**Fix:** Add the two fields to the event emission:
```typescript
this.eventBus.emitAndBuild(EventType.CREDITLINE_CYCLE_CLOSED, tenantId, {
  creditLineId: cl.id,
  customerId: cl.customerId,
  cycleNumber,                        // ← add
  openingBalance,                     // ← add
  cycleStart: cycleStart.toISOString(),
  cycleEnd: cycleEnd.toISOString(),
  dueDate: dueDate.toISOString(),
  closingBalance,
});
```

---

## FIX 7 (Minor): Track Per-Product Configurable Aging Thresholds as Backlog Item

**File:** `services/overdraft-service/src/aging/overdraft-aging.service.ts`
**Lines:** 41-47

**Problem:** The aging thresholds are hardcoded in `DEFAULT_THRESHOLDS`. SPEC §9.1 says thresholds are "configurable per product and per regulatory jurisdiction." The current implementation only uses defaults.

**Fix:** No code change now, but add a `TODO` comment above `DEFAULT_THRESHOLDS`:
```typescript
// TODO (Sprint 12+): Read per-product thresholds from
// product.overdraftConfig.agingThresholds and fall back to these
// defaults when unconfigured. See SPEC §9.1, FR-DM-001.2.
const DEFAULT_THRESHOLDS: BucketDefinition[] = [
```

---

## FIX 8 (Minor): Document That `CREDITLINE_NPL_CLASSIFIED` Event Has No Consumer Yet

**File:** `services/overdraft-service/src/aging/overdraft-aging.service.ts`
**Lines:** 261-272

**Problem:** The `loss` bucket emits `CREDITLINE_NPL_CLASSIFIED` for customer suspension and credit bureau reporting, but no service currently consumes this event. The comment at lines 268-271 acknowledges this ("We emit so they can subscribe"). This is fine architecturally but should be tracked.

**Fix:** Update the comment to include a sprint reference:
```typescript
case 'loss': {
  this.eventBus.emitAndBuild(EventType.CREDITLINE_NPL_CLASSIFIED, tenantId, {
    creditLineId: cl.id,
    customerId: cl.customerId,
    daysPastDue: dpd,
    totalOwed,
  });
  // TODO (Sprint 13+): Customer-level suspension + credit bureau
  // reporting are owned by entity-service and integration-service
  // respectively. They must subscribe to this event before NPL
  // handling is complete. See SPEC §9.1 Loss bucket actions.
  break;
}
```

---

## FIX 9 (Minor): Handle `provider: 'unknown'` in Backfill Documentation

**File:** `scripts/backfill-wallet-account-mappings.ts`

**Problem:** When a customer's `metadata.walletProvider` is absent, the backfill script defaults to `provider: 'unknown'`. These rows will never match a webhook lookup because `resolveWallet` queries with the real provider name from the URL (e.g., `mtn_momo`). The backfilled rows are effectively dead data.

**Fix:** Add a log line at the end of the script summarizing how many rows were created with `provider: 'unknown'`, and a clear instruction for ops:
```typescript
this.logger.warn(
  `${unknownProviderCount} mappings created with provider='unknown'. ` +
  `These won't match inbound webhooks. Run: UPDATE wallet_account_mappings ` +
  `SET provider = '<real_provider>' WHERE provider = 'unknown';`,
);
```

Also add a comment at the top of the script documenting this limitation.

---

## FIX 10 (Minor): Track Branch Coverage Gap

**File:** `services/overdraft-service/jest.config.ts`

**Problem:** Branch coverage is set to 65% while CLAUDE.md requires 80%. The comment says Sprint 13 integration tests will close the gap.

**Fix:** No threshold change, but add a `// TODO` referencing the target:
```typescript
coverageThreshold: {
  global: {
    statements: 80,
    functions: 80,
    lines: 80,
    branches: 65, // TODO: Raise to 80 by Sprint 13 (live-DB integration tests)
  },
},
```

---

## Verification

After applying all fixes:

1. `tsc --noEmit` across `@lons/overdraft-service` — 0 errors
2. `pnpm --filter overdraft-service test` — all existing + new tests pass
3. Manually verify that `closeCyclesDue` resets `interestAccrued`, `feesOutstanding`, `penaltiesAccrued` to `'0'` after crystallization (FIX 1 — most critical)
4. Verify reminder events fire at DPD 3 and 7 within the watch bucket without a bucket transition (FIX 2)
5. Verify `walletAccountMapping.upsert` is called during `activateCreditLine` when customer has wallet metadata (FIX 3)

---

## Delivery

Once complete, provide confirmation and PM will mark Track A as fully closed. Track B (BNPL) can then commence.
