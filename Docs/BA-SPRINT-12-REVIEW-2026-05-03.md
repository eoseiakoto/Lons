# BA Sprint 12 Delivery Review

**Date:** 2026-05-03
**Reviewer:** Business Analyst (Claude)
**Sprint:** 12 — Invoice Factoring + BNPL Carry-Forward
**Reference Specs:** `SPEC-invoice-factoring.md`, `Docs/01-loan-portfolio.md` (FR-IF-001–FR-IF-004), `Docs/BA-SPRINT-11-REVIEW-2026-05-02.md`
**Delivery Notes:** `Docs/DELIVERY-NOTES-SPRINT-12-2026-05-03.md`, `Docs/DEV-SPRINT-12-2026-05-03.md`
**Verdict:** Conditional sign-off — **8 findings** (2 P1, 3 P2, 3 P3)

---

## 1. Scope Verification

### 1.1 Sprint 12 Committed Items — Delivery Status

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Prisma schema (Debtor + Invoice + 4 enums) | ✅ Delivered | Exact match to SPEC §2.2 and §3.1 |
| 2 | Event contracts (25 events) | ✅ Delivered | 16 invoice + 5 debtor + 2 concentration + 2 recourse |
| 3 | DebtorService (CRUD + risk + exposure) | ✅ Delivered | 22 tests |
| 4 | InvoiceSubmissionService (submit + verify) | ✅ Delivered | 13 tests |
| 5 | FactoringOriginationService (Steps 3–9) | ✅ Delivered | 27 tests |
| 6 | ReserveService (debtor payment + reserve release) | ✅ Delivered | 19 tests |
| 7 | RecourseService (default + write-off) | ✅ Delivered | 10 tests |
| 8 | ConcentrationLimitService (4-dimension check) | ✅ Delivered | 13 tests |
| 9 | InvoiceAgingService (7-bucket model) | ✅ Delivered | 14 + 4 scheduler tests |
| 10 | GraphQL resolvers (6 queries + 15 mutations) | ✅ Delivered | 21 tests |
| 11 | REST seller-facing API (7 endpoints) | ✅ Delivered | 13 tests |
| 12 | Admin portal: debtor + invoice + concentration screens | ✅ Delivered | 16 new files |
| 13 | Product wizard IF step + customer Invoices tab | ✅ Delivered | Wizard now 9-step for IF |
| 14 | Lifecycle integration tests (4 scenarios) | ✅ Delivered | Happy path, partial, default, concentration |
| 15 | G2 BNPL auto-collection on due dates | ✅ Delivered | Scheduler job + adapter + events |
| 16 | G3 BNPL early settlement / advance payment | ✅ Delivered | Two new mutations + wallet collection |
| 17 | G5 bnplConfig migration | ✅ Delivered | Additive column + back-fill |
| 18 | F-BN-1 partial refund net clawback fix | ✅ Delivered | See §2.1 |
| 19 | F-OD-1 idempotencyKey passthrough fix | ✅ Delivered | See §2.2 |
| — | i18n locale mirroring (all 6 non-English locales) | ✅ Delivered | 2,141 keys each, English fallback |

**All 19 committed items delivered.** Test count: 403 process-engine + 14 scheduler + 21 GraphQL + 13 REST = 451 tests.

### 1.2 Pre-Sprint Fix Verification

**F-BN-1 (P1 — partial refund net clawback):** Verified. `bnpl-refund.service.ts` lines 257–259 now compute `partialNetClawback = amount − bankersRound(amount × discountRate)`, matching the full-refund logic at lines 179–181. The merchant only receives `(1 − discountRate)` of the settlement; the clawback now correctly mirrors that net amount instead of clawing back gross. Regression test present.

**F-OD-1 (P3 — waiveOverdraftPenalties idempotencyKey):** Verified. `overdraft.resolver.ts` line 348 now uses `idempotencyKey` (no underscore prefix) and passes it through to `creditLineService.waivePenalties`. Service signature extended with optional `idempotencyKey` parameter.

---

## 2. Business Requirements Cross-Reference

### 2.1 SPEC-invoice-factoring.md Compliance

| SPEC Section | Requirement | Delivered | Gap? |
|---|---|---|---|
| §2.2 Debtor schema | 18+ fields, unique constraint, indexes | ✅ | — |
| §2.3 Risk assessment | Internal score 0–100, rule-based v1 | ✅ | See F-IF-3 |
| §2.4 Concentration limits | 4 dimensions (debtor%, debtor abs, industry%, seller-debtor%) | ✅ | — |
| §3.1 Invoice schema | 30+ fields, 14-status enum, verification enum, recourse enum | ✅ | — |
| §3.2 Status transitions | submitted → … → settled, with branches for rejected/cancelled/disputed/defaulted | ✅ | — |
| §3.3 Verification | 3-level (waived/automated/manual) with configurable thresholds | ✅ | — |
| §4.1 Steps 1–2 | Submission + verification routing | ✅ | — |
| §4.1 Step 3 | Offer generation with advance rate formula | ✅ | — |
| §4.1 Steps 4–5 | Accept/decline + disbursement | ✅ | — |
| §4.1 Step 6 | Debtor notification | ✅ (mock) | — |
| §4.1 Steps 7–8 | Debtor payment + reserve release | ✅ | — |
| §4.1 Step 9 | Settlement + exposure decrement | ✅ | — |
| §4.2 Advance rate formula | base + debtor + tenor + seller adjustments, clamp [60%, 95%] | ✅ | — |
| §5.1 With recourse | Grace period → seller collection → collections workflow | ✅ | See F-IF-4 |
| §5.2 Without recourse | Write-off + reserve return + exposure decrement | ✅ | — |
| §5.3 Non-recourse eligibility | Risk score ≥ 70, payment history ≥ 6, tenor ≤ 90, feeMultiplier | ✅ | — |
| §6.1 Standard reserve release | Full payment → release full reserve | ✅ | — |
| §6.2 Partial reserve release | Surplus past advance + fees | ✅ | — |
| §6.3 Auto vs manual | `autoReserveRelease` + `manualReleaseAbove` thresholds | ✅ | — |
| §7.1 Aging buckets | 7 buckets, configurable thresholds, daily cron | ✅ | — |
| §7.2 Debtor payment tracking | Historical behavior, reliability score, re-assessment post-payment | ✅ | See F-IF-3 |
| §8 Reverse factoring | FR-IF-003 — v1 excluded per spec | ✅ (deferred) | — |
| §9 Event types | 25 events matching spec list | ✅ | 3 bonus events beyond spec |
| §10.1 Admin screens (5) | Debtor list/detail, invoice pipeline/detail, concentration dashboard | ✅ | See F-IF-5 |
| §10.2 Updated screens | Product wizard IF step, customer Invoices tab, collections defaults | ✅ | — |

### 2.2 Docs/01-loan-portfolio.md FR Coverage

| Requirement | Description | Status |
|---|---|---|
| FR-IF-001 | Standard factoring — seller submits, platform advances, collects from debtor | ✅ Delivered |
| FR-IF-002 | AI risk analysis — analyze invoice characteristics, debtor patterns, industry | Partial (v1 rule-based) |
| FR-IF-003 | Reverse factoring — buyer-initiated flow | Deferred to post-v1 per SPEC §8 |
| FR-IF-004 | Dynamic pricing — advance rate varies by risk factors | ✅ Delivered |

FR-IF-002 note: The SPEC explicitly defers ML scoring to Phase 5+. The rule-based v1 model is accepted for Sprint 12 scope, but this should remain tracked as a backlog item for Sprint 14+.

---

## 3. Findings

### F-IF-1 (P1): Offer expiry not implemented — SPEC §4.1 Step 3 specifies `expiresAt`

**SPEC reference:** §4.1 Step 3 shows the offer response includes `"expiresAt": "2026-04-15T23:59:59Z"`. This implies a time-bound offer window. However:

- The `Invoice` model has no `offerExpiresAt` field.
- `FactoringOriginationService.generateOffer()` does not compute or persist an expiry timestamp.
- `acceptOffer()` does not validate whether the offer has expired.
- There is no scheduler job to auto-cancel stale offers.

**Business impact:** Without offer expiry, a seller could accept a factoring offer days or weeks after market conditions (and debtor risk profile) have changed, exposing the platform to stale-rate risk. For African markets with volatile exchange rates, this is financially significant.

**Recommendation:** Add `offerExpiresAt DateTime?` to the Invoice model. `generateOffer()` should compute it from `product.factoringConfig.offerValidityHours` (default 48h). `acceptOffer()` should reject expired offers. A daily scheduler job should transition expired `offer_generated` invoices to `cancelled`. Sprint 13 scope.

---

### F-IF-2 (P1): Debtor payment matching is purely manual — no inbound payment reconciliation hook

**SPEC reference:** §4.1 Step 7 states "If debtor pays via wallet/bank transfer referencing the invoice → match payment to invoice." The delivery notes confirm (known limitation #7): "currently manual via the admin portal."

**What exists:** `ReserveService.recordDebtorPayment()` requires an operator to manually identify the invoice and record the payment amount via the admin portal `recordInvoiceDebtorPayment` mutation.

**What's missing:** There is no inbound webhook or bank-feed listener that auto-matches a debtor's bank transfer to an invoice. In the African B2B context, debtors pay via mobile money or bank transfer, and the platform has no way to detect or process those inbound payments without operator intervention for every single invoice.

**Business impact:** At scale (hundreds of invoices across multiple sellers and debtors), manual payment matching becomes the operational bottleneck. Every debtor payment requires an operator action before the reserve can release and the seller gets paid. This delays the seller's cash flow — the exact problem factoring is supposed to solve.

**Recommendation:** This is correctly flagged as a known limitation and deferred to Sprint 13+. However, the BA notes that the inbound payment webhook endpoint should be scoped into Sprint 13 as a priority, not a backlog "nice to have." Even a basic `POST /v1/invoices/payment-webhook` that accepts a bank reference + amount and attempts auto-matching (by `debtorPaymentRef` or `invoiceNumber`) would eliminate the majority of manual work. Alternatively, the reconciliation-service batch (Docs/06-post-process.md §3) should be extended with a factoring auto-match step.

---

### F-IF-3 (P2): Debtor risk score uses `updatedAt` as payment-date proxy — no actual payment timestamp

**SPEC reference:** §2.3 specifies "average payment delay (days after due date)" and §7.2 requires "average days to payment."

**Implementation:** `debtor.service.ts` `assessRisk()` computes the reliability score by comparing each invoice's `dueDate` to its `updatedAt` timestamp. The code comments explicitly acknowledge this as a v1 limitation: "Uses updatedAt as proxy for actual payment date."

**Problem:** `updatedAt` changes on any mutation — not just payment receipt. If an operator edits the invoice metadata, adds verification notes, or triggers a reserve release, `updatedAt` advances and the computed "payment delay" becomes meaningless. This produces unreliable risk scores that feed back into advance rate calculations (§4.2 `debtorAdjustment`), creating a financial accuracy concern.

**Recommendation:** The `Invoice` model should track a dedicated `debtorPaidAt DateTime?` field (set when status first transitions to `payment_received`). The risk assessment should use `debtorPaidAt - dueDate` rather than `updatedAt - dueDate`. This is a schema change + minor service update — low complexity, high business value. Sprint 13 scope.

---

### F-IF-4 (P2): With-recourse grace-period scheduler job not implemented

**SPEC reference:** §5.1 step 3 describes the seller collection flow after the grace period elapses. The delivery notes (known limitation #4) confirm: "the actual scheduled deduction job is deferred."

**Implementation:** `RecourseService.handleWithRecourse()` correctly writes `metadata.recourseGraceEndAt` and `recourseAmount` breadcrumbs. `enforceGracePeriodElapsed()` exists and correctly routes to the CollectionsAction workflow. However, there is no scheduler job that scans for invoices where `recourseGraceEndAt < now` and calls `enforceGracePeriodElapsed`.

**Business impact:** With-recourse defaults enter a dead zone after the grace period expires. No system picks them up automatically. Operators must manually identify expired grace periods and trigger collection — which defeats the purpose of the configurable grace-period mechanism.

**Recommendation:** Add a daily scheduler job (similar to `invoice-aging.job.ts`) that scans for defaulted with-recourse invoices whose `metadata.recourseGraceEndAt` has elapsed and calls `RecourseService.enforceGracePeriodElapsed`. Sprint 13 scope — the delivery notes already recommend this.

---

### F-IF-5 (P2): Invoice verification queue is not a dedicated screen

**SPEC reference:** §10.1 item 4 specifies "Invoice Verification Queue — invoices requiring manual verification. Operator reviews documents, may record debtor confirmation call, approves or rejects."

**Implementation:** The admin portal has the invoice pipeline page (`loans/factoring/page.tsx`) with filter-by-status capability and a kanban view. Operators can filter to `under_review` status. The invoice detail page (`loans/factoring/[id]/page.tsx`) includes a `VerifyInvoiceModal` for approve/reject actions.

**Gap:** There is no dedicated queue screen. The SPEC envisions a purpose-built view where operators see only pending-verification invoices with document previews, debtor confirmation tracking, and batch actions. The current implementation requires the operator to filter the general pipeline to `under_review`, then click into each invoice individually.

**Business impact:** Low volume → acceptable. High volume → operator productivity issue. This is an ergonomic gap, not a functional gap. The approve/reject mechanics work correctly.

**Recommendation:** Add a dedicated `/loans/factoring/verification-queue` page that defaults to `under_review` filter, shows document thumbnails inline, and supports batch approve/reject. Sprint 14 backlog — low priority given the filter workaround exists.

---

### F-IF-6 (P3): `funded` status missing from aging scan — invoices between funding and debtor notification are invisible to aging

**SPEC reference:** §7.1 aging applies to all funded-but-unpaid invoices.

**Implementation:** `invoice-aging.service.ts` line 34 defines `ACTIVE_INVOICE_STATUSES` as `[debtor_notified, payment_received]`. The `funded` status is excluded.

**Problem:** Between `funded` and `debtor_notified` there is a window (potentially days, if the notification dispatch is delayed or if the operator hasn't triggered notification) where the invoice has money outstanding but is invisible to the aging scan. If an operator funds an invoice but forgets to trigger debtor notification, the invoice never appears in aging — it could silently age past due without any system awareness.

**Recommendation:** Add `InvoiceStatus.funded` to `ACTIVE_INVOICE_STATUSES`. The aging classification logic already handles pre-due invoices correctly (they'd land in `Current` or `Approaching`). Sprint 13 fix.

---

### F-IF-7 (P3): Debtor nested resolvers missing on InvoiceType — admin portal shows truncated UUIDs

**SPEC reference:** §10.1 items 2–3 require debtor and seller names to be visible in the invoice pipeline and detail views.

**Implementation:** The delivery notes (known limitation #8) confirm: "admin portal currently renders truncated UUIDs for debtor/seller names in some tables because the GraphQL InvoiceType doesn't have nested debtor/seller resolvers yet."

**Business impact:** Operators cannot identify invoices by debtor or seller name at a glance. They must click through to the detail page to see the debtor company name. This is a significant UX degradation for the invoice pipeline and verification workflows.

**Recommendation:** Add `@ResolveField(() => DebtorType)` and `@ResolveField(() => CustomerType)` decorators on the factoring resolver to resolve `invoice.debtor` and `invoice.seller` nested objects. Low-complexity, high-UX-impact. Sprint 13 fix.

---

### F-IF-8 (P3): Early settlement discount applied to total remaining balance, not outstanding principal

**SPEC reference:** Not explicitly specified in SPEC-invoice-factoring.md (this is a BNPL carry-forward item, G3).

**Implementation:** `bnpl-installment.service.ts` `earlySettlement()` lines 782–799 compute the discount on `totalRemaining`, which is the sum of full `inst.amount` values for pending installments. However, if a customer has already made partial payments toward some of those installments (i.e., `inst.paidAmount > 0` on a pending installment), the discount is applied to the full installment amount rather than the remaining balance (`inst.amount - inst.paidAmount`).

**Example:** If installment #3 is `1000.00` but the customer already paid `400.00`, the remaining owed is `600.00`. The early settlement discount should be applied to `600.00`, not `1000.00`. The current logic applies the discount to `1000.00` and then marks `paidAmount = 1000.00`, which could lead to the customer being charged less than they should be (discount on already-paid amounts) or the books not balancing correctly.

**Recommendation:** Change the `totalRemaining` calculation to sum `subtract(inst.amount, inst.paidAmount)` for pending installments. Update the installment closure to set `paidAmount` to `inst.amount` only when the payment amount covers the remaining balance. Sprint 13 fix.

---

## 4. Spec Gaps and Observations

These are not findings against the delivery — the delivery correctly implements what the spec says. These are gaps in the spec itself that should be addressed before production deployment.

### SG-IF-1: SPEC §4.1 Step 3 does not specify the advance rate adjustment table

The SPEC says `debtorAdjustment = f(debtor.internalRiskScore)` with a note "−10% to +5%" but does not define the exact brackets. The implementation uses: `≥80` → +5, `70–79` → +2, `50–69` → 0, `30–49` → −5, `<30` → −10. These values are reasonable but were not specified by the BA. The SPEC should be updated to document the implemented brackets so they become the official business rule.

### SG-IF-2: SPEC does not define concentration limit enforcement timing

The SPEC says concentration limits are "checked at invoice submission time." The implementation correctly blocks at submission. However, the SPEC does not address what happens when a debtor's existing invoices settle (reducing exposure) — should invoices previously blocked by concentration limits be retried? The current answer is "no" (the seller must re-submit), which is pragmatic but should be documented.

### SG-IF-3: SPEC §5.1 with-recourse sweep mechanism not detailed

Step 3 of §5.1 says "Deduct from seller's pending reserve releases on other invoices." The implementation (`enforceGracePeriodElapsed`) routes directly to CollectionsAction without attempting the reserve sweep. This is acknowledged as a v1 limitation in the code comments. The SPEC should be updated to clarify that reserve sweep is a Phase 5+ enhancement and that v1 routes directly to collections.

### SG-IF-4: SPEC does not address currency mismatch between seller invoices

In a multi-currency market (GHS, NGN, KES, etc.), a debtor might owe on invoices denominated in different currencies. The concentration limit service sums `faceValue` across all active invoices regardless of currency. If Debtor X has GHS 100,000 and KES 500,000 in active invoices, the concentration check sums these as if they're in the same unit. This could produce misleading concentration percentages. The SPEC should specify whether concentration limits are per-currency or cross-currency (with FX conversion).

---

## 5. Financial Accuracy Verification

| Check | Result |
|---|---|
| Monetary fields use Decimal (not float/number) | ✅ All Prisma fields are `@db.Decimal(19,4)` |
| API responses serialize as strings | ✅ Event payloads + GraphQL types use string |
| Banker's rounding applied | ✅ `bankersRound()` from `@lons/common` used throughout |
| Ledger entries are append-only | ✅ Only `create()` calls, no updates or deletes |
| Double-entry bookkeeping | ✅ Disbursement creates 4 entries; reserve release creates 2 |
| Debtor exposure atomically updated | ✅ Prisma `increment` operator for concurrent safety |
| Reserve math (faceValue = advanced + reserve) | ✅ Verified in `generateOffer()` |
| Discount fee formula (advanced × rate × days/365) | ✅ Verified in `generateOffer()` |
| Non-recourse fee multiplier | ✅ Applied to `discountFee` only, not `serviceFee` |
| Net disbursement = advanced − discountFee − serviceFee | ✅ Verified |
| Write-off loss = advanced − received | ✅ Verified in `handleWithoutRecourse()` |

---

## 6. Multi-Tenancy Verification

| Check | Result |
|---|---|
| Every DB query scoped by tenantId | ✅ All `findFirst`/`findMany`/`create`/`update` include `tenantId` |
| No cross-tenant data access | ✅ No raw SQL, no unscoped queries |
| Events carry tenantId | ✅ All `emitAndBuild` calls pass `tenantId` |
| GraphQL resolvers use `@CurrentTenant()` | ✅ All 21 resolver methods |
| REST controller uses `ApiKeyGuard` + `req.tenantId` | ✅ All 7 endpoints |
| Scheduler jobs use `enterTenantContext` | ✅ Both aging and auto-collect jobs |

---

## 7. Event Contract Verification

All 25 event types defined in `factoring-events.ts` are emitted by the corresponding services:

| Event | Emitter | Verified |
|---|---|---|
| INVOICE_SUBMITTED | InvoiceSubmissionService | ✅ |
| INVOICE_UNDER_REVIEW | InvoiceSubmissionService | ✅ |
| INVOICE_VERIFIED | InvoiceSubmissionService + resolveVerification | ✅ |
| INVOICE_REJECTED | InvoiceSubmissionService (resolveVerification) | ✅ |
| INVOICE_OFFER_GENERATED | FactoringOriginationService | ✅ |
| INVOICE_OFFER_ACCEPTED | FactoringOriginationService | ✅ |
| INVOICE_OFFER_DECLINED | FactoringOriginationService | ✅ |
| INVOICE_FUNDED | FactoringOriginationService | ✅ |
| INVOICE_DEBTOR_NOTIFIED | FactoringOriginationService | ✅ |
| INVOICE_PAYMENT_RECEIVED | ReserveService | ✅ |
| INVOICE_PAYMENT_PARTIAL | ReserveService | ✅ |
| INVOICE_RESERVE_RELEASED | ReserveService | ✅ |
| INVOICE_SETTLED | FactoringOriginationService | ✅ |
| INVOICE_DISPUTED | FactoringOriginationService | ✅ |
| INVOICE_DEFAULTED | RecourseService | ✅ |
| INVOICE_CANCELLED | FactoringOriginationService | ✅ |
| DEBTOR_CREATED | DebtorService | ✅ |
| DEBTOR_RISK_ASSESSED | DebtorService | ✅ |
| DEBTOR_SUSPENDED | DebtorService | ✅ |
| DEBTOR_BLACKLISTED | DebtorService | ✅ |
| DEBTOR_EXPOSURE_CHANGED | DebtorService | ✅ |
| CONCENTRATION_LIMIT_WARNING | ConcentrationLimitService | ✅ |
| CONCENTRATION_LIMIT_BREACHED | ConcentrationLimitService | ✅ |
| RECOURSE_ENFORCEMENT_INITIATED | RecourseService | ✅ |
| NON_RECOURSE_WRITE_OFF | RecourseService | ✅ |

3 bonus events beyond spec (INVOICE_CANCELLED, RECOURSE_ENFORCEMENT_INITIATED, NON_RECOURSE_WRITE_OFF) are welcome additions for operational observability.

---

## 8. BNPL Carry-Forward Verification

### G2 (Auto-collection on due dates)
- Scheduler job runs daily at 06:00 UTC with per-tenant fan-out. ✅
- Mock adapter uses deterministic hash for predictable testing. ✅
- `collectInstallment()` validates installment status, transaction status, auto-collect config, max retry attempts. ✅
- Failed collection emits both `BNPL_INSTALLMENT_COLLECTION_FAILED` and `WALLET_BALANCE_INSUFFICIENT`. ✅
- Success path routes through standard `processInstallmentPayment()` for event parity. ✅
- New Prisma fields (`lastCollectionAttemptAt`, `collectionAttemptCount`) tracked. ✅

### G3 (Early settlement / advance payment)
- `earlySettlement()` validates product config (`earlySettlementAllowed`), sums remaining balance, applies discount percent, processes wallet collection, marks all pending installments paid, transitions to completed. ✅
- Idempotency: replay on already-completed transaction returns cached result. ✅
- `advancePayment()` validates each requested installment number, processes single wallet collection for summed amount, marks each paid. ✅
- Transaction completion check fires `BNPL_PURCHASE_COMPLETED` for parity. ✅
- Both methods emit their own events (`BNPL_EARLY_SETTLEMENT`, `BNPL_ADVANCE_PAYMENT`). ✅
- **Note:** See F-IF-8 regarding discount calculation on partially-paid installments.

### G5 (bnplConfig migration)
- Migration adds `bnpl_config JSONB` column to `products`, back-fills from `overdraft_config` for BNPL products. ✅
- All BNPL services read from `product.bnplConfig` with fallback to `overdraftConfig` for un-migrated products. ✅
- Backward compatible — existing BNPL products continue to work via fallback. ✅

---

## 9. Admin Portal Verification

| Screen | SPEC §10 Requirement | Delivered | Notes |
|---|---|---|---|
| Debtor list | Search, filter by status/industry/country | ✅ | Risk badges, status badges, action buttons |
| Debtor detail | Contact info, risk score, payment history, exposure, invoices | ✅ | Reassess risk button, exposure progress bar |
| Invoice pipeline | Kanban or list view by status, filters | ✅ | Both kanban and list modes, full filter set |
| Invoice detail | Full lifecycle view, offer terms, payment tracking | ✅ | Timeline component, action panel, financial terms |
| Concentration dashboard | Top 10 debtors, industry breakdown, utilization gauges | ✅ | Separate page with 4 gauge types |
| Verification queue | Dedicated queue for manual review | ⚠️ | See F-IF-5 — no dedicated screen, uses pipeline filter |
| Product wizard IF step | Advance rate, discount, recourse, verification, concentration, aging | ✅ | 9-step wizard, cross-field validation |
| Customer Invoices tab | Seller's invoices, funded amounts, reserve balances | ✅ | Conditionally visible |
| Collections defaults | Factoring defaults with recourse distinction | ✅ | Debtor vs seller collection, grace countdown |

i18n: All 6 non-English locales have English placeholders for new IF keys. Real translations are a translator follow-up. The fallback mechanism (3-step lookup: locale → en → raw key) is verified.

---

## 10. Disposition

### Conditional Sign-Off

Sprint 12 is approved for merge with the following conditions:

**Before Sprint 13 starts (mandatory):**

1. **F-IF-1 (P1):** Offer expiry — add `offerExpiresAt` field, compute on offer generation, validate on accept, add scheduler for stale offers. This is a financial risk control that must be in place before real invoices flow through the system.

2. **F-IF-6 (P3):** Add `funded` to aging `ACTIVE_INVOICE_STATUSES`. Single-line fix, prevents invoices from being invisible to aging between funding and debtor notification.

**Sprint 13 scope (tracked):**

3. **F-IF-2 (P1):** Inbound payment webhook or reconciliation-service auto-match for debtor payments. Manual matching is the operational bottleneck for factoring at scale.

4. **F-IF-3 (P2):** Add `debtorPaidAt` field to Invoice and use it in risk assessment instead of `updatedAt`.

5. **F-IF-4 (P2):** Grace-period expiry scheduler job for with-recourse defaults.

6. **F-IF-7 (P3):** Add debtor/seller nested resolvers on InvoiceType to eliminate truncated UUIDs in admin portal.

7. **F-IF-8 (P3):** Fix early settlement discount calculation to use remaining balance rather than full installment amounts.

**Backlog (Sprint 14+):**

8. **F-IF-5 (P2):** Dedicated verification queue screen.

### Spec Updates Required

The following spec updates should be filed before Sprint 13 planning:

- SG-IF-1: Document the advance rate adjustment brackets as implemented.
- SG-IF-2: Document concentration limit enforcement timing (submission-only, no auto-retry).
- SG-IF-3: Clarify with-recourse reserve sweep is Phase 5+, v1 routes to collections.
- SG-IF-4: Address cross-currency concentration limit calculation.

---

**Signed:** Business Analyst (Claude)
**Date:** 2026-05-03
