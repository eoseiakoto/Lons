# ADR: Overdraft Real-Time Architecture

**Status:** Proposed
**Date:** 2026-04-14
**Author:** Business Analyst (Claude)
**Monday.com:** 11743596951
**Deciders:** Project Owner (Emmanuel), PM, Dev Lead

---

## 1. Context

The Lōns process engine handles loan origination through a linear state machine:

```
received → validated → pre_qualified → scored → approved → offer_sent → accepted → contract_created → disbursing → disbursed
```

This flow is application-triggered, batch-oriented, and tolerates multi-second latency between steps. It works well for Micro-Loans and BNPL where a customer explicitly applies for credit.

Overdraft is fundamentally different. Per FR-OD-004, when a wallet transaction exceeds the customer's available balance, the system must **automatically check the customer's overdraft eligibility and disburse the shortfall in real-time** — without any manual application. The customer's experience is seamless: their transaction just succeeds, backed by overdraft credit.

This requires sub-second decision-making, real-time wallet event processing, and automatic repayment when funds arrive. None of these capabilities exist in the current architecture.

---

## 2. Decision: Separate Overdraft Service (Option A — Recommended)

### 2.1 Options Evaluated

**Option A — Separate `overdraft-service`**

A dedicated, lightweight NestJS service optimized for real-time credit line management. It receives wallet webhook events, makes sub-second drawdown decisions against pre-approved credit lines, and emits events to the core system for ledger recording and settlement.

| Dimension | Assessment |
|---|---|
| Latency | Optimized for sub-second. No shared queue with batch operations. Direct Redis-cached credit line lookup. |
| Isolation | Failure in overdraft processing cannot affect micro-loan or BNPL flows. Independent scaling. |
| Complexity | New service to deploy and monitor. Adds one more item to the service mesh. |
| Code duplication | Some shared logic with process engine (scoring, ledger posting). Mitigated by shared packages. |
| Data consistency | Credit line state lives in its own tables. Contract/ledger entries created via event emission to existing services. |

**Option B — Product-type branching in process engine**

Extend the existing `loan-request-state-machine.ts` with an overdraft-specific branch triggered when `product.type === 'OVERDRAFT'`.

| Dimension | Assessment |
|---|---|
| Latency | Process engine uses BullMQ for step transitions. Adding real-time requirements to a queue-based system risks either degrading batch throughput or adding complexity for priority lanes. |
| Isolation | A bug or performance issue in the overdraft real-time path could affect all loan processing. The state machine becomes significantly more complex. |
| Complexity | Fewer services to deploy. But the process engine's `VALID_TRANSITIONS` map would need a parallel branch, and the service would need both queue-based and event-driven processing patterns. |
| Code duplication | Minimal — everything is in one service. |
| Data consistency | Simpler — same service, same database transaction boundaries. |

### 2.2 Recommendation: Option A

The overdraft use case has fundamentally different performance characteristics (sub-second vs. multi-second), different trigger mechanisms (external webhook vs. internal application), and different lifecycle patterns (revolving credit line vs. fixed-term contract). Forcing it into the existing process engine would compromise both systems.

**The deciding factors:**

1. **Latency SLA mismatch.** The process engine uses BullMQ with Redis-backed queues. Each state transition is a separate job. The total origination time for a micro-loan is measured in seconds — acceptable for an application flow, unacceptable for a transaction happening at a merchant's point of sale. The overdraft service needs to respond within 200-500ms.

2. **Trigger mechanism.** The process engine is pull-based (customer/SP initiates a request). Overdraft is push-based (wallet provider sends an insufficient-balance event). These are different concurrency and scaling patterns.

3. **Failure isolation.** If overdraft traffic spikes (e.g., month-end salary period), it should not queue-starve micro-loan applications. Separate services scale independently.

4. **The state machine doesn't fit.** A credit line is not a loan request. It doesn't go through `received → validated → scored → approved`. It's pre-approved. The drawdown is an instant debit against a pre-existing limit. Mapping this onto the `LoanRequestStatus` enum would be a semantic mismatch.

### 2.3 Trade-offs Accepted

- **Additional deployment unit.** One more service in the Kubernetes cluster. Mitigated by: it follows the same NestJS patterns as other services, same Helm chart template, same CI/CD pipeline.
- **Shared logic extraction.** Interest calculation, ledger posting, and penalty logic are shared with other services. These already live in `packages/common/src/financial/` — the overdraft service imports them.
- **Cross-service data flow.** After a drawdown, the overdraft service emits events that the settlement service and ledger service consume. This is consistent with the existing event-driven architecture.

---

## 3. CreditLine Entity Model

### 3.1 Prisma Schema

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

### 3.2 Status Transitions

```
pending_activation → active          (customer activates via SP channel, scoring engine assigns limit)
active → frozen                      (overdue payment, fraud flag, or manual SP action)
frozen → active                      (outstanding cleared, SP unfreezes)
active → suspended                   (temporary hold — e.g., limit review in progress)
suspended → active                   (review complete, reinstated)
active → closed                      (customer requests deactivation AND balance is zero)
active → expired                     (contract lifecycle duration exceeded)
frozen → closed                      (balance cleared while frozen, then closed)
```

**Rules:**
- Transition to `closed` requires `outstandingAmount == 0` AND `interestAccrued == 0` AND `feesOutstanding == 0` AND `penaltiesAccrued == 0`.
- Transition to `frozen` is immediate and blocks all new drawdowns. Existing outstanding balance continues to accrue interest.
- `expired` is system-triggered when `expiresAt` is reached. Outstanding balance remains collectible.

### 3.3 Drawdown Model

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

### 3.4 Credit Limit Change Model

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

---

## 4. Drawdown and Auto-Repayment Flows

### 4.1 Drawdown Flow (Wallet Insufficient Balance)

```
1. Wallet provider detects insufficient balance for a transaction
2. Wallet provider sends webhook to Lōns integration service:
   POST /webhooks/{provider}/insufficient-balance
   { walletId, transactionAmount, availableBalance, shortfall, transactionRef, timestamp }

3. Integration service validates webhook signature, maps walletId → customerId, emits internal event:
   wallet.balance.insufficient { tenantId, customerId, walletId, transactionAmount, availableBalance, shortfall, transactionRef }

4. Overdraft service receives event, performs checks (all cached in Redis for speed):
   a. Does customer have an active credit line? → If no, emit wallet.overdraft.declined (no credit line)
   b. Is credit line status == 'active'? → If frozen/suspended/closed, decline
   c. Is shortfall <= availableBalance on credit line? → If no, check partial drawdown policy
   d. Apply transaction fee per product config

5. If approved:
   a. Create Drawdown record (status: initiated)
   b. Debit credit line: availableBalance -= (shortfall + fee), outstandingAmount += shortfall
   c. Call wallet adapter: disburse(walletId, shortfall, transactionRef)
   d. On wallet confirmation: Drawdown status → completed, emit creditline.drawdown.completed
   e. Emit event for ledger service to create ledger entries (debit: overdraft receivable, credit: disbursement)

6. If declined:
   a. Emit wallet.overdraft.declined { reason, customerId, transactionRef }
   b. Wallet provider receives decline → original transaction fails with insufficient funds

Target latency: < 500ms from webhook receipt to drawdown decision. < 2s for full round-trip including wallet disbursement confirmation.
```

### 4.2 Partial Drawdown Policy

When the shortfall exceeds the available credit line balance:

**Option A — Reject entirely.** Customer's transaction fails. Simple, predictable.

**Option B — Partial drawdown.** Disburse whatever is available on the credit line. Customer's transaction may still fail if wallet balance + partial drawdown < transaction amount (depends on wallet provider behavior).

**Recommendation:** Make this configurable per product via a `partialDrawdownEnabled` flag on the product configuration. Default: **reject entirely** (Option A). Rationale: partial drawdowns create a confusing customer experience if the transaction still fails after a partial top-up, and the customer now has an outstanding overdraft for a transaction that didn't complete.

### 4.3 Auto-Repayment Flow (Wallet Credit Event)

```
1. Wallet provider sends webhook when funds are credited to customer's wallet:
   POST /webhooks/{provider}/transaction-notification
   { walletId, type: "credit", amount, newBalance, transactionRef, timestamp }

2. Integration service maps walletId → customerId, emits:
   wallet.balance.credited { tenantId, customerId, walletId, creditAmount, newBalance }

3. Overdraft service receives event, checks:
   a. Does customer have an active credit line with outstandingAmount > 0?
   b. If no outstanding balance, ignore event
   c. If yes, calculate collection amount:
      - collectionAmount = min(outstandingAmount + interestAccrued + feesOutstanding + penaltiesAccrued, creditAmount)
      - Apply waterfall: penalties → interest → fees → principal (per FR-RP-001 waterfall, configurable per product)

4. Initiate collection:
   a. Call wallet adapter: collect(walletId, collectionAmount, autoRepaymentRef)
   b. On success: update credit line balances, restore available limit for principal portion
   c. Create ledger entries (credit: overdraft receivable, debit: repayment received)
   d. Emit creditline.repayment.auto_collected
   e. If fully repaid: restore full credit limit, reset accrued interest

5. If collection fails (insufficient balance — customer may have spent funds between credit and collection):
   a. Log failure, do not retry immediately (avoid debit loops)
   b. Schedule retry for next wallet credit event
```

### 4.4 Intra-Day Interest Accrual

**Method:** Daily accrual at end of day (not per-drawdown).

**Calculation:**
```
dailyRate = annualInterestRate / 365
dailyInterest = outstandingAmount * dailyRate
```

**Schedule:** A scheduled job runs at 23:59 tenant timezone (or configurable time). For each active credit line with `outstandingAmount > 0`:
1. Calculate daily interest
2. Add to `interestAccrued`
3. Create ledger entry (debit: interest receivable, credit: interest income)
4. If interest accrual causes total outstanding to approach or exceed limit, emit warning event

**Billing cycle consolidation (FR-OD-004):** All drawdowns within a billing cycle are consolidated into a single statement. At cycle end, accrued interest is crystallized and added to the outstanding balance. This creates a single repayable amount for the cycle rather than per-drawdown tracking.

**Why not per-drawdown accrual?** Per-drawdown interest calculation (interest from exact moment of drawdown) is more precise but adds significant complexity. A customer might have 15 drawdowns in a day. Daily accrual on the aggregate outstanding balance is simpler, more predictable for the customer, and consistent with how most overdraft products in the market work. If per-drawdown precision is needed later, it can be layered on.

---

## 5. Event Types for `packages/event-contracts/`

### 5.1 New Events to Add to `events.enum.ts`

```typescript
// Wallet events (from integration service)
WALLET_BALANCE_INSUFFICIENT = 'wallet.balance.insufficient',
WALLET_BALANCE_CREDITED = 'wallet.balance.credited',
WALLET_OVERDRAFT_DECLINED = 'wallet.overdraft.declined',

// Credit line lifecycle events
CREDITLINE_ACTIVATED = 'creditline.activated',
CREDITLINE_FROZEN = 'creditline.frozen',
CREDITLINE_UNFROZEN = 'creditline.unfrozen',
CREDITLINE_SUSPENDED = 'creditline.suspended',
CREDITLINE_REINSTATED = 'creditline.reinstated',
CREDITLINE_CLOSED = 'creditline.closed',
CREDITLINE_EXPIRED = 'creditline.expired',

// Drawdown events
CREDITLINE_DRAWDOWN_INITIATED = 'creditline.drawdown.initiated',
CREDITLINE_DRAWDOWN_COMPLETED = 'creditline.drawdown.completed',
CREDITLINE_DRAWDOWN_FAILED = 'creditline.drawdown.failed',
CREDITLINE_DRAWDOWN_REVERSED = 'creditline.drawdown.reversed',

// Auto-repayment events
CREDITLINE_REPAYMENT_AUTO_COLLECTED = 'creditline.repayment.auto_collected',
CREDITLINE_REPAYMENT_MANUAL = 'creditline.repayment.manual',
CREDITLINE_REPAYMENT_FAILED = 'creditline.repayment.failed',
CREDITLINE_FULLY_REPAID = 'creditline.fully_repaid',

// Limit management events
CREDITLINE_LIMIT_CHANGED = 'creditline.limit.changed',
CREDITLINE_LIMIT_REVIEW_SCHEDULED = 'creditline.limit.review_scheduled',

// Interest/billing events
CREDITLINE_INTEREST_ACCRUED = 'creditline.interest.accrued',
CREDITLINE_CYCLE_CLOSED = 'creditline.cycle.closed',
CREDITLINE_STATEMENT_GENERATED = 'creditline.statement.generated',
```

### 5.2 Event Interfaces

```typescript
export interface IWalletBalanceInsufficientEvent {
  customerId: string;
  walletId: string;
  transactionAmount: string;
  availableBalance: string;
  shortfall: string;
  transactionRef: string;
  walletProvider: string;
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
```

---

## 6. Integration Requirements

### 6.1 Wallet Webhook Events Needed

**From MTN MoMo:**
- **Insufficient balance callback** — This is the primary trigger. MTN MoMo's disbursement API returns synchronous responses, but for balance-aware triggers, Lōns would need to be registered as a "payment partner" that the MoMo wallet consults before declining a transaction. This requires MTN partner-level integration (not just the standard Collections/Disbursements API).
- **Transaction notification** — Already part of the standard MoMo API callback mechanism. Used for auto-repayment triggers.

**From M-Pesa:**
- Similar pattern via M-Pesa's C2B and B2C callback URLs.

### 6.2 Push vs. Pull Model

**Recommendation: Push model (wallet pushes events to Lōns).**

A pull model (Lōns polls wallet balances) would require constant polling for every overdraft-enabled customer, which doesn't scale and adds latency. The push model means the wallet provider calls Lōns only when relevant events occur.

**However,** the "insufficient balance" push event is not universally available from all wallet providers. Some providers only support post-transaction callbacks (telling Lōns a transaction succeeded or failed), not pre-transaction hooks (asking Lōns whether to extend credit before declining).

**Fallback for providers without pre-transaction hooks:** The SP pre-funds a settlement account. When a customer's wallet balance is low and they opt in to overdraft, the SP's system (not the wallet provider) detects the shortfall and calls Lōns to request a drawdown. This shifts the integration burden to the SP but works with any wallet provider. This should be documented as a configurable integration pattern.

### 6.3 Latency SLA

| Segment | Target | Rationale |
|---|---|---|
| Webhook receipt → drawdown decision | < 200ms | Credit line lookup is Redis-cached. Decision is a simple balance check. |
| Drawdown decision → wallet disburse call | < 100ms | Internal service call. |
| Wallet disburse → confirmation | Provider-dependent (500ms–3s) | MTN MoMo: typically < 2s. M-Pesa: < 3s. |
| **Total round-trip** | **< 3s** | Customer-facing latency at point of sale. |

### 6.4 Redis Caching Strategy

To meet the < 200ms decision target, credit line state must be cached:

```
Key: creditline:{tenantId}:{customerId}:{productId}
Value: { id, status, approvedLimit, availableBalance, outstandingAmount, interestRate }
TTL: 300s (5 minutes), refreshed on every drawdown/repayment
```

The cache is the source of truth for **read** operations (drawdown decisions). **Write** operations (drawdown execution, repayment) update both PostgreSQL and Redis atomically (write-through). If cache miss, fall back to database read and re-populate cache.

---

## 7. Service Architecture Summary

```
                        ┌─────────────────────┐
                        │   Wallet Provider    │
                        │  (MTN MoMo, M-Pesa) │
                        └──────┬──────┬────────┘
                               │      │
              insufficient     │      │  transaction
              balance webhook  │      │  notification
                               ▼      ▼
                        ┌─────────────────────┐
                        │ Integration Service  │
                        │  (webhook handler)   │
                        └──────┬──────┬────────┘
                               │      │
          wallet.balance.      │      │  wallet.balance.
          insufficient         │      │  credited
                               ▼      ▼
                        ┌─────────────────────┐
                        │  Overdraft Service   │◄──── Redis (credit line cache)
                        │  (new service)       │
                        └──┬───┬───┬───┬───────┘
                           │   │   │   │
     creditline.drawdown   │   │   │   │  creditline.repayment
     .completed            │   │   │   │  .auto_collected
                           ▼   │   │   ▼
                  ┌────────┐   │   │   ┌──────────────┐
                  │ Ledger │   │   │   │  Settlement   │
                  │Service │   │   │   │  Service      │
                  └────────┘   │   │   └──────────────┘
                               │   │
                               │   │  creditline.limit.changed
                               │   ▼
                               │  ┌──────────────┐
                               │  │  Notification │
                               │  │  Service      │
                               │  └──────────────┘
                               │
                               ▼
                        ┌─────────────────────┐
                        │   Scoring Service    │
                        │ (limit review only)  │
                        └─────────────────────┘
```

---

## 8. Admin Portal Implications

### 8.1 New Screens/Components Needed

1. **Credit Line Management** — List all credit lines for a customer. Show status, limit, available balance, outstanding. Actions: freeze, unfreeze, adjust limit, close.
2. **Drawdown History** — Per credit line, show all drawdowns with timestamps, amounts, transaction refs, and statuses.
3. **Overdraft Dashboard** — Aggregate view: total active credit lines, total outstanding, utilization rate, drawdown volume (today/week/month), auto-repayment success rate.
4. **Product wizard update** — When product type is OVERDRAFT, show credit line-specific configuration fields: billing cycle, auto-repayment priority, partial drawdown toggle, limit review frequency.

### 8.2 Existing Screens That Need Updates

- **Customer Detail** — Add "Credit Lines" tab alongside existing "Contracts" tab.
- **Product Detail** — Show overdraft-specific metrics (utilization rate, average drawdown size) alongside standard metrics.
- **Collections Dashboard** — Overdraft delinquencies should appear in the same queue as micro-loan delinquencies, but with credit line context instead of contract context.

---

## 9. Test Scenarios

### 9.1 Unit Tests
- Credit line creation with valid/invalid parameters
- Drawdown approval when balance sufficient, rejection when insufficient
- Partial drawdown policy (enabled vs disabled)
- Auto-repayment waterfall allocation (penalties → interest → fees → principal)
- Interest accrual calculation for various outstanding amounts and rates
- Status transition validation (all valid and invalid transitions)
- Credit limit change with reason code recording

### 9.2 Integration Tests
- End-to-end: insufficient balance webhook → drawdown → ledger entry → notification
- End-to-end: wallet credit webhook → auto-repayment → limit restoration → notification
- Concurrent drawdowns on the same credit line (race condition handling)
- Drawdown when wallet disbursement fails → proper rollback
- Billing cycle closure → statement generation → interest crystallization
- Credit line freeze during active drawdown processing

### 9.3 Performance Tests
- Drawdown decision latency under load (target: p99 < 200ms)
- Redis cache hit rate and fallback behavior
- Concurrent webhook processing throughput
- Auto-repayment batch processing during salary-day spike

---

## 10. Open Questions for Decision

| # | Question | Options | BA Recommendation |
|---|---|---|---|
| 1 | Partial drawdown when credit line has insufficient balance? | (A) Reject entirely, (B) Partial drawdown | A — reject. Make configurable per product. |
| 2 | Interest accrual frequency? | (A) Daily on aggregate, (B) Per-drawdown from exact timestamp | A — daily aggregate. Simpler, market-standard. |
| 3 | What happens when drawdown exceeds credit limit but a limit review is pending? | (A) Decline, (B) Hold for X seconds while review completes | A — decline. Limit reviews should happen proactively, not at transaction time. |
| 4 | Auto-repayment: collect full outstanding or only due amount? | (A) Full outstanding, (B) Up to current billing cycle amount | A — full outstanding. Overdraft is meant to be short-term. |
| 5 | Credit line expiry: what happens to outstanding balance? | (A) Becomes a fixed-term collection, (B) Auto-renew credit line | **DECIDED (2026-04-14):** Option A — convert to fixed-term collection for v1.0. Auto-renew deferred to post-v1.0 as configurable product option. |
| 6 | Wallet provider integration model? | (A) Pre-transaction hook (ideal), (B) SP-mediated fallback | Both — A where available, B as fallback. Document as integration patterns. |

---

## Appendix A: FR-OD-001 & FR-OD-002 Coverage Notes

This ADR focuses on the real-time architecture (FR-OD-004 and FR-OD-005) as those are the architecturally novel aspects. FR-OD-001 (Product Management) and FR-OD-002 (Subscription Management) are addressed here for completeness:

### FR-OD-001: Overdraft Product Management

Overdraft products are created via the existing product wizard with type `OVERDRAFT`. The Product model already supports all required fields (min/max amount, interest rate, penalty config, grace period, notification templates, lender link). Additional overdraft-specific configuration should be stored in the product's `feeStructure` JSON or a new `overdraftConfig` JSON field:

```json
{
  "billingCycleDays": 30,
  "billingCycleStartDay": 1,
  "contractLifecycleDays": 365,
  "partialDrawdownEnabled": false,
  "autoRepaymentEnabled": true,
  "autoRepaymentWaterfall": ["penalties", "interest", "fees", "principal"],
  "limitReviewFrequencyDays": 90,
  "intraDayAccrualEnabled": false
}
```

Product versioning, audit trail, and the ability to deactivate without affecting active credit lines all use the existing product lifecycle (FR-LP-001). No new architecture needed — the product wizard needs an OVERDRAFT-specific step in the UI.

### FR-OD-002: Overdraft Subscription Management

Subscription activation uses the existing `Subscription` model. When a customer activates an overdraft subscription:

1. System checks: KYC status, pre-qualification rules, credit score eligibility, existing active overdraft subscription (only one per product per customer).
2. Scoring engine assigns initial credit limit → creates CreditLine record (see Section 3.1).
3. CreditLine status: `pending_activation` → `active`.
4. Confirmation notification sent.

Deactivation: Customer or SP requests deactivation. System checks `outstandingAmount == 0` on the CreditLine. If zero, CreditLine → `closed`, Subscription → deactivated. If non-zero, deactivation is blocked until balance is cleared.

These flows use the existing subscription and scoring infrastructure. The CreditLine model (Section 3) is the new component that bridges subscriptions to the real-time drawdown capability.
