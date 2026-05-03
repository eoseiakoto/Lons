# BA Review: Sprint 12 Plan — Invoice Factoring Product Type

**From:** BA (Claude)
**To:** PM (Claude) / Emmanuel
**Date:** 2026-05-03
**Sprint:** 12 — Invoice Factoring Product Type
**Type:** Plan review — pre-execution assessment
**Reference:** SPEC-invoice-factoring.md, Docs/01-loan-portfolio.md §4 (FR-IF-001 through FR-IF-004)

---

## Executive Summary

Sprint 12 delivers the third of four core product types: Invoice Factoring. The plan has **17 items** — 13 for invoice factoring core, plus 3 carry-forward BNPL items from Sprint 11 (G2, G3, G5) and 1 i18n locale mirroring task. Total story points: ~78.

The invoice factoring items map well to SPEC-invoice-factoring.md and cover the full lifecycle: Prisma schema, debtor CRUD, invoice submission, verification, advance rate calculation, 9-step origination state machine, reserve mechanics, recourse enforcement, concentration limits, aging, GraphQL resolvers, admin portal screens, and tests.

The plan is **well-scoped for a single sprint** — unlike Sprint 13 which is overloaded, Sprint 12 is focused on one product type with a clear spec. However, the review identifies **4 gaps** where spec requirements aren't covered by current items, **2 dependency risks**, and **1 carry-forward item that's missing entirely**.

---

## Sprint 12 Items — Inventory

### Invoice Factoring Core (13 items, ~57 SP)

| # | Item | Priority | SP |
|---|---|---|---|
| 1 | Implement Invoice Factoring Product Type (FR-IF-*) — epic/umbrella | Critical | — |
| 2 | Prisma schema: Debtor, Invoice models + enums + migration | Critical | 5 |
| 3 | Event contracts: Invoice factoring events | High | 3 |
| 4 | Debtor CRUD service + risk assessment | Critical | 5 |
| 5 | Invoice submission + verification flow (configurable) | Critical | 5 |
| 6 | Advance rate calculation engine + factoring origination state machine (9 steps) | Critical | 8 |
| 7 | Reserve mechanics: hold, release (auto/manual) | High | 5 |
| 8 | Recourse enforcement: notification → 7-day grace → deduction | High | 5 |
| 9 | Concentration limit checks (debtor, industry, seller-debtor) | High | 3 |
| 10 | Aging classification for unpaid invoices (30/60/90+) | Medium | 3 |
| 11 | Invoice Factoring unit + integration tests | High | 5 |
| 12 | Admin Portal: Debtor + Invoice management screens | High | 5 |
| 13 | GraphQL resolvers + mutations for Invoice Factoring | Critical | 5 |

### Carry-Forward from Sprint 11 (3 items, ~16 SP)

| # | Item | Priority | SP | Source |
|---|---|---|---|---|
| 14 | BNPL auto-collection on due dates (G2) | High | 8 | BA Sprint 11 Review |
| 15 | BNPL early settlement / advance payoff (G3) | Medium | 5 | BA Sprint 11 Review |
| 16 | Migrate BNPL config from overdraftConfig to bnplConfig (G5) | Medium | 3 | BA Sprint 11 Review |

### i18n (1 item, 5 SP)

| # | Item | Priority | SP |
|---|---|---|---|
| 17 | Mirror 1,088 i18n keys to 6 non-English locale files | Medium | 5 |

---

## Cross-Reference: SPEC-invoice-factoring.md Coverage

### §2 — Debtor Entity Model

| Spec Requirement | Sprint 12 Coverage | Status |
|---|---|---|
| Debtor as separate entity (§2.1) | Item 4 title says "separate entity" | ✅ Covered |
| Prisma schema per §2.2 (14 fields, indexes, unique constraint) | Item 2 | ✅ Covered |
| DebtorStatus enum (active, under_review, suspended, blacklisted) | Item 2 (enums) | ✅ Covered |
| Debtor risk assessment — external rating + internal score (§2.3) | Item 4 (risk assessment) | ✅ Covered |
| Concentration limits (§2.4) — debtor, industry, seller-debtor | Item 9 | ✅ Covered |

### §3 — Invoice Entity Model

| Spec Requirement | Sprint 12 Coverage | Status |
|---|---|---|
| Invoice Prisma schema per §3.1 (30+ fields) | Item 2 | ✅ Covered |
| InvoiceStatus enum (14 states) | Item 2 (enums) | ✅ Covered |
| VerificationStatus enum (pending, verified, failed, waived) | Item 2 (enums) | ✅ Covered |
| RecourseType enum (with_recourse, without_recourse) | Item 2 (enums) | ✅ Covered |
| Invoice status transitions per §3.2 | Item 6 (state machine) | ✅ Covered |
| Verification level determination per §3.3 | Item 5 (configurable) | ✅ Covered |

### §4 — Factoring Origination Flow (9 steps)

| Step | Description | Sprint 12 Coverage | Status |
|---|---|---|---|
| 1 | Invoice submission (seller → API) | Item 5 | ✅ Covered |
| 2 | Risk assessment & verification | Items 4, 5 | ✅ Covered |
| 3 | Offer generation (advance rate calc) | Item 6 | ✅ Covered |
| 4 | Seller accepts offer | Item 6 (state machine) | ✅ Covered |
| 5 | Advance disbursement + ledger entries + debtor exposure update | Item 6 | ✅ Covered |
| 6 | Debtor notification | Item 4 (email-only) | ⚠️ See Finding S12-1 |
| 7 | Debtor payment collection | Item 7 (reserve mechanics) | ⚠️ See Finding S12-2 |
| 8 | Reserve release | Item 7 | ✅ Covered |
| 9 | Completion (contract settled, exposure updated) | Item 6 (state machine) | ✅ Covered |

### §5 — Recourse vs. Non-Recourse

| Spec Requirement | Sprint 12 Coverage | Status |
|---|---|---|
| With-recourse flow (seller collection after debtor default) | Item 8 | ✅ Covered |
| Without-recourse flow (lender absorbs loss, write-off) | Item 8 | ⚠️ Partially — item title mentions only "notification → grace → deduction" which is recourse. Non-recourse write-off path should be explicit. |
| Product-level default + per-invoice override | Item 2 (schema has recourseType) | ✅ Schema covered |
| Non-recourse eligibility criteria (minDebtorRiskScore, etc.) | Not explicitly mentioned in any item | ⚠️ See Finding S12-3 |

### §6 — Reserve Mechanics

| Spec Requirement | Sprint 12 Coverage | Status |
|---|---|---|
| Standard flow (hold → release) | Item 7 | ✅ Covered |
| Partial debtor payment → partial reserve release | Item 7 (title: "hold, release") | ✅ Implied |
| Auto vs. manual release trigger (configurable) | Item 7 title: "auto default, manual above threshold" | ✅ Covered |

### §7 — Aging and Default Classification

| Spec Requirement | Sprint 12 Coverage | Status |
|---|---|---|
| 7 aging buckets (Current → Default at 60+ DPD) | Item 10 | ✅ Covered (title says 30/60/90+, spec says 7 buckets — dev prompt should use spec buckets) |
| Debtor payment tracking (avg days, reliability score, dispute count) | Item 4 (risk assessment recalculation) | ✅ Implied |

### §8 — Reverse Factoring

| Spec Requirement | Sprint 12 Coverage | Status |
|---|---|---|
| Standard factoring only for v1.0 | — | ✅ Correct — spec §8.2 explicitly defers reverse factoring |

### §9 — Event Types

| Spec Requirement | Sprint 12 Coverage | Status |
|---|---|---|
| 16 invoice lifecycle events + 5 debtor events + 2 concentration events | Item 3 | ✅ Covered — item title lists "submission, verification, advance, payment" but dev prompt should include all 23 events from spec |

### §10 — Admin Portal

| Spec Requirement | Sprint 12 Coverage | Status |
|---|---|---|
| Debtor management screen | Item 12 | ✅ Covered |
| Invoice pipeline (kanban/list by status) | Item 12 | ✅ Covered |
| Invoice detail (full lifecycle view) | Item 12 | ✅ Covered |
| Invoice verification queue | Item 12 | ⚠️ Not explicitly mentioned — item says "list, detail, verification" which likely covers it |
| Concentration dashboard | Not in any item | ❌ See Finding S12-4 |
| Product wizard update (IF-specific fields) | Not in any item | ⚠️ See Finding S12-5 |
| Customer detail "Invoices" tab | Not in any item | ⚠️ See Finding S12-5 |
| Collections dashboard update (debtor vs seller collection) | Not in any item | ⚠️ See Finding S12-5 |

### §11 — Contract Model Relationship

| Spec Requirement | Sprint 12 Coverage | Status |
|---|---|---|
| Reuse Contract model with IF-specific field mappings | Item 6 (state machine creates Contract) | ✅ Implied |

### §12 — Test Scenarios

| Spec Requirement | Sprint 12 Coverage | Status |
|---|---|---|
| Happy path, risk scenarios, payment scenarios, dispute scenarios, edge cases | Item 11 | ✅ Covered |

---

## Cross-Reference: FR-IF-001 through FR-IF-004 (Docs/01-loan-portfolio.md)

| Requirement | Sprint 12 | Status |
|---|---|---|
| FR-IF-001.1 — Product configuration (advance rate, discount rate, tenor, industries, fees) | Items 2, 6 | ✅ |
| FR-IF-001.2 — Configurable risk policies (min value, max age, required docs) | Item 5 (verification rules) | ✅ |
| FR-IF-002.1 — Invoice submission via API | Item 5 | ✅ |
| FR-IF-002.2 — Automated risk assessment (AI-driven, debtor creditworthiness, patterns) | Items 4, 6 | ⚠️ Risk assessment is rule-based. AI-driven analysis (FR-IF-002.2 says "AI-driven") is not in Sprint 12. Same pattern as ML scoring — rule-based first is acceptable for v1.0 if PM confirms. |
| FR-IF-002.3 — Financing offer generation | Item 6 | ✅ |
| FR-IF-003.1 — Advance disbursement | Item 6 | ✅ |
| FR-IF-003.2 — Debtor payment collection + remainder remittance | Items 7, 8 | ✅ |
| FR-IF-003.3 — Reverse factoring | N/A | ✅ Deferred per spec §8.2 |
| FR-IF-004.1 — Invoice aging + recovery for overdue | Items 8, 10 | ✅ |
| FR-IF-004.2 — AI-driven recovery/risk pricing | Not in Sprint 12 | ⚠️ Same as FR-IF-002.2 — AI deferred. Acceptable if PM confirms rule-based for v1.0. |

---

## Findings

### S12-1 (MEDIUM — Debtor Notification as Separate Concern)

**Spec §4 Step 6** describes debtor notification as a distinct step: notify the debtor that the invoice has been factored, with new payment instructions (pay to Lōns collection account, not seller). This is legally significant — in many jurisdictions the factor must notify the debtor to have legal standing on the receivable.

Item 4's title mentions "email-only notifications" as part of debtor CRUD, but debtor notification is really part of the origination flow (Step 6 in the state machine), not CRUD. The dev prompt should ensure the origination state machine (Item 6) handles the `funded → debtor_notified` transition with actual email dispatch, not just a status change.

**Recommendation:** PM should clarify in the dev prompt that Item 6 (state machine) must integrate with the notification service for the debtor notification step, and that Item 4 provides the debtor contact info for that dispatch.

### S12-2 (MEDIUM — Debtor Payment Matching)

**Spec §4 Step 7** describes debtor payment collection: matching incoming payments to invoices, handling partial payments, and tracking `amountReceived`. This is a non-trivial reconciliation concern — the debtor pays to a collection account, and the system must match the payment to the correct invoice.

No Sprint 12 item explicitly covers the debtor payment **inbound flow**. Item 7 (reserve mechanics) covers what happens after payment is received, but not how the payment is received and matched. This likely requires:

- A REST endpoint or webhook for debtor payments (similar to the wallet webhook for overdraft)
- Payment-to-invoice matching logic (by reference number, debtor ID + amount)
- Handling of unmatched payments

**Recommendation:** PM should either add a specific item or ensure the dev prompt for Item 6/7 explicitly covers the inbound payment matching flow. This could be simplified for v1.0 with manual payment recording (SP operator enters received payment) while automated matching via bank feeds is deferred.

### S12-3 (LOW — Non-Recourse Eligibility Criteria)

**Spec §5.3** defines non-recourse eligibility: `minDebtorRiskScore: 70`, `minDebtorPaymentHistory: 6`, `maxInvoiceTenorDays: 90`, `feeMultiplier: 1.5`. These are product configuration values that gate whether a specific invoice can be non-recourse.

Item 8 (recourse enforcement) focuses on what happens when default occurs, but the gate that determines whether non-recourse is allowed for a given invoice isn't explicitly covered. The origination flow (Item 6) should check these criteria when a seller requests non-recourse on submission.

**Recommendation:** Include non-recourse eligibility validation in the dev prompt for Item 6 (origination state machine).

### S12-4 (MEDIUM — Concentration Dashboard Missing)

**Spec §10.1** lists 5 admin portal screens. Item 12 covers 3 of them (debtor management, invoice pipeline/detail, verification queue). The **concentration dashboard** — showing top debtors by exposure, industry breakdown, and concentration limit utilization gauges — is not in any item.

For a risk-focused product like invoice factoring, concentration visibility is operationally important. SP risk managers need to see at a glance whether their portfolio is dangerously concentrated in one debtor or industry.

**Recommendation:** Either add a separate item or expand Item 12's scope to include the concentration dashboard. If Sprint 12 is getting too heavy, this could move to Sprint 13 — but it should be tracked.

### S12-5 (LOW — Admin Portal Updates to Existing Screens)

**Spec §10.2** identifies 3 existing screens that need updates for invoice factoring:

- **Product wizard:** IF-specific configuration fields (advance rate range, discount rate, verification rules, recourse default, concentration limits, aging thresholds)
- **Customer detail:** "Invoices" tab for sellers
- **Collections dashboard:** Distinguish debtor collection vs. seller collection

These are not in any Sprint 12 item. They're smaller than new screens but still need implementation. The product wizard update is particularly important — without it, SP operators cannot configure invoice factoring products through the portal.

**Recommendation:** Add to the dev prompt for Item 12 (admin portal screens) or create a separate item.

### S12-6 (HIGH — Missing F-BN-1 Fix)

The Sprint 11 BA review identified **F-BN-1 (P1): Partial refund clawback uses gross amount, not net**. This was flagged as "must fix before Sprint 12 coding begins" because it's a financial incorrectness that overcharges merchants on partial refunds.

This fix is not tracked in any Sprint 12 item on Monday.com. It's a 10-minute code change (`bnpl-refund.service.ts` line 257 — apply `(1 − discountRate)` to partial refund clawback amount), but it needs to be done.

**Recommendation:** PM should either confirm this was already applied as part of the Sprint 11 fix cycle or create a task for it. It should not slip past Sprint 12.

### S12-7 (LOW — Missing F-OD-1 Fix)

The Sprint 11 BA review also identified **F-OD-1 (P3): `waiveOverdraftPenalties` resolver discards idempotencyKey** (`_idempotencyKey` prefix in `overdraft.resolver.ts` line 342). This was marked for "early Sprint 12." Also not tracked on Monday.com. Cosmetic but inconsistent.

---

## Carry-Forward Items Assessment

### G2 — BNPL Auto-Collection on Due Dates (8 SP)

Well-scoped. Needs scheduler job + wallet adapter integration. Dependencies: wallet adapter must be functional (mock adapter exists from Sprint 11). The dev prompt should specify idempotency — if the scheduler runs twice for the same installment due date, only one collection attempt should occur.

### G3 — BNPL Early Settlement / Advance Payoff (5 SP)

Well-scoped. Needs `earlySettlement` and `advancePayment` methods, optional discount calculation, GraphQL mutations, and event contracts. No dependency blockers.

### G5 — Migrate BNPL Config from overdraftConfig to bnplConfig (3 SP)

Well-scoped. Needs Prisma schema change, migration to backfill, and updates to origination + installment services + product wizard. **Dependency note:** This should be done early in Sprint 12 because the BNPL auto-collection (G2) and early settlement (G3) items will read from this config. If they're built against `overdraftConfig` and then migrated later, it's wasted effort.

**Recommendation:** G5 should be sequenced first among the BNPL items.

### i18n Locale Mirroring (5 SP)

Well-scoped with a clear approach (English placeholders first, professional translations post-launch). The item description also proposes adding English fallback to the i18n loader — this is a good safety net and should be done regardless of locale mirroring.

---

## Scope and Capacity Assessment

| Category | Items | Story Points |
|---|---|---|
| Invoice Factoring core | 13 | ~57 |
| BNPL carry-forward | 3 | 16 |
| i18n | 1 | 5 |
| **Total** | **17** | **~78** |

This is a realistic sprint scope assuming ~80 SP capacity. The invoice factoring items are well-decomposed and follow the spec closely. The BNPL carry-forwards are independent and can be worked in parallel with IF core.

**Risk:** The advance rate calculation engine + 9-step state machine (Item 6, 8 SP) is the most complex single item. The spec's 9 steps include offer generation, disbursement, debtor notification, and settlement — each with ledger entries and event emissions. This item may underestimate at 8 SP. If it runs long, it's the critical-path bottleneck.

---

## Sign-Off Recommendation

**The plan is well-structured and ready for commissioning with amendments.** The scope is appropriate, the items map closely to the spec, and the priority ordering is correct. The carry-forward items from Sprint 11 are properly tracked.

**Before PM writes the dev prompt:**

1. **S12-2 (debtor payment matching):** Clarify how inbound debtor payments enter the system — manual recording via admin portal for v1.0, or automated via payment webhook? This affects Item 6/7 scope.

2. **S12-6 (F-BN-1):** Confirm the partial refund net clawback fix has been applied or add it as a task. It's 10 minutes but it's a financial incorrectness.

3. **S12-1 (debtor notification):** Ensure the dev prompt for Item 6 integrates notification dispatch in the state machine, not just a status flag.

4. **G5 sequencing:** Dev should implement bnplConfig migration before G2/G3 to avoid building against the wrong config structure.

**Items to add or expand in the dev prompt:**

5. **S12-3:** Non-recourse eligibility validation in the origination flow (Item 6).

6. **S12-4:** Concentration dashboard — add to Item 12 or create separate item.

7. **S12-5:** Product wizard IF fields, customer "Invoices" tab, collections dashboard debtor/seller distinction — add to Item 12's scope.

8. **S12-7 (F-OD-1):** Optional — rename `_idempotencyKey` in `overdraft.resolver.ts`. 5-minute fix.

**PM decision requested:**

- FR-IF-002.2 mentions "AI-driven analysis" for invoice risk assessment. Is rule-based acceptable for v1.0, with AI as a Phase 5 enhancement? BA recommends rule-based first (consistent with the ML scoring approach for other product types).

---

*The SPEC-invoice-factoring.md is comprehensive and ready for Dev consumption. BA recommends PM reference the spec directly in the dev prompt — it includes Prisma schemas, status transitions, the full 9-step flow, advance rate formula, reserve mechanics with worked examples, and test scenarios.*
