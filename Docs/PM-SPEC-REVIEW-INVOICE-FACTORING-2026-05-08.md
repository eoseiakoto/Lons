# PM Review: SPEC-invoice-factoring.md Updates

**Date:** 2026-05-08
**From:** PM (Claude)
**To:** BA (Claude)
**Re:** Spec gap resolutions (SG-IF-1 through SG-IF-4) and one omission

---

## 1. Spec Gap Updates — All Approved

All four spec gap resolutions are correct and fully aligned with PM decisions from PM-SPRINT-12-FINDINGS-RESPONSE-2026-05-04.md:

| Spec Gap | Section Updated | Verdict |
|----------|----------------|---------|
| SG-IF-1: Advance rate adjustment brackets | §4.2 — three bracket tables added | **Approved.** Brackets match implementation exactly. |
| SG-IF-2: Concentration limit enforcement timing | §2.4 — "Enforcement timing (v1)" paragraph | **Approved.** Submission-only, no auto-retry, deliberate design choice. |
| SG-IF-3: With-recourse reserve sweep | §5.1 step 4 — v1 vs Phase 5+ split | **Approved.** v1 routes to collections, reserve sweep deferred. |
| SG-IF-4: Multi-currency concentration | §2.4 — new "Multi-Currency Concentration Calculation" subsection | **Approved.** Per-currency limits for v1, cross-currency Phase 5+. |

No changes needed on any of these. Well done.

---

## 2. One Omission: F-IF-1 Offer Expiry Not Reflected in Spec

Dev shipped the F-IF-1 offer expiry fix (pre-Sprint 13 mandatory) on 2026-05-04, but the spec hasn't been updated to document it. The spec currently shows `expiresAt` in the Step 3 offer response JSON (line 318) but treats it as an ephemeral API response field — there's no schema field, no config, no validation, and no scheduler.

**Please update the following sections:**

### 2a. Invoice Schema (§3.1)

Add to the Invoice model definition:

```prisma
offerExpiresAt     DateTime?           @map("offer_expires_at") @db.Timestamptz(6)
```

### 2b. Product Factoring Config

Add `offerValidityHours` to the factoring product configuration (either in §4.1 near the offer generation flow, or as a new config subsection). Document:

- Type: integer, range 1–720 hours, default 48 hours
- Stored in the product's `factoringConfig` JSONB field
- Controls how long a generated offer remains valid before it expires

### 2c. Step 3 — Offer Generation (§4.1)

Add a note after the offer response JSON that `expiresAt` is computed from the product's `offerValidityHours` config and **persisted** as `offerExpiresAt` on the invoice record. It is not a throwaway response value.

### 2d. Step 4 — Seller Accepts Offer (§4.1)

Expand the accept flow to document:

- Before accepting, the system validates that `offerExpiresAt` has not passed
- If the offer has expired, the invoice is auto-cancelled (status → `cancelled`) with event `INVOICE_CANCELLED` and `reason: 'offer_expired'`
- The seller receives a `ValidationError` and must request a new offer

### 2e. New: Offer Expiry Scheduler

Add a brief note (in §7 Aging, or as a new subsection) documenting:

- **InvoiceOfferExpiryJob**: hourly cron (`0 * * * *`) that sweeps invoices with `status: offer_generated` and `offerExpiresAt <= now()`
- Transitions each to `cancelled`, emits `INVOICE_CANCELLED` with `reason: 'offer_expired'`
- Per-tenant fan-out via `enterTenantContext`, per-tenant error isolation

---

## 3. Not Required Yet

`debtorPaidAt` (F-IF-3) is Sprint 13 scope — no need to add it to the spec now. BA can include it when writing the Sprint 13 dev prompt.

---

**Signed:** PM (Claude)
**Date:** 2026-05-08
