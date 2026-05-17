# PM Response to BA Sprint 17 Review

**Author:** Project Manager (Claude)
**Date:** 2026-05-17
**In Response To:** BA-SPRINT-17-FINDINGS-FOR-PM-2026-05-17.md
**Sprint:** 17 — Scoring/EMI Integration + Entity Management + BA Fix Items
**BA Verdict:** CONDITIONAL SIGN-OFF (0 P1, 5 P2, 8 P3 + 2 carry-forward)

---

## 1. Overall Assessment

Good catch on all five P2s — each independently verified against the code. The carry-forward finding on the two Sprint 16 BA P2 items (F-BA-S16-3 + F-BA-S16-4) is also confirmed: neither was implemented. That's an oversight that should not have survived two sprint transitions.

**PM verdict: Sprint 17 APPROVED for close.** The conditional sign-off is accepted. All P2 items (5 new + 2 carry-forward = 7 items, ~5 SP) tracked for immediate fix before Sprint 18 starts.

---

## 2. P2 Findings — All Confirmed for Immediate Fix

| ID | Finding | SP | Notes |
|---|---|---|---|
| F-BA-S17-1 | `averageBalance` via `Number()` in scoring input | 0.5 | Valid — keep as string, convert only inside band matcher with documented trade-off. |
| F-BA-S17-2 | `score` + `recommendedLimit` + `confidence` stored via `Number()` | 0.5 | Valid — also confirmed `confidence` at line 124 has the same issue. Pass strings directly; Prisma handles Decimal coercion from strings. |
| F-BA-S17-3 | Null factor values penalize data-absent customers | 1 | Valid — adopt BA recommendation option 3 (skip null factors with weight > 0, add to `_metadata.skippedFactors[]`). Option 2 (configurable `nullPolicy`) deferred to Sprint 19 scoring hardening. |
| F-BA-S17-4 | API key rotation missing audit log | 0.5 | Valid — also confirmed `revokeApiKey()` has the same gap. Fix both. |
| F-BA-S17-5 | Post-overdue reminders hardcoded to SMS | 1 | Valid — verified pre-due pass reads from `reminder.channel` via `resolveReminderConfig()`. Overdue pass bypasses entirely with `channel: 'sms'`. Route overdue through same config pattern. |

**Total new P2 fix: 3.5 SP.**

---

## 3. Carry-Forward Items — Confirmed Still Open

Both verified against the worktree code. Neither fix was implemented.

| ID | Finding | SP | Notes |
|---|---|---|---|
| F-BA-S16-3 | Early settlement total not floored at zero | 0.5 | `totalSettlementAmount` is computed as `bankersRound(subtract(subtotal, interestRebate), 4)` with no floor guard. A 100% rebate on large unearned interest produces a negative quote. Two-line fix. |
| F-BA-S16-4 | Template lookup integration test for `split(':')[0]` | 1 | The `split(':')[0]` mechanism at `notification.service.ts:28` works but has zero test coverage. No test passes a colon-discriminated eventType. |

**Total carry-forward fix: 1.5 SP.**

---

## 4. P3 Dispositions

### Accepted as-is (no action needed)

| ID | Finding | Rationale |
|---|---|---|
| F-BA-S17-10 | Customer merge audit log after transaction | **Accepted.** Merge reparent is idempotent — if audit write fails, the merge is still correct and replayable. Low risk. Document in merge service comments. |
| F-BA-S17-11 | BNPL restore `newLimit` may diverge under concurrency | **Accepted.** The `LEAST(...)` SQL is the source of truth for the actual DB value. The adjustment record's `newLimit` is informational. Document this in the service. |
| F-BA-S17-12 | `suspendBorrowing` scope via undefined-triggers-default | **Accepted as-is.** JavaScript `?? 'product'` is idiomatic. The safety guard in `eb8ebc9` already catches the no-productId case with an explicit ERROR log. No change needed. |

### Sprint 18

| ID | Finding | SP | Rationale |
|---|---|---|---|
| F-BA-S17-8 | `FINANCIAL_PROFILE_INVALIDATION_EVENTS` includes non-existent `repayment.completed` | 0.5 | Dead code / misleading const. Clean up when wiring actual event listeners in Sprint 18. |
| F-BA-S17-9 | Onboarding audit failure uses `console.error` instead of `this.logger.error()` | 0.5 | Valid — bypasses structured logging. Quick fix. |

### Sprint 19–20

| ID | Finding | SP | Rationale |
|---|---|---|---|
| F-BA-S17-6 | In-memory cache in `EmiDataService` has no LRU cap | 0.5 | Sprint 20 (pre-scaling). Acceptable for single-instance dev. Will migrate to Redis with bounded cache. |
| F-BA-S17-7 | `scoreNum = Number(score)` for limit band lookup | 0.5 | Sprint 19 (scoring hardening). Low practical risk — thresholds are integer-like. |
| F-BA-S17-13 | S16 BA P2s still unimplemented | — | **Tracked as carry-forward above. Immediate fix.** |

---

## 5. BA Asks — Responses

| # | Ask | Response |
|---|---|---|
| 1 | Confirm P3 dispositions | Done — see §4. 3 accepted, 2 → Sprint 18, 3 → Sprint 19–20. |
| 2 | Schedule 5 P2 items | **Immediate fix before Sprint 18.** Combined with carry-forwards: 7 items, ~5 SP. Dev prompt will be prepared. |
| 3 | Track 2 carry-forward items | **Included in the immediate fix prompt below.** These must not slip again. |
| 4 | Confirm §5.9 — `PRODUCT_CONFIG_CHANGED` on minAmount | **Confirmed correct.** Reducing `minAmount` never violates existing approvals. No action needed. |
| 5 | Confirm S17-FIX-3 scope-down | **Accepted.** DI plumbing is in place. Full call-site migration belongs in Sprint 18 coordinated wallet-adapter pass. No functional regression. |

---

## 6. Immediate Fix Prompt (for Dev)

### FIX-BA-1 — Remove `Number()` on scoring input and persistence (~1 SP)

**Files:**
- `services/process-engine/src/scoring/scoring.service.ts`

**6a.** Line 204–205 — `averageBalance` scoring input:

Replace:
```typescript
averageBalance = latestEmi.averageBalance30d
  ? Number(latestEmi.averageBalance30d)
  : null;
```

With:
```typescript
averageBalance = latestEmi.averageBalance30d
  ? latestEmi.averageBalance30d.toString()
  : null;
```

**6b.** Lines 116, 121, 124 — `scoringResult.create()` persistence:

Replace:
```typescript
score: Number(result.score),
recommendedLimit: Number(result.recommendedLimit),
confidence: Number(result.confidence),
```

With:
```typescript
score: result.score,                    // Prisma Decimal accepts string
recommendedLimit: result.recommendedLimit, // monetary — must stay as string
confidence: result.confidence,
```

**Test:** Add a case with a `recommendedLimit` value near the JS Number precision boundary (e.g., `'9999999999999.9999'`) and verify it roundtrips through the DB without precision loss.

---

### FIX-BA-2 — Skip null factors with non-zero weight (1 SP)

**File:** `services/process-engine/src/scoring/scorecard/scorecard-engine.ts`

At line 36, the engine treats null factor values as 0:
```typescript
const numericValue = value !== null && value !== undefined ? Number(value) : 0;
```

Replace with skip logic:

```typescript
const skippedFactors: string[] = [];

for (const factor of scorecard.factors) {
  const value = input[factor.name];

  // Skip factors with null/undefined values when weight > 0
  if ((value === null || value === undefined) && factor.weight > 0) {
    skippedFactors.push(factor.name);
    continue; // exclude from both score and totalWeight
  }

  const numericValue = value !== null && value !== undefined ? Number(value) : 0;
  // ... existing band matching logic ...

  totalWeight += factor.weight; // only accumulate weight for non-skipped factors
}
```

Add `skippedFactors` to the return value and include in `_metadata`:
```typescript
_metadata: {
  ...existingMetadata,
  skippedFactors,
}
```

**Tests:**
- Factor with null value and weight=0 → contributes 0 (existing behaviour, backward compatible)
- Factor with null value and weight>0 → skipped entirely, not in denominator
- Factor with non-null value and weight>0 → scored normally
- `_metadata.skippedFactors` lists the skipped factor names

---

### FIX-BA-3 — Audit log for API key rotation + revocation (0.5 SP)

**File:** `services/entity-service/src/api-key/api-key-rotation.service.ts`

1. Inject `AuditService` into the constructor.

2. After successful rotation (after line 59):
```typescript
await this.auditService.log({
  tenantId,
  action: 'API_KEY_ROTATED',
  actorId: null, // system-initiated or pass from caller
  resourceType: 'api_key',
  resourceId: apiKeyId,
  details: {
    previousKeyId: apiKeyId,
    newKeyId: newApiKey.id,
    gracePeriodHours,
  },
});
```

3. After successful revocation in `revokeApiKey()`:
```typescript
await this.auditService.log({
  tenantId,
  action: 'API_KEY_REVOKED',
  actorId: null,
  resourceType: 'api_key',
  resourceId: apiKeyId,
  details: { revokedAt: new Date().toISOString() },
});
```

**Do not** log actual key values or hashes in audit entries.

---

### FIX-BA-4 — Post-overdue reminders use product notification config (1 SP)

**File:** `apps/scheduler/src/jobs/payment-reminder.job.ts`

The pre-due pass at line ~221 correctly reads `channel` from product config via `resolveReminderConfig()`. The post-overdue pass at line 311 hardcodes `channel: 'sms'`.

**Fix:** Route the overdue pass through the same config pattern. In the `sendOverdueReminders` method, resolve the channel per product:

```typescript
// Resolve channel from product config (same as pre-due pass)
const overdueConfig = resolveOverdueReminderConfig(product);
const channel = overdueConfig?.channel ?? product.notificationConfig?.defaultChannel ?? 'sms';
```

Add `resolveOverdueReminderConfig(product)` that reads from `product.notificationConfig.paymentReminders.overdueSchedule` — if no `channel` is specified per overdue entry, fall back to the product's `defaultChannel`, then to `'sms'` as the absolute last resort.

**Test:** Product with `notificationConfig.defaultChannel: 'email'` should send overdue reminders via email, not SMS.

---

### FIX-BA-5 — Floor early settlement total at zero (0.5 SP) [CARRY-FORWARD]

**File:** `services/repayment-service/src/early-settlement/early-settlement.service.ts`

After line 149 (`const totalSettlementAmount = bankersRound(subtract(subtotal, interestRebate), 4);`), add:

```typescript
import { compare } from '@lons/common';

// Floor at zero — a 100% rebate should never produce a negative obligation.
if (compare(totalSettlementAmount, '0') < 0) {
  totalSettlementAmount = '0.0000';
}
```

**Test:** Add to `early-settlement.service.spec.ts`:
- Config: `interestRebatePercent: 100`, contract with large `unearnedInterest` exceeding remaining principal
- Assert: `totalSettlementAmount === '0.0000'` (not negative)
- Assert: `breakdown` still shows the rebate line for transparency

---

### FIX-BA-6 — Template lookup integration test (1 SP) [CARRY-FORWARD]

**File:** `services/notification-service/src/notification.service.spec.ts` (add to existing, or create `notification.service.integration.spec.ts`)

```typescript
describe('Template lookup with installment-scoped eventType', () => {
  it('resolves template via prefix when eventType contains :discriminator', async () => {
    const result = await notificationService.sendNotification({
      tenantId: TENANT,
      customerId: CUSTOMER,
      contractId: CONTRACT,
      eventType: 'payment_reminder.3:some-installment-uuid',
      channel: 'sms',
      variables: {
        customerName: 'Jane',
        amount: '500.00',
        currency: 'GHS',
        dueDate: '2026-05-20',
        installmentNumber: '3',
      },
    });

    // Should resolve to 'payment_reminder.3' template, not return null
    expect(result).not.toBeNull();
    expect(result.body).toContain('Jane');
    expect(result.body).toContain('500.00');
  });

  it('still resolves plain eventType without discriminator', async () => {
    const result = await notificationService.sendNotification({
      tenantId: TENANT,
      customerId: CUSTOMER,
      contractId: CONTRACT,
      eventType: 'payment_reminder.3',
      channel: 'sms',
      variables: {
        customerName: 'Jane',
        amount: '500.00',
        currency: 'GHS',
        dueDate: '2026-05-20',
        installmentNumber: '3',
      },
    });

    expect(result).not.toBeNull();
  });
});
```

This confirms the `split(':')[0]` mechanism works end-to-end and catches any future refactor that breaks the contract.

---

## 7. Sprint 18 Capacity Impact

| Category | SP |
|---|---|
| Original Sprint 18 scope | ~50 |
| BA S17 P2 immediate fix (5 items) | ~3.5 |
| S16 BA carry-forward (2 items) | 1.5 |
| PM S17 P3 items deferred to S18 | ~2.5 |
| BA S17 P3 items deferred to S18 (F-BA-S17-8, -9) | ~1 |
| Pre-existing screening test fix | 0.5 |
| **Total** | **~59 SP** |

Within acceptable ceiling. If tight, F-BA-S17-3 (null factor handling, 1 SP) can defer to Sprint 19 — it only matters when tenants enable new factors with non-zero weight, which is Sprint 19+ at earliest. That brings the fix cycle to ~4 SP.

---

*References: BA-SPRINT-17-FINDINGS-FOR-PM-2026-05-17.md, PM-SPRINT-17-REVIEW-2026-05-17.md, PM-RESPONSE-BA-SPRINT-16-2026-05-17.md*
