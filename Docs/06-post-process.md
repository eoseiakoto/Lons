# 06 — Post-Process Layer

This document defines the requirements for post-disbursement operations: statements, revenue settlement, reconciliation, and default management.

---

## 1. Statement Engine

### 1.1 Functional Requirements

#### FR-ST-001: Statement Generation

| ID | Requirement | Priority |
|---|---|---|
| FR-ST-001.1 | The system SHALL generate periodic loan statements for each active contract. Statement frequency SHALL be configurable per product: daily, weekly, monthly, or on-demand. | Must |
| FR-ST-001.2 | Each statement SHALL include: statement period (from/to), opening balance, all transactions during the period (disbursements, repayments, fees, penalties, adjustments), closing balance, next payment due date and amount, and total amount paid to date vs. total amount due. | Must |
| FR-ST-001.3 | Statements SHALL be accessible via the GraphQL API and downloadable from the O&M Portal. | Must |
| FR-ST-001.4 | The system SHALL support generating statements in PDF format for customer-facing distribution. | Should |

#### FR-ST-002: Account Ledger

| ID | Requirement | Priority |
|---|---|---|
| FR-ST-002.1 | The system SHALL maintain a double-entry ledger for each loan contract recording every financial event: disbursement (debit), interest accrual (debit), fee application (debit), penalty application (debit), repayment (credit), adjustment (debit or credit), and write-off (credit). | Must |
| FR-ST-002.2 | Ledger entries SHALL be immutable — corrections are made via adjustment entries, never by modifying existing records. | Must |
| FR-ST-002.3 | Each ledger entry SHALL include: entry ID, contract ID, entry type, debit/credit indicator, amount, running balance, effective date, value date, description, and reference (e.g., payment ID, fee rule ID). | Must |

---

## 2. Revenue Settlement

### 2.1 Overview

Revenue from loan products (interest, fees, penalties) is shared between multiple parties: the lender (funding source), the SP (platform operator), the EMI (distribution channel), and the Lōns platform. The revenue settlement engine calculates each party's share and generates settlement instructions.

### 2.2 Functional Requirements

#### FR-RS-001: Revenue Sharing Rules

| ID | Requirement | Priority |
|---|---|---|
| FR-RS-001.1 | Revenue sharing rules SHALL be configurable per product and per lender configuration, defining: percentage or fixed amount per party for each revenue type (interest, origination fee, service fee, penalty fee, late fee). | Must |
| FR-RS-001.2 | Supported revenue distribution models: percentage split (e.g., 60% lender, 25% SP, 10% EMI, 5% platform), tiered split (percentages change based on volume thresholds), fixed amount per transaction plus percentage of remainder, and waterfall (first X goes to party A, then Y to party B, remainder to party C). | Must |
| FR-RS-001.3 | Revenue sharing rules SHALL be versioned and linked to product versions. | Must |

#### FR-RS-002: Settlement Calculation

| ID | Requirement | Priority |
|---|---|---|
| FR-RS-002.1 | The system SHALL calculate revenue settlement on a configurable schedule: daily, weekly, bi-weekly, or monthly. | Must |
| FR-RS-002.2 | Settlement calculation SHALL aggregate all revenue events since the last settlement and apply the sharing rules. | Must |
| FR-RS-002.3 | Each settlement run SHALL produce a settlement report per party showing: gross revenue by type, party share calculation, deductions (if any), net settlement amount, and supporting transaction details. | Must |

#### FR-RS-003: Settlement Execution

| ID | Requirement | Priority |
|---|---|---|
| FR-RS-003.1 | Settlement reports SHALL be made available for SP review and approval before execution (configurable — can be auto-approved). | Must |
| FR-RS-003.2 | Upon approval, the system SHALL generate settlement instructions (transfer orders) for each party. | Must |
| FR-RS-003.3 | Settlement execution (actual fund transfer) SHALL be handled by the integration layer — Lōns generates instructions, the payment system executes. | Must |
| FR-RS-003.4 | The system SHALL track settlement status: CALCULATED → APPROVED → EXECUTING → SETTLED → FAILED. | Must |

---

## 3. Reconciliation

### 3.1 Functional Requirements

#### FR-RC-001: Daily Reconciliation

| ID | Requirement | Priority |
|---|---|---|
| FR-RC-001.1 | The system SHALL perform daily reconciliation comparing Lōns internal records against external sources: (a) wallet provider transaction records (disbursements and repayments), (b) lender funding account movements, (c) settlement account balances. | Must |
| FR-RC-001.2 | Reconciliation SHALL run as a scheduled batch job at a configurable time (default: 2:00 AM tenant timezone). | Must |
| FR-RC-001.3 | The reconciliation process SHALL produce a report categorizing each transaction as: matched, unmatched (exists in Lōns but not in external system), orphaned (exists in external system but not in Lōns), or amount mismatch. | Must |

#### FR-RC-002: Exception Handling

| ID | Requirement | Priority |
|---|---|---|
| FR-RC-002.1 | Unmatched, orphaned, and mismatched transactions SHALL be flagged as reconciliation exceptions. | Must |
| FR-RC-002.2 | Exceptions SHALL be surfaced in the O&M Portal with severity levels: low (timing difference likely to self-resolve), medium (requires investigation within 24 hours), and high (potential financial loss — immediate investigation). | Must |
| FR-RC-002.3 | SP operators SHALL be able to investigate and resolve exceptions with documented resolution notes. | Must |
| FR-RC-002.4 | Unresolved exceptions older than a configurable threshold (default: 3 business days) SHALL trigger escalation alerts. | Should |

#### FR-RC-003: Reconciliation Reporting

| ID | Requirement | Priority |
|---|---|---|
| FR-RC-003.1 | The system SHALL maintain a reconciliation history showing: daily match rates, exception trends, average resolution time, and outstanding exceptions by age. | Must |
| FR-RC-003.2 | Reconciliation reports SHALL be available for regulatory audit. | Must |

---

## 4. Default Management

### 4.1 Overview

Default management handles the classification, provisioning, and lifecycle of non-performing loans. It bridges the gap between the repayment engine (which tracks payments) and the recovery engine (which attempts to collect).

### 4.2 Functional Requirements

#### FR-DFL-001: Portfolio Quality Classification

| ID | Requirement | Priority |
|---|---|---|
| FR-DFL-001.1 | The system SHALL classify the entire loan portfolio into quality buckets at least daily: Performing (current on all payments), Special Mention (1–30 DPD), Substandard (31–60 DPD), Doubtful (61–90 DPD), and Loss (90+ DPD). | Must |
| FR-DFL-001.2 | Classification thresholds SHALL be configurable per regulatory jurisdiction (e.g., Central Bank of Kenya vs. Bank of Ghana rules). | Must |
| FR-DFL-001.3 | The system SHALL calculate provisioning requirements per classification bucket (e.g., 1% for Special Mention, 20% for Substandard, 50% for Doubtful, 100% for Loss). | Must |

#### FR-DFL-002: Portfolio Analytics

| ID | Requirement | Priority |
|---|---|---|
| FR-DFL-002.1 | The system SHALL compute and expose key portfolio metrics: Portfolio at Risk (PAR) at 1, 7, 30, 60, 90 days, Non-Performing Loan (NPL) ratio, Loan Loss Reserve ratio, Write-off ratio, Collection rate, and Vintage analysis (performance of loans originated in the same period). | Must |
| FR-DFL-002.2 | Metrics SHALL be calculable by: product type, origination period, customer segment, geographic region, and lender. | Must |
| FR-DFL-002.3 | Metrics SHALL be available via API and O&M Portal dashboards. | Must |

#### FR-DFL-003: Regulatory Reporting

| ID | Requirement | Priority |
|---|---|---|
| FR-DFL-003.1 | The system SHALL support generation of regulatory reports in formats required by local financial authorities. | Should |
| FR-DFL-003.2 | Report templates SHALL be configurable per jurisdiction. | Should |
| FR-DFL-003.3 | The system SHALL support submission of credit data to credit bureaus where integrated (positive and negative reporting). | Should |
