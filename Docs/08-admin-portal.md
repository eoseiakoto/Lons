# 08 — Admin Portal (O&M Portal)

This document defines the requirements for the Operations & Maintenance Portal — the web-based admin interface used by SP operators to manage the Lōns platform.

---

## 1. Portal Overview

### 1.1 Purpose

The O&M Portal is the primary interface for SP operators to configure products, manage loans, monitor portfolio health, handle exceptions, and generate reports. It is built as a Next.js web application and supports multi-tenant, role-based access.

### 1.2 Design Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-PT-001 | The portal SHALL be a responsive web application supporting desktop (1280px+) and tablet (768px+) viewports. | Must |
| FR-PT-002 | The portal SHALL support white-labeling: SP logo, brand colors, and custom domain. | Should |
| FR-PT-003 | The portal SHALL support English as the default language with a framework for adding additional languages (i18n). | Must |
| FR-PT-004 | All data-heavy views SHALL support export to CSV and PDF. | Should |
| FR-PT-005 | The portal SHALL implement optimistic UI updates for a responsive feel, with server-side confirmation. | Should |

---

## 2. Dashboard

### 2.1 Functional Requirements

#### FR-DB-001: Executive Dashboard

| ID | Requirement | Priority |
|---|---|---|
| FR-DB-001.1 | The dashboard SHALL display key metrics at a glance: total active loans (count and value), total disbursements today/this week/this month, total repayments collected today/this week/this month, portfolio at risk (PAR 1, 7, 30), NPL ratio, new applications today, approval rate, and revenue earned (current period). | Must |
| FR-DB-001.2 | Metrics SHALL be filterable by: product type, date range, and customer segment. | Must |
| FR-DB-001.3 | The dashboard SHALL include trend charts showing: disbursement volume over time, repayment collection over time, PAR trends, and new customer acquisition. | Must |
| FR-DB-001.4 | The dashboard SHALL highlight alerts and exceptions requiring attention. | Must |

---

## 3. Product Management Screens

### 3.1 Functional Requirements

#### FR-PM-001: Product List & Creation

| ID | Requirement | Priority |
|---|---|---|
| FR-PM-001.1 | The portal SHALL display a list of all loan products with: name, type, status, currency, active contract count, and creation date. | Must |
| FR-PM-001.2 | SP operators SHALL create new products through a multi-step wizard that guides them through all required configurations (basic info → financial terms → fees → eligibility → approval workflow → notifications → review & activate). | Must |
| FR-PM-001.3 | The wizard SHALL validate configurations at each step and prevent activation of incomplete products. | Must |

#### FR-PM-002: Product Detail & Editing

| ID | Requirement | Priority |
|---|---|---|
| FR-PM-002.1 | The product detail view SHALL show all configuration parameters, version history, and active contract count. | Must |
| FR-PM-002.2 | Editing SHALL create a new version with a diff view showing what changed. | Must |
| FR-PM-002.3 | The portal SHALL warn operators when editing a product with active contracts that changes only apply to future contracts. | Must |

---

## 4. Customer Management Screens

### 4.1 Functional Requirements

#### FR-CM-001: Customer Search & List

| ID | Requirement | Priority |
|---|---|---|
| FR-CM-001.1 | The portal SHALL provide a customer search supporting: name, phone number, national ID, external ID, and Lōns customer ID. | Must |
| FR-CM-001.2 | Search results SHALL show: customer name, ID, phone, KYC level, active loan count, current risk status, and total outstanding balance. | Must |

#### FR-CM-002: Customer Detail View

| ID | Requirement | Priority |
|---|---|---|
| FR-CM-002.1 | The customer detail view SHALL include tabs for: Profile (personal info, KYC, consent status), Credit Summary (scores, limits, utilization), Contracts (all loans — active and historical), Repayment History (all payments across contracts), Financial Profile (transaction patterns, income indicators), and Activity Log (all system interactions and events). | Must |
| FR-CM-002.2 | Operators SHALL be able to perform actions from the customer view: add to blacklist/watchlist, trigger manual credit score refresh, view scoring breakdown, and add notes. | Must |

---

## 5. Loan Operations Screens

### 5.1 Functional Requirements

#### FR-LO-001: Application Queue

| ID | Requirement | Priority |
|---|---|---|
| FR-LO-001.1 | The portal SHALL display a queue of loan applications pending manual review, sorted by priority and age. | Must |
| FR-LO-001.2 | Each queue item SHALL show: customer name, product, requested amount, credit score, risk tier, AI recommendation, time in queue, and SLA status (within/breaching). | Must |
| FR-LO-001.3 | Operators SHALL be able to: approve (with optional term modifications), reject (with mandatory reason), or escalate to a higher authority. | Must |

#### FR-LO-002: Active Contracts View

| ID | Requirement | Priority |
|---|---|---|
| FR-LO-002.1 | The portal SHALL display all active contracts with filtering by: product type, status (performing/overdue/delinquent/default), date range, amount range, and customer segment. | Must |
| FR-LO-002.2 | Bulk actions SHALL be supported: bulk export, bulk notification send, and bulk assignment to collectors. | Should |

#### FR-LO-003: Contract Detail View

| ID | Requirement | Priority |
|---|---|---|
| FR-LO-003.1 | The contract detail view SHALL show: contract terms, repayment schedule, payment history, ledger entries, current balance breakdown (principal/interest/fees), and timeline of all state transitions. | Must |
| FR-LO-003.2 | Operators SHALL be able to: initiate restructuring, waive penalties (with approval), record manual payment, and add collection notes. | Must |

---

## 6. Collections & Recovery Screens

### 6.1 Functional Requirements

#### FR-CR-001: Collections Dashboard

| ID | Requirement | Priority |
|---|---|---|
| FR-CR-001.1 | The collections dashboard SHALL show: total overdue amount, number of overdue contracts by aging bucket, recovery rate trends, AI-recommended actions pending review, and collector workload distribution. | Must |

#### FR-CR-002: Collections Queue

| ID | Requirement | Priority |
|---|---|---|
| FR-CR-002.1 | The collections queue SHALL list all contracts in recovery, with AI-recommended strategies displayed alongside each. | Must |
| FR-CR-002.2 | Operators SHALL be able to: approve/modify AI-recommended strategies, log contact attempts, record promises-to-pay, initiate restructuring, and escalate to external agencies. | Must |

---

## 7. Reporting Screens

### 7.1 Functional Requirements

#### FR-RPT-001: Standard Reports

| ID | Requirement | Priority |
|---|---|---|
| FR-RPT-001.1 | The portal SHALL provide the following standard reports: Disbursement Report (daily/weekly/monthly), Repayment Collection Report, Portfolio Quality Report (PAR, NPL, provisioning), Revenue & Settlement Report, Reconciliation Report, Customer Acquisition Report, Product Performance Report, and Collections Performance Report. | Must |
| FR-RPT-001.2 | All reports SHALL support: date range selection, product filtering, export to CSV and PDF, and scheduled delivery via email. | Must |

#### FR-RPT-002: Custom Reports

| ID | Requirement | Priority |
|---|---|---|
| FR-RPT-002.1 | The portal SHALL support a report builder allowing operators to: select data fields, apply filters, choose grouping/aggregation, and save report definitions for reuse. | Should |

---

## 8. Settings & Configuration Screens

### 8.1 Functional Requirements

#### FR-SET-001: Tenant Settings

| ID | Requirement | Priority |
|---|---|---|
| FR-SET-001.1 | SP Admins SHALL manage: organization profile, branding (logo, colors), user accounts and roles, API keys, webhook configurations, notification templates, integration connections, and scoring model configuration. | Must |

#### FR-SET-002: Audit Log Viewer

| ID | Requirement | Priority |
|---|---|---|
| FR-SET-002.1 | The portal SHALL provide a searchable audit log showing all significant actions: who did what, when, from where (IP), and what changed (before/after values). | Must |
| FR-SET-002.2 | Audit logs SHALL be filterable by: user, action type, date range, and affected resource. | Must |
| FR-SET-002.3 | Audit logs SHALL be immutable and tamper-evident. | Must |
