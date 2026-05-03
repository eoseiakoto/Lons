# Monday.com Bug Items — Pending Upload

**Date:** 2026-04-16
**Status:** Monday.com API was unreachable. Create these items when connectivity resumes.
**Board:** 18405683508 (Lōns — Development Tasks)
**Group:** group_mm2depym (Sprint 10 — Overdraft Product Type)

---

## Bug 1: Product Code Sequence Not Auto-Incrementing

**Item name:** BUG: Product code sequence not auto-incrementing (always generates 001)
**Status:** To Do
**Priority:** High
**Service/Module:** entity-service, admin-portal

**Note to post:**

> **Bug Report — Product Code Sequence**
>
> **Reported:** 2026-04-16 by PM during product creation testing
> **Severity:** High — affects all new product creation
>
> **Symptoms:** New products keep getting sequence 001 regardless of how many products exist with the same prefix-currency combination. E.g., creating a second OD-GHS product generates OD-GHS-001 instead of OD-GHS-002.
>
> **Root cause:** Code generation lives entirely on the frontend (product-wizard.tsx lines 272-294). The wizard fetches up to 500 products via a generic query (no type/currency filter), scans for matching prefix-currency codes, and picks max + 1. This fails because:
> 1. The query fetches ALL product types but paginates at 500 — missing products when count is high
> 2. No type/currency filter means the 500-item budget is wasted on irrelevant products
> 3. Race condition: concurrent wizard sessions generate the same code
> 4. Stale query: code computed once on mount, not refreshed
> 5. Backend retry (ProductService lines 47-98) blindly increments +1 up to 5 times — fails if gap > 5
>
> **Fix:** Move code generation to backend. New `nextProductCode(type, currency)` GraphQL query that atomically queries MAX(sequence) from the database filtered by exact prefix-currency pattern. Frontend becomes a thin client. Fix prompt: `Docs/FIX-PRODUCT-CODE-SEQUENCE.md`
>
> **Files affected:**
> - services/entity-service/src/product/product.service.ts (add getNextProductCode method, update create())
> - apps/graphql-server/src/graphql/resolvers/product.resolver.ts (add nextProductCode query)
> - apps/admin-portal/src/components/products/wizard/product-wizard.tsx (replace client-side generation)

---

## Bug 2: Self-Funded Products Cannot Activate

**Item name:** BUG: Self-funded products cannot activate — "Product must have a lender" error
**Status:** To Do
**Priority:** High
**Service/Module:** entity-service, admin-portal

**Note to post:**

> **Bug Report — Self-Funded Product Activation**
>
> **Reported:** 2026-04-16 by PM during product activation testing
> **Severity:** High — blocks all SPs that self-fund from their own balance sheet
>
> **Symptoms:** Product creation wizard allows "No lender (self-funded)" option on the Funding Source step. Product saves as draft successfully. On activation attempt, error toast: "Product must have a lender before activation."
>
> **Root cause:** Contradiction between UI and validation logic:
> - UI (step-funding-source.tsx line 110): "No lender" sets lenderId to empty string
> - Prisma schema: lenderId is optional (String?)
> - ProductService.activate() (line 246): `if (!product.lenderId) throw ValidationError(...)`
> - Docs FR-LP-002.1 and FR-SP-004.3: mandate lender linkage, don't account for self-funding
>
> **Business decision (Project Owner):** Self-funded products are valid. SPs in African markets commonly fund from their own balance sheet.
>
> **Fix:** Auto-create a "Self-Funded" lender record per tenant. Every product always has a lenderId — self-funded products use the system lender. Revenue sharing: 0% lender, 100% SP (minus platform fee). Fix prompt: `Docs/FIX-SELF-FUNDED-PRODUCT-ACTIVATION.md`. BA amendment request: `Docs/BA-AMENDMENT-SELF-FUNDED-PRODUCTS.md`
>
> **Files affected:**
> - services/entity-service/src/product/product.service.ts (add getOrCreateSelfFundedLender, update create())
> - apps/admin-portal/src/components/products/wizard/step-funding-source.tsx (relabel option, filter system lender)
> - apps/admin-portal/src/app/(portal)/lenders/page.tsx (add System badge, prevent delete)
> - packages/database/prisma/seed.ts (seed self-funded lenders for test tenants)
> - Docs/04-entity-management.md (amend FR-LP-002.1, FR-SP-004.3, add FR-LD-00X)
