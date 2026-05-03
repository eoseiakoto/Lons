# Dev Prompt: Sprint 10B BA Review Fixes (F1, F2, F3)

**Priority:** MUST complete before Sprint 11 starts
**Effort:** ~30 minutes total (3 small fixes + 3 test cases)
**Reference:** `Docs/BA-SPRINT-10B-REVIEW-2026-05-01.md` findings F1, F2, F3

---

## Context

BA reviewed the Sprint 10B overdraft delivery and gave a conditional sign-off. Core financial logic is correct, but 3 logic-level issues must be fixed before Sprint 11 builds on top. All three are in `services/overdraft-service/src/credit-line/credit-line.service.ts`.

---

## Fix F1: Enforce `product.minAmount` Floor in Limit Assignment

**Monday.com:** item 11899175002
**SPEC ref:** §10.1
**File:** `services/overdraft-service/src/credit-line/credit-line.service.ts`

**Problem:** Line 123 applies the ceiling (`min(recommended, maxAmount)`) but NOT the floor. A scoring engine that returns 1 GHS would be accepted, creating a credit line that can't cover a single transaction fee.

**Fix:** After computing the ceiling on line 123, apply the floor:

```typescript
// Current (line 121-123):
const productMax = product.maxAmount ? String(product.maxAmount) : input.recommendedLimit;
const approvedLimit =
  compare(input.recommendedLimit, productMax) > 0 ? productMax : input.recommendedLimit;

// Replace with:
const productMax = product.maxAmount ? String(product.maxAmount) : input.recommendedLimit;
const productMin = product.minAmount ? String(product.minAmount) : '0';
const capped = compare(input.recommendedLimit, productMax) > 0 ? productMax : input.recommendedLimit;
const approvedLimit = decMax(capped, productMin);
```

`decMax` is already imported from `@lons/common` on line 18.

**Test:** Add one test case to `credit-line.service.spec.ts`:
- Verify that when `recommendedLimit` is below `product.minAmount`, the floor is applied.
- Note: this test will need a mock or a new test section since the existing tests only cover `assertTransitionAllowed`. You can add a new `describe('activateCreditLine limit bounds')` block that unit-tests the limit-capping logic in isolation (extract it to a helper if needed), or test via the full method with mocked deps.

---

## Fix F2: Allow `adjustLimit` Below Outstanding (Set Available to 0)

**Monday.com:** item 11899149673
**SPEC ref:** §10.4
**File:** `services/overdraft-service/src/credit-line/credit-line.service.ts`

**Problem:** Lines 309-312 throw `ValidationError` when `newLimit < outstandingAmount`. SPEC §10.4 explicitly says: "A limit decrease does NOT affect outstanding balance. If the new limit is less than the current outstanding amount: `approvedLimit = newLimit`, `availableBalance = 0`." This blocks a key risk management scenario (reducing a risky customer's limit below their current balance).

**Fix:** Remove the rejection at lines 309-312:

```typescript
// REMOVE these lines (309-312):
if (compare(input.newLimit, String(cl.outstandingAmount)) < 0) {
  throw new ValidationError(
    `newLimit ${input.newLimit} is below current outstanding ${cl.outstandingAmount}`,
  );
}
```

The existing `computeAvailableBalance` helper (line 422) already handles this correctly — it clamps at 0 via `decMax(subtract(approvedLimit, outstanding), '0')`. So when `newLimit < outstanding`, `availableBalance` becomes 0 automatically. No other code changes needed.

Keep the non-negative validation at lines 314-316 — a negative limit is still invalid.

**Test:** Add one test case to `credit-line.service.spec.ts`:
- Call `adjustLimit` with `newLimit = '500'` when `outstandingAmount = '800'`. Verify it succeeds and `availableBalance = '0'` (not a thrown error).
- This test needs mocked Prisma + EventBus, so it may be simpler as an integration test. At minimum, add a comment noting the expected behavior.

---

## Fix F3: Add KYC Status Check in Activation

**Monday.com:** item 11899149839
**SPEC ref:** §5.1 step 2b
**File:** `services/overdraft-service/src/credit-line/credit-line.service.ts`

**Problem:** `activateCreditLine` checks `customer.status !== active` (line 81-83) but does NOT check `customer.kycStatus` against the product's minimum KYC level. A customer with incomplete KYC could be activated on an overdraft product.

**Fix:** After line 83, add:

```typescript
// 2b — KYC level meets product minimum
const minimumKycLevel = (product as any).minimumKycLevel ?? 'basic';
const KYC_LEVEL_ORDER: Record<string, number> = {
  none: 0,
  basic: 1,
  standard: 2,
  enhanced: 3,
  full: 4,
};
const customerKycLevel = (customer as any).kycStatus ?? 'none';
if ((KYC_LEVEL_ORDER[customerKycLevel] ?? 0) < (KYC_LEVEL_ORDER[minimumKycLevel] ?? 0)) {
  throw new ValidationError(
    `Customer KYC level '${customerKycLevel}' is below product minimum '${minimumKycLevel}'`,
  );
}
```

**Note:** Check if `kycLevelOrder` or similar utility already exists in `@lons/entity-service` or `@lons/common`. If so, import and use it instead of the inline map. If the `Customer` type doesn't have `kycStatus` or the `Product` type doesn't have `minimumKycLevel`, you may need to use `(customer as any).kycStatus` or add the fields — check the Prisma schema.

**Test:** Add one test case:
- Verify that activation throws `ValidationError` when customer KYC level is below product minimum.

---

## Verification

After applying all 3 fixes:

1. `tsc --noEmit` across `@lons/overdraft-service` — 0 errors
2. Run `credit-line.service.spec.ts` — all existing + new tests pass
3. `pnpm verify:synced` — still in lockstep

---

## Delivery

Once complete, provide delivery notes and PM will mark all 3 Monday items Done. Sprint 11 can then commence.
