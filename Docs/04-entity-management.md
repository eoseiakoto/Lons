# 04 — Entity Management

This document defines the requirements for the core entities in Lōns: Service Providers (tenants), Loan Products, and Customers.

---

## 1. Service Provider (Tenant) Management

### 1.1 Overview

A Service Provider (SP) is the primary tenant in Lōns — typically a lending institution, EMI, bank, or licensed creditor that uses the platform to offer loan products. Each SP operates in an isolated data environment with its own configuration, users, products, and customer base.

### 1.2 Functional Requirements

#### FR-SP-001: Tenant Onboarding

| ID | Requirement | Priority |
|---|---|---|
| FR-SP-001.1 | Platform admins SHALL onboard new SPs by creating a tenant record with: organization name, legal entity name, registration number, country of operation, primary contact, billing information, and assigned plan/tier. | Must |
| FR-SP-001.2 | Upon creation, the system SHALL provision: an isolated database schema, default configuration values, an SP Admin user account, API credentials (client ID + secret), and a dedicated webhook signing key. | Must |
| FR-SP-001.3 | Tenant provisioning SHALL complete within 60 seconds. | Should |

#### FR-SP-002: Tenant Configuration

| ID | Requirement | Priority |
|---|---|---|
| FR-SP-002.1 | Each SP SHALL have configurable settings including: supported currencies, default language/locale, timezone, business hours, notification preferences, branding (logo, colors — for white-label portal), regulatory jurisdiction, and feature flags (which modules are enabled). | Must |
| FR-SP-002.2 | Configuration changes SHALL be audited and take effect immediately (or on next business day for critical settings, configurable). | Must |

#### FR-SP-003: Tenant User Management

| ID | Requirement | Priority |
|---|---|---|
| FR-SP-003.1 | SP Admins SHALL manage users within their tenant: create, update, deactivate, and assign roles. | Must |
| FR-SP-003.2 | The system SHALL enforce role-based access control (RBAC) with the following default roles: SP Admin, SP Operator, SP Analyst, SP Auditor. Custom roles SHALL be supported. | Must |
| FR-SP-003.3 | Each role SHALL have configurable permissions mapped to specific actions (create product, approve loan, view reports, manage users, etc.). | Must |
| FR-SP-003.4 | The system SHALL support multi-factor authentication (MFA) for all SP portal users. | Must |
| FR-SP-003.5 | Failed login attempts SHALL trigger account lockout after a configurable number of failures (default: 5). | Must |

#### FR-SP-004: Lender Configuration

| ID | Requirement | Priority |
|---|---|---|
| FR-SP-004.1 | Within each tenant, the system SHALL support one or more lender configurations representing the actual funding entities. | Must |
| FR-SP-004.2 | Each lender configuration SHALL include: lender name, license number, funding capacity, interest rate bounds (min/max), revenue sharing rules, settlement account details, and risk appetite parameters. | Must |
| FR-SP-004.3 | Loan products SHALL be linked to a specific lender configuration. | Must |

---

## 2. Loan Product Management

### 2.1 Overview

Loan products are the configurable templates that define the terms, rules, and behavior of each lending offering. Products are created and managed by SP operators and serve as the blueprint for all loan contracts.

### 2.2 Functional Requirements

#### FR-LP-001: Product Lifecycle

| ID | Requirement | Priority |
|---|---|---|
| FR-LP-001.1 | Loan products SHALL have the following lifecycle states: Draft → Active → Suspended → Discontinued. | Must |
| FR-LP-001.2 | Only Active products SHALL be available for new subscriptions and loan origination. | Must |
| FR-LP-001.3 | Suspended products SHALL stop accepting new applications but continue managing existing contracts. | Must |
| FR-LP-001.4 | Discontinued products SHALL be read-only — existing contracts run to completion but no new activity is permitted. | Must |

#### FR-LP-002: Product Configuration

| ID | Requirement | Priority |
|---|---|---|
| FR-LP-002.1 | Every loan product SHALL define the following common parameters: product code (unique within tenant), product name and description, product type (overdraft, micro-loan, BNPL, invoice-financing), currency, minimum and maximum loan amount, tenor options (min/max days, or fixed options), interest rate model and rate(s), fee structure (origination, service, insurance, etc.), repayment method (lump-sum, installments, auto-deduction), grace period, penalty configuration, approval workflow (auto/semi-auto/manual), linked lender configuration, linked scoring model, eligibility rules (pre-qualification criteria), notification templates, and revenue sharing rules. | Must |
| FR-LP-002.2 | Product-type-specific parameters SHALL also be configurable (see 01-loan-portfolio.md for details per type). | Must |

#### FR-LP-003: Product Versioning

| ID | Requirement | Priority |
|---|---|---|
| FR-LP-003.1 | Every change to a product's configuration SHALL create a new version. | Must |
| FR-LP-003.2 | Active contracts SHALL remain bound to the product version under which they were created. | Must |
| FR-LP-003.3 | The system SHALL maintain a complete version history for each product, accessible via the O&M Portal and API. | Must |
| FR-LP-003.4 | SP operators SHALL be able to compare any two versions side-by-side. | Should |

#### FR-LP-004: Product Segmentation

| ID | Requirement | Priority |
|---|---|---|
| FR-LP-004.1 | Products SHALL support target customer segment definitions, restricting which customers can subscribe. | Should |
| FR-LP-004.2 | Segmentation criteria SHALL include: customer tier/level, geographic region, account age range, income bracket, and custom tags. | Should |

---

## 3. Customer Management

### 3.1 Overview

Customers in Lōns are the end-user borrowers. They do not interact with Lōns directly — they interact through the SP's customer-facing channels (wallet app, USSD, merchant POS). Lōns maintains customer records synchronized from EMI systems plus credit-related data generated by the platform.

### 3.2 Functional Requirements

#### FR-CM-001: Customer Record

| ID | Requirement | Priority |
|---|---|---|
| FR-CM-001.1 | The system SHALL maintain a customer record for each borrower, including: internal customer ID (Lōns-generated UUID), external customer ID (from the EMI/SP system), full name, date of birth, gender, national ID number (encrypted at rest), phone number(s), email (if available), KYC level and verification status, account creation date (in EMI system), geographic location (country, region, city), customer segment/tier, and consent records (what data access the customer has authorized). | Must |
| FR-CM-001.2 | Customer records SHALL be created automatically when a customer first interacts with a Lōns-powered product (subscription activation or pre-qualification check). | Must |
| FR-CM-001.3 | The system SHALL de-duplicate customers using configurable matching rules (phone number + national ID, or EMI external ID). | Must |

#### FR-CM-002: Customer Financial Profile

| ID | Requirement | Priority |
|---|---|---|
| FR-CM-002.1 | The system SHALL maintain a financial profile for each customer, aggregated from integrated data sources: wallet balance history, transaction summary (volume, frequency, average amount by category), income indicators (regular deposit patterns), expense patterns, existing loan/credit obligations (across all Lōns products), repayment history across all contracts, and credit scores (historical). | Must |
| FR-CM-002.2 | Financial profiles SHALL be updated in real-time as new data arrives from integrations. | Must |
| FR-CM-002.3 | Historical profile data SHALL be retained for a configurable period (default: 3 years) for scoring model training. | Must |

#### FR-CM-003: Customer Credit Summary

| ID | Requirement | Priority |
|---|---|---|
| FR-CM-003.1 | The system SHALL maintain a real-time credit summary per customer showing: current credit score (and model version used), total credit limit (across all products), total utilized credit, total available credit, number of active contracts, number of overdue contracts, worst delinquency status (current, 30 DPD, 60 DPD, etc.), and total outstanding balance. | Must |
| FR-CM-003.2 | The credit summary SHALL be accessible via the GraphQL API and the O&M Portal. | Must |

#### FR-CM-004: Customer Blacklist & Watchlist

| ID | Requirement | Priority |
|---|---|---|
| FR-CM-004.1 | The system SHALL maintain a blacklist of customers who are barred from all lending products (fraud, severe default, regulatory order). | Must |
| FR-CM-004.2 | The system SHALL maintain a watchlist of customers requiring enhanced monitoring or manual review for any new application. | Must |
| FR-CM-004.3 | Blacklist/watchlist entries SHALL include: reason code, date added, added by (operator or system), expiry date (if temporary), and supporting notes. | Must |
| FR-CM-004.4 | Pre-qualification SHALL automatically check blacklist/watchlist status. | Must |

#### FR-CM-005: Customer Consent Management

| ID | Requirement | Priority |
|---|---|---|
| FR-CM-005.1 | The system SHALL record customer consents for: data access from EMI systems, automated wallet deductions for repayment, credit bureau reporting, use of alternative data for scoring, and communication preferences. | Must |
| FR-CM-005.2 | Consents SHALL be versioned with timestamps — recording when consent was given and when it was revoked. | Must |
| FR-CM-005.3 | The system SHALL respect consent status in all processing — if a consent is revoked, the corresponding data access or action SHALL stop. | Must |
| FR-CM-005.4 | Consent records SHALL be queryable for regulatory audit purposes. | Must |

#### FR-CM-006: Data Privacy & Retention

| ID | Requirement | Priority |
|---|---|---|
| FR-CM-006.1 | Customer PII (personally identifiable information) SHALL be encrypted at rest using AES-256. | Must |
| FR-CM-006.2 | The system SHALL support data anonymization for customers who request account deletion, while preserving aggregate lending data for reporting. | Must |
| FR-CM-006.3 | Data retention periods SHALL be configurable per data type and per regulatory jurisdiction. | Must |
| FR-CM-006.4 | The system SHALL support data export (customer's right to portability) in a standard format (JSON/CSV). | Should |
