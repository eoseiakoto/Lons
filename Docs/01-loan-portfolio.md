# 01 — Loan Portfolio Management

This document defines the functional requirements for all loan product types managed by the Lōns platform.

---

## 1. Overdraft

### 1.1 Product Overview

An overdraft allows a customer to complete a transaction when their wallet/account balance is insufficient. The shortfall is covered by a credit facility, consolidated into a single rolling overdraft contract per customer. Overdrafts are short-term, typically repaid within 7–30 days.

### 1.2 Functional Requirements

#### FR-OD-001: Overdraft Product Management

| ID | Requirement | Priority |
|---|---|---|
| FR-OD-001.1 | SP operators SHALL create overdraft products via the O&M Portal with the following parameters: product name, description, currency, minimum/maximum overdraft amount, interest rate (flat or percentage), penalty fee structure, grace period (days), contract lifecycle duration, and notification templates. | Must |
| FR-OD-001.2 | SP operators SHALL be able to query, modify, and deactivate overdraft products. Deactivation SHALL NOT affect active contracts — only prevent new subscriptions. | Must |
| FR-OD-001.3 | Each overdraft product SHALL be linked to a specific lender configuration that defines the funding source and revenue-sharing rules. | Must |
| FR-OD-001.4 | The system SHALL support multiple active overdraft products per tenant, each with distinct terms and target customer segments. | Should |
| FR-OD-001.5 | Product configuration changes SHALL be versioned, with an audit trail of who changed what and when. | Must |

#### FR-OD-002: Overdraft Subscription Management

| ID | Requirement | Priority |
|---|---|---|
| FR-OD-002.1 | Customers SHALL be able to activate overdraft service through the SP's customer-facing channel (wallet app, USSD, API). | Must |
| FR-OD-002.2 | Upon activation request, the system SHALL check: (a) customer KYC status, (b) pre-qualification criteria, (c) credit score eligibility, (d) whether the customer already has an active overdraft subscription. | Must |
| FR-OD-002.3 | If eligible, the system SHALL assign an initial credit limit based on the scoring engine output and the product's configured limits. | Must |
| FR-OD-002.4 | Customers SHALL be able to deactivate their overdraft subscription. Deactivation SHALL only be permitted when the outstanding balance is zero. | Must |
| FR-OD-002.5 | The system SHALL send confirmation notifications for both activation and deactivation events. | Must |

#### FR-OD-003: Overdraft Limit Management

| ID | Requirement | Priority |
|---|---|---|
| FR-OD-003.1 | The system SHALL assign an initial credit limit upon subscription activation, derived from the scoring engine. | Must |
| FR-OD-003.2 | Customers SHALL be able to query their current available overdraft limit at any time. | Must |
| FR-OD-003.3 | The system SHALL automatically recalculate and adjust credit limits based on: repayment behavior, transaction volume changes, updated credit score, and configurable review frequency (e.g., every 30/60/90 days). | Must |
| FR-OD-003.4 | Limit increases SHALL be subject to maximum caps defined in the product configuration. | Must |
| FR-OD-003.5 | Limit decreases SHALL NOT affect the outstanding balance — only future overdraft availability. | Must |
| FR-OD-003.6 | All limit changes SHALL be logged with reason codes and timestamps. | Must |

#### FR-OD-004: Overdraft Transactions

| ID | Requirement | Priority |
|---|---|---|
| FR-OD-004.1 | When a customer initiates a transaction that exceeds their wallet balance, the system SHALL automatically check overdraft eligibility and cover the shortfall up to the available limit. | Must |
| FR-OD-004.2 | The overdraft amount used SHALL be deducted from the customer's available credit limit in real-time. | Must |
| FR-OD-004.3 | All overdraft transactions within a billing cycle SHALL be consolidated into a single overdraft contract. | Must |
| FR-OD-004.4 | The system SHALL apply applicable fees (transaction fee, service fee) per the product configuration at the time of each transaction. | Must |
| FR-OD-004.5 | If the overdraft request exceeds the available limit, the transaction SHALL be declined with an appropriate reason code. | Must |
| FR-OD-004.6 | The system SHALL record each overdraft transaction with: timestamp, transaction amount, wallet balance before/after, overdraft amount used, fees applied, and reference ID. | Must |

#### FR-OD-005: Overdraft Repayment

| ID | Requirement | Priority |
|---|---|---|
| FR-OD-005.1 | The system SHALL support automatic repayment: when funds are deposited into the customer's wallet, the system deducts the outstanding overdraft amount (or a portion) following a configurable priority order (fees → interest → principal). | Must |
| FR-OD-005.2 | Customers SHALL also be able to make manual repayments toward their overdraft balance. | Must |
| FR-OD-005.3 | Partial repayments SHALL be accepted and applied per the configured priority order. | Must |
| FR-OD-005.4 | Upon full repayment, the overdraft contract SHALL be marked as settled and the full credit limit restored. | Must |
| FR-OD-005.5 | The system SHALL generate a repayment receipt/notification for every payment processed. | Must |

#### FR-OD-006: Post-Loan Management

| ID | Requirement | Priority |
|---|---|---|
| FR-OD-006.1 | The system SHALL calculate and apply interest charges per the product terms (daily accrual, flat fee, or tiered). | Must |
| FR-OD-006.2 | If repayment is not made by the due date, the system SHALL apply penalty fees as configured in the product. | Must |
| FR-OD-006.3 | The system SHALL send reminder notifications at configurable intervals before and after the due date (e.g., 3 days before, on due date, 1 day overdue, 7 days overdue). | Must |
| FR-OD-006.4 | The system SHALL manage overdraft contract lifecycle states: Active → Due → Overdue → Delinquent → Default → Written Off → Settled. | Must |
| FR-OD-006.5 | State transitions SHALL trigger events that feed into the analytics and recovery engines. | Must |

#### FR-OD-007: Revenue Settlement

| ID | Requirement | Priority |
|---|---|---|
| FR-OD-007.1 | The system SHALL automatically calculate revenue from all overdraft fees (service fees, interest, penalties). | Must |
| FR-OD-007.2 | Revenue SHALL be split between SP, lender, and platform according to configurable revenue-sharing rules defined per product. | Must |
| FR-OD-007.3 | Settlement calculations SHALL run on a configurable schedule (daily, weekly, monthly). | Must |
| FR-OD-007.4 | The system SHALL generate settlement reports showing gross revenue, each party's share, and net amounts. | Must |

#### FR-OD-008: Data & Reporting

| ID | Requirement | Priority |
|---|---|---|
| FR-OD-008.1 | The system SHALL provide daily data extracts for overdraft activity (subscriptions, transactions, repayments, defaults). | Must |
| FR-OD-008.2 | Summary and detail reports SHALL be available via the O&M Portal and API. | Must |
| FR-OD-008.3 | Reports SHALL support filtering by date range, product, customer segment, and contract status. | Should |

---

## 2. Micro-Loan

### 2.1 Product Overview

Micro-loans are small-amount, short-to-medium-term loans disbursed directly to a customer's wallet. They follow a formal application → approval → disbursement → repayment cycle with installment or lump-sum repayment options.

### 2.2 Functional Requirements

#### FR-ML-001: Micro-Loan Product Management

| ID | Requirement | Priority |
|---|---|---|
| FR-ML-001.1 | SP operators SHALL create micro-loan products with: product name, description, currency, min/max loan amount, tenor options (e.g., 7/14/30/60/90 days), interest rate model (flat, reducing balance, tiered), fee structure (origination fee, service fee, insurance levy), repayment method (lump-sum, equal installments, balloon), grace period, and penalty configuration. | Must |
| FR-ML-001.2 | SP operators SHALL be able to modify, query, and discontinue products. Discontinuation SHALL NOT affect active loans. | Must |
| FR-ML-001.3 | Products SHALL support configurable eligibility rules (minimum account age, minimum transaction volume, required KYC level). | Must |

#### FR-ML-002: Subscription Management

| ID | Requirement | Priority |
|---|---|---|
| FR-ML-002.1 | Customers SHALL activate micro-loan service, triggering eligibility verification (KYC, pre-qualification, scoring). | Must |
| FR-ML-002.2 | Activation SHALL result in a credit limit assignment based on the scoring engine output. | Must |
| FR-ML-002.3 | Customers SHALL be able to deactivate only when no loans are outstanding. | Must |

#### FR-ML-003: Loan Request & Disbursement

| ID | Requirement | Priority |
|---|---|---|
| FR-ML-003.1 | An active subscriber SHALL request a loan specifying: desired amount and preferred tenor. | Must |
| FR-ML-003.2 | The system SHALL validate: (a) amount is within credit limit, (b) no existing active loan of the same product type (if single-loan policy), (c) customer is in good standing. | Must |
| FR-ML-003.3 | Upon validation, the system SHALL generate a loan offer showing: approved amount, interest, total fees, repayment schedule, and total cost of credit. | Must |
| FR-ML-003.4 | The customer SHALL explicitly accept the offer before disbursement proceeds. | Must |
| FR-ML-003.5 | Upon acceptance, the system SHALL create a loan contract and initiate disbursement to the customer's wallet. | Must |
| FR-ML-003.6 | Disbursement SHALL be processed through the integration layer (digital wallet adapter) and confirmed via callback. | Must |
| FR-ML-003.7 | If disbursement fails, the contract SHALL be rolled back and the customer notified. | Must |

#### FR-ML-004: Repayment

| ID | Requirement | Priority |
|---|---|---|
| FR-ML-004.1 | The system SHALL generate a repayment schedule at contract creation, showing each installment's due date, principal portion, interest portion, and total amount. | Must |
| FR-ML-004.2 | Repayments SHALL be collected automatically on due dates via wallet deduction (with customer's prior consent during activation). | Must |
| FR-ML-004.3 | Customers SHALL also be able to make manual or advance repayments at any time. | Must |
| FR-ML-004.4 | Early/advance repayment rules SHALL be configurable per product (e.g., interest rebate, no rebate, penalty for early repayment). | Should |
| FR-ML-004.5 | Partial repayments SHALL be accepted and allocated per the configured priority (fees → interest → principal). | Must |
| FR-ML-004.6 | The system SHALL send payment reminders before each due date and confirmation after each payment. | Must |

#### FR-ML-005: Credit Limit Adjustments

| ID | Requirement | Priority |
|---|---|---|
| FR-ML-005.1 | Upon successful loan repayment, the system SHALL trigger a credit limit review and potentially increase the customer's limit. | Must |
| FR-ML-005.2 | Repeated defaults or late payments SHALL trigger limit reduction or suspension. | Must |
| FR-ML-005.3 | Limit adjustments SHALL follow configurable rules per product and be logged with reason codes. | Must |

#### FR-ML-006: Post-Loan Management

| ID | Requirement | Priority |
|---|---|---|
| FR-ML-006.1 | Loan contract lifecycle states: Pending → Active → Performing → Due → Overdue → Delinquent → Default → Written Off → Settled. | Must |
| FR-ML-006.2 | The system SHALL apply late fees, penalty interest, and any applicable insurance levies per product configuration. | Must |
| FR-ML-006.3 | Rollover options (extending the loan tenor with additional fees) SHALL be configurable per product. | Should |
| FR-ML-006.4 | The system SHALL support loan restructuring for customers in financial difficulty (subject to SP approval workflow). | Should |

#### FR-ML-007: Sanctions & Revenue

| ID | Requirement | Priority |
|---|---|---|
| FR-ML-007.1 | The system SHALL support configurable sanction actions for defaulting customers: service suspension, limit reduction, blacklisting, referral to collections. | Must |
| FR-ML-007.2 | Revenue from micro-loans SHALL be settled per the same revenue-sharing framework as overdrafts (FR-OD-007). | Must |

---

## 3. Buy-Now-Pay-Later (BNPL)

### 3.1 Product Overview

BNPL enables customers to split a purchase into installments at the point of sale. The merchant receives full payment upfront (funded by the lender), and the customer repays in installments. BNPL involves a three-party relationship: customer, merchant, and lender — all orchestrated by Lōns.

### 3.2 Functional Requirements

#### FR-BN-001: BNPL Product Management

| ID | Requirement | Priority |
|---|---|---|
| FR-BN-001.1 | SP operators SHALL create BNPL products with: product name, currency, min/max transaction amount, number of installments (e.g., 3/6/12), installment frequency (weekly, bi-weekly, monthly), interest/fee model (zero-interest merchant-subsidized, customer-paid interest, or hybrid), merchant fee percentage, and late payment penalties. | Must |
| FR-BN-001.2 | BNPL products SHALL support merchant whitelisting — defining which merchants/categories are eligible. | Should |
| FR-BN-001.3 | Product modifications SHALL NOT affect existing active BNPL contracts. | Must |

#### FR-BN-002: BNPL Transaction Processing

| ID | Requirement | Priority |
|---|---|---|
| FR-BN-002.1 | At checkout, the customer selects BNPL as a payment method. The merchant's system calls Lōns to initiate the BNPL transaction. | Must |
| FR-BN-002.2 | The system SHALL validate: (a) customer has an active BNPL subscription, (b) transaction amount is within the customer's available BNPL credit limit, (c) merchant is eligible for the BNPL product. | Must |
| FR-BN-002.3 | Upon approval, the system SHALL: (a) pay the merchant the full purchase amount (minus merchant fee), (b) create a BNPL contract for the customer with the installment schedule, (c) deduct the transaction from the customer's BNPL credit limit. | Must |
| FR-BN-002.4 | The system SHALL send the customer a confirmation with the installment schedule and total cost. | Must |

#### FR-BN-003: BNPL Repayment

| ID | Requirement | Priority |
|---|---|---|
| FR-BN-003.1 | Installments SHALL be collected automatically on scheduled due dates via wallet deduction. | Must |
| FR-BN-003.2 | Customers SHALL be able to settle remaining installments early (advance settlement). | Must |
| FR-BN-003.3 | Early settlement terms SHALL be configurable (e.g., interest rebate for early payoff). | Should |
| FR-BN-003.4 | Missed installments SHALL trigger late payment penalties and notifications per product configuration. | Must |

#### FR-BN-004: BNPL Credit Limit

| ID | Requirement | Priority |
|---|---|---|
| FR-BN-004.1 | Each customer SHALL have a BNPL-specific credit limit, separate from overdraft and micro-loan limits. | Must |
| FR-BN-004.2 | Credit limits SHALL be dynamically adjusted based on purchase history, repayment behavior, and credit score updates. | Must |
| FR-BN-004.3 | As BNPL contracts are repaid, the corresponding credit limit SHALL be restored. | Must |

#### FR-BN-005: Post-Purchase & Settlement

| ID | Requirement | Priority |
|---|---|---|
| FR-BN-005.1 | The system SHALL track each BNPL transaction through its full lifecycle: Active → Performing → Due → Overdue → Delinquent → Default → Settled. | Must |
| FR-BN-005.2 | Revenue from BNPL (merchant fees, customer fees, late penalties) SHALL be settled per the revenue-sharing framework. | Must |
| FR-BN-005.3 | Merchant settlements SHALL be processed on a configurable schedule (immediate, daily, weekly). | Must |

---

## 4. Invoice Discounting, Factoring & Reverse-Factoring

### 4.1 Product Overview

These B2B lending products allow businesses to access working capital against outstanding invoices. Factoring sells invoices at a discount; reverse-factoring is buyer-initiated where the buyer's creditworthiness secures funding for the supplier. This module is designed primarily for transaction banking scenarios.

### 4.2 Functional Requirements

#### FR-IF-001: Invoice Product Management

| ID | Requirement | Priority |
|---|---|---|
| FR-IF-001.1 | SP operators SHALL configure invoice financing products with: product type (discounting, factoring, reverse-factoring), advance rate percentage (e.g., 80% of invoice value), discount/interest rate, maximum tenor, eligible industries/categories, and fee structure. | Must |
| FR-IF-001.2 | Products SHALL support configurable risk policies that define acceptable invoice characteristics (minimum value, maximum age, required documentation). | Must |

#### FR-IF-002: Invoice Submission & Assessment

| ID | Requirement | Priority |
|---|---|---|
| FR-IF-002.1 | Businesses SHALL submit invoices for financing via the API, including: invoice number, amount, currency, debtor details, due date, and supporting documentation. | Must |
| FR-IF-002.2 | The system SHALL perform automated risk assessment using: AI-driven analysis of the invoice, debtor creditworthiness, historical payment patterns of the debtor, industry risk factors, and the submitter's track record. | Must |
| FR-IF-002.3 | Based on assessment, the system SHALL generate a financing offer showing: advance amount, discount/fee, net disbursement, and expected settlement date. | Must |

#### FR-IF-003: Disbursement & Settlement

| ID | Requirement | Priority |
|---|---|---|
| FR-IF-003.1 | Upon acceptance, the advance amount SHALL be disbursed to the submitter's account. | Must |
| FR-IF-003.2 | When the invoice is paid by the debtor, the system SHALL: collect the full invoice amount, deduct the advance and fees, and remit any remainder to the submitter. | Must |
| FR-IF-003.3 | For reverse-factoring, the buyer SHALL approve invoices for early payment, and the system SHALL disburse to the supplier based on the buyer's credit facility. | Must |

#### FR-IF-004: Risk & Recovery

| ID | Requirement | Priority |
|---|---|---|
| FR-IF-004.1 | The system SHALL monitor invoice payment status and trigger recovery processes for overdue invoices. | Must |
| FR-IF-004.2 | AI-driven analysis of previous invoice data SHALL inform recovery strategies and risk pricing for future transactions. | Should |

---

## 5. Cross-Cutting Portfolio Requirements

These apply across all loan product types:

| ID | Requirement | Priority |
|---|---|---|
| FR-CP-001 | Every loan product SHALL support multi-currency configuration. | Should |
| FR-CP-002 | All financial calculations SHALL use decimal precision (minimum 4 decimal places) with banker's rounding. | Must |
| FR-CP-003 | Product configurations SHALL be versioned — active contracts remain on the version they were created under. | Must |
| FR-CP-004 | The system SHALL support product-level configurable workflows for approval (auto-approve, single approver, multi-level approval). | Must |
| FR-CP-005 | All contract state transitions SHALL emit events to the event bus for downstream processing. | Must |
| FR-CP-006 | The system SHALL enforce a configurable cooling-off period after contract creation during which the customer can cancel. | Should |
| FR-CP-007 | The system SHALL support configurable maximum exposure rules — limiting total credit across all product types per customer. | Must |
| FR-CP-008 | All monetary amounts in API responses SHALL include the currency code and the amount as a string (not float) to prevent precision loss. | Must |
