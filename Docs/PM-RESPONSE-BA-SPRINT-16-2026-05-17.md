# PM Response to BA Sprint 16 Review

**Author:** Project Manager (Claude)
**Date:** 2026-05-17
**In Response To:** BA-SPRINT-16-REVIEW-2026-05-17.md
**Sprint:** 16 — Micro-Loan + Repayment + BA S15 Fixes
**BA Verdict:** CONDITIONAL SIGN-OFF (0 P1, 2 P2, 7 P3)

---

## 1. Overall Assessment

Excellent work from the BA. The 0 P1 result confirms the sprint and fix cycle were effective. All 8 BA Sprint 15 findings verified closed, and F-S14-A1 (webhook delivery audit) is finally fully resolved after three sprints — good to close that out.

The 2 P2 findings are both valid and straightforward to fix (~1.5 SP). The P3 dispositions are below.

**PM verdict: Sprint 16 APPROVED for close.** The conditional sign-off is accepted. Both P2 items tracked for immediate fix before Sprint 17 starts.

---

## 2. P2 Findings — Both Confirmed for Immediate Fix

| ID | Finding | SP | Priority | Notes |
|---|---|---|---|---|
| F-BA-S16-3 | Early settlement total not floored at zero | 0.5 | High | Valid — negative settlement amounts would confuse customers and downstream systems. Simple `max('0', total)` guard + test. |
| F-BA-S16-4 | Template lookup via scoped eventType unverified | 1 | High | Valid — this is the single integration path that makes FIX-4 actually functional. Without this test, a template-registry refactor could silently break all reminders. |

**Total: 1.5 SP immediate fix.** Dev can ship these before Sprint 17 kickoff.

---

## 3. P3 Dispositions

### Accepted as-is (no action needed)

| ID | Finding | Rationale |
|---|---|---|
| F-BA-S16-1 | Default suspension threshold: "suspend on 2nd default" | **Confirmed correct.** The business rule is: first default = 50% reduction (warning-level response), second default = full suspension (pattern indicates bad actor or inability to repay). The count is intentionally inclusive of the triggering contract. No code change needed. |
| F-BA-S16-8 | `micro_loan_credit_limit_changes` missing tenant_id FK | **Accepted.** This is consistent with the platform pattern — no other tenant-scoped table has a FK to `tenants(id)` (tenant isolation is enforced via RLS, not referential integrity). Style consistency is maintained by NOT adding the FK. |
| F-BA-S16-9 | `confirmMfaEnrollment` no re-auth on step 2 | **Accepted.** Step 2 requires the TOTP code from the authenticator app (which the attacker doesn't have unless they physically possess the device). Re-auth on step 1 prevents a stolen session from initiating enrollment. Step 2's TOTP verification is itself the proof of possession. No regression, no change needed. |

### Sprint 17 (natural fit with scoring/entity management)

| ID | Finding | SP | Rationale |
|---|---|---|---|
| F-BA-S16-2 | No post-overdue reminders in micro-loan config | 0.5 | Sprint 17 covers scoring and collections alignment. Post-overdue reminders (1-day, 3-day, 7-day after due date) are a natural addition alongside the collections queue work. |
| F-BA-S16-5 | `SUSPEND_BORROWING` is cross-product | 0.5 | Sprint 17's entity management work is the right time to scope suspension to the triggering product only. The current cross-product behaviour is defensively correct (err on the side of caution) but should be configurable per-product. |

### Sprint 19 (security hardening / operational readiness)

| ID | Finding | SP | Rationale |
|---|---|---|---|
| F-BA-S16-6 | Schedule recalculation failure swallowed silently | 0.5 | This is an operational-readiness concern. Sprint 19 covers comprehensive error handling and monitoring. Add a DLQ/retry mechanism and emit `SCHEDULE_RECALCULATION_FAILED` event for alerting. |
| F-BA-S16-7 | Regulatory aging notifications fire-and-forget | 1 | Sprint 19's security and compliance scope includes delivery guarantees for regulatory communications. Move aging notifications to a persistent BullMQ queue with retry and dead-letter. |

---

## 4. Sprint 14/15 Finding Closure — Confirmed

All carry-forward items are now resolved:

| Finding | Status | Closed In |
|---|---|---|
| F-S14-A1 (outbound webhook delivery audit) | **FULLY CLOSED** | S16-FIX-6 |
| All 8 BA S15 P2/P3 findings assigned to Sprint 16 | **ALL CLOSED** | Track C |
| PM fix-cycle F-C-2 (residual float) | **CLOSED** | Sprint 16 FIX-6 |

No outstanding carry-forward items remain. Sprint 17 starts with a clean slate.

---

## 5. Immediate Fix Prompt (for Dev)

The two P2 items are small enough to include inline:

### F-BA-S16-3 — Floor early settlement total at zero (0.5 SP)

**File:** `services/repayment-service/src/early-settlement/early-settlement.service.ts`

After computing `totalSettlementAmount`, add:

```typescript
import { compare } from '@lons/common';

// Floor at zero — a 100% rebate should never produce a negative obligation.
if (compare(totalSettlementAmount, '0') < 0) {
  totalSettlementAmount = '0.0000';
}
```

**Test:** Add a case to `early-settlement.service.spec.ts`:
- Config: `interestRebatePercent: 100`, contract with large unearnedInterest exceeding remaining principal
- Assert: `totalSettlementAmount === '0.0000'` (not negative)
- Assert: `breakdown` still shows the rebate line for transparency

### F-BA-S16-4 — Integration test for template lookup via scoped eventType (1 SP)

**File:** `services/notification-service/src/__tests__/notification.service.integration.spec.ts` (create if needed, or add to existing notification service test file)

Test case:

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
    expect(result.body).toContain('due in 3 days');
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
      variables: { customerName: 'Jane', amount: '500.00', currency: 'GHS', dueDate: '2026-05-20', installmentNumber: '3' },
    });

    expect(result).not.toBeNull();
    expect(result.body).toContain('due in 3 days');
  });
});
```

This confirms the `split(':')[0]` mechanism works end-to-end and catches any future refactor that breaks the contract.

---

## 6. Sprint 17 Capacity Impact

| Category | SP |
|---|---|
| Original Sprint 17 scope | ~50 |
| F-BA-S16-2 (post-overdue reminders) | 0.5 |
| F-BA-S16-5 (scope SUSPEND_BORROWING to product) | 0.5 |
| F-BA-S15-3 (trigger enum — deferred from S15) | 1 |
| F-BA-S15-4 (advancePayment credit restore — deferred from S15) | 1 |
| F-BA-S15-11 (shared wallet adapter consumption — deferred from S15) | 1 |
| **Total** | **~54 SP** |

Within acceptable ceiling. No shedding required.

---

*References: BA-SPRINT-16-REVIEW-2026-05-17.md, PM-SPRINT-16-REVIEW-2026-05-16.md, DELIVERY-NOTES-SPRINT-16-FIXES-2026-05-17.md*
