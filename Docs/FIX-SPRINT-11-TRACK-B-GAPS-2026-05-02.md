# Dev Prompt: Sprint 11 Track B (BNPL) — Gaps & Fixes

**Date:** 2026-05-02
**Priority:** MUST complete before Track B can be closed
**Effort:** ~3–4 hours total (2 P0, 5 P1, 8 P2, 10 P3)
**Reference:** PM review of Sprint 11 Track B delivery

---

## Context

All 13 BNPL items (B1–B12) are implemented and the architecture is sound. This prompt covers 25 fixes ranging from two financial-correctness blockers (P0) down to minor polish. Work them in priority order — P0 first, then P1, etc.

**Platform rules apply throughout:** never use `float`/`Number()` for money, all Decimal-string math via `@lons/common`, tenant isolation on every query, idempotent mutations.

---

## FIX 1 (P0 — BLOCKER): Full Refund Claws Back Gross Instead of Net

**File:** `services/process-engine/src/bnpl/bnpl-refund.service.ts`
**Lines:** 166–173 (inside `applyFullRefund`)

**Problem:** The comment at line 166 says "full purchase amount minus the discount fee" but the code at line 169 uses the raw `purchaseAmount` (gross) as the clawback:

```typescript
const grossClawback = bankersRound(String(tx.purchaseAmount), 4);
```

If a merchant was settled net (e.g. 100.00 purchase × 2.5% discount = 97.50 paid to merchant), clawing back 100.00 **over-collects by 2.50**. The merchant loses both their discount fee AND the net settlement.

**Fix:** Compute the net clawback using the merchant's discount rate. The `tx` includes `merchant` (line 80), which has `discountRate`:

```typescript
// Replace lines 166–169 with:
// Merchant clawback = net amount they actually received.
// net = purchaseAmount × (1 − discountRate)
const discountRate = String(tx.merchant?.discountRate ?? '0');
const discountFee = bankersRound(multiply(String(tx.purchaseAmount), discountRate), 4);
const netClawback = subtract(String(tx.purchaseAmount), discountFee);
```

Then update line 173:

```typescript
clawedBackFromMerchant: bankersRound(netClawback, 4),
```

**Also fix the `BnplTxWithInstallments` type** at line 262 to include the merchant relation:

```typescript
interface BnplTxWithInstallments {
  id: string;
  tenantId: string;
  customerId: string;
  merchantId: string;
  purchaseAmount: { toString(): string };
  status: BnplTransactionStatus;
  installments: InstallmentRow[];
  merchant?: { discountRate: { toString(): string } } | null;
}
```

**Import:** Add `multiply` and `subtract` to the imports from `@lons/common` if not already present (they are — line 14–15).

**Test:** Add a test verifying that the clawback amount equals `purchaseAmount − (purchaseAmount × discountRate)`, not `purchaseAmount` itself.

---

## FIX 2 (P0 — BLOCKER): Float Arithmetic on Monetary Amounts in Admin Portal

**Files:**
- `apps/admin-portal/src/components/merchants/merchant-list.tsx` (line 225)
- `apps/admin-portal/src/components/merchants/merchant-form.tsx` (lines 44, 73, 79)
- `apps/admin-portal/src/app/(portal)/merchants/[id]/page.tsx` (lines 114–117, 170)

**Problem:** Multiple locations use `Number()` and JavaScript float arithmetic (`* 100`, `/ 100`, `.reduce(acc + Number(...))`) on monetary amounts and Decimal fields. This violates the platform's core rule: never use float for money.

**Fixes:**

**merchant-list.tsx line 225:**
```typescript
// Current:
const formatRate = (rate: string) => `${(Number(rate) * 100).toFixed(2)}%`;

// Replace with Decimal-safe version:
const formatRate = (rate: string) => `${bankersRound(multiply(rate, '100'), 2)}%`;
```
Import `multiply` and `bankersRound` from `@lons/common`.

**merchant-form.tsx line 44:**
```typescript
// Current:
setDiscountRatePercent((Number(merchant.discountRate) * 100).toFixed(2));

// Replace with:
setDiscountRatePercent(bankersRound(multiply(String(merchant.discountRate), '100'), 2));
```

**merchant-form.tsx line 73–79:**
```typescript
// Current:
const ratePct = Number(discountRatePercent);
if (Number.isNaN(ratePct) || ratePct < 0 || ratePct >= 100) { ... }
const discountRate = (ratePct / 100).toFixed(4);

// Replace with:
const ratePctStr = discountRatePercent.trim();
if (!ratePctStr || isNaN(Number(ratePctStr))) {
  setError('Discount rate must be a valid number');
  return;
}
if (compare(ratePctStr, '0') < 0 || compare(ratePctStr, '100') >= 0) {
  setError('Discount rate must be in [0, 100)');
  return;
}
const discountRate = bankersRound(divide(ratePctStr, '100'), 4);
```
Import `compare`, `divide`, `bankersRound` from `@lons/common`.

**[id]/page.tsx lines 114–117 — `totalGross` accumulation:**
```typescript
// Current:
const totalGross = transactions.reduce(
  (acc, tx) => acc + Number(tx.purchaseAmount),
  0,
);

// Replace with:
const totalGross = transactions.reduce(
  (acc: string, tx) => add(acc, String(tx.purchaseAmount)),
  '0',
);
```
Import `add` from `@lons/common`. Update any downstream formatting of `totalGross` to use `formatMoney(totalGross, ...)` since it's now a string.

**[id]/page.tsx line 170 — subtitle:**
```typescript
// Current:
${(Number(merchant.discountRate) * 100).toFixed(2)}%

// Replace with:
${bankersRound(multiply(String(merchant.discountRate), '100'), 2)}%
```

---

## FIX 3 (P1): Origination Must Check for Existing Defaults

**File:** `services/process-engine/src/bnpl/bnpl-origination.service.ts`
**Lines:** Insert between step 5 (KYC gate, line 155) and step 6 (per-product bounds, line 157)

**Problem:** `initiate()` approves new BNPL purchases without checking if the customer has existing transactions in `defaulted` or `accelerated` status. A customer who has already defaulted can immediately take on new BNPL debt. SPEC §FR-BN-001 requires a default/acceleration gate.

**Fix:** Add a default-check step after the KYC gate:

```typescript
// 5b) Default/acceleration gate — reject if the customer has any
// active default or accelerated BNPL transaction, either globally or
// on this specific merchant.
const existingDefault = await this.prisma.bnplTransaction.findFirst({
  where: {
    tenantId,
    customerId: input.customerId,
    status: {
      in: [BnplTransactionStatus.defaulted, BnplTransactionStatus.accelerated],
    },
    deletedAt: null,
  },
  select: { id: true, status: true, merchantId: true },
});
if (existingDefault) {
  this.declineEvent(tenantId, input, merchant.id, 'existing_default');
  throw new ValidationError(
    `Customer has an existing ${existingDefault.status} BNPL transaction (${existingDefault.id.slice(0, 8)}…) — cannot approve new purchases until resolved`,
  );
}
```

**Test:** Add a test that creates a `defaulted` transaction for a customer, then asserts that a new `initiate()` call throws `ValidationError` with `'existing_default'`.

---

## FIX 4 (P1): Origination Must Call Scoring Service

**File:** `services/process-engine/src/bnpl/bnpl-origination.service.ts`
**Lines:** Insert after the default gate (FIX 3) and before the per-product bounds (line 157)

**Problem:** The origination flow skips credit/risk scoring entirely — it goes from KYC check straight to product bounds validation. SPEC §FR-BN-001 requires at least a rule-based scoring pass before approval, mirroring the overdraft origination pattern.

**Fix:** Add a scoring call. If the scoring service is not yet wired in, add a structured TODO with a bypass that logs a warning:

```typescript
// 5c) Scoring gate — mirrors overdraft origination pattern.
// TODO (Sprint 12+): Wire in scoring service call. For now, log
// a warning and proceed. When ready, call:
//   const scoreResult = await this.scoringService.evaluate(tenantId, {
//     customerId: input.customerId,
//     productId: product.id,
//     amount: input.purchaseAmount,
//     currency: input.currency,
//   });
//   if (scoreResult.decision === 'reject') {
//     this.declineEvent(tenantId, input, merchant.id, 'scoring_rejected');
//     throw new ValidationError(`Scoring rejected: ${scoreResult.reason}`);
//   }
this.logger.warn(
  `BNPL scoring bypass: no scoring service call for customer ${input.customerId.slice(0, 8)}… — Sprint 12+ will wire this in`,
);
```

This makes the gap visible in logs and leaves a clear path for the Sprint 12 implementation.

---

## FIX 5 (P1): T+1 Batch Must Link Transactions to Settlement

**File:** `services/process-engine/src/bnpl/merchant-settlement.service.ts`
**Lines:** 182–196 (inside `runDailyBatch`, after `merchantSettlement.create`)

**Problem:** `runDailyBatch()` creates the `MerchantSettlement` row but never updates the `BnplTransaction` rows with the `merchantSettlementId`. The transactions remain orphaned — there's no way to trace which settlement a transaction belongs to. The query at line 159 filters `settlement: null`, so re-runs are safe, but the lack of linkage breaks audit trails and reporting.

**Fix:** After creating the settlement at line 196, add an updateMany to link the eligible transactions:

```typescript
// Link transactions to this settlement for audit trail + reporting.
await this.prisma.bnplTransaction.updateMany({
  where: {
    id: { in: eligible.map((t) => t.id) },
    tenantId,
  },
  data: {
    settlementId: settlement.id,
  },
});
```

**Note:** The `eligible` query select (line 164) currently only selects `id`, `purchaseAmount`, `currency`. This is sufficient — `updateMany` only needs the IDs. However, verify that the `BnplTransaction` model has a `settlementId` field (it does — the `settlement MerchantSettlement?` relation implies it). If the relation uses `transactionId` on the `MerchantSettlement` side instead, adjust accordingly — you may need to create one settlement row per transaction for 1:1, or add a join table. Check the schema and adjust.

---

## FIX 6 (P1): settleNow Must Be Called After Batch Settlement Creation

**File:** `services/process-engine/src/bnpl/merchant-settlement.service.ts`
**Lines:** 196–208 (after the settlement create and event emission in `runDailyBatch`)

**Problem:** `runDailyBatch()` creates the settlement record in `pending` status and emits an event, but never calls `settleNow()` to actually dispatch the wallet payout. The settlement sits in `pending` forever unless something external triggers dispatch.

**Fix:** After the event emission at line 208, call `settleNow`. The adapter needs to be injected:

**Step 1:** Add the adapter to the constructor via `@Inject`:

```typescript
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

// In the constructor:
constructor(
  private readonly prisma: PrismaService,
  private readonly eventBus: EventBusService,
  @Optional() @Inject(MERCHANT_SETTLEMENT_ADAPTER)
  private readonly adapter?: MerchantSettlementAdapter,
) {}
```

**Step 2:** After the event emission in `runDailyBatch` (line 208), add:

```typescript
// Dispatch the settlement — if no adapter is registered (dev/CI),
// the settlement stays pending and can be retried when one is available.
if (this.adapter) {
  try {
    await this.settleNow(tenantId, settlement.id, this.adapter);
  } catch (e) {
    this.logger.error(
      `Failed to dispatch settlement ${settlement.id}: ${e instanceof Error ? e.message : e}`,
    );
    // Settlement stays in `pending` or `failed` — the daily retry
    // or ops manual trigger will pick it up.
  }
}
```

**Step 3:** Also add the same auto-dispatch pattern after `createImmediateSettlement` (line 124), so IMMEDIATE settlements also get auto-dispatched:

```typescript
// Auto-dispatch for IMMEDIATE mode.
if (this.adapter) {
  try {
    await this.settleNow(tenantId, settlement.id, this.adapter);
  } catch (e) {
    this.logger.error(
      `IMMEDIATE settlement dispatch failed for ${settlement.id}: ${e instanceof Error ? e.message : e}`,
    );
  }
}
```

---

## FIX 7 (P1): Acceleration Must Emit Collections Referral Event

**File:** `services/process-engine/src/bnpl/bnpl-installment.service.ts`
**Lines:** 353–358 (inside `evaluateAcceleration`, after `BNPL_ACCELERATED` emission)

**Problem:** When a transaction is accelerated (customer missed consecutive payments), only `BNPL_ACCELERATED` is emitted. There's no collections referral event or recovery work item. The accelerated transaction enters a dead zone — no team or system picks it up for follow-through.

**Fix:** Add a collections referral event after the acceleration event. First, ensure the event type exists in `packages/event-contracts/`:

**Step 1:** Check if `BNPL_COLLECTIONS_REFERRED` exists in the events enum. If not, add it:

```typescript
// In packages/event-contracts/src/events.enum.ts:
BNPL_COLLECTIONS_REFERRED = 'bnpl.collections.referred',
```

**Step 2:** Add the event interface in `packages/event-contracts/src/bnpl-events.ts`:

```typescript
export interface BnplCollectionsReferredEvent {
  transactionId: string;
  customerId: string;
  merchantId: string;
  acceleratedBalance: string;
  missedInstallments: number;
  totalOwed: string;
  referredAt: string;
}
```

**Step 3:** After line 358 in `bnpl-installment.service.ts`, emit the referral:

```typescript
// Collections referral — the recovery service subscribes to this and
// creates a work item in the collections queue.
this.eventBus.emitAndBuild(EventType.BNPL_COLLECTIONS_REFERRED, tenantId, {
  transactionId: tx.id,
  customerId: tx.customerId,
  merchantId: tx.merchantId,
  acceleratedBalance,
  missedInstallments: consecutiveOverdue,
  totalOwed: acceleratedBalance, // same for now; future: include late fees
  referredAt: now.toISOString(),
});
```

---

## FIX 8 (P2): BnplTransaction.lenderId Missing @relation and FK Index

**File:** `packages/database/prisma/schema.prisma`
**Lines:** 1578, 1603–1607

**Problem:** The `lenderId` field on `BnplTransaction` (line 1578) has no `@relation` annotation linking it to the `Lender` model, and no index. Other models (e.g. `Contract`) properly define `lender Lender @relation(fields: [lenderId], references: [id])`. Without the relation, Prisma won't enforce referential integrity and queries joining to Lender will require manual joins.

**Fix:** Add the relation and index:

```prisma
// After line 1605 (product relation), add:
  lender               Lender                @relation(fields: [lenderId], references: [id])

// In the indexes block (after line 1615), add:
  @@index([lenderId])
```

**Migration:** Run `pnpm --filter database db:migrate` to generate the migration. The FK constraint will fail if any existing `lenderId` values don't match a `Lender` row — seed data should be consistent, but verify.

---

## FIX 9 (P2): BNPL Config Read from overdraftConfig Field

**File:** `services/process-engine/src/bnpl/bnpl-origination.service.ts`
**Lines:** 172–174

**Problem:** Line 172 reads BNPL configuration from `product.overdraftConfig`:

```typescript
const bnplConfig = (product.overdraftConfig as Record<string, unknown> | null) ?? {};
```

This is semantically wrong. BNPL-specific config (deferral days, interval days, zero-interest period, acceleration thresholds) should come from a dedicated field. Currently it works because both product types share a JSON shape, but it will break when overdraft config diverges.

**Fix option A (preferred — if schema already has `bnplConfig`):** Change line 172 to read from `product.bnplConfig`. Check the Prisma schema for a `bnplConfig` column on the `Product` model. If it exists, simply replace:

```typescript
const bnplConfig = (product.bnplConfig as Record<string, unknown> | null) ?? {};
```

**Fix option B (if no `bnplConfig` column exists):** Add a `bnplConfig Json?` column to the Product model in Prisma, run a migration, and update this line. For now, as a minimum, add a comment documenting the coupling:

```typescript
// TODO (Sprint 12): Migrate to product.bnplConfig once the schema
// column is added. Currently reusing overdraftConfig JSON shape.
const bnplConfig = (product.overdraftConfig as Record<string, unknown> | null) ?? {};
```

**Also fix in `bnpl-installment.service.ts` line 295** — the acceleration threshold is also read from `overdraftConfig`:

```typescript
const config = (tx.product?.overdraftConfig as Record<string, unknown> | null) ?? {};
```

Apply the same fix (or TODO) here.

---

## FIX 10 (P2): Late Fees — Add TODO or Stub

**File:** `services/process-engine/src/bnpl/bnpl-installment.service.ts`
**Line:** 48 (class doc comment)

**Problem:** The code explicitly defers late fees: "Late-fee application is a Sprint 12 follow-up" (line 48). However, there's no structured TODO, no placeholder method, and no event emitted when an installment becomes overdue that would carry late-fee information.

**Fix:** This is documented scope deferral, but add a structured placeholder so Sprint 12 has a clear hook:

**Step 1:** In `markOverdueInstallments`, after updating the installment to `overdue` (line 202), add a TODO-comment block:

```typescript
// TODO (Sprint 12 — Late Fees): Calculate and apply late fee here.
// Pattern: read product.bnplConfig.lateFee (flat or percentage),
// create a LedgerEntry, update inst.feePortion. The event below
// should include the fee amount so notification-service can tell
// the customer what they owe.
```

**Step 2:** Add `lateFeeAmount: '0'` to the `BNPL_INSTALLMENT_OVERDUE` event payload (line 205–212) so consumers don't break when the fee becomes non-zero:

```typescript
this.eventBus.emitAndBuild(EventType.BNPL_INSTALLMENT_OVERDUE, tenantId, {
  transactionId: inst.transactionId,
  installmentId: inst.id,
  installmentNumber: inst.installmentNumber,
  customerId: inst.transaction.customerId,
  amount: String(inst.amount),
  daysPastDue,
  lateFeeAmount: '0', // Sprint 12: populate from product config
});
```

---

## FIX 11 (P2): totalCount Returns Page Slice Length, Not Actual Count

**File:** `apps/graphql-server/src/graphql/resolvers/bnpl.resolver.ts`
**Lines:** 129, 192

**Problem:** Both `bnplTransactions` (line 129) and `merchants` (line 192) return `totalCount: sliced.length` / `totalCount: result.items.length`. This is the number of items on the current page, not the total matching the query. Frontend pagination will be broken — it can never know how many pages exist.

**Fix for `bnplTransactions` (line 100–131):** Add a count query:

```typescript
// Before the findMany (around line 102), add a count:
const totalCount = await this.prisma.bnplTransaction.count({
  where: {
    tenantId,
    deletedAt: null,
    ...(filters?.customerId ? { customerId: filters.customerId } : {}),
    ...(filters?.merchantId ? { merchantId: filters.merchantId } : {}),
    ...(filters?.status
      ? { status: filters.status as BnplTransactionStatus }
      : {}),
  },
});
```

Then at line 129, use `totalCount` instead of `sliced.length`.

**Fix for `merchants` (line 192):** The `merchantService.list()` should return a total count. Either:
- Add a `totalCount` field to the list result in `merchant.service.ts`, or
- Run a separate `this.prisma.merchant.count(...)` in the resolver.

Update line 192: `totalCount: result.totalCount ?? result.items.length`.

---

## FIX 12 (P2): idempotencyKey Accepted but Ignored in 3 Mutations

**File:** `apps/graphql-server/src/graphql/resolvers/bnpl.resolver.ts`
**Lines:** 243, 267

**Problem:** `cancelBnplTransaction` (line 243: `_idempotencyKey`) and `processInstallmentPayment` (line 267: `_idempotencyKey`) accept `idempotencyKey` in their args but prefix it with `_` and never pass it through. Callers get a false sense of idempotency protection.

**Fix for `cancelBnplTransaction`:** Pass the idempotency key to the refund service. Update line 243:

```typescript
@Args('idempotencyKey') idempotencyKey: string,
```

And pass it in the `initiate` call at line 250–256. The `InitiateRefundInput` interface needs an `idempotencyKey` field (add if not present). The refund service should check for existing refunds with this key before processing.

**Fix for `processInstallmentPayment`:** The underlying `BnplInstallmentService.processInstallmentPayment` doesn't accept an idempotency key. Either:
1. Add `idempotencyKey` to the service method signature and check for a duplicate payment with the same key, OR
2. Remove `idempotencyKey` from the mutation args (but this breaks the API contract stated in the resolver doc comment).

**Recommended:** Option 1 — add to the service. Before processing, query:

```typescript
// In processInstallmentPayment, at the top:
if (idempotencyKey) {
  // Check ledger or a dedicated idempotency table for this key.
  // If found, return the previous result.
}
```

**Also for `initiateBnplRefund`:** Verify that `input.idempotencyKey` (from `InitiateRefundInput`) is actually passed through to the refund service and used for deduplication.

---

## FIX 13 (P2): "Pay Next Unpaid" Convenience Method

**File:** `services/process-engine/src/bnpl/bnpl-installment.service.ts`

**Problem:** The installment service requires callers to specify exactly which installment ID to pay. There's no `payNextDue(transactionId, amount)` method that automatically selects the earliest unpaid installment. This is a common UX requirement for BNPL — customers just want to "make a payment."

**Fix:** Add a convenience method:

```typescript
/**
 * Pay the next unpaid installment on a transaction. Selects the
 * earliest (by installmentNumber) installment in `pending`, `due`,
 * or `overdue` status and applies the payment.
 */
async payNextDue(
  tenantId: string,
  transactionId: string,
  amount: string,
  idempotencyKey?: string,
): Promise<{
  installmentId: string;
  installmentPaidInFull: boolean;
  transactionCompleted: boolean;
  paidAmount: string;
}> {
  const nextInst = await this.prisma.installmentSchedule.findFirst({
    where: {
      tenantId,
      transactionId,
      status: { in: [InstallmentStatus.overdue, InstallmentStatus.due, InstallmentStatus.pending] },
    },
    orderBy: { installmentNumber: 'asc' },
  });
  if (!nextInst) {
    throw new ValidationError(`No unpaid installments on transaction ${transactionId}`);
  }
  const result = await this.processInstallmentPayment(tenantId, nextInst.id, amount);
  return { installmentId: nextInst.id, ...result };
}
```

**Also add a resolver mutation** in `bnpl.resolver.ts`:

```typescript
@Mutation(() => InstallmentPaymentResultType)
@AuditAction(AuditActionType.REPAYMENT, AuditResourceType.REPAYMENT)
@Roles('repayment:create')
async payNextBnplInstallment(
  @CurrentTenant() tenantId: string,
  @Args('transactionId', { type: () => ID }) transactionId: string,
  @Args('amount') amount: string,
  @Args('idempotencyKey') idempotencyKey: string,
): Promise<InstallmentPaymentResultType> {
  return this.installment.payNextDue(tenantId, transactionId, amount, idempotencyKey);
}
```

---

## FIX 14 (P2): Pre-Qualification Missing Redis Cache

**File:** `services/process-engine/src/bnpl/bnpl-eligibility.service.ts` (or wherever the pre-qual `check()` method lives)

**Problem:** The pre-qualification check hits Postgres on every call. For high-traffic merchant integrations (checkout widgets polling eligibility), this should have a short-lived Redis cache like overdraft eligibility does.

**Fix:** Wrap the eligibility result in a Redis cache with a short TTL (e.g. 60s):

```typescript
// At the top of the check() method:
const cacheKey = `bnpl:eligibility:${tenantId}:${input.customerId}:${input.merchantCode}:${input.amount}`;
const cached = await this.redis.get(cacheKey);
if (cached) return JSON.parse(cached);

// ... existing logic ...

// Before returning the result:
await this.redis.setex(cacheKey, 60, JSON.stringify(result));
return result;
```

If Redis is not yet injected into this service, add it via the constructor. Follow the same pattern used in the overdraft cache service (`services/overdraft-service/src/cache/credit-line-cache.service.ts`).

---

## FIX 15 (P2): MerchantModule Missing PrismaModule Import

**File:** `services/entity-service/src/merchant/merchant.module.ts`

**Problem:** The module provides `MerchantService` but doesn't import `PrismaModule`:

```typescript
@Module({
  providers: [MerchantService],
  exports: [MerchantService],
})
export class MerchantModule {}
```

`MerchantService` injects `PrismaService` in its constructor (line 29 of `merchant.service.ts`). Without importing `PrismaModule`, NestJS cannot resolve the dependency. This is likely masked in tests by a custom provider but will fail at runtime.

**Fix:**

```typescript
import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';

import { MerchantService } from './merchant.service';

@Module({
  imports: [PrismaModule],
  providers: [MerchantService],
  exports: [MerchantService],
})
export class MerchantModule {}
```

---

## FIX 16 (P3): idempotencyKey Not Passed Through processInstallmentPayment

**File:** `services/process-engine/src/bnpl/bnpl-installment.service.ts`
**Method:** `processInstallmentPayment`

**Problem:** The service method signature doesn't include `idempotencyKey`, so duplicate payment submissions aren't guarded at the service level.

**Fix:** Add an optional `idempotencyKey` parameter. At the start of the method, check for a prior payment with the same key:

```typescript
async processInstallmentPayment(
  tenantId: string,
  installmentId: string,
  amount: string,
  idempotencyKey?: string,
): Promise<{ ... }> {
  if (idempotencyKey) {
    // TODO: Check an idempotency record table or use a unique constraint.
    // For now, log the key for traceability.
    this.logger.debug(`Payment idempotencyKey: ${idempotencyKey}`);
  }
  // ... existing logic ...
}
```

Update the resolver (FIX 12) to pass the key through.

---

## FIX 17 (P3): Merchant Mutations Lack idempotencyKey

**File:** `apps/graphql-server/src/graphql/resolvers/bnpl.resolver.ts`
**Lines:** 294–371 (all 6 merchant mutations)

**Problem:** `createMerchant`, `updateMerchant`, `activateMerchant`, `suspendMerchant`, `reactivateMerchant`, `deactivateMerchant` don't accept an `idempotencyKey`. The resolver's own doc comment (line 65) says "All mutations require idempotencyKey."

**Fix:** Add `@Args('idempotencyKey') idempotencyKey: string` to each of the 6 mutation signatures. For now, log the key; full deduplication can follow the same pattern used in origination:

```typescript
// Example for createMerchant:
async createMerchant(
  @CurrentTenant() tenantId: string,
  @Args('input') input: CreateMerchantInput,
  @Args('idempotencyKey') idempotencyKey: string,
): Promise<MerchantType> {
  // TODO: idempotency check on (tenantId, idempotencyKey)
  return (await this.merchantService.create(tenantId, { ... })) as unknown as MerchantType;
}
```

Apply the same pattern to all 6. Update the GraphQL input types if needed.

---

## FIX 18 (P3): No Dedicated merchantTransactions Query

**File:** `apps/graphql-server/src/graphql/resolvers/bnpl.resolver.ts`

**Problem:** There's no `merchantTransactions(merchantId, first, after)` query. Callers must use the generic `bnplTransactions(filters: { merchantId })`. For merchant detail views and settlement reconciliation, a purpose-built query with merchant-specific defaults and sorting is more ergonomic.

**Fix:** Add a field resolver on `MerchantType`:

```typescript
@Query(() => BnplTransactionConnection)
@Roles('contract:read')
async merchantTransactions(
  @CurrentTenant() tenantId: string,
  @Args('merchantId', { type: () => ID }) merchantId: string,
  @Args('first', { type: () => Int, nullable: true }) first?: number,
  @Args('after', { nullable: true }) after?: string,
): Promise<BnplTransactionConnection> {
  return this.bnplTransactions(tenantId, first, after, { merchantId });
}
```

This delegates to the existing `bnplTransactions` method, so totalCount (once fixed in FIX 11) works automatically.

---

## FIX 19 (P3): No Text Search on Merchant List

**File:** `apps/admin-portal/src/components/merchants/merchant-list.tsx`

**Problem:** The merchant list page only filters by status. There's no search input for merchant name or code. For tenants with many merchants, this makes finding a specific one impractical.

**Fix:** Add a search input above the table that filters client-side on `name` and `code`:

```typescript
// Add state:
const [search, setSearch] = useState('');

// Add filter logic before the columns:
const filtered = merchants.filter((m) => {
  const matchesStatus = !statusFilter || m.status === statusFilter;
  const matchesSearch = !search ||
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.code.toLowerCase().includes(search.toLowerCase());
  return matchesStatus && matchesSearch;
});
```

Add a search input next to the status filter dropdown. Use the same input styling as other list pages.

---

## FIX 20 (P3): No Settlement History on Merchant Detail

**File:** `apps/admin-portal/src/app/(portal)/merchants/[id]/page.tsx`

**Problem:** The merchant detail page shows transactions but has no section for settlement history. Ops users need to see settlement status (pending/processing/settled/failed), amounts, and dates.

**Fix:** Add a second tab or section below the transaction list. Query `merchantSettlements(merchantId)` via GraphQL (add the query if it doesn't exist in the resolver) and display a table with columns: Date, Gross, Fee, Net, Status, Wallet Ref.

If the GraphQL query doesn't exist yet, add it to the resolver:

```typescript
@Query(() => [MerchantSettlementType])
@Roles('contract:read')
async merchantSettlements(
  @CurrentTenant() tenantId: string,
  @Args('merchantId', { type: () => ID }) merchantId: string,
): Promise<MerchantSettlementType[]> {
  return this.prisma.merchantSettlement.findMany({
    where: { tenantId, merchantId },
    orderBy: { createdAt: 'desc' },
  }) as unknown as MerchantSettlementType[];
}
```

Define the `MerchantSettlementType` GraphQL type if it doesn't exist.

---

## FIX 21 (P3): No Pagination on Merchant Transaction List

**File:** `apps/admin-portal/src/app/(portal)/merchants/[id]/page.tsx`

**Problem:** The detail page loads all transactions without pagination controls. For merchants with hundreds of transactions, this will be slow and unwieldy.

**Fix:** Add cursor-based "Load more" or page controls using the `pageInfo.hasNextPage` and `endCursor` from the `bnplTransactions` connection. Follow the same pagination pattern used on other list pages in the admin portal.

---

## FIX 22 (P3): Merchant Deactivation Doesn't Check for Active Transactions

**File:** `services/entity-service/src/merchant/merchant.service.ts`
**Method:** `deactivate()`

**Problem:** `deactivate()` soft-deletes a merchant without verifying whether they have in-flight BNPL transactions (`approved`, `active`, or `accelerated` status). Deactivating a merchant with active transactions could orphan those purchases — installment collection continues but there's no active merchant entity to settle with or contact.

**Fix:** Before soft-deleting, check for active transactions:

```typescript
async deactivate(tenantId: string, id: string): Promise<Merchant> {
  const merchant = await this.findByIdOrThrow(tenantId, id);

  // Guard: don't deactivate if there are in-flight transactions.
  const activeCount = await this.prisma.bnplTransaction.count({
    where: {
      tenantId,
      merchantId: id,
      status: { in: ['approved', 'active', 'accelerated'] },
      deletedAt: null,
    },
  });
  if (activeCount > 0) {
    throw new ValidationError(
      `Cannot deactivate merchant ${merchant.code}: ${activeCount} active BNPL transaction(s) remain. Suspend instead, or resolve transactions first.`,
    );
  }

  // ... existing soft-delete logic ...
}
```

---

## FIX 23 (P3): feePortion Hardcoded to '0' in Installment Generator

**File:** `services/process-engine/src/bnpl/installment-generator.ts`

**Problem:** Every installment gets `feePortion: '0'`. If this is intentional deferral (fees come in Sprint 12), add a TODO so it's visible as planned work, not an oversight.

**Fix:** Add a TODO comment where `feePortion` is set:

```typescript
feePortion: '0', // TODO (Sprint 12): Populate from product.bnplConfig.installmentFee when fee-bearing products are configured
```

---

## FIX 24 (P3): No BNPL Lifecycle Integration Test

**File:** `services/process-engine/src/bnpl/__tests__/` (create if needed)

**Problem:** Unit tests exist for individual services but there's no end-to-end test covering the full BNPL lifecycle: purchase → installments generated → payment on each installment → transaction completed. Critical paths like acceleration and refund also lack integration coverage.

**Fix:** Create `services/process-engine/src/bnpl/__tests__/bnpl-lifecycle.integration.spec.ts` with at least these scenarios:

1. **Happy path:** initiate purchase → verify installments created → pay all installments → verify transaction status is `completed`
2. **Acceleration:** initiate → mark 2 installments overdue → verify acceleration fires → verify transaction status is `accelerated`
3. **Full refund:** initiate → pay 1 installment → full refund → verify all installments waived, customer reimbursed, merchant clawback is NET (not gross)
4. **Partial refund:** initiate → partial refund → verify installments proportionally reduced

Use the same Prisma mock patterns established in the overdraft service tests.

---

## FIX 25 (P3): Hardcoded English Strings in Admin Merchant Pages

**File:** `apps/admin-portal/src/app/(portal)/merchants/[id]/page.tsx` (line 128–153)

**Problem:** Several column headers and labels are hardcoded English strings instead of using the `t()` translation function. Examples: `'Ref'`, `'Status'`, `'Amount'`, `'Installments'`, `'Created'` at lines 128–153.

**Fix:** Replace all hardcoded strings with `t()` calls using keys from the existing `merchants` namespace:

```typescript
{ header: t('common.ref'), ... },
{ header: t('common.status'), ... },
{ header: t('common.amount'), ... },
{ header: t('merchants.installments'), ... },
{ header: t('common.created'), ... },
```

Add any missing keys to the translation file (`apps/admin-portal/src/locales/en.json` or equivalent).

---

## Summary

| # | Severity | Item | File |
|---|----------|------|------|
| 1 | P0 | Refund claws back gross, not net | `bnpl-refund.service.ts` |
| 2 | P0 | Float arithmetic on money in admin | merchant-list/form/detail |
| 3 | P1 | No existing-defaults check in origination | `bnpl-origination.service.ts` |
| 4 | P1 | No scoring service call | `bnpl-origination.service.ts` |
| 5 | P1 | T+1 batch doesn't link transactions | `merchant-settlement.service.ts` |
| 6 | P1 | settleNow never called after batch | `merchant-settlement.service.ts` |
| 7 | P1 | No collections referral on acceleration | `bnpl-installment.service.ts` |
| 8 | P2 | Missing Lender relation + FK index | `schema.prisma` |
| 9 | P2 | BNPL config from overdraftConfig field | `bnpl-origination.service.ts` |
| 10 | P2 | Late fees — structured TODO stub | `bnpl-installment.service.ts` |
| 11 | P2 | totalCount returns slice length | `bnpl.resolver.ts` |
| 12 | P2 | idempotencyKey ignored in mutations | `bnpl.resolver.ts` |
| 13 | P2 | No "pay next unpaid" method | `bnpl-installment.service.ts` |
| 14 | P2 | Pre-qual missing Redis cache | `bnpl-eligibility.service.ts` |
| 15 | P2 | MerchantModule missing PrismaModule | `merchant.module.ts` |
| 16 | P3 | idempotencyKey not passed in payment | `bnpl-installment.service.ts` |
| 17 | P3 | Merchant mutations lack idempotencyKey | `bnpl.resolver.ts` |
| 18 | P3 | No merchantTransactions query | `bnpl.resolver.ts` |
| 19 | P3 | No text search on merchant list | `merchant-list.tsx` |
| 20 | P3 | No settlement history on detail | `[id]/page.tsx` |
| 21 | P3 | No pagination on txn list | `[id]/page.tsx` |
| 22 | P3 | Deactivation doesn't check active txns | `merchant.service.ts` |
| 23 | P3 | feePortion hardcoded '0' — needs TODO | `installment-generator.ts` |
| 24 | P3 | No lifecycle integration test | new file |
| 25 | P3 | Hardcoded English strings | `[id]/page.tsx` |

**Work order:** P0 (FIX 1–2) → P1 (FIX 3–7) → P2 (FIX 8–15) → P3 (FIX 16–25). Report back with a status on each fix when done.
