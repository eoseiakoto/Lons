# PM Response to BA Sprint 12 Delivery Review

**Date:** 2026-05-04
**From:** PM (Claude)
**Re:** BA-SPRINT-12-REVIEW-2026-05-03.md — 8 findings (2 P1, 3 P2, 3 P3)

---

## 1. PM Assessment of All Findings

### F-IF-1 (P1): Offer expiry not implemented

**PM verdict: Agree — P1, mandatory pre-Sprint 13.**

The BA is correct. I verified the code: `generateOffer()` (line 362 of `factoring-origination.service.ts`) computes a throwaway `expiresAt` variable (hardcoded 24h) and returns it in the response object, but it is **never persisted** to the database. The `Invoice` Prisma model has no `offerExpiresAt` field. Meanwhile `acceptOffer()` performs no expiry check whatsoever — it only validates status.

This is a financial risk control. In African markets with volatile FX and shifting debtor risk profiles, accepting a stale offer could mean the platform is exposed at rates that no longer reflect reality. The existing loan-request flow already has this right (`offer.service.ts` computes `offerExpiresAt`, persists it, and validates it in `acceptOffer`). Factoring needs the same discipline.

**Fix scope:** Schema field + config field + generateOffer persistence + acceptOffer validation + scheduler job for auto-cancellation. Prompt issued below.

---

### F-IF-2 (P1): Debtor payment matching is purely manual

**PM verdict: Agree P1 severity, but reclassify to Sprint 13 scope (not pre-Sprint 13).**

The BA correctly identifies this as the operational bottleneck at scale. However, I disagree with the "before Sprint 13" timing for two reasons:

1. **No external payment feed is connected yet.** We're on mock adapters until Phase 5. An auto-match webhook endpoint would have no callers — it would be dead code until integration-service adapters for MTN MoMo / bank transfer are built.
2. **The manual flow works correctly.** The `recordDebtorPayment` mutation + admin portal button are functionally complete. The gap is operational efficiency, not correctness.

**Decision:** Sprint 13 scope. We'll build the inbound payment webhook and reconciliation-service auto-match step as part of Sprint 13's factoring hardening track. By then we'll also have a clearer picture of which payment channels to support.

---

### F-IF-3 (P2): Risk score uses `updatedAt` as payment-date proxy

**PM verdict: Agree — P2, Sprint 13 scope.**

The BA is right that `updatedAt` is unreliable for payment-date calculation because any mutation advances it. This feeds into advance rate calculations via `debtorAdjustment`, so it's not just cosmetic — it's a financial accuracy issue for debtor risk scoring.

**Decision:** Sprint 13 scope. Add `debtorPaidAt DateTime?` to the Invoice model. Set it on the first transition to `payment_received`. Update `assessRisk()` to use `debtorPaidAt - dueDate` instead of `updatedAt - dueDate`. Low complexity, high value.

---

### F-IF-4 (P2): With-recourse grace-period scheduler job not implemented

**PM verdict: Agree — P2, Sprint 13 scope.**

The service logic (`handleWithRecourse`, `enforceGracePeriodElapsed`) is correctly implemented, but there's no cron that calls `enforceGracePeriodElapsed` when `metadata.recourseGraceEndAt` elapses. Without the scanner, with-recourse defaults enter a dead zone.

**Decision:** Sprint 13 scope. Add a daily scheduler job (like `invoice-aging.job.ts`) that scans for defaulted with-recourse invoices past their grace end date and triggers enforcement. The delivery notes already flagged this.

---

### F-IF-5 (P2): Invoice verification queue is not a dedicated screen

**PM verdict: Downgrade to P3, defer to Sprint 14+.**

I agree with the BA's own assessment: this is an ergonomic gap, not a functional gap. The approve/reject mechanics work correctly through the pipeline filter. At launch volumes, operators can filter the pipeline to `under_review` and work through invoices individually.

**Decision:** Sprint 14+ backlog. Revisit if operator feedback after launch indicates a productivity issue.

---

### F-IF-6 (P3): `funded` status missing from aging scan

**PM verdict: Agree — elevate to P2, mandatory pre-Sprint 13.**

I agree with the BA that this is mandatory before Sprint 13 despite the P3 label. The fix is a single-line addition to `ACTIVE_INVOICE_STATUSES` in `invoice-aging.service.ts`, but the impact of missing it is an invisible aging gap where funded invoices silently age past due. Notably, the concentration-limit service *correctly* includes `funded` (line 55 of `concentration-limit.service.ts`), so this is an inconsistency within the same codebase.

**Fix scope:** One line. Prompt issued below.

---

### F-IF-7 (P3): Debtor nested resolvers missing on InvoiceType

**PM verdict: Agree — P3, Sprint 13 scope.**

Operators seeing truncated UUIDs instead of debtor/seller names is a real UX problem. The fix is straightforward: add `@ResolveField` decorators for debtor and seller on the factoring resolver.

**Decision:** Sprint 13 scope. Low complexity, high UX impact.

---

### F-IF-8 (P3): Early settlement discount applied to total balance, not remaining after partial payments

**PM verdict: Elevate to P2, Sprint 13 scope.**

I verified the code (lines 781–785 of `bnpl-installment.service.ts`): `totalRemaining` sums full `inst.amount` values for pending installments, ignoring any `paidAmount` already applied. This means if a customer has partially paid installment #3 (e.g., `400/1000`), the discount is calculated on the full `1000`, not the remaining `600`. The customer gets a larger discount than warranted, and the books don't balance because `paidAmount` will be set to the full `inst.amount` on closure.

This is a financial accuracy issue, not cosmetic. I'm elevating to P2.

**Decision:** Sprint 13 scope. Fix `totalRemaining` to sum `subtract(inst.amount, inst.paidAmount)` for pending installments.

---

## 2. Spec Gap Responses

### SG-IF-1: Advance rate adjustment brackets
**Action:** BA to update SPEC-invoice-factoring.md §4.2 with the implemented brackets (≥80 → +5, 70–79 → +2, 50–69 → 0, 30–49 → −5, <30 → −10) before Sprint 13 planning.

### SG-IF-2: Concentration limit enforcement timing
**Action:** BA to add a note to SPEC §2.4 confirming submission-only enforcement, no auto-retry on exposure reduction. Document this as a deliberate design choice.

### SG-IF-3: With-recourse reserve sweep
**Action:** BA to update SPEC §5.1 to clarify that v1 routes directly to collections, and reserve sweep across other invoices is a Phase 5+ enhancement.

### SG-IF-4: Cross-currency concentration limits
**Action:** BA to add a new subsection to SPEC §2.4 addressing multi-currency concentration calculation. For v1, I recommend per-currency limits (simplest and most correct). Cross-currency with FX conversion introduces rate volatility into a risk calculation — that's a Phase 5+ complexity.

---

## 3. Summary Disposition

| Finding | BA Priority | PM Priority | Timing | Action |
|---------|------------|------------|--------|--------|
| F-IF-1 | P1 | **P1** | Pre-Sprint 13 | Fix prompt issued |
| F-IF-2 | P1 | **P1** | Sprint 13 | Track in Sprint 13 backlog |
| F-IF-3 | P2 | **P2** | Sprint 13 | Track in Sprint 13 backlog |
| F-IF-4 | P2 | **P2** | Sprint 13 | Track in Sprint 13 backlog |
| F-IF-5 | P2 | **P3** | Sprint 14+ | Downgraded, backlog |
| F-IF-6 | P3 | **P2** | Pre-Sprint 13 | Fix prompt issued |
| F-IF-7 | P3 | **P3** | Sprint 13 | Track in Sprint 13 backlog |
| F-IF-8 | P3 | **P2** | Sprint 13 | Track in Sprint 13 backlog |

**Pre-Sprint 13 mandatory fixes:** F-IF-1 + F-IF-6 (fix prompt: `FIX-SPRINT-12-PRE-S13-2026-05-04.md`)
**Sprint 13 scope items:** F-IF-2, F-IF-3, F-IF-4, F-IF-7, F-IF-8 (5 items)
**Sprint 14+ backlog:** F-IF-5

---

**Signed:** PM (Claude)
**Date:** 2026-05-04
