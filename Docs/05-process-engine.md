# 05 — Process Engine (Loan Lifecycle)

This document defines the requirements for the loan processing pipeline — from initial request through approval, contract creation, and disbursement.

---

## 1. Loan Lifecycle Overview

Every loan in Lōns follows a standardized pipeline, regardless of product type. Product-specific behavior is injected via configuration, not code.

```
Customer Request
      │
      ▼
┌─────────────┐
│  Validation  │──── Reject (invalid request)
└──────┬──────┘
       ▼
┌─────────────┐
│Pre-Qualifica-│──── Reject (ineligible)
│    tion      │
└──────┬──────┘
       ▼
┌─────────────┐
│   Credit     │
│   Scoring    │
└──────┬──────┘
       ▼
┌─────────────┐
│  Approval    │──── Reject (score too low / policy)
│  Decision    │──── Manual Review (edge case)
└──────┬──────┘
       ▼
┌─────────────┐
│ Offer        │
│ Generation   │
└──────┬──────┘
       ▼
┌─────────────┐
│ Customer     │──── Declined (customer rejects offer)
│ Acceptance   │──── Expired (offer timeout)
└──────┬──────┘
       ▼
┌─────────────┐
│  Contract    │
│  Creation    │
└──────┬──────┘
       ▼
┌─────────────┐
│ Disbursement │──── Failed (retry / rollback)
└──────┬──────┘
       ▼
  Active Loan
  (→ Repayment Engine)
```

---

## 2. Loan Request

### 2.1 Functional Requirements

#### FR-LR-001: Request Initiation

| ID | Requirement | Priority |
|---|---|---|
| FR-LR-001.1 | Loan requests SHALL be initiated via: (a) GraphQL API (from SP's customer-facing app), (b) REST API (for simpler integrations), or (c) automatic trigger (overdraft — triggered by insufficient balance during a transaction). | Must |
| FR-LR-001.2 | A loan request SHALL include: customer ID, product code, requested amount (optional for overdraft — derived from transaction shortfall), preferred tenor (if applicable), and request channel identifier. | Must |
| FR-LR-001.3 | The system SHALL generate a unique request ID and timestamp for every loan request. | Must |

#### FR-LR-002: Request Validation

| ID | Requirement | Priority |
|---|---|---|
| FR-LR-002.1 | The system SHALL validate each request against: (a) customer exists and is active, (b) product exists and is active, (c) customer has an active subscription for the product, (d) requested amount is within product min/max bounds, (e) customer is not blacklisted, (f) no policy conflicts (e.g., single active loan restriction). | Must |
| FR-LR-002.2 | Validation failures SHALL return specific error codes and messages. | Must |
| FR-LR-002.3 | Valid requests SHALL be assigned status `VALIDATED` and proceed to pre-qualification. | Must |

#### FR-LR-003: Request States

| ID | Requirement | Priority |
|---|---|---|
| FR-LR-003.1 | Loan requests SHALL track the following states: RECEIVED → VALIDATED → PRE_QUALIFIED → SCORED → APPROVED / REJECTED / MANUAL_REVIEW → OFFER_SENT → ACCEPTED / DECLINED / EXPIRED → CONTRACT_CREATED → DISBURSING → DISBURSED / DISBURSEMENT_FAILED. | Must |
| FR-LR-003.2 | Every state transition SHALL be logged with timestamp, actor (system or user), and reason. | Must |
| FR-LR-003.3 | State transitions SHALL emit events to the event bus. | Must |

---

## 3. Credit Check & Scoring Integration

### 3.1 Functional Requirements

#### FR-CC-001: Scoring Orchestration

| ID | Requirement | Priority |
|---|---|---|
| FR-CC-001.1 | After pre-qualification passes, the process engine SHALL invoke the scoring engine (see 02-qualification-scoring.md). | Must |
| FR-CC-001.2 | The scoring request SHALL include: customer ID, product code, requested amount, and context (new application, limit review, or renewal). | Must |
| FR-CC-001.3 | The scoring response SHALL include: credit score, recommended credit limit, probability of default, risk tier, and model version used. | Must |
| FR-CC-001.4 | If scoring fails (service unavailable), the request SHALL be queued for retry (max 3 attempts) or escalated to manual review. | Must |

---

## 4. Approval Engine

### 4.1 Functional Requirements

#### FR-AE-001: Approval Decision

| ID | Requirement | Priority |
|---|---|---|
| FR-AE-001.1 | The approval engine SHALL make a decision based on: credit score vs. product thresholds, requested amount vs. recommended limit, customer's existing exposure (total debt across all products), product-specific business rules, and SP-configured risk policies. | Must |
| FR-AE-001.2 | Decision outcomes SHALL be: APPROVED (with approved amount and terms), REJECTED (with reason codes), COUNTER_OFFER (approved at a lower amount or different terms), or MANUAL_REVIEW (sent to operator queue). | Must |

#### FR-AE-002: Approval Workflow

| ID | Requirement | Priority |
|---|---|---|
| FR-AE-002.1 | The system SHALL support configurable approval workflows per product: (a) auto-approve — system decides without human intervention, (b) single-level — one operator approves, (c) multi-level — sequential approval by multiple operators based on amount thresholds (e.g., < $1000 = team lead, > $1000 = manager). | Must |
| FR-AE-002.2 | For manual review, the system SHALL create a work item in the O&M Portal with all relevant context: customer profile, credit summary, scoring details, and product terms. | Must |
| FR-AE-002.3 | Manual review decisions SHALL include: operator ID, decision, modified terms (if any), and justification notes. | Must |
| FR-AE-002.4 | The system SHALL enforce approval authority limits — operators can only approve up to their configured limit. | Must |

#### FR-AE-003: Approval Timeout

| ID | Requirement | Priority |
|---|---|---|
| FR-AE-003.1 | Manual review items SHALL have a configurable SLA (e.g., 4 hours, 24 hours). | Should |
| FR-AE-003.2 | If not actioned within the SLA, the system SHALL escalate to the next level or auto-reject (configurable). | Should |

---

## 5. Offer Generation

### 5.1 Functional Requirements

#### FR-OG-001: Loan Offer

| ID | Requirement | Priority |
|---|---|---|
| FR-OG-001.1 | Upon approval, the system SHALL generate a loan offer containing: approved amount, interest rate, total interest amount, all applicable fees (itemized), total cost of credit, repayment schedule (for installment products), first payment due date, contract duration, and key terms and conditions. | Must |
| FR-OG-001.2 | The offer SHALL be sent to the customer via the SP's channel (API response for real-time flows, push notification for async). | Must |
| FR-OG-001.3 | Offers SHALL have a configurable expiry period (e.g., 15 minutes for overdraft, 24 hours for micro-loan). | Must |

#### FR-OG-002: Customer Response

| ID | Requirement | Priority |
|---|---|---|
| FR-OG-002.1 | Customers SHALL explicitly accept or decline the offer. | Must |
| FR-OG-002.2 | Acceptance SHALL be recorded with: timestamp, channel, and acceptance method (API call, USSD confirmation, etc.). | Must |
| FR-OG-002.3 | Expired offers SHALL be automatically marked as EXPIRED and the request closed. The customer may reapply. | Must |
| FR-OG-002.4 | For overdraft (real-time flow), the offer → acceptance cycle SHALL complete within 10 seconds. | Must |

---

## 6. Contract Creation

### 6.1 Functional Requirements

#### FR-CT-001: Contract Generation

| ID | Requirement | Priority |
|---|---|---|
| FR-CT-001.1 | Upon offer acceptance, the system SHALL create a loan contract with: unique contract number, customer ID, product code and version, lender ID, principal amount, interest rate and calculation method, fee schedule, repayment schedule (for installment products), all key dates (start, first payment, maturity), contract terms snapshot (from product version at time of creation), and initial status: ACTIVE. | Must |
| FR-CT-001.2 | The contract SHALL be immutable once created — changes are handled through amendments or restructuring (separate records that reference the original). | Must |
| FR-CT-001.3 | The system SHALL generate a human-readable contract reference number (e.g., LON-2024-00001) in addition to the UUID. | Must |

#### FR-CT-002: Contract States

| ID | Requirement | Priority |
|---|---|---|
| FR-CT-002.1 | Contract states: ACTIVE → PERFORMING → DUE → OVERDUE → DELINQUENT → DEFAULT → WRITTEN_OFF → SETTLED → CANCELLED. | Must |
| FR-CT-002.2 | The CANCELLED state SHALL only be reachable from ACTIVE during a cooling-off period (if configured). | Should |
| FR-CT-002.3 | State transitions SHALL be governed by business rules and SHALL NOT be manually overridable (except by Platform Admin for error correction with full audit trail). | Must |

---

## 7. Disbursement

### 7.1 Functional Requirements

#### FR-DB-001: Disbursement Processing

| ID | Requirement | Priority |
|---|---|---|
| FR-DB-001.1 | Upon contract creation, the system SHALL initiate disbursement through the integration layer — transferring the approved amount to the customer's wallet/account. | Must |
| FR-DB-001.2 | Disbursement SHALL be processed via the configured digital wallet adapter (see 09-integrations.md). | Must |
| FR-DB-001.3 | The system SHALL support: (a) real-time disbursement (immediate transfer — required for overdraft), (b) batch disbursement (queued for processing — acceptable for micro-loans). | Must |

#### FR-DB-002: Disbursement Confirmation

| ID | Requirement | Priority |
|---|---|---|
| FR-DB-002.1 | The system SHALL wait for disbursement confirmation from the wallet provider (via callback/webhook). | Must |
| FR-DB-002.2 | Upon confirmation, the contract status SHALL be updated and the customer notified. | Must |
| FR-DB-002.3 | If disbursement fails, the system SHALL: retry per configurable policy (e.g., 3 retries over 1 hour), and if all retries fail, roll back the contract to CANCELLED and notify the customer and SP operator. | Must |

#### FR-DB-003: Disbursement Reconciliation

| ID | Requirement | Priority |
|---|---|---|
| FR-DB-003.1 | Every disbursement SHALL be reconciled against the wallet provider's transaction record within 24 hours. | Must |
| FR-DB-003.2 | Discrepancies SHALL be flagged for manual investigation. | Must |

---

## 8. Process Engine — Cross-Cutting Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-PE-001 | The entire request-to-disbursement pipeline for overdrafts SHALL complete within 30 seconds (real-time flow). | Must |
| FR-PE-002 | For micro-loans, the pipeline SHALL complete within 5 minutes (including manual review SLA where applicable). | Should |
| FR-PE-003 | The process engine SHALL support idempotent request processing — duplicate requests with the same idempotency key SHALL return the original result. | Must |
| FR-PE-004 | All pipeline steps SHALL be individually retriable without restarting the full pipeline. | Must |
| FR-PE-005 | The system SHALL support pipeline configuration per product — allowing steps to be skipped (e.g., skip pre-qualification for pre-approved customers) or added (e.g., additional compliance check). | Should |
| FR-PE-006 | The process engine SHALL maintain a complete audit trail for every request: each step, its inputs, outputs, duration, and outcome. | Must |
