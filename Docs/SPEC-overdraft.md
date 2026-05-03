# SPEC: Overdraft — Credit Line & Real-Time Drawdown

**Status:** Proposed
**Date:** 2026-04-30
**Author:** Business Analyst (Claude)
**Needed by:** Sprint 10 start
**Depends on:** ADR-overdraft-realtime.md (architectural decisions)

---

## 1. Overview

Overdraft allows a customer to complete a wallet transaction when their balance is insufficient, with the shortfall covered by a pre-approved credit line. Unlike Micro-Loans (customer-initiated, fixed-term, installment-based), overdraft is transaction-triggered, revolving, and operates in real-time at the point of sale.

This spec defines the complete overdraft product implementation: credit line entity model, real-time drawdown mechanics, auto-repayment, interest accrual and billing cycles, overdue handling, credit limit management, revenue settlement, admin portal screens, integration patterns, events, and test scenarios.

**Requirements coverage:** FR-OD-001 through FR-OD-008 (Docs/01-loan-portfolio.md §1), FR-RP-001 (repayment waterfall), FR-DM-001/002 (overdue classification and penalties), FR-ST-001/002 (statements and ledger), FR-RS-001/002/003 (revenue settlement).

**Architecture decision:** ADR-overdraft-realtime.md decided on a separate `overdraft-service` (Option A). This spec assumes that decision.

---

## 2. What Makes Overdraft Different

The following table clarifies where overdraft diverges from the existing micro-loan/BNPL loan lifecycle managed by the process engine. Dev should treat these as architectural boundaries — overdraft should NOT be forced through the `LoanRequestStatus` state machine.

| Dimension | Micro-Loan / BNPL | Overdraft |
|---|---|---|
| Trigger | Customer/merchant initiates an application | Wallet provider pushes an insufficient-balance event |
| Credit decision | Per-application scoring | Pre-approved credit line; drawdown is a balance check |
| Latency target | < 5 minutes (micro-loan), < 30s (BNPL) | < 500ms decision, < 3s end-to-end |
| Contract model | Fixed-term contract per disbursement | Revolving credit line with multiple drawdowns |
| Repayment | Scheduled installments | Automatic collection on next wallet credit |
| Interest | Calculated at origination, baked into schedule | Daily accrual on aggregate outstanding balance |
| Lifecycle entity | `LoanRequest` → `Contract` | `CreditLine` → `Drawdown[]` |

---

## 3. Entity Models

### 3.1 CreditLine

The CreditLine is the core entity — it represents a customer's pre-approved overdraft facility. One CreditLine per customer per overdraft product per tenant.

```prisma
model CreditLine {
  id                String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String           @map("tenant_id") @db.Uuid
  customerId        String           @map("customer_id") @db.Uuid
  productId         String           @map("product_id") @db.Uuid
  lenderId          String           @map("lender_id") @db.Uuid
  currency          String           @db.VarChar(3)
  approvedLimit     Decimal          @map("approved_limit") @db.Decimal(19, 4)
  availableBalance  Decimal          @map("available_balance") @db.Decimal(19, 4)
  outstandingAmount Decimal          @default(0) @map("outstanding_amount") @db.Decimal(19, 4)
  interestRate      Decimal          @map("interest_rate") @db.Decimal(7, 4)
  interestAccrued   Decimal          @default(0) @map("interest_accrued") @db.Decimal(19, 4)
  feesOutstanding   Decimal          @default(0) @map("fees_outstanding") @db.Decimal(19, 4)
  penaltiesAccrued  Decimal          @default(0) @map("penalties_accrued") @db.Decimal(19, 4)
  status            CreditLineStatus @default(pending_activation)
  billingCycleDay   Int              @default(1) @map("billing_cycle_day")
  currentCycleStart DateTime?        @map("current_cycle_start") @db.Date
  currentCycleEnd   DateTime?        @map("current_cycle_end") @db.Date
  lastDrawdownAt    DateTime?        @map("last_drawdown_at") @db.Timestamptz(6)
  lastRepaymentAt   DateTime?        @map("last_repayment_at") @db.Timestamptz(6)
  lastLimitReviewAt DateTime?        @map("last_limit_review_at") @db.Timestamptz(6)
  activatedAt       DateTime?        @map("activated_at") @db.Timestamptz(6)
  expiresAt         DateTime?        @map("expires_at") @db.Timestamptz(6)
  frozenAt          DateTime?        @map("frozen_at") @db.Timestamptz(6)
  frozenReason      String?          @map("frozen_reason") @db.Text
  closedAt          DateTime?        @map("closed_at") @db.Timestamptz(6)
  closedReason      String?          @map("closed_reason") @db.Text
  metadata          Json?
  createdAt         DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime         @updatedAt @map("updated_at") @db.Timestamptz(6)

  customer          Customer         @relation(fields: [customerId], references: [id])
  product           Product          @relation(fields: [productId], references: [id])
  lender            Lender           @relation(fields: [lenderId], references: [id])
  drawdowns         Drawdown[]
  limitChanges      CreditLimitChange[]

  @@unique([tenantId, customerId, productId])
  @@index([tenantId])
  @@index([customerId])
  @@index([status])
  @@index([expiresAt])
  @@map("credit_lines")
}

enum CreditLineStatus {
  pending_activation
  active
  frozen
  suspended
  closed
  expired

  @@map("credit_line_status")
}
```

**Key invariants:**
- `availableBalance = approvedLimit - outstandingAmount` (maintained by the service, not computed on read — for cache consistency).
- `outstandingAmount` includes principal only. Interest, fees, and penalties are tracked separately.
- All monetary fields are `Decimal(19, 4)`. No `Number()` casts, no `parseFloat()`. Values flow as strings through GraphQL and REST boundaries.

### 3.2 CreditLine Status Transitions

```
pending_activation → active          Customer activates via SP channel; scoring assigns limit
active → frozen                      Overdue payment, fraud flag, or manual SP action
frozen → active                      Outstanding cleared, SP unfreezes
active → suspended                   Temporary hold (limit review in progress)
suspended → active                   Review complete, reinstated
active → closed                      Customer deactivates AND total balance is zero
active → expired                     Contract lifecycle duration exceeded
frozen → closed                      Balance cleared while frozen, then closed
expired → closed                     Balance cleared after expiry
```

**Transition rules:**
- `closed` requires: `outstandingAmount == 0 AND interestAccrued == 0 AND feesOutstanding == 0 AND penaltiesAccrued == 0`.
- `frozen` is immediate and blocks all new drawdowns. Existing outstanding balance continues to accrue interest.
- `expired` is system-triggered when `expiresAt` is reached. Outstanding balance remains collectible. No new drawdowns permitted.
- `suspended` blocks new drawdowns. Used during limit review processing to prevent drawdowns against a limit that may change.

### 3.3 Drawdown

Each drawdown records an individual overdraft transaction — a specific shortfall covered by the credit line.

```prisma
model Drawdown {
  id              String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String         @map("tenant_id") @db.Uuid
  creditLineId    String         @map("credit_line_id") @db.Uuid
  amount          Decimal        @db.Decimal(19, 4)
  currency        String         @db.VarChar(3)
  walletBalance   Decimal        @map("wallet_balance") @db.Decimal(19, 4)
  transactionRef  String         @map("transaction_ref") @db.VarChar(255)
  walletRef       String?        @map("wallet_ref") @db.VarChar(255)
  feeAmount       Decimal        @default(0) @map("fee_amount") @db.Decimal(19, 4)
  status          DrawdownStatus @default(initiated)
  failureReason   String?        @map("failure_reason") @db.Text
  completedAt     DateTime?      @map("completed_at") @db.Timestamptz(6)
  createdAt       DateTime       @default(now()) @map("created_at") @db.Timestamptz(6)

  creditLine      CreditLine     @relation(fields: [creditLineId], references: [id])

  @@index([tenantId])
  @@index([creditLineId])
  @@index([transactionRef])
  @@index([status])
  @@map("drawdowns")
}

enum DrawdownStatus {
  initiated
  completed
  failed
  reversed

  @@map("drawdown_status")
}
```

**Field notes:**
- `walletBalance`: the customer's wallet balance at the time of the drawdown request. Recorded for audit and analytics.
- `transactionRef`: the wallet provider's reference for the original transaction that triggered the overdraft.
- `walletRef`: the wallet provider's reference for the disbursement transaction (assigned on completion).
- `feeAmount`: per-transaction fee calculated at drawdown time per product configuration.
- `reversed`: used when a drawdown is rolled back (e.g., original transaction was itself reversed by the wallet provider).

### 3.4 CreditLimitChange

Every change to a credit line's approved limit is recorded as an immutable audit record.

```prisma
model CreditLimitChange {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String    @map("tenant_id") @db.Uuid
  creditLineId  String    @map("credit_line_id") @db.Uuid
  previousLimit Decimal   @map("previous_limit") @db.Decimal(19, 4)
  newLimit      Decimal   @map("new_limit") @db.Decimal(19, 4)
  reasonCode    String    @map("reason_code") @db.VarChar(50)
  reasonDetail  String?   @map("reason_detail") @db.Text
  triggeredBy   String    @map("triggered_by") @db.VarChar(50)
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

  creditLine    CreditLine @relation(fields: [creditLineId], references: [id])

  @@index([tenantId])
  @@index([creditLineId])
  @@map("credit_limit_changes")
}
```

**Reason codes:** `initial_assignment`, `periodic_review`, `behavior_upgrade`, `behavior_downgrade`, `manual_adjustment`, `overdue_reduction`, `fraud_freeze`, `regulatory_cap`.

**Triggered by values:** `scoring_engine`, `scheduler`, `operator:{userId}`, `system`.

**Requirement mapping:** Fulfils FR-OD-003.6 (all limit changes logged with reason codes and timestamps).

---

## 4. Product Configuration for Overdraft

When a product's type is `OVERDRAFT`, the following additional configuration is stored in the product's `metadata` JSON field (or a dedicated `overdraftConfig` JSON column if Dev prefers separation):

```json
{
  "billingCycleDays": 30,
  "billingCycleStartDay": 1,
  "contractLifecycleDays": 365,
  "partialDrawdownEnabled": false,
  "autoRepaymentEnabled": true,
  "autoRepaymentWaterfall": ["penalties", "interest", "fees", "principal"],
  "limitReviewFrequencyDays": 90,
  "interestAccrualMethod": "daily_aggregate",
  "interestModel": "percentage",
  "gracePeriodDays": 0,
  "transactionFee": {
    "type": "flat",
    "amount": "0.50",
    "currency": "GHS"
  },
  "penaltyConfig": {
    "type": "percentage_daily",
    "rate": "0.005",
    "maxCapPercent": "0.30",
    "startAfterDays": 1
  },
  "reminderSchedule": {
    "beforeDueDays": [3, 1],
    "afterOverdueDays": [1, 7, 14, 30]
  }
}
```

**Requirement mapping:**
- `billingCycleDays`, `billingCycleStartDay`: FR-OD-004.3 (consolidated billing cycle)
- `contractLifecycleDays`: FR-OD-001.1 (contract lifecycle duration)
- `partialDrawdownEnabled`: FR-OD-004.5 (decline when exceeding limit) — configurable per ADR §4.2
- `autoRepaymentWaterfall`: FR-OD-005.1 (configurable priority order) and FR-RP-001.3
- `limitReviewFrequencyDays`: FR-OD-003.3 (configurable review frequency)
- `penaltyConfig`: FR-OD-006.2 (penalty fee application)
- `reminderSchedule`: FR-OD-006.3 (configurable reminder intervals)

---

## 5. Subscription & Activation Flow

Overdraft subscription uses the existing `Subscription` model. The activation flow creates a `CreditLine`.

### 5.1 Activation Steps

```
1. Customer requests overdraft activation via SP's channel (wallet app, USSD, API)
   → API call: mutation { activateOverdraftSubscription(customerId, productCode) }

2. Validation checks (FR-OD-002.2):
   a. Customer exists and is active
   b. Customer KYC status meets product minimum
   c. Product exists, is active, and type == OVERDRAFT
   d. No existing active overdraft subscription for this customer + product

3. Pre-qualification (FR-PQ-001):
   a. Run pre-qualification rules engine for the product
   b. If fail → return rejection with reason codes

4. Credit scoring (FR-CS-003):
   a. Invoke scoring engine: { customerId, productCode, context: "new_subscription" }
   b. Receive: { creditScore, recommendedLimit, probabilityOfDefault, riskTier }

5. Approval decision (FR-AE-001):
   a. Compare score against product thresholds
   b. If auto-approve: proceed
   c. If manual_review: create work item in O&M Portal (FR-AE-002.2), halt until resolved
   d. If reject: return rejection

6. Credit line creation:
   a. Create Subscription record (status: active)
   b. Create CreditLine record:
      - approvedLimit = min(recommendedLimit, product.maxAmount)
      - availableBalance = approvedLimit
      - outstandingAmount = 0
      - interestRate = product.interestRate
      - status = active
      - billingCycleDay = product.overdraftConfig.billingCycleStartDay
      - expiresAt = now + product.overdraftConfig.contractLifecycleDays
   c. Create CreditLimitChange record (reasonCode: initial_assignment, triggeredBy: scoring_engine)
   d. Populate Redis cache: creditline:{tenantId}:{customerId}:{productId}

7. Confirmation:
   a. Emit CREDITLINE_ACTIVATED event
   b. Send activation notification (FR-OD-002.5)
   c. Return credit line details to customer
```

### 5.2 Deactivation Steps

```
1. Customer or SP requests deactivation

2. Check: creditLine.outstandingAmount == 0 AND interestAccrued == 0
   AND feesOutstanding == 0 AND penaltiesAccrued == 0
   → If non-zero: reject deactivation, return outstanding balance details (FR-OD-002.4)

3. CreditLine status → closed (closedReason: "customer_deactivation" or "sp_deactivation")
4. Subscription status → deactivated
5. Invalidate Redis cache
6. Emit CREDITLINE_CLOSED event
7. Send deactivation confirmation notification (FR-OD-002.5)
```

---

## 6. Drawdown Flow (Real-Time)

This is the core real-time flow triggered when a customer's wallet transaction exceeds their balance. Per the ADR, this runs in the dedicated overdraft-service with Redis-cached credit line state.

### 6.1 Sequence

```
1. Wallet provider detects insufficient balance for a transaction
2. Wallet provider sends webhook:
   POST /webhooks/{provider}/insufficient-balance
   {
     walletId: string,
     transactionAmount: string,    // Decimal as string
     availableBalance: string,
     shortfall: string,
     transactionRef: string,
     timestamp: string
   }

3. Integration service:
   a. Validates webhook signature (HMAC)
   b. Maps walletId → { tenantId, customerId } via lookup table
   c. Emits internal event: wallet.balance.insufficient

4. Overdraft service receives event, performs checks (all against Redis cache):
   a. Does customer have an active credit line for an overdraft product?
      → If no: emit wallet.overdraft.declined { reason: "no_credit_line" }
   b. Is credit line status == active?
      → If frozen/suspended/closed/expired: decline with reason
   c. Is shortfall <= availableBalance on credit line?
      → If no AND partialDrawdownEnabled == false: decline { reason: "insufficient_limit" }
      → If no AND partialDrawdownEnabled == true: adjust shortfall to availableBalance
   d. Calculate transaction fee per product config

5. If approved:
   a. Create Drawdown record (status: initiated)
   b. Update credit line (write-through to both PostgreSQL and Redis):
      - availableBalance -= (shortfall + feeAmount)
      - outstandingAmount += shortfall
      - feesOutstanding += feeAmount
      - lastDrawdownAt = now
   c. Call wallet adapter: disburse(walletId, shortfall, transactionRef)
   d. On wallet confirmation:
      - Drawdown status → completed, set walletRef and completedAt
      - Emit CREDITLINE_DRAWDOWN_COMPLETED
   e. Emit event for ledger service:
      - Debit: overdraft receivable (amount = shortfall)
      - Credit: disbursement payable (amount = shortfall)
      - Debit: fee receivable (amount = feeAmount)
      - Credit: fee income (amount = feeAmount)

6. If declined:
   a. Emit wallet.overdraft.declined { reason, customerId, transactionRef }
   b. Wallet provider receives decline → original transaction fails

7. If wallet disbursement fails:
   a. Drawdown status → failed, set failureReason
   b. Reverse credit line updates (restore availableBalance, reduce outstandingAmount)
   c. Emit CREDITLINE_DRAWDOWN_FAILED
   d. Wallet provider receives failure → original transaction fails
```

### 6.2 Latency Targets

| Segment | Target | Notes |
|---|---|---|
| Webhook receipt → drawdown decision | < 200ms | Credit line lookup from Redis cache |
| Drawdown decision → wallet disburse call | < 100ms | Internal service call |
| Wallet disburse → confirmation | 500ms–3s | Provider-dependent (MTN MoMo ~2s, M-Pesa ~3s) |
| **Total round-trip** | **< 3s** | Customer-facing latency at point of sale |

**Requirement mapping:** FR-OD-004.1 (automatic check and cover shortfall), FR-OD-004.2 (deducted from limit in real-time), FR-OD-004.4 (fees applied per config), FR-OD-004.5 (decline if exceeds limit), FR-OD-004.6 (record with timestamp, amounts, fees, reference), FR-PE-001 (< 30s pipeline — overdraft well within this).

### 6.3 Partial Drawdown Policy

When the shortfall exceeds the available credit line balance:

- **Default (partialDrawdownEnabled = false):** Reject entirely. Customer's transaction fails with insufficient funds. Simple and predictable.
- **Optional (partialDrawdownEnabled = true):** Disburse the available credit line balance. The customer's transaction may still fail if wallet balance + partial drawdown < transaction amount (depends on wallet provider behavior). Use with caution — a customer could end up with an outstanding overdraft for a transaction that didn't complete.

Configurable per product. Recommendation: default to reject (false).

### 6.4 Concurrent Drawdown Handling

A customer may have multiple wallet transactions in rapid succession. The service must handle concurrent drawdown requests against the same credit line:

- **Redis-level:** Use `WATCH`/`MULTI`/`EXEC` or Lua scripts for atomic balance checks and updates on the cached credit line.
- **PostgreSQL-level:** Use `SELECT ... FOR UPDATE` on the credit line row within the transaction to prevent race conditions.
- **Ordering:** If two concurrent drawdowns are both approved but together exceed the limit, the second should be declined. Redis atomic operations ensure this.

---

## 7. Auto-Repayment Flow

When funds are credited to the customer's wallet, the system automatically collects outstanding overdraft balance. This is the primary repayment mechanism for overdraft (FR-OD-005.1).

### 7.1 Sequence

```
1. Wallet provider sends webhook on wallet credit:
   POST /webhooks/{provider}/transaction-notification
   {
     walletId: string,
     type: "credit",
     amount: string,
     newBalance: string,
     transactionRef: string,
     timestamp: string
   }

2. Integration service maps walletId → { tenantId, customerId }, emits:
   wallet.balance.credited { tenantId, customerId, walletId, creditAmount, newBalance }

3. Overdraft service receives event:
   a. Look up active credit lines for customer with outstandingAmount > 0
   b. If no outstanding balance: ignore event, return
   c. Calculate total owed:
      totalOwed = outstandingAmount + interestAccrued + feesOutstanding + penaltiesAccrued
   d. Calculate collection amount:
      collectionAmount = min(totalOwed, creditAmount)

4. Apply waterfall allocation (configurable per product, default order):
   a. penaltiesAccrued (reduce to 0 or by allocated portion)
   b. interestAccrued (reduce to 0 or by allocated portion)
   c. feesOutstanding (reduce to 0 or by allocated portion)
   d. outstandingAmount (reduce by remainder; restore availableBalance by same amount)

5. Initiate collection:
   a. Call wallet adapter: collect(walletId, collectionAmount, autoRepaymentRef)
   b. On success:
      - Update credit line balances (write-through to PostgreSQL and Redis)
      - Create ledger entries:
        * Credit: overdraft receivable (principal portion)
        * Debit: repayment received (total collected)
        * Credit: interest receivable (interest portion)
        * Credit: fee receivable (fee portion)
        * Credit: penalty receivable (penalty portion)
      - Emit CREDITLINE_REPAYMENT_AUTO_COLLECTED
      - If fully repaid (totalOwed == 0 after collection):
        * Emit CREDITLINE_FULLY_REPAID
        * Restore full credit limit (availableBalance = approvedLimit)
        * Send full repayment notification
      - Else: send partial repayment notification

6. If collection fails (customer spent funds between credit and collection attempt):
   a. Log failure, do NOT retry immediately (avoid debit loops)
   b. Schedule retry for next wallet credit event
   c. Do NOT freeze the credit line on collection failure — this is expected behavior
```

### 7.2 Manual Repayment

Customers may also make manual repayments toward their overdraft balance (FR-OD-005.2).

```
1. Customer initiates payment via SP channel:
   mutation { makeOverdraftRepayment(creditLineId, amount) }

2. Validate:
   a. Credit line exists and belongs to customer
   b. amount > 0
   c. amount <= totalOwed (if overpayment: reject or cap at totalOwed, configurable)

3. Apply same waterfall allocation as auto-repayment

4. Process:
   a. Call wallet adapter: collect(walletId, amount, manualRepaymentRef)
   b. On success: update balances, create ledger entries, emit CREDITLINE_REPAYMENT_MANUAL
   c. On failure: return error to customer
```

**Requirement mapping:** FR-OD-005.1 (automatic repayment on wallet credit), FR-OD-005.2 (manual repayment), FR-OD-005.3 (partial repayments accepted), FR-OD-005.4 (full repayment → settled, limit restored), FR-OD-005.5 (repayment notification).

---

## 8. Interest Accrual & Billing Cycles

### 8.1 Daily Interest Accrual

Interest accrues daily on the aggregate outstanding balance, not per-drawdown. This is simpler, more predictable for customers, and consistent with how most overdraft products in the market operate.

**Calculation:**
```
dailyRate = annualInterestRate / 365
dailyInterest = outstandingAmount × dailyRate
```

**Execution:** A scheduled job runs daily at 23:59 tenant timezone (configurable). For each active credit line with `outstandingAmount > 0`:

1. Calculate `dailyInterest` using `Decimal` arithmetic (from `packages/common/src/financial/decimal.util.ts`)
2. Update credit line: `interestAccrued += dailyInterest`
3. Create ledger entries:
   - Debit: interest receivable
   - Credit: interest income
4. If `outstandingAmount + interestAccrued + feesOutstanding + penaltiesAccrued` approaches or exceeds `approvedLimit`, emit a warning event
5. Emit CREDITLINE_INTEREST_ACCRUED

**Requirement mapping:** FR-OD-006.1 (interest calculation per product terms — daily accrual).

### 8.2 Billing Cycle Consolidation

All drawdowns within a billing cycle are consolidated into a single statement (FR-OD-004.3).

At billing cycle end:
1. Crystallize accrued interest — add `interestAccrued` to a due amount
2. Generate a cycle statement showing: opening balance, all drawdowns in the cycle, all repayments in the cycle, interest accrued, fees applied, penalties applied, closing balance
3. Set the due date for the cycle (e.g., 7 days after cycle end, configurable via `gracePeriodDays`)
4. Emit CREDITLINE_CYCLE_CLOSED and CREDITLINE_STATEMENT_GENERATED
5. Start a new billing cycle

**The due date triggers the overdue clock.** If the closing balance is not fully repaid by the due date, the credit line enters overdue state and penalty accrual begins.

### 8.3 Interest Models Supported

Per FR-OD-006.1, the product configuration supports:

| Model | Stored in `interestModel` | Calculation |
|---|---|---|
| Percentage (annual) | `percentage` | Daily rate = annual rate / 365, applied to outstanding |
| Flat fee per cycle | `flat` | Fixed fee charged at cycle end regardless of balance |
| Tiered | `tiered` | Different rates for different outstanding amount bands |

---

## 9. Overdue & Penalty Management

### 9.1 Overdue Classification

When a billing cycle's closing balance is not repaid by the due date, the credit line enters an overdue state. The aging classification system applies to credit lines the same way it applies to contracts:

| Bucket | Days Past Due | System Action |
|---|---|---|
| Current | 0 | Normal operation |
| Watch | 1–7 DPD | Reminder notifications (per `reminderSchedule.afterOverdueDays`) |
| Substandard | 8–30 DPD | Freeze credit line (block new drawdowns), escalate to SP operator |
| Doubtful | 31–90 DPD | Refer to recovery engine, credit limit reduction |
| Loss | 90+ DPD | NPL classification, credit bureau reporting, suspend customer across all products |

Bucket thresholds are configurable per product and per regulatory jurisdiction (FR-DM-001.2).

### 9.2 Penalty Application

Penalties accrue per the product's `penaltyConfig`:

```
If type == "percentage_daily":
  dailyPenalty = min(
    outstandingAmount × penaltyConfig.rate,
    outstandingAmount × penaltyConfig.maxCapPercent - penaltiesAccrued
  )
  If dailyPenalty > 0: penaltiesAccrued += dailyPenalty
```

- Penalty accrual runs as part of the daily scheduled job (same job as interest accrual).
- Penalties respect regulatory caps (FR-DM-002.2): `maxCapPercent` ensures total penalties never exceed a configured percentage of the outstanding balance.
- SP operators can waive penalties on a per-credit-line basis with documented reason (FR-DM-002.3).

**Requirement mapping:** FR-OD-006.2 (penalty fees per product terms), FR-OD-006.4 (lifecycle states: Active → Due → Overdue → Delinquent → Default → Written Off → Settled), FR-OD-006.5 (state transitions trigger events).

### 9.3 Credit Line Expiry

When a credit line reaches `expiresAt`:

1. Status → `expired`
2. No new drawdowns permitted
3. Outstanding balance remains collectible (interest and penalties continue to accrue)
4. Per ADR §10 Q5 decision: outstanding balance converts to a fixed-term collection — the system creates a collection work item with a payoff date
5. Emit CREDITLINE_EXPIRED
6. If outstanding balance is zero at expiry, status → `closed` directly

---

## 10. Credit Limit Management

### 10.1 Initial Limit Assignment

On subscription activation, the scoring engine returns a `recommendedLimit`. The system assigns:
```
approvedLimit = min(recommendedLimit, product.maxAmount)
approvedLimit = max(approvedLimit, product.minAmount)  // floor
```
A `CreditLimitChange` record is created with `reasonCode: initial_assignment`.

### 10.2 Periodic Review

A scheduled job runs at the frequency configured in `limitReviewFrequencyDays` (FR-OD-003.3). For each active credit line due for review:

1. Suspend credit line briefly (status → `suspended`) to prevent drawdowns during review
2. Invoke scoring engine: `{ customerId, productCode, context: "limit_review" }`
3. Receive new `recommendedLimit`
4. Apply bounds: `min(recommendedLimit, product.maxAmount)`
5. If new limit differs from current `approvedLimit`:
   a. Update `approvedLimit`
   b. Recalculate `availableBalance = approvedLimit - outstandingAmount` (but never negative)
   c. Create `CreditLimitChange` record
   d. Emit CREDITLINE_LIMIT_CHANGED
   e. Notify customer of limit change
6. Reinstate credit line (status → `active`)
7. Update `lastLimitReviewAt`

### 10.3 Behavior-Triggered Adjustments

Beyond periodic reviews, limits may change due to:

- **Repayment behavior (FR-OD-003.3):** Good repayment history triggers upgrade review. Repeated overdue triggers downgrade.
- **Overdue reduction:** When credit line enters Substandard bucket, reduce limit by a configurable percentage. The reduction only affects future availability, not outstanding balance (FR-OD-003.5).
- **Manual adjustment:** SP operators can adjust limits via the O&M Portal. Requires operator role with limit adjustment permission.

### 10.4 Limit Decrease Rules

Per FR-OD-003.5, a limit decrease does NOT affect outstanding balance. If the new limit is less than the current outstanding amount:
- `approvedLimit = newLimit`
- `availableBalance = 0` (no new drawdowns until repayment brings outstanding below the new limit)
- Outstanding balance continues to be collected via auto-repayment

---

## 11. Revenue Settlement

Overdraft revenue consists of transaction fees, interest income, and penalties. The existing settlement engine (FR-RS-001 through FR-RS-003) handles revenue sharing.

### 11.1 Revenue Types

| Revenue Type | When Generated | Ledger Entry |
|---|---|---|
| Transaction fee | Each drawdown | Debit: fee receivable / Credit: fee income |
| Interest income | Daily accrual | Debit: interest receivable / Credit: interest income |
| Penalty income | Daily accrual (when overdue) | Debit: penalty receivable / Credit: penalty income |

### 11.2 Settlement Calculation

The settlement engine aggregates overdraft revenue alongside micro-loan and BNPL revenue. No special overdraft-specific settlement logic is needed — the existing product-level revenue sharing rules apply (FR-OD-007.1, FR-OD-007.2).

Settlement runs on the schedule configured per product (daily, weekly, monthly — FR-OD-007.3). The settlement report for each run shows overdraft revenue broken out by type: gross transaction fees, gross interest, gross penalties, each party's share, and net amounts (FR-OD-007.4).

### 11.3 Self-Funded Products

Per the self-funded product amendment (Docs/04, FR-SP-005), if an overdraft product uses the system-managed "Self-Funded" lender, the lender share in revenue calculations is 0%. All revenue is distributed between SP, EMI, and platform per the product's sharing rules.

---

## 12. Notifications

### 12.1 Notification Events

| Trigger | Template | Channel | Timing |
|---|---|---|---|
| Subscription activated | `overdraft_activated` | SMS + push | Immediate |
| Drawdown completed | `overdraft_drawdown` | SMS | Immediate |
| Auto-repayment collected | `overdraft_auto_repaid` | SMS | Immediate |
| Manual repayment received | `overdraft_manual_repaid` | SMS | Immediate |
| Fully repaid | `overdraft_fully_repaid` | SMS + push | Immediate |
| Payment reminder (before due) | `overdraft_reminder` | SMS | Configurable days before due date |
| Payment overdue | `overdraft_overdue` | SMS + push | Configurable days after due date |
| Limit changed | `overdraft_limit_changed` | SMS | Immediate |
| Credit line frozen | `overdraft_frozen` | SMS + push | Immediate |
| Credit line expired | `overdraft_expired` | SMS + push | Immediate |
| Subscription deactivated | `overdraft_deactivated` | SMS | Immediate |

All notification templates support dynamic variables: `{customerName}`, `{amount}`, `{currency}`, `{availableLimit}`, `{outstandingBalance}`, `{dueDate}`, `{newLimit}`.

PII masking applies per CLAUDE.md — notification service must never log full phone numbers or customer names.

**Requirement mapping:** FR-OD-002.5, FR-OD-005.5, FR-OD-006.3.

---

## 13. Data & Reporting

### 13.1 Daily Data Extracts (FR-OD-008.1)

The analytics service provides daily extracts for overdraft activity:
- New subscriptions (activated credit lines)
- Total drawdowns (count and volume)
- Total repayments (count and volume, split auto vs. manual)
- Active credit lines by status
- Overdue credit lines by aging bucket
- Default events
- Revenue generated (fees, interest, penalties)

### 13.2 Reports (FR-OD-008.2, FR-OD-008.3)

Available via O&M Portal and GraphQL API:

| Report | Content | Filters |
|---|---|---|
| Credit Line Summary | Active lines, total limits, utilization rate, outstanding | Date range, product, status |
| Drawdown Activity | Transaction count, volume, average size, peak times | Date range, product, customer segment |
| Repayment Performance | Collection rate, auto vs. manual split, failed collections | Date range, product |
| Aging Report | Credit lines by aging bucket, PAR metrics | Date range, product, customer segment |
| Revenue Report | Fees, interest, penalties — gross and per-party share | Date range, product, lender |

### 13.3 Key Metrics

| Metric | Definition |
|---|---|
| Credit line utilization rate | outstanding / approvedLimit (aggregate across all active lines) |
| Auto-repayment success rate | successful auto-collections / attempted auto-collections |
| Average drawdown size | total drawdown volume / drawdown count |
| Drawdown frequency | average drawdowns per active credit line per billing cycle |
| Days to full repayment | average days from first drawdown in a cycle to full repayment |
| PAR (Portfolio at Risk) | outstanding on overdue credit lines / total outstanding |

---

## 14. Admin Portal Screens

### 14.1 New Screens

**Credit Line Management (per customer):**
- List all credit lines for a customer with: status badge, approved limit, available balance, outstanding amount, utilization bar
- Detail view: full credit line record, all drawdowns (paginated, sortable), all limit changes, all repayments, billing cycle history
- Actions: Freeze / Unfreeze, Adjust Limit (opens modal with reason code selection), Close (only if zero balance), Waive Penalties (with reason field)

**Drawdown History (per credit line):**
- Table: date/time, amount, wallet balance at time, transaction ref, fee, status
- Exportable to CSV

**Overdraft Dashboard (aggregate):**
- Total active credit lines (count and total approved limits)
- Total outstanding and utilization rate (gauge chart)
- Drawdown volume: today, this week, this month (line chart with comparison to prior period)
- Auto-repayment success rate (percentage with trend)
- Overdue credit lines by aging bucket (stacked bar chart)
- Top 10 credit lines by outstanding (table)

**Product Wizard Update:**
- When product type == OVERDRAFT, show additional configuration step:
  - Billing cycle days and start day
  - Contract lifecycle duration
  - Partial drawdown toggle
  - Auto-repayment waterfall order (drag-and-drop reorder)
  - Limit review frequency
  - Interest model selector (percentage / flat / tiered)
  - Transaction fee configuration
  - Penalty configuration (type, rate, cap)
  - Reminder schedule (before/after due date intervals)

### 14.2 Existing Screen Updates

- **Customer Detail:** Add "Credit Lines" tab alongside "Contracts" tab. Show credit line summary card with quick actions.
- **Product Detail:** When product type == OVERDRAFT, show overdraft-specific metrics (utilization rate, average drawdown size, auto-repayment rate) alongside standard product metrics.
- **Collections Dashboard:** Overdraft delinquencies appear in the same queue as micro-loan delinquencies, but display credit line context (limit, utilization, drawdown count) instead of contract context (principal, installments remaining).

---

## 15. Integration Patterns

### 15.1 Pre-Transaction Hook (Preferred)

The wallet provider calls Lōns before declining a transaction for insufficient funds. This is the ideal integration — Lōns can cover the shortfall in real-time and the customer's transaction succeeds seamlessly.

**Required webhook:** `POST /webhooks/{provider}/insufficient-balance`

**Availability:** Requires partner-level integration with the wallet provider (e.g., MTN MoMo "payment partner" status, not just the standard Collections/Disbursements API).

### 15.2 SP-Mediated Fallback

For wallet providers that don't support pre-transaction hooks, the SP's system detects the shortfall and calls Lōns directly:

```
1. SP's wallet app detects customer balance < transaction amount
2. SP calls Lōns: POST /api/v1/overdraft/drawdown
   { customerId, transactionAmount, walletBalance, shortfall, transactionRef }
3. Lōns processes drawdown (same logic as webhook path)
4. Returns: { approved: true, drawdownId, disbursedAmount } or { approved: false, reason }
5. SP completes or declines the transaction based on response
```

This shifts integration burden to the SP but works with any wallet provider.

### 15.3 Auto-Repayment Webhook

For auto-repayment, the wallet provider must push transaction notifications when funds are credited to the customer's wallet:

**Required webhook:** `POST /webhooks/{provider}/transaction-notification` (with `type: "credit"`)

If the wallet provider doesn't support push notifications, the overdraft service can poll the wallet balance periodically — but this adds latency and reduces auto-repayment responsiveness. Push is strongly preferred.

### 15.4 Redis Caching Strategy

```
Key pattern:   creditline:{tenantId}:{customerId}:{productId}
Value:         { id, status, approvedLimit, availableBalance, outstandingAmount, interestRate }
TTL:           300s (5 minutes), refreshed on every drawdown/repayment
Write policy:  Write-through (update PostgreSQL and Redis atomically)
Read policy:   Cache-first. On cache miss, read from PostgreSQL and re-populate.
```

---

## 16. Event Types

### 16.1 Events to Register in `packages/event-contracts/`

```typescript
// Credit line lifecycle
CREDITLINE_ACTIVATED = 'creditline.activated'
CREDITLINE_FROZEN = 'creditline.frozen'
CREDITLINE_UNFROZEN = 'creditline.unfrozen'
CREDITLINE_SUSPENDED = 'creditline.suspended'
CREDITLINE_REINSTATED = 'creditline.reinstated'
CREDITLINE_CLOSED = 'creditline.closed'
CREDITLINE_EXPIRED = 'creditline.expired'

// Drawdown events
CREDITLINE_DRAWDOWN_INITIATED = 'creditline.drawdown.initiated'
CREDITLINE_DRAWDOWN_COMPLETED = 'creditline.drawdown.completed'
CREDITLINE_DRAWDOWN_FAILED = 'creditline.drawdown.failed'
CREDITLINE_DRAWDOWN_REVERSED = 'creditline.drawdown.reversed'

// Repayment events
CREDITLINE_REPAYMENT_AUTO_COLLECTED = 'creditline.repayment.auto_collected'
CREDITLINE_REPAYMENT_MANUAL = 'creditline.repayment.manual'
CREDITLINE_REPAYMENT_FAILED = 'creditline.repayment.failed'
CREDITLINE_FULLY_REPAID = 'creditline.fully_repaid'

// Limit management
CREDITLINE_LIMIT_CHANGED = 'creditline.limit.changed'
CREDITLINE_LIMIT_REVIEW_SCHEDULED = 'creditline.limit.review_scheduled'

// Interest and billing
CREDITLINE_INTEREST_ACCRUED = 'creditline.interest.accrued'
CREDITLINE_CYCLE_CLOSED = 'creditline.cycle.closed'
CREDITLINE_STATEMENT_GENERATED = 'creditline.statement.generated'

// Wallet events (from integration service)
WALLET_BALANCE_INSUFFICIENT = 'wallet.balance.insufficient'
WALLET_BALANCE_CREDITED = 'wallet.balance.credited'
WALLET_OVERDRAFT_DECLINED = 'wallet.overdraft.declined'
```

### 16.2 Key Event Interfaces

```typescript
export interface ICreditLineActivatedEvent {
  creditLineId: string;
  customerId: string;
  productId: string;
  approvedLimit: string;  // Decimal as string
  interestRate: string;
  expiresAt: string;      // ISO 8601
}

export interface ICreditLineDrawdownCompletedEvent {
  creditLineId: string;
  drawdownId: string;
  customerId: string;
  amount: string;
  feeAmount: string;
  newAvailableBalance: string;
  newOutstandingAmount: string;
  transactionRef: string;
}

export interface ICreditLineRepaymentAutoCollectedEvent {
  creditLineId: string;
  customerId: string;
  totalCollected: string;
  allocatedPrincipal: string;
  allocatedInterest: string;
  allocatedFees: string;
  allocatedPenalties: string;
  newOutstandingAmount: string;
  newAvailableBalance: string;
}

export interface ICreditLineLimitChangedEvent {
  creditLineId: string;
  customerId: string;
  previousLimit: string;
  newLimit: string;
  reasonCode: string;
  triggeredBy: string;
}

export interface IWalletBalanceInsufficientEvent {
  customerId: string;
  walletId: string;
  transactionAmount: string;
  availableBalance: string;
  shortfall: string;
  transactionRef: string;
  walletProvider: string;
}
```

All monetary fields are strings (Decimal serialization). All events include standard envelope: `{ event, tenantId, timestamp, correlationId, data }`.

---

## 17. GraphQL API

### 17.1 Queries

```graphql
# Customer-facing (via SP's app)
query creditLine(customerId: ID!, productCode: String!): CreditLine
query creditLineBalance(creditLineId: ID!): CreditLineBalance
query drawdownHistory(creditLineId: ID!, first: Int, after: String): DrawdownConnection

# Admin portal
query creditLines(filters: CreditLineFilterInput, first: Int, after: String): CreditLineConnection
query creditLineDetail(id: ID!): CreditLineDetail
query overdraftDashboard(tenantId: ID!, dateRange: DateRangeInput): OverdraftDashboardData
```

### 17.2 Mutations

```graphql
mutation activateOverdraftSubscription(customerId: ID!, productCode: String!, idempotencyKey: String!): ActivationResult
mutation deactivateOverdraftSubscription(creditLineId: ID!, idempotencyKey: String!): DeactivationResult
mutation makeOverdraftRepayment(creditLineId: ID!, amount: String!, idempotencyKey: String!): RepaymentResult

# Admin actions
mutation freezeCreditLine(creditLineId: ID!, reason: String!, idempotencyKey: String!): CreditLine
mutation unfreezeCreditLine(creditLineId: ID!, idempotencyKey: String!): CreditLine
mutation adjustCreditLimit(creditLineId: ID!, newLimit: String!, reasonCode: String!, reasonDetail: String, idempotencyKey: String!): CreditLine
mutation waiveOverdraftPenalties(creditLineId: ID!, amount: String!, reason: String!, idempotencyKey: String!): CreditLine
```

Note: `amount` fields are `String` (not `Float`) per CLAUDE.md money rules. All mutations accept `idempotencyKey`.

### 17.3 REST Endpoints

```
# Wallet provider webhooks (integration layer)
POST /webhooks/{provider}/insufficient-balance
POST /webhooks/{provider}/transaction-notification

# SP-mediated drawdown (fallback pattern)
POST /api/v1/overdraft/drawdown
GET  /api/v1/overdraft/credit-lines/{id}
GET  /api/v1/overdraft/credit-lines/{id}/balance
```

---

## 18. Test Scenarios

### 18.1 Unit Tests

| Area | Scenarios |
|---|---|
| Credit line creation | Valid params, invalid customer, invalid product, duplicate subscription |
| Drawdown approval | Balance sufficient, balance insufficient (reject), balance insufficient (partial enabled), frozen credit line, expired credit line |
| Drawdown fee calculation | Flat fee, percentage fee, zero fee |
| Auto-repayment waterfall | Full repayment, partial (covers penalties + interest only), partial (covers nothing fully), zero outstanding |
| Interest accrual | Single day, multiple days, zero outstanding (no accrual), rate boundary cases |
| Penalty accrual | Within cap, at cap (no further accrual), zero penalty rate |
| Status transitions | All valid transitions succeed, all invalid transitions are rejected |
| Credit limit changes | Increase, decrease (above outstanding), decrease (below outstanding → available = 0) |
| Concurrent drawdowns | Two simultaneous requests, only one approved if combined exceeds limit |

### 18.2 Integration Tests

| Flow | Validates |
|---|---|
| Insufficient-balance webhook → drawdown → ledger entry → notification | End-to-end drawdown including event emission and ledger creation |
| Wallet credit webhook → auto-repayment → limit restoration → notification | End-to-end auto-repayment with waterfall allocation |
| Drawdown when wallet disbursement fails → rollback | Credit line state restored, drawdown marked failed |
| Billing cycle closure → statement generation → interest crystallization | Scheduled job creates statement and resets cycle |
| Credit line freeze during active drawdown processing | Drawdown in flight completes, but next drawdown is blocked |
| Limit review → suspend → score → update → reinstate | Full periodic review lifecycle |
| Overdue escalation → freeze → penalty accrual → auto-repayment → unfreeze | Recovery path from overdue back to active |

### 18.3 Performance Tests

| Test | Target |
|---|---|
| Drawdown decision latency under load | p99 < 200ms at 100 concurrent requests |
| Redis cache hit rate | > 99% during normal operation |
| Redis cache miss fallback | < 50ms additional latency |
| Concurrent webhook processing throughput | > 500 webhooks/second per service instance |
| Auto-repayment batch during salary-day spike | Process 10,000 credit events within 5 minutes |
| Daily interest accrual batch | Process 100,000 active credit lines within 10 minutes |

### 18.4 Financial Calculation Tests

All financial tests must use property-based testing to verify:
- Interest accrual uses `Decimal` arithmetic throughout — no floating-point at any step
- Waterfall allocation: sum of allocated portions == total collected (no rounding loss)
- Available balance invariant: `availableBalance == approvedLimit - outstandingAmount` at all times
- Penalty cap: `penaltiesAccrued <= outstandingAmount × maxCapPercent` at all times
- Billing cycle statements: opening balance + drawdowns - repayments + interest + fees + penalties == closing balance

---

## 19. Requirement Coverage Matrix

| Requirement | Section(s) | Status |
|---|---|---|
| FR-OD-001 (Product Management) | §4 | Covered — product config JSON with all required parameters |
| FR-OD-002 (Subscription Management) | §5 | Covered — activation flow with KYC, scoring, limit assignment; deactivation with balance check |
| FR-OD-003 (Limit Management) | §10 | Covered — initial assignment, periodic review, behavior-triggered, manual adjustment, decrease rules |
| FR-OD-004 (Transactions) | §6 | Covered — real-time drawdown, limit deduction, billing cycle consolidation, fee application, decline handling, transaction recording |
| FR-OD-005 (Repayment) | §7 | Covered — auto-repayment on wallet credit, manual repayment, partial repayment, full repayment → limit restored, notification |
| FR-OD-006 (Post-Loan) | §8, §9 | Covered — daily interest accrual, penalty application, reminder notifications, lifecycle states, events on transitions |
| FR-OD-007 (Revenue Settlement) | §11 | Covered — revenue types, settlement calculation via existing engine, self-funded products |
| FR-OD-008 (Data & Reporting) | §13 | Covered — daily extracts, summary/detail reports via portal and API, filtering |
| FR-PE-001 (< 30s pipeline) | §6.2 | Exceeded — target is < 3s total |
| FR-RP-001 (Waterfall) | §7.1, §7.2 | Covered — configurable waterfall order |
| FR-DM-001 (Overdue classification) | §9.1 | Covered — aging buckets with configurable thresholds |
| FR-DM-002 (Penalties) | §9.2 | Covered — penalty types, regulatory caps, waiver |
| FR-ST-001 (Statements) | §8.2 | Covered — billing cycle statements |
| FR-ST-002 (Ledger) | §6.1 step 5e, §7.1 step 5, §8.1 step 3 | Covered — double-entry ledger entries at drawdown, repayment, and interest accrual |

---

*PM: This spec is ready for Dev prompt generation. The ADR (ADR-overdraft-realtime.md) covers architectural rationale; this spec covers implementation detail. Dev should read both. New Prisma models (CreditLine, Drawdown, CreditLimitChange) require a migration. The overdraft-service is a new NestJS service following existing patterns.*
