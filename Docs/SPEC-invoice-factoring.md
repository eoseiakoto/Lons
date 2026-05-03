# SPEC: Invoice Factoring — Debtor Entity & Flow

**Status:** Proposed
**Date:** 2026-04-14
**Author:** Business Analyst (Claude)
**Monday.com:** 11743617096
**Needed by:** Sprint 12 start

---

## 1. Overview

Invoice Factoring (also: Invoice Discounting, Reverse Factoring) allows businesses (sellers) to receive early payment on their outstanding invoices. The platform advances a percentage of the invoice face value to the seller, then collects the full amount from the debtor (buyer) when the invoice matures.

This is fundamentally different from other loan types because **collection is from a third party (debtor/buyer), not the borrower (seller)**. It introduces new entities (Debtor, Invoice), new financial mechanics (advance rate, reserve release), and new risk dimensions (debtor creditworthiness, invoice authenticity).

**Requirements coverage:** FR-IF-001 through FR-IF-004 (Docs/01-loan-portfolio.md §5).

---

## 2. Debtor (Buyer) Entity Model

### 2.1 Design Decision: Separate Entity

The Debtor is a **separate entity**, not a sub-type of Customer. Rationale:

- Debtors are third parties who owe money — they are not borrowers and do not apply for credit.
- A Debtor may have no direct relationship with the Lōns platform (no wallet, no KYC, no consent).
- The same Debtor (e.g., a large corporation) may appear across invoices from multiple sellers.
- Debtor risk assessment is based on payment history and creditworthiness, not borrowing behavior.

### 2.2 Prisma Schema

```prisma
model Debtor {
  id                  String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId            String        @map("tenant_id") @db.Uuid
  companyName          String        @map("company_name") @db.VarChar(255)
  tradingName          String?       @map("trading_name") @db.VarChar(255)
  registrationNumber   String?       @map("registration_number") @db.VarChar(100)
  taxId                String?       @map("tax_id") @db.VarChar(100)
  country              String        @db.VarChar(3)
  industrySector       String?       @map("industry_sector") @db.VarChar(100)
  contactEmail         String?       @map("contact_email") @db.VarChar(255)
  contactPhone         String?       @map("contact_phone") @db.VarChar(50)
  contactName          String?       @map("contact_name") @db.VarChar(255)
  address              Json?
  paymentTerms         String?       @map("payment_terms") @db.VarChar(50)
  averagePaymentDays   Int?          @map("average_payment_days")
  externalCreditRating String?       @map("external_credit_rating") @db.VarChar(50)
  internalRiskScore    Decimal?      @map("internal_risk_score") @db.Decimal(5, 2)
  totalExposure        Decimal       @default(0) @map("total_exposure") @db.Decimal(19, 4)
  exposureLimit        Decimal?      @map("exposure_limit") @db.Decimal(19, 4)
  status               DebtorStatus  @default(active)
  verifiedAt           DateTime?     @map("verified_at") @db.Timestamptz(6)
  metadata             Json?
  createdAt            DateTime      @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt            DateTime      @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt            DateTime?     @map("deleted_at") @db.Timestamptz(6)

  invoices             Invoice[]

  @@unique([tenantId, companyName, registrationNumber])
  @@index([tenantId])
  @@index([status])
  @@index([industrySector])
  @@map("debtors")
}

enum DebtorStatus {
  active
  under_review
  suspended
  blacklisted

  @@map("debtor_status")
}
```

### 2.3 Debtor Risk Assessment

Debtors are assessed on two dimensions:

**External credit rating:** Pulled from credit bureaus or business registries where available. Stored as a string (e.g., "AA", "B+", "unrated") because rating scales vary by provider and jurisdiction.

**Internal risk score (0–100):** Calculated by the scoring service based on:
- Historical payment behavior within the platform (invoices paid on time vs. late)
- Average payment delay (days after due date)
- Number of disputed invoices
- Industry sector risk factor
- Country risk factor
- Concentration risk (how much of the platform's portfolio is exposed to this debtor)

The internal risk score is recalculated whenever a debtor payment event occurs (invoice paid, disputed, or defaulted).

### 2.4 Concentration Limits

| Limit Type | Description | Configurable Per |
|---|---|---|
| Debtor concentration | Max percentage of total portfolio (or absolute amount) exposed to a single debtor | Tenant, Product |
| Industry concentration | Max percentage exposed to a single industry sector | Tenant, Product |
| Seller-debtor concentration | Max percentage of a single seller's invoices to one debtor | Product |

Stored as product configuration (extend the Product model's `eligibilityRules` JSON):
```json
{
  "concentrationLimits": {
    "maxDebtorExposurePercent": 15,
    "maxDebtorExposureAmount": "500000.00",
    "maxIndustryExposurePercent": 30,
    "maxSellerDebtorPercent": 50
  }
}
```

Checked at invoice submission time. If funding the invoice would breach a concentration limit, the invoice is declined with a specific reason.

---

## 3. Invoice Entity Model

### 3.1 Prisma Schema

```prisma
model Invoice {
  id                 String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId           String              @map("tenant_id") @db.Uuid
  sellerId           String              @map("seller_id") @db.Uuid
  debtorId           String              @map("debtor_id") @db.Uuid
  productId          String              @map("product_id") @db.Uuid
  contractId         String?             @map("contract_id") @db.Uuid
  idempotencyKey     String              @map("idempotency_key") @db.VarChar(255)
  invoiceNumber      String              @map("invoice_number") @db.VarChar(100)
  issueDate          DateTime            @map("issue_date") @db.Date
  dueDate            DateTime            @map("due_date") @db.Date
  faceValue          Decimal             @map("face_value") @db.Decimal(19, 4)
  currency           String              @db.VarChar(3)
  advanceRatePercent Decimal             @map("advance_rate_percent") @db.Decimal(5, 2)
  advancedAmount     Decimal?            @map("advanced_amount") @db.Decimal(19, 4)
  reserveAmount      Decimal?            @map("reserve_amount") @db.Decimal(19, 4)
  discountFee        Decimal?            @map("discount_fee") @db.Decimal(19, 4)
  serviceFee         Decimal?            @map("service_fee") @db.Decimal(19, 4)
  netDisbursement    Decimal?            @map("net_disbursement") @db.Decimal(19, 4)
  status             InvoiceStatus       @default(submitted)
  verificationStatus VerificationStatus  @default(pending) @map("verification_status")
  verifiedBy         String?             @map("verified_by") @db.Uuid
  verifiedAt         DateTime?           @map("verified_at") @db.Timestamptz(6)
  verificationNotes  String?             @map("verification_notes") @db.Text
  recourseType       RecourseType        @default(with_recourse) @map("recourse_type")
  debtorNotifiedAt   DateTime?           @map("debtor_notified_at") @db.Timestamptz(6)
  debtorPaymentRef   String?             @map("debtor_payment_ref") @db.VarChar(255)
  amountReceived     Decimal?            @default(0) @map("amount_received") @db.Decimal(19, 4)
  reserveReleased    Decimal?            @default(0) @map("reserve_released") @db.Decimal(19, 4)
  disputeReason      String?             @map("dispute_reason") @db.Text
  documents          Json?
  metadata           Json?
  fundedAt           DateTime?           @map("funded_at") @db.Timestamptz(6)
  settledAt          DateTime?           @map("settled_at") @db.Timestamptz(6)
  defaultedAt        DateTime?           @map("defaulted_at") @db.Timestamptz(6)
  createdAt          DateTime            @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt          DateTime            @updatedAt @map("updated_at") @db.Timestamptz(6)

  seller             Customer            @relation(fields: [sellerId], references: [id])
  debtor             Debtor              @relation(fields: [debtorId], references: [id])
  product            Product             @relation(fields: [productId], references: [id])
  contract           Contract?           @relation(fields: [contractId], references: [id])

  @@unique([tenantId, idempotencyKey])
  @@unique([tenantId, sellerId, invoiceNumber])
  @@index([tenantId])
  @@index([sellerId])
  @@index([debtorId])
  @@index([status])
  @@index([dueDate])
  @@map("invoices")
}

enum InvoiceStatus {
  submitted
  under_review
  verified
  offer_generated
  offer_accepted
  funded
  debtor_notified
  payment_received
  reserve_released
  settled
  disputed
  defaulted
  cancelled
  rejected

  @@map("invoice_status")
}

enum VerificationStatus {
  pending
  verified
  failed
  waived

  @@map("verification_status")
}

enum RecourseType {
  with_recourse
  without_recourse

  @@map("recourse_type")
}
```

### 3.2 Invoice Status Transitions

```
submitted → under_review → verified → offer_generated → offer_accepted → funded → debtor_notified → payment_received → reserve_released → settled
                         ↘ rejected (verification failed)
                                                       ↘ cancelled (seller declines offer)
                                                                                            ↘ disputed (debtor disputes invoice)
                                                                                   funded → defaulted (debtor fails to pay past threshold)
```

### 3.3 Verification Status

Invoice verification is a risk mitigation step to confirm the invoice is genuine.

| Level | Process | When to Use |
|---|---|---|
| Waived | No verification. Trust seller's submission. | Low-value invoices, repeat sellers with strong track record. |
| Automated | System checks: invoice number format, debtor exists, amount within bounds, no duplicate. | Default for most invoices. |
| Manual | SP operator reviews documents, may contact debtor to confirm invoice. | High-value invoices, new sellers, new debtors, flagged by risk engine. |

Verification level is determined by product configuration rules:
```json
{
  "verificationRules": {
    "autoVerifyBelow": "50000.00",
    "manualVerifyAbove": "200000.00",
    "manualVerifyNewSeller": true,
    "manualVerifyNewDebtor": true
  }
}
```

---

## 4. Factoring Origination Flow

### 4.1 End-to-End Flow

```
Step 1: INVOICE SUBMISSION (Seller → Lōns API)
───────────────────────────────────────────────
Seller submits invoice via API:

POST /v1/invoices/submit
{
  "idempotencyKey": "INV-2026-0342",
  "invoiceNumber": "INV-2026-0342",
  "debtorId": "uuid" | "debtorRegistrationNumber": "GH-12345",
  "issueDate": "2026-03-15",
  "dueDate": "2026-05-15",
  "faceValue": "100000.00",
  "currency": "GHS",
  "productId": "uuid",
  "documents": [{ "type": "invoice_pdf", "url": "..." }, { "type": "delivery_note", "url": "..." }]
}

Status: submitted

Step 2: RISK ASSESSMENT & VERIFICATION (Lōns internal)
───────────────────────────────────────────────────────
a. Validate: seller has active subscription, product is active, invoice amount within product bounds
b. Validate: debtor exists and is not blacklisted/suspended
c. Check concentration limits: will this invoice breach debtor or industry caps?
d. Debtor risk assessment: pull internal score, check payment history
e. Invoice verification per product rules (automated or manual)
f. AI risk analysis (FR-IF-002): analyze invoice characteristics, debtor patterns, industry factors

If rejected → status: rejected, return reason.
If manual verification required → status: under_review (operator reviews in admin portal)
If auto-verified → status: verified

Step 3: OFFER GENERATION (Lōns → Seller)
────────────────────────────────────────
Calculate financing offer:

  advanceRate = productDefault (e.g., 80%) adjusted by debtor risk score
  advancedAmount = faceValue * advanceRate / 100
  reserveAmount = faceValue - advancedAmount
  discountFee = advancedAmount * discountRate * (daysToDue / 365)
  serviceFee = flat fee per product config (if applicable)
  netDisbursement = advancedAmount - discountFee - serviceFee

Return offer to seller:
{
  "invoiceId": "uuid",
  "faceValue": "100000.00",
  "advanceRate": "80.00",
  "advancedAmount": "80000.00",
  "reserveAmount": "20000.00",
  "discountFee": "2400.00",
  "serviceFee": "500.00",
  "netDisbursement": "77100.00",
  "expectedSettlementDate": "2026-05-15",
  "recourseType": "with_recourse",
  "expiresAt": "2026-04-15T23:59:59Z"
}

Status: verified → offer_generated

Step 4: SELLER ACCEPTS OFFER
─────────────────────────────
POST /v1/invoices/{invoiceId}/accept

Status: offer_generated → offer_accepted

Step 5: ADVANCE DISBURSEMENT (Lōns → Seller wallet)
────────────────────────────────────────────────────
a. Create Contract record (type = INVOICE_FACTORING, principalAmount = advancedAmount)
b. Create ledger entries:
   - Debit: Invoice receivable (faceValue)
   - Credit: Advance payable to seller (netDisbursement)
   - Credit: Fee income (discountFee + serviceFee)
   - Credit: Reserve held (reserveAmount)
c. Disburse netDisbursement to seller's wallet
d. Update Debtor.totalExposure += faceValue

Status: offer_accepted → funded

Step 6: DEBTOR NOTIFICATION
───────────────────────────
Notify the debtor that the invoice has been factored:
  - Channel: email, letter, or API (configurable per debtor, per product)
  - Content: invoice details, new payment instructions (pay to Lōns collection account, not seller)
  - Legal: in many jurisdictions, debtor must be notified for the factor to have legal standing

Status: funded → debtor_notified

Step 7: DEBTOR PAYMENT COLLECTION
─────────────────────────────────
On invoice due date (or earlier):
  a. If debtor pays via wallet/bank transfer referencing the invoice → match payment to invoice
  b. Record: amountReceived, debtorPaymentRef
  c. If full payment: status → payment_received
  d. If partial payment: record partial, continue tracking remaining

Step 8: RESERVE RELEASE (Lōns → Seller)
───────────────────────────────────────
After debtor payment is confirmed and reconciled:
  reserveRelease = reserveAmount (or amountReceived - advancedAmount - fees, if partial)
  Disburse reserveRelease to seller's wallet
  Create ledger entries:
    - Debit: Reserve held
    - Credit: Reserve released to seller

Status: payment_received → reserve_released → settled

Step 9: COMPLETION
──────────────────
Contract status → settled
Update Debtor.totalExposure -= faceValue
Invoice status → settled
```

### 4.2 Advance Rate Calculation

The advance rate is the percentage of invoice face value disbursed to the seller upfront. It varies based on risk:

| Factor | Impact on Advance Rate |
|---|---|
| Debtor internal risk score (high) | ↑ Higher advance rate (lower risk) |
| Debtor internal risk score (low) | ↓ Lower advance rate (higher risk) |
| New debtor (no history) | ↓ Start at lower rate, increase with track record |
| Invoice tenor (days to due date) | ↓ Longer tenor → slightly lower rate |
| Seller track record | ↑ Repeat seller with clean history → higher rate |
| Industry sector risk | Adjustment factor per sector |

**Formula:**
```
baseRate = product.advanceRatePercent (e.g., 85%)
debtorAdjustment = f(debtor.internalRiskScore)  // -10% to +5%
tenorAdjustment = f(daysToDueDate)               // -2% for > 90 days
sellerAdjustment = f(sellerTrackRecord)          // +0% to +3%

effectiveAdvanceRate = clamp(baseRate + debtorAdjustment + tenorAdjustment + sellerAdjustment, 60%, 95%)
```

The minimum (60%) and maximum (95%) are configurable per product.

---

## 5. Recourse vs. Non-Recourse

### 5.1 With Recourse (Default)

If the debtor fails to pay within the tolerance window (configurable, e.g., 30 days past due date):

1. Invoice transitions to `defaulted`
2. The seller becomes responsible for repaying the advanced amount
3. System initiates collection from seller:
   - Deduct from seller's wallet balance
   - Deduct from seller's pending reserve releases on other invoices
   - If insufficient, treat as a standard delinquent contract → collections workflow
4. The seller can still pursue the debtor independently

### 5.2 Without Recourse

The lender/SP absorbs the loss if the debtor fails to pay:

1. Invoice transitions to `defaulted`
2. The advanced amount is written off against the lender's provisioning
3. The seller retains the advance — no clawback
4. Higher discount fee compensates for the additional risk

### 5.3 Configuration

Recourse type is set at the product level with optional per-invoice override:
- Product config: `defaultRecourseType: "with_recourse" | "without_recourse"`
- Per-invoice override: seller can request non-recourse on submission (subject to higher fees and SP approval)

Non-recourse typically requires higher debtor creditworthiness thresholds:
```json
{
  "nonRecourseEligibility": {
    "minDebtorRiskScore": 70,
    "minDebtorPaymentHistory": 6,
    "maxInvoiceTenorDays": 90,
    "feeMultiplier": 1.5
  }
}
```

---

## 6. Reserve Mechanics

### 6.1 Standard Flow

```
Invoice face value:    GHS 100,000
Advance rate:          80%
Advanced amount:       GHS  80,000
Reserve amount:        GHS  20,000  (held by platform)
Discount fee:          GHS   2,400  (deducted from advance)
Service fee:           GHS     500  (deducted from advance)
Net disbursement:      GHS  77,100  (seller receives)
```

When debtor pays full amount (GHS 100,000):
```
From debtor payment:   GHS 100,000
Less: advanced amount  GHS  80,000  (already disbursed to seller)
Remaining:             GHS  20,000  = reserve amount
Reserve released:      GHS  20,000  → disbursed to seller
```

### 6.2 Partial Debtor Payment

If debtor pays only GHS 70,000 (partial):
```
From debtor payment:   GHS  70,000
Less: advanced amount: GHS  80,000
Shortfall:             GHS  10,000

Reserve held:          GHS  20,000
Less shortfall:        GHS  10,000
Reserve released:      GHS  10,000  → disbursed to seller
Remaining reserve:     GHS  10,000  → held until remainder collected
```

If debtor never pays the remaining GHS 30,000 and invoice defaults:
- With recourse: seller must repay GHS 10,000 shortfall + remaining reserve is forfeited
- Without recourse: lender absorbs the GHS 10,000 loss, remaining reserve returned to seller

### 6.3 Reserve Release Trigger

**Automatic** on payment confirmation (default). When the integration service or reconciliation batch confirms debtor payment was received and reconciled, the reserve release is triggered automatically.

**Manual approval** (configurable per product): For high-value invoices, reserve release requires SP operator approval. The operator verifies the payment is genuine and cleared before releasing.

---

## 7. Aging and Default Classification

### 7.1 Invoice Aging Buckets

| Bucket | Days Past Due Date | Action |
|---|---|---|
| Current | Not yet due | Monitor |
| Approaching | 1–7 days before due | Send debtor reminder |
| Due | Due date | Send payment request to debtor |
| Grace | 1–7 DPD | First reminder to debtor and seller |
| Overdue | 8–30 DPD | Escalate — contact debtor, notify seller |
| Seriously Overdue | 31–60 DPD | Collection actions, consider recourse trigger |
| Default | 60+ DPD (configurable) | Default classification, recourse enforcement or write-off |

### 7.2 Debtor Payment Tracking

The system tracks debtor payment behavior across all invoices (not just the current one):
- Average days to payment (across all invoices for this debtor)
- Payment reliability score (% of invoices paid on time)
- Number of disputed invoices
- This data feeds back into the debtor risk score and future advance rate calculations

---

## 8. Reverse Factoring (FR-IF-003)

Reverse factoring is initiated by the buyer (debtor), not the seller. The buyer pre-approves invoices for early payment using their credit facility.

### 8.1 Flow Differences

| Aspect | Standard Factoring | Reverse Factoring |
|---|---|---|
| Initiated by | Seller | Buyer (debtor) |
| Credit assessed | Debtor + Seller | Buyer (has a credit facility) |
| Advance rate | Risk-adjusted | Typically higher (buyer-backed) |
| Recourse | To seller | N/A — buyer has committed to pay |
| Debtor notification | Required | N/A — buyer initiates |

### 8.2 Implementation Approach

**For v1.0:** Standard factoring only. Reverse factoring requires a buyer credit facility model and buyer-initiated workflow that adds significant complexity.

**Post-v1.0:** Reverse factoring can be implemented as a separate product sub-type with:
- BuyerCreditFacility model (similar to CreditLine but for B2B)
- Buyer-initiated invoice approval flow
- Different risk/pricing model

---

## 9. Event Types

```typescript
// Invoice lifecycle events
INVOICE_SUBMITTED = 'invoice.submitted',
INVOICE_UNDER_REVIEW = 'invoice.under_review',
INVOICE_VERIFIED = 'invoice.verified',
INVOICE_REJECTED = 'invoice.rejected',
INVOICE_OFFER_GENERATED = 'invoice.offer.generated',
INVOICE_OFFER_ACCEPTED = 'invoice.offer.accepted',
INVOICE_OFFER_DECLINED = 'invoice.offer.declined',
INVOICE_FUNDED = 'invoice.funded',
INVOICE_DEBTOR_NOTIFIED = 'invoice.debtor.notified',
INVOICE_PAYMENT_RECEIVED = 'invoice.payment.received',
INVOICE_PAYMENT_PARTIAL = 'invoice.payment.partial',
INVOICE_RESERVE_RELEASED = 'invoice.reserve.released',
INVOICE_SETTLED = 'invoice.settled',
INVOICE_DISPUTED = 'invoice.disputed',
INVOICE_DEFAULTED = 'invoice.defaulted',

// Debtor events
DEBTOR_CREATED = 'debtor.created',
DEBTOR_RISK_ASSESSED = 'debtor.risk.assessed',
DEBTOR_SUSPENDED = 'debtor.suspended',
DEBTOR_BLACKLISTED = 'debtor.blacklisted',
DEBTOR_EXPOSURE_CHANGED = 'debtor.exposure.changed',

// Concentration events
CONCENTRATION_LIMIT_WARNING = 'concentration.limit.warning',
CONCENTRATION_LIMIT_BREACHED = 'concentration.limit.breached',
```

---

## 10. Admin Portal Implications

### 10.1 New Screens

1. **Debtor Management** — List debtors with search by name, registration number, industry. Detail page: contact info, risk score, payment history, total exposure, invoices against this debtor.

2. **Invoice Pipeline** — Kanban or list view of invoices by status (submitted → verified → funded → payment_received → settled). Filter by seller, debtor, amount, due date.

3. **Invoice Detail** — Full lifecycle view: submission details, verification decision, offer terms, advance disbursement, debtor notification, payment tracking, reserve release.

4. **Invoice Verification Queue** — Invoices requiring manual verification. Operator reviews documents, may record debtor confirmation call, approves or rejects.

5. **Concentration Dashboard** — Visual display of portfolio concentration: top 10 debtors by exposure, industry breakdown, concentration limit utilization gauges.

### 10.2 Updated Screens

- **Product Wizard** — When product type is INVOICE_FACTORING: advance rate range, discount rate, verification rules, recourse default, concentration limits, aging thresholds.
- **Customer Detail** — Add "Invoices" tab for sellers showing submitted invoices, funded amounts, reserve balances, settlement history.
- **Collections Dashboard** — Defaulted invoices appear with debtor context. Distinguish between debtor collection (for non-recourse/pre-recourse) and seller collection (for recourse enforcement).

---

## 11. Relationship to Existing Contract Model

Invoice factoring reuses the existing `Contract` model with some adaptations:

| Contract Field | Invoice Factoring Usage |
|---|---|
| `principalAmount` | advancedAmount (not invoice face value) |
| `customerId` | sellerId (the borrower is the seller) |
| `loanRequestId` | Can reference the Invoice record's ID via metadata |
| `interestRate` | discount rate (annualized) |
| `tenorDays` | Days from funding to invoice due date |
| `maturityDate` | Invoice due date |
| `repaymentMethod` | BULLET (single payment from debtor at maturity) |
| `totalOutstanding` | advancedAmount (until debtor pays) |

The Invoice model tracks the factoring-specific details (debtor, face value, advance rate, reserve, verification). The Contract model tracks the financial obligation. They are linked via `contractId` on the Invoice model.

---

## 12. Test Scenarios

### 12.1 Happy Path
- Seller submits invoice → auto-verified → offer generated → accepted → advance disbursed → debtor notified → debtor pays on due date → reserve released → settled
- Verify: advance amount correct, fees deducted, reserve held and released, debtor exposure tracked

### 12.2 Risk Scenarios
- Invoice exceeds debtor concentration limit → rejected with reason
- New debtor with no history → manual verification required, lower advance rate
- Debtor with poor payment history → lower advance rate or rejection

### 12.3 Payment Scenarios
- Debtor pays early → reserve released early
- Debtor partial payment → partial reserve release, remainder tracked
- Debtor pays late but within grace → standard flow, late payment logged
- Debtor fails to pay (default) → with recourse: seller collection; without recourse: write-off

### 12.4 Dispute Scenarios
- Debtor disputes invoice → status: disputed, freeze reserve release, notify seller
- Dispute resolved in seller's favor → resume normal flow
- Dispute resolved in debtor's favor → cancel invoice, with recourse: collect advance from seller

### 12.5 Edge Cases
- Same invoice submitted twice (idempotency check)
- Debtor pays to seller directly instead of Lōns → manual reconciliation, debtor notification was ignored
- Seller submits invoices against a suspended debtor → rejected
- Reserve release when seller's wallet is inactive → hold reserve, notify SP

---

## 13. Open Questions for Decision

| # | Question | Options | BA Recommendation |
|---|---|---|---|
| 1 | Is Debtor a separate entity or Customer sub-type? | (A) Separate entity, (B) Customer with `isDebtor` flag | A — separate entity. Different lifecycle, no wallet/KYC relationship. |
| 2 | Invoice verification: mandatory for all? | (A) Mandatory, (B) Risk-based (auto for low-value, manual for high), (C) Configurable | C — configurable per product with risk-based defaults. |
| 3 | Debtor notification channel? | (A) Email only, (B) Email + letter, (C) API callback to debtor's system | A for v1.0 — email. B and C post-v1.0. |
| 4 | Reserve release: automatic or manual approval? | (A) Auto on payment confirmation, (B) Manual above threshold | Both — auto by default, manual above configurable threshold. |
| 5 | Recourse enforcement: how aggressive? | (A) Immediate wallet deduction, (B) Notification → grace period → deduction | B — notification first, 7-day grace, then deduction. |
| 6 | Reverse factoring in v1.0? | (A) Yes, (B) No — standard factoring only | B — defer to post-v1.0. Standard factoring is complex enough for v1.0. |
| 7 | Multiple invoices bundled into one advance? | (A) One invoice = one contract, (B) Bundle multiple invoices per debtor | A for v1.0 — one-to-one. Bundling adds reconciliation complexity. |
