# 03 — Repayments & Recovery

This document defines the requirements for the repayment engine, AI-driven recovery, and collections management within Lōns.

---

## 1. Repayment Engine

### 1.1 Overview

The repayment engine handles all incoming payments across every loan product type, applying funds to contracts in the correct priority order and managing the full repayment lifecycle from first payment to final settlement.

### 1.2 Functional Requirements

#### FR-RP-001: Repayment Processing

| ID | Requirement | Priority |
|---|---|---|
| FR-RP-001.1 | The system SHALL support the following repayment methods: (a) automatic wallet deduction on due date, (b) manual customer-initiated payment, (c) bulk payment (customer pays toward multiple contracts at once), (d) third-party payment (someone else pays on behalf of the borrower). | Must |
| FR-RP-001.2 | Automatic repayment SHALL attempt wallet deduction on the due date. If the balance is insufficient, the system SHALL retry per a configurable schedule (e.g., retry every 6 hours for 3 days). | Must |
| FR-RP-001.3 | Each repayment SHALL be allocated to the contract according to a configurable payment waterfall priority: (1) overdue penalties, (2) overdue interest, (3) overdue principal, (4) current fees, (5) current interest, (6) current principal. The priority order SHALL be configurable per product. | Must |
| FR-RP-001.4 | Partial payments SHALL be accepted and allocated following the waterfall until exhausted. | Must |
| FR-RP-001.5 | Every repayment transaction SHALL be recorded with: payment ID, contract ID, amount, allocation breakdown (how much to principal/interest/fees), payment method, source (auto/manual/third-party), timestamp, and status (success/failed/pending). | Must |

#### FR-RP-002: Repayment Schedules

| ID | Requirement | Priority |
|---|---|---|
| FR-RP-002.1 | The system SHALL generate repayment schedules at contract creation for installment-based products (micro-loans, BNPL). | Must |
| FR-RP-002.2 | Supported schedule types: equal installments (EMI), reducing balance, balloon payment (small installments with large final payment), bullet payment (lump sum at end of tenor), and custom schedules defined by the SP. | Must |
| FR-RP-002.3 | Schedules SHALL show for each installment: installment number, due date, principal portion, interest portion, fee portion, and total amount due. | Must |
| FR-RP-002.4 | Schedules SHALL be recalculated when: an early/advance payment is made, a loan restructuring is applied, or penalty fees are added. | Must |

#### FR-RP-003: Early & Advance Repayment

| ID | Requirement | Priority |
|---|---|---|
| FR-RP-003.1 | Customers SHALL be able to repay their loan ahead of schedule (early settlement). | Must |
| FR-RP-003.2 | Early settlement calculations SHALL be configurable per product: (a) full interest charged regardless of early payment, (b) interest rebate for remaining period, (c) early settlement fee applied. | Must |
| FR-RP-003.3 | The system SHALL calculate and present the early settlement amount to the customer before they confirm. | Must |

#### FR-RP-004: Repayment Notifications

| ID | Requirement | Priority |
|---|---|---|
| FR-RP-004.1 | The system SHALL send notifications at the following stages: (a) upcoming payment reminder (configurable days before due date, e.g., 3 days, 1 day), (b) payment due today, (c) payment successfully processed, (d) payment failed — retry scheduled, (e) payment overdue, (f) loan fully settled. | Must |
| FR-RP-004.2 | Notification channels SHALL be configurable per tenant: SMS, push notification (via EMI app), email, and USSD callback. | Must |
| FR-RP-004.3 | Notification templates SHALL be customizable per product with dynamic variables (customer name, amount, due date, balance). | Must |

---

## 2. Overdue & Default Management

### 2.1 Overview

When repayments are missed, the system manages the escalation path from overdue to delinquent to default, applying penalties and triggering appropriate interventions at each stage.

### 2.2 Functional Requirements

#### FR-DM-001: Overdue Classification

| ID | Requirement | Priority |
|---|---|---|
| FR-DM-001.1 | The system SHALL classify contracts using configurable aging buckets. Default buckets: Current (0 days past due), Watch (1–7 DPD), Substandard (8–30 DPD), Doubtful (31–90 DPD), Loss (90+ DPD). | Must |
| FR-DM-001.2 | Aging bucket thresholds SHALL be configurable per product and per regulatory jurisdiction. | Must |
| FR-DM-001.3 | The system SHALL automatically transition contracts between buckets based on the number of days past due. | Must |
| FR-DM-001.4 | Each bucket transition SHALL trigger configurable actions: notification to customer, notification to SP operator, penalty fee application, credit limit adjustment, and referral to recovery. | Must |

#### FR-DM-002: Penalty Management

| ID | Requirement | Priority |
|---|---|---|
| FR-DM-002.1 | The system SHALL apply late payment penalties per product configuration: flat fee per missed payment, percentage of overdue amount per day/week, compound penalty (penalty on accumulated penalties — configurable cap), and maximum penalty cap (absolute amount or percentage of principal). | Must |
| FR-DM-002.2 | Penalty accrual SHALL respect regulatory caps where configured (e.g., total penalties shall not exceed X% of the original loan amount). | Must |
| FR-DM-002.3 | SP operators SHALL be able to waive penalties on a per-contract basis with documented reason. | Should |

#### FR-DM-003: Default & Write-Off

| ID | Requirement | Priority |
|---|---|---|
| FR-DM-003.1 | Contracts that reach the configured default threshold (e.g., 90+ DPD) SHALL be automatically classified as Non-Performing Loans (NPL). | Must |
| FR-DM-003.2 | NPL classification SHALL trigger: suspension of the customer's borrowing privileges across all products, referral to the AI recovery engine, reporting to credit bureaus (where integrated), and provisioning calculation for the lender's books. | Must |
| FR-DM-003.3 | Write-off SHALL be a manual decision by authorized SP operators, requiring multi-level approval. | Must |
| FR-DM-003.4 | Written-off loans SHALL remain in the system for record-keeping and potential future recovery. | Must |

---

## 3. AI-Driven Recovery

### 3.1 Overview

Lōns uses artificial intelligence to optimize loan recovery — predicting which loans are at risk, recommending tailored recovery strategies, and identifying community-based recovery opportunities. This replaces labor-intensive manual collection with data-driven, respectful recovery processes.

### 3.2 Functional Requirements

#### FR-AR-001: Predictive Risk Analysis

| ID | Requirement | Priority |
|---|---|---|
| FR-AR-001.1 | The AI engine SHALL analyze active loans to predict the probability of default before it occurs, using: payment history patterns, wallet balance trends, income deposit frequency changes, spending behavior shifts, and external economic indicators (where available). | Must |
| FR-AR-001.2 | Predictions SHALL be generated on a configurable schedule (daily or triggered by significant events). | Must |
| FR-AR-001.3 | Each prediction SHALL include: probability of default (0–100%), predicted days to default, confidence level, and top contributing risk factors. | Must |
| FR-AR-001.4 | High-risk loans SHALL be automatically flagged and surfaced to SP operators in the O&M Portal with recommended actions. | Must |

#### FR-AR-002: Recovery Strategy Recommendation

| ID | Requirement | Priority |
|---|---|---|
| FR-AR-002.1 | The AI engine SHALL recommend recovery strategies tailored to each borrower's situation: restructured repayment plan (extended tenor, reduced installments), grace period offering, transaction fee-based recovery (small deductions from future transactions), partial settlement offer, and escalation to formal collections. | Must |
| FR-AR-002.2 | Strategy recommendations SHALL be ranked by predicted effectiveness (recovery probability) and cost. | Must |
| FR-AR-002.3 | SP operators SHALL review and approve/modify recommended strategies before execution. | Must |
| FR-AR-002.4 | The system SHALL track the outcome of each recovery strategy to improve future recommendations (feedback loop). | Must |

#### FR-AR-003: Transaction Fee-Based Recovery

| ID | Requirement | Priority |
|---|---|---|
| FR-AR-003.1 | The system SHALL support a recovery method where small amounts are deducted from the borrower's wallet transactions to gradually repay the outstanding loan. | Should |
| FR-AR-003.2 | Deduction amounts and frequency SHALL be configurable (e.g., X% of each incoming transaction, up to Y per day). | Should |
| FR-AR-003.3 | This recovery method SHALL require explicit customer consent and comply with local regulations. | Must |

#### FR-AR-004: Network-Based Recovery

| ID | Requirement | Priority |
|---|---|---|
| FR-AR-004.1 | The AI engine SHALL analyze the borrower's transaction network to identify potential guarantors — individuals or entities with strong financial ties to the borrower who could vouch for or support repayment. | Should |
| FR-AR-004.2 | Network analysis SHALL only use data the borrower has consented to share, complying with privacy regulations. | Must |
| FR-AR-004.3 | Identified potential guarantors SHALL be presented to the SP for manual outreach — the system SHALL NOT automatically contact them. | Must |

#### FR-AR-005: Loan Restructuring

| ID | Requirement | Priority |
|---|---|---|
| FR-AR-005.1 | The system SHALL support loan restructuring for customers in financial difficulty, including: tenor extension, installment reduction with tenor extension, interest rate modification, penalty waiver (full or partial), and payment holiday (temporary pause on collections). | Must |
| FR-AR-005.2 | Restructuring SHALL create a new repayment schedule while preserving the original contract history. | Must |
| FR-AR-005.3 | Restructured loans SHALL be flagged and tracked separately in reporting. | Must |
| FR-AR-005.4 | Restructuring SHALL require SP approval per configurable authorization rules. | Must |

---

## 4. Collections Workflow

### 4.1 Functional Requirements

#### FR-CW-001: Collections Queue

| ID | Requirement | Priority |
|---|---|---|
| FR-CW-001.1 | The system SHALL maintain a prioritized collections queue showing all contracts requiring recovery action. | Must |
| FR-CW-001.2 | Queue prioritization SHALL be configurable: by amount owed, by days past due, by AI-predicted recovery probability, or by custom scoring. | Must |
| FR-CW-001.3 | SP operators SHALL be able to filter, sort, and assign queue items to specific team members. | Should |

#### FR-CW-002: Collections Actions

| ID | Requirement | Priority |
|---|---|---|
| FR-CW-002.1 | The system SHALL support the following collections actions, logged against each contract: send payment reminder (SMS/push/email), record customer contact attempt (call log), record promise-to-pay with date, apply restructuring, initiate transaction fee-based recovery, escalate to external collections agency, recommend write-off. | Must |
| FR-CW-002.2 | Each action SHALL be timestamped and attributed to the operator who performed it. | Must |
| FR-CW-002.3 | The system SHALL track promise-to-pay commitments and auto-flag broken promises. | Should |

#### FR-CW-003: Collections Reporting

| ID | Requirement | Priority |
|---|---|---|
| FR-CW-003.1 | The system SHALL provide collections performance reports: recovery rate by strategy type, recovery rate by aging bucket, average days to recovery, cost of recovery (operational), and collector performance metrics. | Must |
| FR-CW-003.2 | Reports SHALL feed back into the AI engine to improve recovery strategy recommendations. | Should |
