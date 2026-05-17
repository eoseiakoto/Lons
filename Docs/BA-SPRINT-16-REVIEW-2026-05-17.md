# BA Sprint 16 Review

**Date:** 2026-05-17
**Sprint:** 16 (63 SP + 9 SP fix cycle)
**Reviewer:** BA Agent
**Verdict:** CONDITIONAL SIGN-OFF (0 P1, 2 P2, 7 P3)

---

## 1. Executive summary

Sprint 16 delivered 20 items across three tracks: micro-loan dedicated product logic (28 SP), repayment engine gaps (27 SP), and all eight BA Sprint 15 fix items (8 SP). A 7-item fix cycle (9 SP) addressed the PM's six P2 findings plus a template registration gap, adding 63 new tests and bringing the total to 985 — all green.

The BA confirms all Sprint 15 findings assigned to this sprint (F-BA-S15-1, -2, -5, -8, -9, -12, -13, -14) are properly closed. The micro-loan product logic is sound, with correct Decimal arithmetic throughout and an effective idempotency guard (FIX-1) preventing credit-limit compounding on duplicate events. The repayment engine additions (schedule recalculation, early settlement, configurable aging) are architecturally solid.

Two P2 findings remain: one functional gap (early settlement total not floored at zero) and one integration verification gap (template lookup via scoped eventType). Seven P3 findings are documented for PM disposition.

---

## 2. Delivery matrix

| Track | Theme | Items | SP | BA Verdict |
|---|---|---|---|---|
| A | Micro-Loan Product | 6 | 28 | PASS |
| B | Repayment Engine | 6 | 27 | CONDITIONAL |
| C | BA S15 Fixes | 8 | 8 | PASS |
| — | Fix Cycle | 7 | 9 | PASS |

---

## 3. Track-by-track analysis

### 3.1 Track A: Micro-Loan product

All six items are correctly implemented. Key verifications:

**S16-1 (Deactivation guard):** Correctly queries non-terminal contracts and blocks deactivation with structured error listing active contract IDs. Product-type and status guards present.

**S16-2 (Loan request validation):** All three gates use Decimal `compare()` — subscription existence, credit limit check (with legacy null-availableLimit fallback), and maxActiveLoans policy. Wired into `LoanRequestService` via product-type branching.

**S16-4/5 (Credit limit lifecycle):** FIX-1 dedup guard queries `(tenantId, subscriptionId, sourceId, changeType)` BEFORE any math, preventing duplicate-event compounding. Cap at `product.maxAmount` enforced. `availableLimit` hard-set to `'0.0000'` on default regardless of calculation result. Both the subscription update and audit row commit in a single `$transaction`.

**S16-6 (Audit log):** Append-only — no update or delete paths exist. `sourceId` field present for FIX-1 dedup queries. Transaction-client passthrough keeps audit atomic with the parent operation.

**Test coverage (FIX-2):** 40 tests across 4 spec files covering all critical paths including FIX-1 dedup for both increase and decrease, cap logic, lexicographic-compare regression, and boundary cases.

**FR-ML coverage:** FR-ML-002.3, FR-ML-003.2, FR-ML-004.6 (partial — pre-due only), FR-ML-005.1, FR-ML-005.2, FR-ML-005.3 all MET.

#### Findings

| ID | Sev | Description |
|---|---|---|
| F-BA-S16-1 | P3 | `reduceOnDefault` counts contracts inclusive of the triggering contract for suspension threshold. With `maxDefaultsBeforeSuspension=2`, suspension triggers on the second default. Product to confirm this is the intended business rule. |
| F-BA-S16-2 | P3 | FR-ML-004.6 covers pre-due reminders only (3d/1d/due-day). No post-overdue reminders configured. Acceptable for v1.0 but should be added for collections alignment. |

### 3.2 Track B: Repayment engine

Core financial logic is sound. Schedule recalculation uses atomic transactions with rounding absorption on the last installment. Early settlement formula is correct with proper reject codes and quote validity window. Configurable aging with per-action error isolation works as designed.

**FIX-3 (idempotencyKey on processRepayment):** Correctly adds a partial unique index `(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL`. Dedup lookup fires BEFORE contract status check so replays against since-settled contracts return the original repayment.

**FIX-4 (Reminder dedup scoped to installment):** Encodes installment ID into eventType as `payment_reminder.{days}:{entryId}`. `NotificationService` strips the `:discriminator` suffix via `split(':')[0]` for template lookup.

**FIX-5 (Tests):** 23 tests covering schedule recalculation (rounding, atomicity, paid/waived exclusion) and early settlement (all reject codes, formula variants, breakdown filtering, validUntil shape).

#### Findings

| ID | Sev | Description |
|---|---|---|
| F-BA-S16-3 | P2 | Early settlement total not floored at zero. A 100% rebate where unearnedInterest exceeds the subtotal produces a negative quote. No test covers this edge case. Add `max('0', totalSettlementAmount)` guard. |
| F-BA-S16-4 | P2 | Template lookup via scoped eventType unverified at integration level. No test confirms `NotificationService` actually resolves templates via prefix match (`split(':')[0]`) when called with the full `payment_reminder.3:{uuid}` key. A mismatch would silently produce "template not found" in production. |
| F-BA-S16-5 | P3 | `SUSPEND_BORROWING` suspends ALL active subscriptions for the customer regardless of product type. FR-DM-003.2 may intend cross-product suspension, but this warrants product-owner confirmation and a clarifying code comment. |
| F-BA-S16-6 | P3 | Schedule recalculation failure is swallowed silently (catch + log). No retry or event emission. A transient DB error during recalc leaves the schedule in an inconsistent state with no operator visibility. |
| F-BA-S16-7 | P3 | `SEND_NOTIFICATION` in the action matrix uses fire-and-forget event emission. For regulatory aging notices (e.g., 60-day default warning), delivery guarantee may be required. Consider persistent queue. |

### 3.3 Track C: BA Sprint 15 fixes

All eight items are verified closed. The Track C agent confirmed:

| BA S15 Finding | Sprint 16 Item | Status |
|---|---|---|
| F-BA-S15-1 (activatedAt/expiresAt) | S16-FIX-1 | **CLOSED** |
| F-BA-S15-2 (float in evaluateCreditScoreChange) | S16-FIX-2 | **CLOSED** |
| F-BA-S15-5 (retry job contract filter) | S16-FIX-3 | **CLOSED** |
| F-BA-S15-8 (debtors/invoices RLS) | S16-FIX-4 | **CLOSED** (Critical) |
| F-BA-S15-9 (MFA backup code re-auth) | S16-FIX-5 | **CLOSED** |
| F-BA-S15-12 (concurrent deduction test) | S16-BA-12 | **CLOSED** |
| F-BA-S15-13 (webhook delivery audit) | S16-FIX-6 | **CLOSED** |
| F-BA-S15-14 (billing config seed) | S16-BA-14 | **CLOSED** |

PM fix-cycle finding F-C-2 (residual float in `evaluateRepaymentBehaviour`) also confirmed closed — now uses `divide()` + `bankersRound()` + `compare()`.

F-S14-A1 (outbound webhook delivery audit) is now **fully closed** — `WebhookDeliveryService` logs both per-attempt and exhaustion audit entries.

#### Findings

| ID | Sev | Description |
|---|---|---|
| F-BA-S16-8 | P3 | `micro_loan_credit_limit_changes` table has no `tenant_id` FK constraint (has column + RLS, but no foreign key to `tenants`). Inconsistent with tables like `bnpl_credit_lines`. Style deviation, not a data-integrity gap. |
| F-BA-S16-9 | P3 | `confirmMfaEnrollment` (step 2) doesn't require re-auth — only step 1 does. Low severity: attacker would need the TOTP code from the authenticator app to exploit. Not a regression. |

---

## 4. PM fix cycle verification

All 7 fix items confirmed correct:

| Fix | Description | Status |
|---|---|---|
| FIX-1 | Credit limit review idempotency (sourceId dedup) | Correct — both increase and decrease paths guarded |
| FIX-2 | 40 unit tests for micro-loan services | Correct — covers all critical business rules |
| FIX-3 | idempotencyKey on processRepayment | Correct — partial unique index, pre-status-check lookup |
| FIX-4 | Reminder dedup scoped to installment | Correct — eventType encodes entryId |
| FIX-5 | 23 unit tests for repayment services | Correct — rounding, formula, reject codes |
| FIX-6 | Decimal in evaluateRepaymentBehaviour | Correct — divide + bankersRound + compare |
| FIX-7 | Payment reminder templates registered | Correct — 6 templates (3 generic + 3 micro-loan) |

Migration `20260517000000_sprint16_fixes` adds sourceId column + index on audit table, and idempotencyKey + partial unique index on repayments. Both nullable, backward compatible.

---

## 5. Consolidated findings

### P2 — Must fix (2 total, ~1.5 SP)

| ID | Track | Fix Description | SP |
|---|---|---|---|
| F-BA-S16-3 | B | Floor early settlement total at zero (or remainingPrincipal). Add test for 100%-rebate edge case. | 0.5 |
| F-BA-S16-4 | B | Add integration test confirming `NotificationService.sendNotification` resolves template via `split(':')[0]` when eventType contains installment discriminator. | 1 |

### P3 — PM to disposition (7 total)

| ID | Track | Description |
|---|---|---|
| F-BA-S16-1 | A | Default suspension threshold: confirm `maxDefaultsBeforeSuspension=2` means "suspend on 2nd default" |
| F-BA-S16-2 | A | No post-overdue reminders in micro-loan config (pre-due only) |
| F-BA-S16-5 | B | `SUSPEND_BORROWING` is cross-product — confirm or scope to triggering product |
| F-BA-S16-6 | B | Schedule recalculation failure swallowed silently (no retry/event) |
| F-BA-S16-7 | B | Regulatory aging notifications use fire-and-forget (no delivery guarantee) |
| F-BA-S16-8 | C | `micro_loan_credit_limit_changes` missing tenant_id FK (has RLS, style inconsistency) |
| F-BA-S16-9 | C | `confirmMfaEnrollment` doesn't require re-auth (low severity, not a regression) |

---

## 6. Business requirements compliance

| Requirement | Sprint 16 Coverage | Status |
|---|---|---|
| FR-ML-002.3 (Deactivation guard) | S16-1 | MET |
| FR-ML-003.2 (Credit limit + single-loan validation) | S16-2 | MET |
| FR-ML-004.6 (Payment reminders) | S16-3 + S16-10 + FIX-7 | MET (pre-due) |
| FR-ML-005.1 (Credit limit increase on repayment) | S16-4 + FIX-1 | MET |
| FR-ML-005.2 (Limit reduction on default) | S16-5 + FIX-1 | MET |
| FR-ML-005.3 (Limit change audit) | S16-6 | MET |
| FR-RP-002 (Early settlement) | S16-8 + S16-9 | MET (formula correct, floor missing) |
| FR-RP-003 (Payment reminders — generic) | S16-10 + FIX-4 + FIX-7 | MET |
| FR-DM-001 (Configurable aging) | S16-11 + S16-12 | MET |
| FR-DM-003 (Aging actions) | S16-12 | MET |
| CLAUDE.md (Decimal math) | All tracks + FIX-6 | MET (no float arithmetic remains) |
| CLAUDE.md (idempotencyKey on mutations) | FIX-3 | MET |
| All BA S15 P2 findings | Track C | ALL CLOSED |
| F-S14-A1 (outbound webhook audit) | S16-FIX-6 | CLOSED |

---

## 7. Verdict

**CONDITIONAL SIGN-OFF.** Sprint 16 is a well-executed delivery that closes all outstanding BA findings from Sprint 15, implements the full micro-loan product logic with proper financial-grade arithmetic, and fills critical repayment engine gaps. The fix cycle was thorough — 63 new tests, two new migrations, and template registration that makes reminders actually functional.

Two P2 findings require resolution before Sprint 17 can build on top of the early settlement and reminder infrastructure. Total estimated fix effort: 1.5 SP. Seven P3 findings are advisory and can be dispositioned by the PM.

Sprint 14 finding F-S14-A1 (outbound webhook delivery audit) is now **fully closed** after three sprints. All carry-forward items from Sprint 14 and 15 are resolved.

---

*Document prepared by: BA Agent | 2026-05-17 | Sprint 16 Review v1.0*
