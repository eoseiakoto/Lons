# SPEC: BNPL — Merchant Entity & Flow

**Status:** Proposed
**Date:** 2026-04-14
**Author:** Business Analyst (Claude)
**Monday.com:** 11743576673
**Needed by:** Sprint 11 start

---

## 1. Overview

Buy Now Pay Later (BNPL) allows customers to split a purchase into installments at the point of sale. Unlike Micro-Loans (customer-initiated, amount-based), BNPL is purchase-triggered and involves a third party — the Merchant — who receives upfront settlement while the customer repays over time.

This spec defines the Merchant entity, the purchase-triggered origination flow, installment mechanics, merchant settlement, refund handling, and the merchant-facing interface.

**Requirements coverage:** FR-BN-001 through FR-BN-005 (Docs/01-loan-portfolio.md §4).

---

## 2. Merchant Entity Model

### 2.1 Prisma Schema

```prisma
model Merchant {
  id                   String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId             String          @map("tenant_id") @db.Uuid
  name                 String          @db.VarChar(255)
  tradingName          String?         @map("trading_name") @db.VarChar(255)
  registrationNumber   String          @map("registration_number") @db.VarChar(100)
  country              String          @db.VarChar(3)
  categoryCode         String          @map("category_code") @db.VarChar(10)
  categoryName         String?         @map("category_name") @db.VarChar(255)
  contactEmail         String          @map("contact_email") @db.VarChar(255)
  contactPhone         String          @map("contact_phone") @db.VarChar(50)
  contactName          String?         @map("contact_name") @db.VarChar(255)
  address              Json?
  settlementAccount    Json             @map("settlement_account")
  discountFeePercent   Decimal          @map("discount_fee_percent") @db.Decimal(5, 2)
  settlementSchedule   SettlementSchedule @default(T_PLUS_1) @map("settlement_schedule")
  dailyTransactionCap  Decimal?         @map("daily_transaction_cap") @db.Decimal(19, 4)
  monthlyVolumeCap     Decimal?         @map("monthly_volume_cap") @db.Decimal(19, 4)
  perTransactionLimit  Decimal?         @map("per_transaction_limit") @db.Decimal(19, 4)
  status               MerchantStatus   @default(pending_review)
  kycStatus            MerchantKycStatus @default(pending) @map("kyc_status")
  kycVerifiedAt        DateTime?        @map("kyc_verified_at") @db.Timestamptz(6)
  kycDocuments         Json?            @map("kyc_documents")
  apiKeyId             String?          @map("api_key_id") @db.Uuid
  webhookUrl           String?          @map("webhook_url") @db.VarChar(512)
  webhookSecret        String?          @map("webhook_secret") @db.VarChar(255)
  metadata             Json?
  activatedAt          DateTime?        @map("activated_at") @db.Timestamptz(6)
  suspendedAt          DateTime?        @map("suspended_at") @db.Timestamptz(6)
  suspendedReason      String?          @map("suspended_reason") @db.Text
  createdAt            DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt            DateTime         @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt            DateTime?        @map("deleted_at") @db.Timestamptz(6)

  tenant               Tenant           @relation(fields: [tenantId], references: [id])
  bnplTransactions     BnplTransaction[]
  merchantSettlements  MerchantSettlement[]

  @@unique([tenantId, registrationNumber])
  @@index([tenantId])
  @@index([status])
  @@index([categoryCode])
  @@map("merchants")
}

enum MerchantStatus {
  pending_review
  active
  suspended
  terminated

  @@map("merchant_status")
}

enum MerchantKycStatus {
  pending
  documents_submitted
  under_review
  verified
  rejected

  @@map("merchant_kyc_status")
}

enum SettlementSchedule {
  IMMEDIATE
  T_PLUS_1
  WEEKLY
  BI_WEEKLY

  @@map("settlement_schedule")
}
```

### 2.2 Merchant KYC Requirements

Merchant due diligence before activation:

| Document | Required | Notes |
|---|---|---|
| Business registration certificate | Yes | Validates legal entity |
| Tax identification number (TIN) | Yes | Regulatory requirement |
| Bank account verification | Yes | Settlement account ownership proof |
| Trading license (where applicable) | Conditional | Required in certain categories |
| Proof of address | Yes | Physical business location |
| Authorized signatory ID | Yes | National ID of person signing agreement |

### 2.3 Merchant Status Transitions

```
pending_review → active             (KYC verified, SP approves)
pending_review → terminated         (KYC rejected)
active → suspended                  (fraud, policy violation, SP action)
suspended → active                  (issue resolved, SP reinstates)
active → terminated                 (SP terminates relationship)
suspended → terminated              (permanent removal)
```

**Rules:**
- Only `active` merchants can process BNPL transactions.
- Suspension immediately blocks new transactions. In-flight settlements continue to completion.
- Termination is soft-delete (`deletedAt` set). Historical data preserved.

### 2.4 Merchant Onboarding Flow

**For v1.0:** SP creates merchants via the admin portal. No merchant self-registration.

1. SP operator navigates to Merchants section in admin portal
2. Fills in merchant details (name, registration, category, contact, settlement account)
3. Uploads KYC documents
4. Submits for review → status becomes `pending_review`
5. SP reviewer (or designated compliance officer) verifies documents
6. On approval: status → `active`, API credentials generated (client ID + secret), webhook URL configured
7. Merchant receives API credentials via secure channel (email with one-time link)

**Post-v1.0:** Merchant self-registration portal where merchants submit their own details and documents, with SP approval workflow.

### 2.5 Relationship to Tenant

A Merchant belongs to a Tenant (SP). The SP onboards merchants within their ecosystem. One physical merchant could theoretically be onboarded by multiple SPs (different tenants), each with separate terms — this is fine because `@@unique([tenantId, registrationNumber])` ensures uniqueness within a tenant.

---

## 3. BNPL Transaction Model

### 3.1 Prisma Schema

```prisma
model BnplTransaction {
  id                String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String              @map("tenant_id") @db.Uuid
  merchantId        String              @map("merchant_id") @db.Uuid
  customerId        String              @map("customer_id") @db.Uuid
  productId         String              @map("product_id") @db.Uuid
  contractId        String?             @map("contract_id") @db.Uuid
  idempotencyKey    String              @map("idempotency_key") @db.VarChar(255)
  purchaseAmount    Decimal             @map("purchase_amount") @db.Decimal(19, 4)
  currency          String              @db.VarChar(3)
  itemDescription   String?             @map("item_description") @db.Text
  merchantOrderRef  String?             @map("merchant_order_ref") @db.VarChar(255)
  numberOfInstallments Int              @map("number_of_installments")
  installmentAmount Decimal?            @map("installment_amount") @db.Decimal(19, 4)
  firstInstallmentAt DateTime?          @map("first_installment_at") @db.Date
  discountFee       Decimal?            @map("discount_fee") @db.Decimal(19, 4)
  customerFee       Decimal?            @map("customer_fee") @db.Decimal(19, 4)
  status            BnplTransactionStatus @default(initiated)
  preQualResult     Json?               @map("pre_qual_result")
  declineReason     String?             @map("decline_reason") @db.Text
  refundedAmount    Decimal             @default(0) @map("refunded_amount") @db.Decimal(19, 4)
  refundStatus      RefundStatus?       @map("refund_status")
  merchantSettledAt DateTime?           @map("merchant_settled_at") @db.Timestamptz(6)
  completedAt       DateTime?           @map("completed_at") @db.Timestamptz(6)
  metadata          Json?
  createdAt         DateTime            @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime            @updatedAt @map("updated_at") @db.Timestamptz(6)

  merchant          Merchant            @relation(fields: [merchantId], references: [id])
  customer          Customer            @relation(fields: [customerId], references: [id])
  product           Product             @relation(fields: [productId], references: [id])
  contract          Contract?           @relation(fields: [contractId], references: [id])

  @@unique([tenantId, idempotencyKey])
  @@index([tenantId])
  @@index([merchantId])
  @@index([customerId])
  @@index([status])
  @@index([merchantOrderRef])
  @@map("bnpl_transactions")
}

enum BnplTransactionStatus {
  initiated
  pre_qualifying
  pre_qualified
  declined
  offer_presented
  customer_accepted
  contract_created
  merchant_settled
  repaying
  completed
  refunded
  partially_refunded
  defaulted
  cancelled

  @@map("bnpl_transaction_status")
}

enum RefundStatus {
  requested
  processing
  completed
  failed

  @@map("refund_status")
}
```

---

## 4. Purchase-Triggered Origination Flow

### 4.1 State Machine

```
initiated → pre_qualifying → pre_qualified → offer_presented → customer_accepted → contract_created → merchant_settled → repaying → completed
                           ↘ declined
                                                             ↘ cancelled (customer declines offer)
                                                                                                    ↘ defaulted
                                                                                   merchant_settled → refunded / partially_refunded
```

### 4.2 End-to-End Flow

```
Step 1: CHECKOUT INITIATION (Merchant → Lōns API)
────────────────────────────────────────────────
Merchant's checkout system calls Lōns BNPL API:

POST /v1/bnpl/checkout
{
  "merchantId": "uuid",
  "customerId": "customer-external-id",    // Customer's wallet ID or phone number
  "purchaseAmount": "15000.00",
  "currency": "GHS",
  "itemDescription": "Samsung Galaxy A14",
  "merchantOrderRef": "ORD-2026-0142",
  "idempotencyKey": "checkout-ORD-2026-0142",
  "callbackUrl": "https://merchant.com/bnpl/callback"   // Optional override
}

Status: initiated → pre_qualifying

Step 2: PRE-QUALIFICATION (Lōns internal, < 3 seconds)
────────────────────────────────────────────────────────
System performs real-time checks:
  a. Resolve customerId → internal Lōns customer record
  b. Customer blacklist/watchlist check
  c. Active BNPL subscription check (does customer have a BNPL-enabled subscription?)
  d. Credit limit check: does customer have remaining BNPL credit limit ≥ purchaseAmount?
  e. Product eligibility: is merchant's category eligible for this BNPL product?
  f. Amount bounds: purchaseAmount within product min/max?
  g. Merchant status check: is merchant active and within daily/monthly caps?

If any check fails → status: declined, return decline reason to merchant.
If all pass → status: pre_qualified

Step 3: OFFER GENERATION (Lōns → Merchant)
──────────────────────────────────────────
Generate installment offer:
  - Number of installments (from product config, e.g., 3)
  - Installment amount = purchaseAmount / numberOfInstallments (+ customer fee if applicable)
  - First installment date (configurable: immediate or deferred)
  - Total cost to customer (purchase amount + fees)
  - Merchant discount fee (not shown to customer)

Return offer to merchant:
{
  "transactionId": "uuid",
  "status": "offer_presented",
  "offer": {
    "purchaseAmount": "15000.00",
    "numberOfInstallments": 3,
    "installmentAmount": "5000.00",
    "firstInstallmentDate": "2026-05-14",
    "totalCustomerCost": "15000.00",   // Zero-interest in this example
    "customerFee": "0.00"
  },
  "expiresAt": "2026-04-14T15:30:00Z"  // 15 minutes from now
}

Status: pre_qualified → offer_presented

Step 4: CUSTOMER ACCEPTANCE (Customer → Lōns via merchant or direct)
────────────────────────────────────────────────────────────────────
Customer reviews offer on merchant's checkout page and confirms.
Merchant calls:

POST /v1/bnpl/checkout/{transactionId}/accept
{ "customerConsent": true }

Alternatively, customer confirms via SMS OTP or USSD prompt (depending on channel).

Status: offer_presented → customer_accepted

Step 5: CONTRACT CREATION (Lōns internal)
─────────────────────────────────────────
System creates:
  a. Contract record (reusing existing Contract model, type = BNPL)
  b. Repayment schedule (N installments)
  c. Ledger entries (debit: BNPL receivable, credit: merchant payable)
  d. Deduct purchaseAmount from customer's BNPL credit limit (FR-BN-004)

Status: customer_accepted → contract_created

Step 6: MERCHANT SETTLEMENT (Lōns → Wallet)
───────────────────────────────────────────
Based on settlement schedule (IMMEDIATE or T_PLUS_1):
  - Calculate: settlementAmount = purchaseAmount - discountFee
  - Initiate disbursement to merchant's settlement account
  - On confirmation: update merchantSettledAt, notify merchant via webhook

Status: contract_created → merchant_settled

Step 7: CUSTOMER REPAYMENT (ongoing)
────────────────────────────────────
Installments collected per standard repayment engine (FR-RP-001):
  - Auto-deduction from customer wallet on each due date
  - Retry on failure per configurable schedule
  - Late payment penalties per product config
  - Notifications per schedule (reminder, due today, overdue)

Status: merchant_settled → repaying (after first installment is due)

Step 8: COMPLETION
──────────────────
When all installments are paid:
  - Contract status → settled
  - Restore BNPL credit limit by purchaseAmount
  - BnplTransaction status → completed

Status: repaying → completed
```

### 4.3 Merchant Integration Model

**For v1.0: REST API only.** The merchant's checkout system integrates via REST API calls. No SDK, no redirect flow.

API endpoints:
- `POST /v1/bnpl/checkout` — Initiate BNPL transaction
- `GET /v1/bnpl/checkout/{transactionId}` — Check transaction status
- `POST /v1/bnpl/checkout/{transactionId}/accept` — Customer accepts offer
- `POST /v1/bnpl/checkout/{transactionId}/cancel` — Cancel before acceptance
- `POST /v1/bnpl/refund` — Initiate refund
- `GET /v1/bnpl/merchants/{merchantId}/transactions` — List merchant transactions
- `GET /v1/bnpl/merchants/{merchantId}/settlements` — List merchant settlements

**Authentication:** Merchant authenticates using API key (same mechanism as SP API keys, scoped to merchant). Merchant's API key has permissions limited to BNPL operations for that specific merchant.

**Response time SLA:** The pre-qualification step (Step 2) must complete within 3 seconds. The customer is waiting at checkout. Credit limit check and blacklist check should be Redis-cached for speed.

### 4.4 Customer Data from Merchant

The merchant provides:
- `customerId` — the customer's wallet ID, phone number, or other external identifier that maps to a Lōns customer record
- `purchaseAmount` and `currency`
- `itemDescription` — optional, for customer's statement
- `merchantOrderRef` — merchant's order reference for reconciliation

The merchant does NOT provide sensitive customer data (name, national ID, etc.). Lōns resolves the customer internally from the external identifier.

---

## 5. Installment Schedule Mechanics

### 5.1 Standard Configurations

| Parameter | Configuration | Default |
|---|---|---|
| Number of installments | Configurable per product: 2, 3, 4, 6, or 12 | 3 |
| Installment frequency | Weekly, bi-weekly, or monthly (per product) | Monthly |
| First installment timing | (A) At purchase (pay-now portion), or (B) Deferred to first due date | B — Deferred |
| Interest/fee model | (A) Zero-interest (merchant absorbs via discount fee), (B) Customer fee (flat or %), (C) Both | A — Zero-interest |

### 5.2 Installment Calculation

**Zero-interest model (most common for BNPL):**
```
installmentAmount = purchaseAmount / numberOfInstallments
```
If not evenly divisible, the last installment absorbs the remainder:
```
Example: GHS 100 in 3 installments → GHS 33.34, GHS 33.33, GHS 33.33
```

**Customer fee model:**
```
totalCustomerCost = purchaseAmount + customerFee
installmentAmount = totalCustomerCost / numberOfInstallments
```
Customer fee can be flat (e.g., GHS 50) or percentage (e.g., 2% of purchase amount). Configurable per product.

### 5.3 Zero-Interest Promotional Periods

Configured at the product level, not per merchant. A product can be defined as "zero-interest for first 3 months" — meaning the first N installments carry no interest. If the customer misses payments and the promotional period ends, standard interest kicks in on the remaining balance.

**Recommendation for v1.0:** Keep it simple — zero-interest is the product's default behavior (no interest charged to customer; merchant discount fee covers the cost of credit). Promotional periods add complexity and can be deferred.

### 5.4 Late Payment Handling

Per FR-BN-003 and product configuration:

| Scenario | Behavior |
|---|---|
| Missed installment | Apply late penalty per product config (flat fee or %). Send overdue notification. |
| 2+ missed installments | Escalate to collections queue. Send stronger notification. |
| Acceleration clause | Configurable: after N missed installments, entire remaining balance becomes due immediately. Default: after 2 missed. |
| Impact on credit limit | Missed payments reduce future BNPL credit limit per scoring engine rules. |

---

## 6. Merchant Settlement Flow

### 6.1 Settlement Calculation

```
merchantSettlementAmount = purchaseAmount - (purchaseAmount * discountFeePercent / 100)
```

Example: Purchase GHS 1,000, discount fee 3% → Merchant receives GHS 970, Lōns/SP retains GHS 30.

### 6.2 Settlement Timing

| Schedule | Behavior |
|---|---|
| IMMEDIATE | Settlement initiated as soon as customer accepts and contract is created. Merchant receives funds within minutes (depends on wallet provider). |
| T_PLUS_1 | Transactions accumulated during the day. Settlement batch processed at end of day (configurable time). Single payment to merchant for all transactions that day. |
| WEEKLY | Accumulated weekly, settled on configured day. |
| BI_WEEKLY | Accumulated bi-weekly. |

**Recommendation for v1.0:** Support IMMEDIATE and T_PLUS_1. Weekly and bi-weekly can follow later.

### 6.3 Merchant Settlement Model

```prisma
model MerchantSettlement {
  id                String                  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String                  @map("tenant_id") @db.Uuid
  merchantId        String                  @map("merchant_id") @db.Uuid
  periodStart       DateTime                @map("period_start") @db.Date
  periodEnd         DateTime                @map("period_end") @db.Date
  transactionCount  Int                     @map("transaction_count")
  grossAmount       Decimal                 @map("gross_amount") @db.Decimal(19, 4)
  totalDiscountFees Decimal                 @map("total_discount_fees") @db.Decimal(19, 4)
  totalRefunds      Decimal                 @default(0) @map("total_refunds") @db.Decimal(19, 4)
  netAmount         Decimal                 @map("net_amount") @db.Decimal(19, 4)
  currency          String                  @db.VarChar(3)
  status            MerchantSettlementStatus @default(calculated)
  externalRef       String?                 @map("external_ref") @db.VarChar(255)
  settledAt         DateTime?               @map("settled_at") @db.Timestamptz(6)
  failureReason     String?                 @map("failure_reason") @db.Text
  createdAt         DateTime                @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime                @updatedAt @map("updated_at") @db.Timestamptz(6)

  merchant          Merchant                @relation(fields: [merchantId], references: [id])

  @@index([tenantId])
  @@index([merchantId])
  @@index([status])
  @@map("merchant_settlements")
}

enum MerchantSettlementStatus {
  calculated
  approved
  executing
  settled
  failed

  @@map("merchant_settlement_status")
}
```

### 6.4 Discount Fee Ownership

The discount fee is set per merchant by the SP. It represents the cost to the merchant for offering BNPL (the merchant gets paid upfront, but the customer pays over time — someone bears the cost of that time value of money).

The discount fee revenue flows into the standard SP revenue settlement (Docs/06-post-process.md §2) as a new revenue type: `MERCHANT_DISCOUNT_FEE`. It is split between the SP and Lōns per the commercial agreement.

---

## 7. Refund Handling

### 7.1 Full Refund

**Trigger:** Merchant initiates refund via API (customer returns product).

```
POST /v1/bnpl/refund
{
  "transactionId": "uuid",
  "refundAmount": "15000.00",
  "reason": "Customer returned product",
  "merchantOrderRef": "RET-2026-0042"
}
```

**Flow:**
1. Validate: transaction exists, is in `merchant_settled` or `repaying` status, refund amount ≤ remaining balance
2. Cancel all remaining installments on the repayment schedule
3. Calculate: customer has already paid X in installments → refund X to customer wallet
4. Calculate: merchant settlement clawback → deduct from next merchant settlement batch, or initiate collection from merchant
5. Restore customer's BNPL credit limit
6. BnplTransaction status → `refunded`

### 7.2 Partial Refund

**Trigger:** Merchant initiates partial refund (partial return, price adjustment).

**Flow:**
1. Validate: refundAmount < purchaseAmount, refundAmount ≤ remaining outstanding balance
2. Recalculate remaining installments:
   - New remaining balance = old remaining balance - refundAmount
   - Option A: Reduce each remaining installment proportionally
   - Option B: Remove installments from the end (last installment first)
   - **Recommendation:** Option A (reduce proportionally). More predictable for customer.
3. If customer has overpaid (already paid more than new total): refund the excess to customer wallet
4. Adjust merchant settlement: clawback refundAmount from next settlement
5. BnplTransaction status → `partially_refunded`

### 7.3 Refund Window

Configurable per product. Default: 30 days from purchase date. After the refund window closes, refunds are no longer accepted through the standard flow — merchant and customer must resolve through SP's dispute process.

### 7.4 Refund Impact on Merchant Settlement

| Refund Timing | Settlement Impact |
|---|---|
| Before merchant settlement | Deduct refund from pending settlement amount |
| After merchant settlement | Deduct from next settlement batch. If no upcoming settlement, initiate collection from merchant. |
| Merchant has negative balance | Accumulate negative balance. Block new BNPL transactions for this merchant until balance is positive. |

---

## 8. BNPL Credit Limit (FR-BN-004)

### 8.1 Separate from Overdraft Limit

Each customer has a BNPL-specific credit limit, separate from any overdraft credit line. This is stored on the existing `Subscription` model (which tracks a customer's subscription to a product).

```prisma
// Extend existing Subscription model:
model Subscription {
  // ... existing fields ...
  bnplCreditLimit     Decimal?   @map("bnpl_credit_limit") @db.Decimal(19, 4)
  bnplUtilizedAmount  Decimal?   @default(0) @map("bnpl_utilized_amount") @db.Decimal(19, 4)
  bnplAvailableLimit  Decimal?   @map("bnpl_available_limit") @db.Decimal(19, 4)
}
```

### 8.2 Limit Lifecycle

- **Initial assignment:** Scoring engine assigns initial BNPL credit limit at subscription activation.
- **Utilization:** Each BNPL transaction deducts `purchaseAmount` from `bnplAvailableLimit`.
- **Restoration:** As installments are repaid, the paid principal portion restores `bnplAvailableLimit` proportionally.
- **Full restoration:** When a BNPL contract is fully settled, the full `purchaseAmount` is restored.
- **Dynamic adjustment:** Periodic scoring review can increase or decrease `bnplCreditLimit` based on payment behavior and purchase history.

---

## 9. Event Types

### 9.1 New Events for `packages/event-contracts/`

```typescript
// BNPL transaction events
BNPL_CHECKOUT_INITIATED = 'bnpl.checkout.initiated',
BNPL_PREQUALIFICATION_COMPLETED = 'bnpl.prequalification.completed',
BNPL_PREQUALIFICATION_DECLINED = 'bnpl.prequalification.declined',
BNPL_OFFER_PRESENTED = 'bnpl.offer.presented',
BNPL_OFFER_ACCEPTED = 'bnpl.offer.accepted',
BNPL_OFFER_DECLINED = 'bnpl.offer.declined',
BNPL_OFFER_EXPIRED = 'bnpl.offer.expired',
BNPL_CONTRACT_CREATED = 'bnpl.contract.created',
BNPL_TRANSACTION_COMPLETED = 'bnpl.transaction.completed',
BNPL_TRANSACTION_DEFAULTED = 'bnpl.transaction.defaulted',

// Merchant settlement events
MERCHANT_SETTLEMENT_CALCULATED = 'merchant.settlement.calculated',
MERCHANT_SETTLEMENT_EXECUTED = 'merchant.settlement.executed',
MERCHANT_SETTLEMENT_FAILED = 'merchant.settlement.failed',

// Refund events
BNPL_REFUND_INITIATED = 'bnpl.refund.initiated',
BNPL_REFUND_COMPLETED = 'bnpl.refund.completed',
BNPL_REFUND_FAILED = 'bnpl.refund.failed',

// Merchant lifecycle events
MERCHANT_CREATED = 'merchant.created',
MERCHANT_ACTIVATED = 'merchant.activated',
MERCHANT_SUSPENDED = 'merchant.suspended',
MERCHANT_TERMINATED = 'merchant.terminated',

// BNPL credit limit events
BNPL_CREDIT_LIMIT_ASSIGNED = 'bnpl.credit_limit.assigned',
BNPL_CREDIT_LIMIT_CHANGED = 'bnpl.credit_limit.changed',
BNPL_CREDIT_UTILIZED = 'bnpl.credit.utilized',
BNPL_CREDIT_RESTORED = 'bnpl.credit.restored',
```

---

## 10. Admin Portal Implications

### 10.1 New Screens

1. **Merchant Management** — CRUD for merchants. List with search/filter by status, category, name. Detail page showing merchant info, KYC status, transaction history, settlement history, current caps and utilization.

2. **Merchant Onboarding Wizard** — Step-by-step: Basic info → KYC documents → Settlement account → Terms (discount fee, caps) → Review → Submit for approval.

3. **Merchant Settlement Dashboard** — Aggregate view of pending/completed settlements. Drill-down to individual merchant settlement details. Manual settlement trigger for exceptions.

4. **BNPL Transaction Monitor** — Real-time view of BNPL transactions across all merchants. Filter by status, merchant, date range, amount. Useful for operations team monitoring.

### 10.2 Updated Screens

- **Product Wizard** — When product type is BNPL, show BNPL-specific fields: number of installments, installment frequency, merchant discount fee default, refund window, acceleration clause config, credit limit assignment rules.
- **Customer Detail** — Add "BNPL" tab showing active BNPL transactions, credit limit, utilized amount, installment schedule.
- **Collections Dashboard** — BNPL defaults appear in the standard collections queue with merchant context (merchant name, order reference).

### 10.3 Merchant-Facing Interface (Post-v1.0)

**For v1.0:** No separate merchant portal. Merchants interact exclusively via API. Merchant onboarding is done by the SP via admin portal.

**Post-v1.0 scope:** A lightweight merchant portal (could be a separate Next.js app or a section within the admin portal with merchant-scoped authentication) providing: transaction list, settlement reports, refund initiation, account settings. This aligns with the PM recommendation.

---

## 11. Test Scenarios

### 11.1 Happy Path
- Merchant initiates checkout → customer pre-qualifies → offer accepted → contract created → merchant settled → installments paid → completed
- Verify: credit limit deducted on purchase, restored on repayment, merchant receives correct settlement amount

### 11.2 Decline Scenarios
- Customer blacklisted → decline with reason
- Insufficient BNPL credit limit → decline with reason
- Merchant suspended → decline with reason
- Purchase amount exceeds product max → decline with reason
- Merchant daily cap exceeded → decline with reason

### 11.3 Refund Scenarios
- Full refund before first installment → cancel schedule, clawback merchant settlement
- Full refund after 2 of 3 installments paid → refund paid amount to customer, clawback from merchant
- Partial refund → recalculate remaining installments
- Refund after refund window → reject refund request

### 11.4 Edge Cases
- Concurrent BNPL checkout that would exceed credit limit → only first should succeed (race condition)
- Merchant settlement fails (wallet error) → retry logic, manual intervention path
- Customer accepts offer after expiry → reject with expired message
- Installment collection fails, then refund requested → handle negative balance correctly

---

## 12. Open Questions for Decision

| # | Question | Options | BA Recommendation |
|---|---|---|---|
| 1 | First installment timing | (A) Immediate at purchase, (B) Deferred to first due date | B — deferred. Aligns with "buy now, pay later" expectation. Configurable per product. |
| 2 | Who sets the merchant discount fee? | (A) SP sets per merchant, (B) SP sets default, merchant negotiates | A for v1.0 — SP sets per merchant. B is a post-v1.0 enhancement. |
| 3 | Merchant self-registration? | (A) SP-only onboarding, (B) Self-registration with SP approval | A for v1.0. B post-v1.0. |
| 4 | Partial refund installment adjustment | (A) Reduce each remaining installment proportionally, (B) Remove last installment(s) | A — proportional reduction. More predictable. |
| 5 | Acceleration on missed payments | (A) After 2 missed, (B) After 3 missed, (C) Configurable | C — configurable per product with default of 2. |
| 6 | Settlement schedule options for v1.0 | (A) IMMEDIATE + T_PLUS_1 only, (B) All four | A — keep it simple. Weekly/bi-weekly can follow. |
