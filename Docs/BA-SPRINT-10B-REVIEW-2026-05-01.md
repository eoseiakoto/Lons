# BA Review: Sprint 10B — Overdraft Product Implementation

**From:** BA (Claude)
**To:** PM (Claude)
**Date:** 2026-05-01
**Sprint:** 10B — Overdraft Product Implementation
**Verdict:** CONDITIONAL SIGN-OFF — 3 logic-level issues must be fixed before Sprint 11 starts. Core financial logic is sound.

---

## Executive Summary

BA has reviewed the full Sprint 10B overdraft delivery against SPEC-overdraft.md. The core financial logic — waterfall allocation, daily interest accrual, penalty cap enforcement, drawdown concurrency, state machine — is correct and well-implemented. The code quality is high: Decimal arithmetic throughout, no float contamination, proper use of `SELECT FOR UPDATE` for concurrency, clean separation between pure functions and I/O.

However, the review identified **3 logic-level issues** that must be fixed before Sprint 11 builds on top, plus **5 integration-level gaps** that can be added to the Sprint 11 backlog. One spec deviation is intentional and BA recommends accepting it (fee charging against available balance).

---

## PM's 7 Validation Areas — Responses

### 1. State Machine Transitions (SPEC §3.2) — CONFIRMED ✅

The `ALLOWED_TRANSITIONS` map in `credit-line.service.ts` lines 30-42 is an **exact match** to the spec's transition graph. Every edge PM flagged checks out:

- `frozen → active` (unfreeze): allowed ✓
- `frozen → closed`: allowed ✓
- `suspended → active`: allowed ✓
- `suspended → closed`: correctly NOT allowed (must go through `active` first) ✓
- `expired → closed`: only exit from `expired` ✓
- `closed`: terminal, empty array ✓

The `deactivateCreditLine` method additionally enforces the spec's `closed` precondition (all four monetary balances at zero) before attempting the transition. The `assertTransitionAllowed` helper is public and well-tested (11 test cases covering all valid and key invalid transitions).

No issues.

### 2. Waterfall Allocation Order (SPEC §7.1) — CONFIRMED ✅ (Feature, Not Deviation)

**PM's question:** Is the configurable waterfall a feature or a deviation?

**Answer: It is a feature, explicitly specified in the SPEC.**

SPEC §4 defines `autoRepaymentWaterfall` as a product configuration field with the default value `["penalties", "interest", "fees", "principal"]`. SPEC §7.1 step 4 says "Apply waterfall allocation (configurable per product, default order)." The spec was intentionally designed this way to support SP customization — different service providers may have regulatory or business reasons to prioritize interest over penalties, for example.

Dev's implementation faithfully follows this: `RepaymentService.applyWaterfall` accepts a `waterfall` parameter defaulting to `DEFAULT_WATERFALL`, and `collectAndAllocate` reads the order from `product.overdraftConfig.autoRepaymentWaterfall`. The pure function is well-tested with both default and custom orders.

**Product implication:** SPs can configure the waterfall order per product via the product wizard. PM should ensure the product wizard UI supports drag-and-drop reorder for this field (SPEC §14.1 product wizard update).

### 3. Available Balance Restoration After Repayment — CONFIRMED ✅ (with code smell noted)

`collectAndAllocate` in `repayment.service.ts` lines 272-280 correctly restores `availableBalance` by the principal portion only. The logic:

- When fully repaid: `availableBalance = approvedLimit` (full limit restored)
- When partially repaid: `availableBalance = approvedLimit - newOutstandingAmount`

Since `newOutstandingAmount = previousOutstanding - allocatedPrincipal`, the increase in available balance equals exactly the principal portion allocated. Interest, fees, and penalties do not affect available balance. This is correct per the spec invariant.

**Code smell (P3):** Line 280 uses string concatenation `add(approvedLimit, \`-${newOutstanding}\`)` instead of `subtract(approvedLimit, newOutstanding)`. This works but is fragile — the `.replace(/^--/, '')` guard handles double-negation but obscures intent. Dev should replace with `subtract()` for clarity. Not a logic bug.

### 4. Drawdown Fee Charging Against Available Balance — DEVIATION ⚠️ (BA Recommends Accepting)

**PM's question:** Should fees reduce available balance or be tracked separately?

**What the spec says:** SPEC §3.1 defines the invariant as `availableBalance = approvedLimit - outstandingAmount`, and states `outstandingAmount includes principal only.` Under this invariant, fees should NOT reduce available balance.

**What Dev built:** `drawdown.service.ts` line 286 deducts `chargeAmount` (shortfall + fee) from `availableBalance`, while only adding `shortfall` to `outstandingAmount`. This means `availableBalance = approvedLimit - outstandingAmount - feesOutstanding` in practice, which breaks the stated invariant.

**BA's assessment:** Dev's approach is actually safer and more correct than the spec's invariant. Consider a customer with a 1,000 GHS limit:

- **Spec invariant:** Draw 500, fee 5. Available = 500 (1000 - 500). Customer can draw 500 more, accumulating another fee. Fees pile up without affecting headroom — the customer's total obligations can exceed the approved limit.
- **Dev's approach:** Draw 500, fee 5. Available = 495 (1000 - 500 - 5). Credit headroom accurately reflects all obligations that reduce the customer's capacity.

**Recommendation:** Accept Dev's implementation. The spec invariant is slightly wrong — it should account for fees. BA will update SPEC-overdraft.md §3.1 to read: `availableBalance = approvedLimit - outstandingAmount - feesOutstanding` (or more precisely, "availableBalance reflects headroom after all obligation-reducing charges, not just principal").

**Action:** BA to update spec. No Dev work required.

### 5. Partial Drawdown Policy — CONFIRMED ✅

When `partialDrawdownEnabled` is true, `drawdown.service.ts` lines 118-124 compute: `disburseAmount = availableBalance - feeAmount`. The fee is deducted **before** computing the partial amount. This is the only sensible interpretation — you never disburse without covering the fee.

If the remaining amount after fee deduction is non-positive, the drawdown is declined entirely. This prevents edge cases where a customer ends up owing a fee for a zero-value drawdown.

Correct per spec intent.

### 6. Penalty Cap Enforcement (SPEC §9.2) — CONFIRMED ✅

`calculateDailyPenalty` in `interest.service.ts` lines 142-151:

```
cap = outstanding × maxCapPercent
headroom = cap - penaltiesAccrued
dailyPenalty = min(dailyByRate, headroom)
```

This exactly matches the spec formula. The cap is based on **current outstanding**, not the original outstanding at time of overdue classification. This means:

- If a customer repays some principal, the cap shrinks proportionally, and further penalty accrual slows or stops.
- Penalties already accrued are NOT reversed when outstanding decreases — the cap only limits future accrual.

This is correct and aligns with regulatory intent (penalties should not exceed a percentage of what the customer currently owes).

Tests cover: within cap, at cap (zero accrual), and headroom reduction scenarios. All pass.

### 7. Billing Cycle Date Handling — CONFIRMED ✅

`closeCyclesDue` in `interest.service.ts` lines 174-177:

```
newCycleStart = currentCycleEnd + 1 day
newCycleEnd = newCycleStart + (cycleDays - 1) days
```

The next cycle starts the day after the previous cycle ends, ensuring no gaps between cycles. Each cycle is exactly `cycleDays` long (inclusive of start and end dates). This is correct — advancing from `currentCycleEnd` rather than `currentCycleStart` means cycles cannot drift if a cycle was ever manually adjusted.

---

## New Findings — Logic-Level (Must Fix Before Sprint 11)

These are issues not in PM's known gap list that affect business logic correctness.

### F1: CRITICAL — `product.minAmount` Floor Not Enforced in Limit Assignment

**SPEC §10.1:** `approvedLimit = max(approvedLimit, product.minAmount)` — there's a floor to prevent assigning impractically small limits.

**Code:** `credit-line.service.ts` line 123 applies the ceiling (`min(recommended, maxAmount)`) but NOT the floor. A scoring engine that returns a very low limit (e.g., 1 GHS) would be accepted, potentially creating a credit line that can't cover a single transaction fee.

**Fix:** Add one line after line 123:
```typescript
const approvedLimit = decMax(
  compare(input.recommendedLimit, productMax) > 0 ? productMax : input.recommendedLimit,
  product.minAmount ? String(product.minAmount) : '0'
);
```

**Effort:** 5 minutes. Test update: add one test case for the floor.

### F2: HIGH — `adjustLimit` Rejects Limits Below Outstanding (Spec Allows It)

**SPEC §10.4:** "A limit decrease does NOT affect outstanding balance. If the new limit is less than the current outstanding amount: `approvedLimit = newLimit`, `availableBalance = 0`."

**Code:** `credit-line.service.ts` line 309 throws a `ValidationError` when `newLimit < outstandingAmount`. This blocks a key business scenario: when a customer becomes overdue, the spec says the SP should be able to reduce their limit below their current outstanding as a risk management action. The customer can't draw more (available = 0) but continues repaying the existing balance.

**Fix:** Replace the rejection at line 309 with:
```typescript
// Per SPEC §10.4: allow limit below outstanding, set available to 0
const newAvailable = this.computeAvailableBalance(input.newLimit, String(cl.outstandingAmount));
// computeAvailableBalance already clamps at 0 via decMax
```

Remove lines 309-312 (the validation that rejects sub-outstanding limits). The `computeAvailableBalance` helper already handles the math correctly — it clamps at 0.

**Effort:** 10 minutes. Test update: add one test for below-outstanding limit decrease.

### F3: HIGH — KYC Status Not Checked in Activation

**SPEC §5.1 step 2b:** "Customer KYC status meets product minimum."

**Code:** `credit-line.service.ts` checks `customer.status !== active` but does NOT check `customer.kycStatus` against the product's minimum KYC level. A customer with incomplete KYC could be activated on an overdraft product.

**Fix:** Add after line 83:
```typescript
const requiredKyc = product.minimumKycLevel ?? 'basic';
if (kycLevelOrder(customer.kycStatus) < kycLevelOrder(requiredKyc)) {
  throw new ValidationError(`Customer KYC level ${customer.kycStatus} below product minimum ${requiredKyc}`);
}
```

The `kycLevelOrder` utility likely exists already (entity-service uses it). If not, a simple ordinal comparison suffices.

**Effort:** 15 minutes including test.

---

## New Findings — Integration-Level (Add to Sprint 11 Backlog)

These don't affect core logic correctness but are gaps the sprint plan should track.

### F4: Interest Not Crystallized at Cycle Close — No Due Date or Grace Period

**SPEC §8.2** says at cycle end: "Crystallize accrued interest — add `interestAccrued` to a due amount" and "Set the due date for the cycle (e.g., 7 days after cycle end, configurable via `gracePeriodDays`)."

**Code:** `closeCyclesDue` rolls the cycle dates forward and emits events, but does NOT crystallize interest or compute a due date. There is no `dueDate` field on CreditLine, and `gracePeriodDays` from the product config is never consumed.

**Impact:** Without a due date, overdue classification (SPEC §9.1) cannot be implemented. The DPD (days past due) clock has no start date. This is the most significant gap for Sprint 11 — the aging/freeze/penalty escalation logic depends entirely on knowing when a cycle's balance was due.

**Sprint 11 action:** Add `dueDate` field to CreditLine (or a separate `BillingCycle` entity), crystallize interest at cycle close, and compute due date from `currentCycleEnd + gracePeriodDays`.

### F5: Overdue Classification Not Implemented

The daily accrual runs interest and penalties but does not track DPD, classify credit lines into aging buckets (Current/Watch/Substandard/Doubtful/Loss), or trigger the automated actions per SPEC §9.1 (freeze at Substandard, recovery referral at Doubtful, NPL at Loss). This depends on F4 (due dates) and should be Sprint 11 scope.

### F6: Missing Event Types — 4 Events Defined in Spec But Not Emitted

The spec (§16.1) defines 25 event types. The implementation emits 17 of them. Missing:

| Event | When It Should Fire | Why Missing |
|---|---|---|
| `CREDITLINE_SUSPENDED` | Status → suspended (limit review) | No suspend method implemented yet (periodic review is Sprint 11) |
| `CREDITLINE_REINSTATED` | Status → active from suspended | Same — no periodic review flow |
| `CREDITLINE_DRAWDOWN_REVERSED` | Wallet provider reverses a completed drawdown | No reversal flow implemented |
| `CREDITLINE_LIMIT_REVIEW_SCHEDULED` | Periodic review job schedules a review | No scheduler integration |

These are all tied to Sprint 11 features (periodic review, reversal handling). Not a Sprint 10B gap.

### F7: Statement Opening Balance Hardcoded to '0'

`closeCyclesDue` emits `CREDITLINE_STATEMENT_GENERATED` with `openingBalance: '0'` and a code comment acknowledging that historical opening balance tracking would require a snapshot table. The cycle statement won't be accurate until this is addressed.

**Sprint 11 action:** Either introduce a `BillingCycleHistory` table to snapshot opening/closing balances, or compute the opening balance from drawdown/repayment records within the cycle.

### F8: Redis `tryReserve` Built But Not Integrated

The `CreditLineCacheService.tryReserve` method implements atomic WATCH/MULTI/EXEC balance reservation in Redis — exactly what the spec calls for in the drawdown hot path. But `DrawdownService.processDrawdown` doesn't use it; every drawdown goes directly to PostgreSQL via `SELECT FOR UPDATE`.

**Impact:** The < 200ms drawdown decision latency target (SPEC §6.2) may not be met under load, since every drawdown incurs a Postgres round-trip. However, Postgres locking is more authoritative and simpler to reason about, so this is an acceptable Sprint 10B trade-off.

**Additional note:** `tryReserve` has a bug — it adds the full `requiredAmount` (shortfall + fee) to `outstandingAmount`, but the spec (and the Postgres path) only add the principal portion (shortfall) to `outstandingAmount`. If `tryReserve` is integrated in Sprint 11, this must be fixed first.

**Sprint 11 action:** Integrate `tryReserve` as a fast-path optimization before falling back to Postgres on cache miss. Fix the `outstandingAmount` update to add principal only, and add `feesOutstanding` increment separately.

---

## Assessment of PM's Known Gaps

PM identified 7 gaps in the delivery. BA concurs with all of them and adds context:

| PM Gap | BA Assessment |
|---|---|
| `waiveOverdraftPenalties` mutation missing | Confirmed. It's in the resolver's JSDoc comment (line 53) and in the spec (§17.2) but not implemented. The service layer would need a `waivePenalties` method that sets `penaltiesAccrued` to the reduced amount and creates an audit record. P1 for Sprint 11. |
| BullMQ consumers not wired | Confirmed. The webhook controller emits events, but no BullMQ consumer picks them up to call `DrawdownService.processDrawdown` or `RepaymentService.processAutoRepayment`. The end-to-end webhook→service flow is broken. P1 for Sprint 11. |
| Wallet adapters are NULL stubs | Confirmed. `NULL_COLLECTION_ADAPTER` always returns `{ success: false }`. Manual repayments will always fail. P1 for Sprint 11. |
| walletId mapping scans all customers | Confirmed. `resolveWallet` in the webhook controller queries `customer.metadata.walletId` across all tenants — O(n) at scale. PM correctly flagged for a dedicated `wallet_account_mappings` table. P2 for Sprint 11. |
| Scoring engine not integrated | Confirmed. The resolver falls back to `product.maxAmount` when no `recommendedLimit` is provided. Acceptable for Sprint 10B. P2 for Sprint 11. |
| RepaymentService uses string negation | Confirmed (line 280: `add(approvedLimit, \`-${newOutstanding}\`)`). Code smell, not a bug. P3. |
| Test coverage at 60% not 80% | Confirmed. 33 test cases across 4 spec files, but all test pure functions only. No integration tests against a live DB. Coverage will improve in Sprint 11 when the full flow is testable. |

---

## Configurable Waterfall — Product Implications (PM Question #3)

As noted in validation area #2, the configurable waterfall is **spec-compliant, not a deviation**. PM should be aware of the product implications:

1. **Default behavior is safe.** The default order (penalties → interest → fees → principal) prioritizes clearing punitive charges before reducing the borrower's principal obligation. This is the standard approach in microfinance and aligns with customer-friendly regulation.

2. **SP customization is legitimate.** Some SPs may prefer principal-first allocation (to reduce the customer's outstanding faster and restore their credit headroom), or interest-first (to recognize revenue earlier). The product wizard should expose this as an advanced configuration option with clear labeling.

3. **Regulatory constraint.** Some jurisdictions mandate a specific waterfall order. The product configuration allows per-product customization, which supports multi-jurisdiction deployment. PM should document the default as the recommended order and note that jurisdiction-specific overrides may be required.

---

## Sign-Off Recommendation

**Conditional sign-off.** The core financial logic (waterfall, interest, penalty, drawdown, state machine) is correct and ready for Sprint 11 to build on. The 3 logic-level fixes (F1 minAmount floor, F2 limit-below-outstanding, F3 KYC check) are small and self-contained — each is under 15 minutes of Dev work.

**Before Sprint 11 starts:**

1. Fix F1 (minAmount floor) — 5 min
2. Fix F2 (allow limit below outstanding, set available to 0) — 10 min
3. Fix F3 (KYC check in activation) — 15 min
4. BA to update SPEC-overdraft.md §3.1 invariant to reflect fee-inclusive available balance (PM question #4 resolution)

**Add to Sprint 11 backlog:**

- F4: Due date / grace period / interest crystallization (prerequisite for overdue classification)
- F5: Overdue classification (aging buckets, DPD tracking)
- F6: 4 missing event types (suspend, reinstate, reverse, limit-review-scheduled)
- F7: Statement opening balance tracking
- F8: Redis `tryReserve` integration (performance) + bug fix in `outstandingAmount` update
- PM's 7 existing gaps (all confirmed)

**Total Sprint 11 additions from this review:** 5 new items (F4-F8) + PM's 7 = 12 integration-level items. PM should assess Sprint 11 capacity.

---

## Files Reviewed

| File | Lines | Verdict |
|---|---|---|
| `services/overdraft-service/src/credit-line/credit-line.service.ts` | 425 | 2 logic fixes needed (F1 minAmount, F2 limit-below-outstanding, F3 KYC) |
| `services/overdraft-service/src/drawdown/drawdown.service.ts` | 401 | Clean. Fee-against-available deviation accepted. |
| `services/overdraft-service/src/repayment/repayment.service.ts` | 331 | Clean. Code smell on line 280 (P3). |
| `services/overdraft-service/src/interest/interest.service.ts` | 272 | Clean. Cycle close missing crystallization (F4, Sprint 11). |
| `services/overdraft-service/src/cache/credit-line-cache.service.ts` | 162 | `tryReserve` has outstanding-amount bug (F8, Sprint 11). |
| `packages/event-contracts/src/overdraft-events.ts` | 96 | 5 of 25 event interfaces defined. 4 missing emitters (F6, Sprint 11). |
| `apps/graphql-server/src/graphql/resolvers/overdraft.resolver.ts` | 297 | `waiveOverdraftPenalties` missing (PM gap #1). |
| `apps/rest-server/src/wallet-webhook/wallet-webhook.controller.ts` | 244 | Clean. HMAC validation, tenant resolution, timing-safe compare. |
| `packages/database/prisma/migrations/.../migration.sql` | 151 | Clean. RLS policies with platform-admin bypass. All indexes present. |
| `packages/database/prisma/schema.prisma` (lines 1328-1400) | ~73 | Exact match to SPEC §3 entity models. |
| `credit-line.service.spec.ts` | 87 | 11 cases — comprehensive state machine coverage. |
| `drawdown.service.spec.ts` | 55 | 5 cases — fee calculation locked down. |
| `repayment.service.spec.ts` | 112 | 8 cases — precision invariant verified with BigInt comparison. |
| `interest.service.spec.ts` | 101 | 9 cases — daily interest + penalty cap math. |

---

*PM: Please produce dev prompts for the 3 pre-Sprint-11 fixes (F1, F2, F3) and add the 5 new integration-level items (F4-F8) to the Sprint 11 backlog on Monday.com. BA will update SPEC-overdraft.md §3.1 to reflect the fee-inclusive available balance invariant.*
