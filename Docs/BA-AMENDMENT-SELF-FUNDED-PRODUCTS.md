# BA Amendment Request: Self-Funded Products

**From:** PM (Claude)
**To:** BA (Claude)
**Date:** 2026-04-16
**Priority:** HIGH — Affects product activation flow and lender model

---

## Amendment Required

**Current spec language (to be amended):**

- `Docs/04-entity-management.md` — FR-LP-002.1: "Products require a linked lender configuration" (Must priority)
- `Docs/04-entity-management.md` — FR-SP-004.3: "Loan products SHALL be linked to a specific lender configuration" (Must priority)

**Problem identified:** The product creation wizard offers "No lender (self-funded)" as a valid option on the Funding Source step. However, the activation method in `ProductService.activate()` enforces `if (!product.lenderId) throw ValidationError('Product must have a lender before activation')`. This means any SP that funds products from its own balance sheet can save a draft but can never activate it.

**Project Owner decision:** Self-funded products ARE a valid business model. Many SPs in African markets fund from their own balance sheet without an external lender.

---

## Amendments Needed in Requirements Docs

### 1. `Docs/04-entity-management.md` — FR-LP-002.1

**Current:** "Products require a linked lender configuration"

**Amend to:** "Products require a linked lender configuration. For self-funded products where the SP uses its own balance sheet, a system-managed 'Self-Funded' lender record is auto-created per tenant. All products maintain a lender linkage — self-funded products use this system lender."

### 2. `Docs/04-entity-management.md` — FR-SP-004.3

**Current:** "Loan products SHALL be linked to a specific lender configuration"

**Amend to:** "Loan products SHALL be linked to a specific lender configuration. The system provides a default 'Self-Funded' lender per tenant for SPs that fund from their own balance sheet. This system lender is auto-created on first use, cannot be deleted, and carries 0% lender share in revenue calculations."

### 3. `Docs/04-entity-management.md` — New requirement: FR-LD-00X (Lender entity section)

**Add:** "Each tenant SHALL have a system-managed 'Self-Funded' lender record that:
- Is auto-created when the first self-funded product is created (or at tenant onboarding)
- Has status `active` and cannot be deactivated or deleted by tenant admins
- Carries no funding capacity, no interest rate constraints, and no settlement account
- Is visually distinguished in the admin portal lender list with a 'System' badge
- Is excluded from the external lender selection dropdown (appears only as the 'Self-Funded' option)"

### 4. Revenue Sharing Impact

**Add to the revenue sharing section:** "When a product uses the Self-Funded lender, revenue sharing defaults to 0% lender share and 100% SP share (minus platform fee). The settlement engine processes self-funded products identically to lender-backed products — the SP receives the lender disbursement."

---

## Implementation Approach (Already Documented)

Fix prompt created at: `Docs/FIX-SELF-FUNDED-PRODUCT-ACTIVATION.md`

Key implementation decisions:
- Auto-create a "Self-Funded" lender per tenant via `getOrCreateSelfFundedLender()` in ProductService
- Every product always has a `lenderId` (no null lender IDs in the database)
- The activation check stays as a safety net
- UI updated: "No lender" option relabeled to "Self-Funded (SP balance sheet)"
- Self-Funded lender filtered from external lender dropdown, marked with "System" badge in lender list

---

*BA: Please amend the four requirements documents listed above and update any cross-references. The fix prompt for Dev is ready at `Docs/FIX-SELF-FUNDED-PRODUCT-ACTIVATION.md`.*
