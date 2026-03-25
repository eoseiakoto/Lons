# 09 — Integrations

This document defines the requirements for external system integrations: digital wallets, telecom operators, credit bureaus, and other third-party services.

---

## 1. Integration Architecture

### 1.1 Overview

Lōns operates as a backend platform that does not interact with end users directly. All customer-facing interactions flow through integrated partner systems. The integration layer uses an adapter pattern — each external system has a dedicated adapter that translates between Lōns' internal data model and the partner's API.

### 1.2 Design Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-IA-001 | All integrations SHALL use an adapter pattern — core business logic is decoupled from external API specifics. | Must |
| FR-IA-002 | Each adapter SHALL be independently deployable, configurable, and testable. | Must |
| FR-IA-003 | The system SHALL support running multiple adapters simultaneously (e.g., MTN MoMo + Airtel Money for a single tenant). | Must |
| FR-IA-004 | Adapters SHALL implement a standard interface (contract) so that new integrations can be added without modifying core services. | Must |
| FR-IA-005 | All external API calls SHALL implement: timeout handling (configurable, default 30 seconds), retry with exponential backoff, circuit breaker pattern (open after N consecutive failures), and fallback behavior (queue for later processing or graceful degradation). | Must |

---

## 2. Digital Wallet Integrations

### 2.1 Overview

Digital wallets are the primary disbursement and repayment channel. Lōns must integrate with mobile money platforms (MTN MoMo, M-Pesa, Airtel Money, etc.) and digital wallet providers.

### 2.2 Functional Requirements

#### FR-DW-001: Wallet Adapter Interface

| ID | Requirement | Priority |
|---|---|---|
| FR-DW-001.1 | The wallet adapter interface SHALL support the following operations: `getCustomerInfo(walletId)` — retrieve customer details and KYC status, `getBalance(walletId)` — query wallet balance, `getTransactionHistory(walletId, dateRange)` — pull transaction history, `disburse(walletId, amount, reference)` — transfer funds to customer wallet, `collect(walletId, amount, reference)` — deduct funds from customer wallet, `getTransactionStatus(transactionRef)` — check transaction status, and `registerWebhook(events, url)` — register for real-time event notifications. | Must |
| FR-DW-001.2 | Each operation SHALL return a standardized response object regardless of the underlying wallet provider. | Must |

#### FR-DW-002: MTN Mobile Money Adapter

| ID | Requirement | Priority |
|---|---|---|
| FR-DW-002.1 | The system SHALL include an adapter for MTN Mobile Money API (MoMo Open API) supporting: collections (debit customer wallet), disbursements (credit customer wallet), account balance inquiry, transaction status check, and KYC data retrieval. | Must |
| FR-DW-002.2 | The adapter SHALL handle MTN's OAuth 2.0 authentication flow (API key + user provisioning + token refresh). | Must |
| FR-DW-002.3 | The adapter SHALL support MTN's sandbox environment for testing. | Must |

#### FR-DW-003: M-Pesa Adapter

| ID | Requirement | Priority |
|---|---|---|
| FR-DW-003.1 | The system SHALL include an adapter for Safaricom M-Pesa (Daraja API) supporting: B2C payments (disbursement), C2B payments (repayment), transaction status query, and account balance. | Should |
| FR-DW-003.2 | The adapter SHALL handle M-Pesa's authentication and callback mechanisms. | Should |

#### FR-DW-004: Generic Wallet Adapter

| ID | Requirement | Priority |
|---|---|---|
| FR-DW-004.1 | The system SHALL provide a configurable generic wallet adapter that can be configured for any wallet provider by mapping: API endpoints, authentication method, request/response field mappings, and callback/webhook format. | Should |
| FR-DW-004.2 | The generic adapter SHALL be configurable via the O&M Portal without code changes. | Should |

---

## 3. Telecom Integrations

### 3.1 Functional Requirements

#### FR-TL-001: Telecom Data Access

| ID | Requirement | Priority |
|---|---|---|
| FR-TL-001.1 | The system SHALL support integration with telecom operators to access alternative data for credit scoring: airtime purchase history, data bundle usage, call/SMS frequency patterns, mobile money transaction metadata, and device information (where consented). | Should |
| FR-TL-001.2 | Telecom data access SHALL require explicit customer consent, verified and recorded per FR-CM-005. | Must |

#### FR-TL-002: USSD Integration

| ID | Requirement | Priority |
|---|---|---|
| FR-TL-002.1 | The system SHALL support USSD as a customer interaction channel for: subscription activation/deactivation, loan request, balance/limit inquiry, and repayment initiation. | Should |
| FR-TL-002.2 | USSD session management SHALL be handled by the SP's USSD gateway — Lōns provides API endpoints that the gateway calls at each menu step. | Should |

---

## 4. Credit Bureau Integrations

### 4.1 Functional Requirements

#### FR-CB-001: Credit Bureau Query

| ID | Requirement | Priority |
|---|---|---|
| FR-CB-001.1 | The system SHALL support integration with national credit bureaus to: query a customer's credit report and score, submit positive credit data (on-time payments, successful loan closures), and submit negative credit data (defaults, write-offs). | Should |
| FR-CB-001.2 | Each credit bureau integration SHALL be configurable per country/tenant with: bureau API endpoint, authentication credentials, data format mappings, query cost tracking, and consent verification. | Should |

#### FR-CB-002: Credit Bureau Reporting

| ID | Requirement | Priority |
|---|---|---|
| FR-CB-002.1 | The system SHALL support batch reporting to credit bureaus on a configurable schedule (daily, weekly, monthly). | Should |
| FR-CB-002.2 | Reports SHALL include: new loans originated, repayment performance updates, defaults and delinquencies, loan closures, and write-offs. | Should |
| FR-CB-002.3 | Reporting SHALL comply with the bureau's data format and submission requirements. | Should |

---

## 5. Payment Gateway Integration

### 5.1 Functional Requirements

#### FR-PG-001: Payment Processing

| ID | Requirement | Priority |
|---|---|---|
| FR-PG-001.1 | The system SHALL support integration with payment gateways for: bank transfer disbursements (where wallet is not the only channel), card-based repayments (for BNPL with card-holding customers), and settlement fund transfers between parties. | Should |
| FR-PG-001.2 | Payment gateway adapters SHALL follow the same adapter pattern as wallet integrations. | Must |

---

## 6. Notification Service Integration

### 6.1 Functional Requirements

#### FR-NS-001: Notification Channels

| ID | Requirement | Priority |
|---|---|---|
| FR-NS-001.1 | The system SHALL support sending notifications through: SMS (via telecom SMS gateway or aggregator like Twilio, Africa's Talking), push notifications (via SP's mobile app integration — FCM/APNs), email (via SMTP or transactional email service), and in-app messages (via API — delivered by SP's app). | Must |
| FR-NS-001.2 | Notification routing SHALL be configurable per event type and per customer preference. | Must |
| FR-NS-001.3 | The system SHALL track notification delivery status: sent, delivered, failed, and bounced. | Must |
| FR-NS-001.4 | Failed notifications SHALL be retried per configurable rules. | Must |

#### FR-NS-002: Template Management

| ID | Requirement | Priority |
|---|---|---|
| FR-NS-002.1 | Notification templates SHALL support dynamic variables: `{{customer_name}}`, `{{amount}}`, `{{due_date}}`, `{{balance}}`, `{{product_name}}`, `{{contract_number}}`, etc. | Must |
| FR-NS-002.2 | Templates SHALL be manageable per product and per event type via the O&M Portal. | Must |
| FR-NS-002.3 | Templates SHALL support multi-language variants. | Should |

---

## 7. Integration Monitoring

### 7.1 Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-IM-001 | The system SHALL monitor the health of all active integrations: uptime/availability, average response time, error rate, and circuit breaker status. | Must |
| FR-IM-002 | Integration health SHALL be visible on the O&M Portal dashboard. | Must |
| FR-IM-003 | The system SHALL alert SP operators when an integration's error rate exceeds a configurable threshold. | Must |
| FR-IM-004 | All external API calls SHALL be logged with: timestamp, endpoint, request summary, response status, response time, and correlation ID. | Must |
