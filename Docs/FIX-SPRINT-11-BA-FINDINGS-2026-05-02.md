# Dev Prompt: BA Sprint 11 Findings — F-BN-1 + F-OD-1

**Date:** 2026-05-02
**Priority:** F-BN-1 is P1 (financial correctness) — must fix before Sprint 12 coding begins. F-OD-1 is P3 (cosmetic) — early Sprint 12.
**Effort:** ~15 minutes total
**Reference:** BA-SPRINT-11-REVIEW-2026-05-02.md

---

## Context

BA's independent review found 2 issues not caught in PM's review. F-BN-1 is a financial correctness bug where partial refunds overcharge merchants. F-OD-1 is a consistency issue where an idempotency key is silently discarded.

---

## Fix 1: F-BN-1 — Partial Refund Net Clawback (P1)

**File:** `services/process-engine/src/bnpl/bnpl-refund.service.ts`
**Line:** 257

### Problem

The `applyPartialRefund` method claws back the **gross** refund amount from the merchant:

```typescript
// Line 257 — current (WRONG):
clawedBackFromMerchant: bankersRound(amount, 4),
```

But the merchant was only ever settled the **net** amount (after discount rate deduction). So a 100 GHS partial refund on a merchant with a 5% discount rate claws back 100 GHS — but the merchant only received 95 GHS for that portion. The merchant is overcharged by the discount fee on every partial refund.

The **full** refund path already handles this correctly (lines 179–181):

```typescript
const discountRate = String(tx.merchant?.discountRate ?? '0');
const discountFee = bankersRound(multiply(String(tx.purchaseAmount), discountRate), 4);
const netClawback = subtract(String(tx.purchaseAmount), discountFee);
```

### Fix

Apply the same `(1 − discountRate)` formula to the partial refund amount. Replace line 257:

```typescript
// Line 257 — replace:
clawedBackFromMerchant: bankersRound(amount, 4),

// With:
clawedBackFromMerchant: bankersRound(
  subtract(amount, bankersRound(multiply(amount, String(tx.merchant?.discountRate ?? '0')), 4)),
  4,
),
```

Or extract it for clarity:

```typescript
// Above the return statement (around line 254), add:
const partialDiscountRate = String(tx.merchant?.discountRate ?? '0');
const partialNetClawback = subtract(amount, bankersRound(multiply(amount, partialDiscountRate), 4));

// Then line 257 becomes:
clawedBackFromMerchant: bankersRound(partialNetClawback, 4),
```

### Test Update

**File:** `services/process-engine/src/bnpl/bnpl-refund.service.spec.ts`

The existing partial refund tests (lines 187–219) assert `clawedBackFromMerchant` equals the gross amount (`'30.0000'`). Update these assertions and add a dedicated test:

```typescript
// Add after the existing partial refund tests (around line 219):
it('applies net clawback on partial refund using merchant discount rate', async () => {
  const tx = makeTx({
    installments: [
      makeInstallment(1, { status: InstallmentStatus.paid, paidAmount: '40' }),
      makeInstallment(2, { status: InstallmentStatus.pending }),
      makeInstallment(3, { status: InstallmentStatus.pending }),
    ],
    merchant: { discountRate: { toString: () => '0.05' } },
  });
  const prisma = {
    bnplTransaction: { findFirst: jest.fn().mockResolvedValue(tx) },
    installmentSchedule: { update: jest.fn() },
  };
  const eventBus = { emitAndBuild: jest.fn() };
  const service = new BnplRefundService(prisma as any, eventBus as any);

  const result = await service.initiate(TENANT, {
    transactionId: TX_ID,
    amount: '100',
    type: 'partial',
    reason: 'partial return',
    operatorId: 'op',
  });

  // 100 × (1 − 0.05) = 95.0000
  expect(result.clawedBackFromMerchant).toBe('95.0000');
});
```

Also update the existing test assertions at line 215 — if the `makeTx` helper includes a merchant with a non-zero discount rate, the expected clawback value must reflect the net amount. If the helper defaults `discountRate` to `'0'`, then the existing assertion (`'30.0000'`) is still correct for a 0% rate and no change is needed there.

---

## Fix 2: F-OD-1 — waiveOverdraftPenalties idempotencyKey Passthrough (P3)

**File:** `apps/graphql-server/src/graphql/resolvers/overdraft.resolver.ts`
**Line:** 342

### Problem

The `waiveOverdraftPenalties` mutation declares the parameter as `_idempotencyKey` (underscore prefix), which means it's silently discarded — never passed to the service layer. This is the same pattern PM caught and fixed on all BNPL resolver mutations (FIX 12/17), but it was missed on the overdraft side.

### Fix

```typescript
// Line 342 — current:
@Args('idempotencyKey', { nullable: true }) _idempotencyKey?: string,

// Replace with:
@Args('idempotencyKey', { nullable: true }) idempotencyKey?: string,
```

Then pass it through to the service call (the next line or wherever `this.creditLineService.waivePenalties(...)` is called):

```typescript
// Add idempotencyKey to the service call arguments:
await this.creditLineService.waivePenalties(tenantId, contractId, amount, idempotencyKey);
```

If the service method doesn't accept `idempotencyKey` yet, add it as an optional parameter and log it at debug level (same pattern as `bnpl-installment.service.ts` line 91):

```typescript
// In credit-line.service.ts waivePenalties method:
if (idempotencyKey) {
  this.logger.debug(`waivePenalties idempotencyKey=${idempotencyKey}`);
}
```

---

## Summary

| # | Severity | File | Fix | Effort |
|---|----------|------|-----|--------|
| F-BN-1 | P1 | `bnpl-refund.service.ts:257` | Apply `(1 − discountRate)` to partial refund clawback | ~10 min |
| F-OD-1 | P3 | `overdraft.resolver.ts:342` | Rename `_idempotencyKey` → `idempotencyKey`, pass through | ~5 min |

**F-BN-1 must be fixed before Sprint 12 coding begins.** Report back when done.
