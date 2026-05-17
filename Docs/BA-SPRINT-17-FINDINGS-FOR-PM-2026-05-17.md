# BA Sprint 17 Findings — PM Action Brief

**From:** BA Agent
**To:** PM
**Date:** 2026-05-17
**Sprint:** 17 — Scoring/EMI Integration + Entity Management + BA Fix Items
**BA Verdict:** CONDITIONAL SIGN-OFF (0 P1, 5 P2, 8 P3 + 2 carry-forward)

---

## Summary

Sprint 17 is a solid delivery. All five BA deferred findings from Sprints 15/16 are properly closed. The scoring/EMI pipeline architecture is correct. Entity management (dedup, profiles, credit summary) uses Decimal math throughout after the fix cycle.

Five P2 findings need fixing (~3.5 SP). Additionally, the two Sprint 16 BA P2 immediate fixes (F-BA-S16-3 + F-BA-S16-4, combined 1.5 SP) were never implemented — they need to be tracked and resolved.

---

## P2 Findings — Must Fix (~3.5 SP)

### F-BA-S17-1 — `averageBalance` via Number() in scoring input (0.5 SP)

**File:** `services/process-engine/src/scoring/scoring.service.ts:204-205`

`averageBalance30d` comes from a `DECIMAL(19,4)` Prisma column but is cast with `Number()` before feeding into the scorecard engine. This is a monetary amount. CLAUDE.md forbids float for money.

**Fix:** Keep as string. The scorecard engine's band lookup should use `compare()` from `@lons/common` instead of numeric comparison for this factor. Alternatively, pass as string and convert to number only inside the band matcher with a comment acknowledging the precision trade-off (since band thresholds are coarse integers like 50/200/500).

---

### F-BA-S17-2 — `score` and `recommendedLimit` stored via Number() (0.5 SP)

**File:** `services/process-engine/src/scoring/scoring.service.ts:116,121`

Both values are decimal strings from `bankersRound()` but converted to `Number()` before being passed to `prisma.scoringResult.create()`. `recommendedLimit` is a monetary amount — it must be passed as a string for Prisma to handle Decimal coercion correctly.

**Fix:**
```typescript
// Before (wrong)
score: Number(finalScore),
recommendedLimit: Number(recommendedLimit),

// After (correct)
score: finalScore,                    // Prisma Decimal accepts string
recommendedLimit: recommendedLimit,   // monetary — must stay as string
```

---

### F-BA-S17-3 — Null factor values penalize data-absent customers (1 SP)

**File:** `services/process-engine/src/scoring/scorecard/scorecard-engine.ts:36`

When a factor value is `null` or `undefined`, `Number(value)` produces `0`, which maps to the lowest band (typically 10 points). Currently invisible because new factors (`average_balance`, `credit_bureau_score`) have `weight: 0`.

**Problem:** When a tenant enables these factors with non-zero weight, any customer without EMI or bureau data gets penalized — scored as if they have a zero balance or zero bureau score. This is a scoring accuracy issue that will bite production tenants.

**Fix options (pick one):**
1. **Skip null factors** — exclude from `totalWeight` denominator. Score is based only on available data.
2. **Configurable null handling** — add a `nullPolicy` field per factor: `'skip'`, `'penalize'`, or `'use_default'` with a configurable default value.
3. **Minimum viable** — if value is null AND weight > 0, skip the factor and add to `_metadata.skippedFactors[]`.

Recommend option 3 for this sprint, with option 2 as a Sprint 19 enhancement.

---

### F-BA-S17-4 — API key rotation missing audit log (0.5 SP)

**File:** `services/entity-service/src/api-key/api-key-rotation.service.ts:11-62`

`rotateApiKey()` logs via `this.logger.log()` but does not call `AuditService`. Compare:
- `rotateWebhookSigningKey` → has audit ✓
- `onboard` (after fix cycle) → has audit ✓
- `rotateApiKey` → no audit ✗

FR-SEC-002.3 requires audit trail for credential lifecycle changes.

**Fix:** Add `AuditService.log()` call after successful rotation with: `action: 'api_key_rotated'`, `entityId: keyId`, `entityType: 'api_key'`, `metadata: { previousKeyPrefix, newKeyPrefix }`. Do not log the actual key value.

---

### F-BA-S17-5 — Post-overdue reminders hardcoded to SMS (1 SP)

**File:** `apps/scheduler/src/jobs/payment-reminder.job.ts:311`

The overdue reminder pass always sends via `channel: 'sms'` regardless of product notification config. The pre-due reminder pass (same file, ~line 180) correctly reads channel from the product's per-entry config.

**Impact:** Products configured for email-only or push-only notifications will still get SMS overdue reminders. Tenants pay per-SMS fees; this silently costs them money on channels they didn't choose.

**Fix:** Use the same `resolveChannel(product, daysPastDue)` pattern as the pre-due pass. If no channel is explicitly configured for overdue reminders, fall back to the product's default notification channel, then to `'sms'` as last resort.

---

## P3 Findings — PM to Disposition (8 total)

| ID | Track | Description | Suggested Sprint |
|---|---|---|---|
| F-BA-S17-6 | A | In-memory `Map` cache in `EmiDataService` has no LRU cap. Long-running sync of thousands of wallets grows without limit. | Sprint 20 (pre-scaling) |
| F-BA-S17-7 | A | `scoreNum = Number(score)` for limit band lookup in scorecard engine. Should use `compare()` consistently. Low practical risk since thresholds are integer-like. | Sprint 19 (scoring hardening) |
| F-BA-S17-8 | B | `FINANCIAL_PROFILE_INVALIDATION_EVENTS` const includes `repayment.completed` but no `@OnEvent` is wired for it and no producer emits this event. Const is dead code / misleading. | Sprint 18 |
| F-BA-S17-9 | B | Onboarding audit failure caught with `console.error` instead of structured `this.logger.error()`. Bypasses log formatting and observability pipelines. | Sprint 18 |
| F-BA-S17-10 | B | Customer merge audit log written after transaction commits. If audit write fails, merge succeeds but no idempotency record exists. Low risk — reparent is idempotent by nature. | Accepted (document) |
| F-BA-S17-11 | C | BNPL `restoreAvailableLimit` idempotent path: adjustment record's `newLimit` could diverge from actual DB value under concurrent restores. The `LEAST(...)` SQL is the source of truth. | Accepted (document) |
| F-BA-S17-12 | C | `suspendBorrowing` scope default works via JS undefined-triggers-default semantics. Correct but implicit. Adding `?? 'product'` at call site would be explicit. | Accepted as-is |
| F-BA-S17-13 | — | Sprint 16 BA P2 immediate fixes (F-BA-S16-3 + F-BA-S16-4) still unimplemented. Not Sprint 17's fault — designated pre-S17 fix. Must be tracked. | **Immediate** (1.5 SP) |

---

## Carry-Forward: Sprint 16 BA P2s Still Open

These were designated "Dev can ship before Sprint 17 kickoff" in `PM-RESPONSE-BA-SPRINT-16-2026-05-17.md`. No commit addresses them.

### F-BA-S16-3 — Early settlement total not floored at zero (0.5 SP)

**File:** `services/repayment-service/src/early-settlement/early-settlement.service.ts`

After `totalSettlementAmount = subtract(subtotal, interestRebate)`, a 100% rebate where `interestRebate > subtotal` produces a negative quote. The PM response included an inline fix prompt with `compare(totalSettlementAmount, '0') < 0` guard.

### F-BA-S16-4 — Template lookup integration test (1 SP)

**File:** `services/notification-service/src/__tests__/notification.service.integration.spec.ts` (does not exist)

The `split(':')[0]` mechanism at `notification.service.ts:28` works but has zero test coverage. A template-registry refactor could silently break all reminders (pre-due and overdue). The PM response included a full test case.

---

## Asks

1. **Confirm disposition** for the 8 P3 items (accept/defer/fix).
2. **Schedule the 5 P2 items** (~3.5 SP) — can they land in the Sprint 17 fix cycle or do they roll into Sprint 18?
3. **Track the 2 carry-forward items** (F-BA-S16-3 + F-BA-S16-4, 1.5 SP) — these should not slip a third sprint.
4. **Confirm §5.9 from delivery notes** — `PRODUCT_CONFIG_CHANGED` not emitting on `minAmount` reduction. BA confirms this is correct (minAmount reduction never violates existing approvals). No action needed.
5. **Confirm S17-FIX-3 scope-down** — DI-only for shared wallet adapter is acceptable. Full call-site migration belongs in Sprint 18.

---

## Sprint 18 Capacity Impact (if all items addressed)

| Category | SP |
|---|---|
| Original Sprint 18 scope | ~50 |
| F-BA-S17 P2 fix items (5) | ~3.5 |
| F-BA-S17 P3 items deferred to S18 (2) | ~1 |
| S16 BA carry-forward (2) | 1.5 |
| PM P3 items deferred to S18 (already counted in PM review) | ~2.5 |
| Pre-existing screening test fix | 0.5 |
| **Total** | **~59 SP** |

Within ceiling, but tight. If capacity is a concern, F-BA-S17-3 (null factor handling, 1 SP) could defer to Sprint 19 scoring hardening — it only matters when tenants enable the new factors with non-zero weight, which won't happen until sprint 19+ at earliest.

---

*Prepared by: BA Agent | 2026-05-17*
