# 02 — Qualification & Scoring

This document defines the requirements for customer pre-qualification, credit scoring, and AI-driven decision-making within Lōns.

---

## 1. Data Integration Layer

### 1.1 Overview

The Data Integration Layer connects Lōns to external data sources — EMI core systems, telecom platforms, credit bureaus, and alternative data providers — to build a comprehensive financial profile for each customer. This layer is the foundation for all qualification and scoring decisions.

### 1.2 Functional Requirements

#### FR-DI-001: EMI System Integration

| ID | Requirement | Priority |
|---|---|---|
| FR-DI-001.1 | The system SHALL integrate with EMI primary systems to access customer data: KYC information, account details, transaction history, wallet balance, and account age. | Must |
| FR-DI-001.2 | Integration SHALL be configurable per tenant — each SP defines its EMI connection(s) with specific API credentials, endpoints, data mappings, and sync frequency. | Must |
| FR-DI-001.3 | The system SHALL support multiple EMI integrations per tenant (e.g., an SP working with both MTN MoMo and Airtel Money). | Should |
| FR-DI-001.4 | Data access SHALL use secure APIs (OAuth 2.0 / API key + HMAC) with encrypted transport (TLS 1.2+). | Must |

#### FR-DI-002: Credit Bureau Integration

| ID | Requirement | Priority |
|---|---|---|
| FR-DI-002.1 | The system SHALL support integration with national credit bureaus where available, to pull traditional credit reports and scores. | Should |
| FR-DI-002.2 | Credit bureau integrations SHALL be optional and configurable per tenant/country. | Must |
| FR-DI-002.3 | The system SHALL cache credit bureau responses for a configurable duration (e.g., 24 hours) to minimize API calls and costs. | Should |
| FR-DI-002.4 | When a credit bureau is unavailable or returns no data, the system SHALL fall back to internal scoring without blocking the qualification process. | Must |

#### FR-DI-003: Alternative Data Sources

| ID | Requirement | Priority |
|---|---|---|
| FR-DI-003.1 | The system SHALL support ingestion of alternative data for credit assessment: utility bill payment records, mobile money transaction patterns, e-commerce purchase history, telecom usage data (airtime, data bundle purchases), and social/behavioral indicators. | Must |
| FR-DI-003.2 | Each alternative data source SHALL be configurable as an integration adapter with: source identifier, API configuration, data mapping rules, and weight in the scoring model. | Must |
| FR-DI-003.3 | The system SHALL normalize data from disparate sources into a unified customer financial profile schema. | Must |

#### FR-DI-004: Real-Time Data Synchronization

| ID | Requirement | Priority |
|---|---|---|
| FR-DI-004.1 | The system SHALL support real-time data synchronization with EMI systems via webhooks or polling (configurable per integration). | Must |
| FR-DI-004.2 | For webhook-based sync, the system SHALL expose endpoints that EMIs can call when customer data changes (new transaction, balance change, KYC update). | Must |
| FR-DI-004.3 | For polling-based sync, the system SHALL pull updated data at configurable intervals (minimum every 15 minutes). | Should |
| FR-DI-004.4 | All incoming data SHALL be validated, sanitized, and stored with source attribution and timestamp. | Must |

---

## 2. Pre-Qualification

### 2.1 Overview

Pre-qualification is the initial automated screening that determines whether a customer is eligible to access loan products. It runs before formal credit scoring and serves as a fast gate to filter out clearly ineligible applicants.

### 2.2 Functional Requirements

#### FR-PQ-001: Pre-Qualification Rules Engine

| ID | Requirement | Priority |
|---|---|---|
| FR-PQ-001.1 | The system SHALL provide a configurable rules engine where SP operators define pre-qualification criteria per product. | Must |
| FR-PQ-001.2 | Supported rule types SHALL include: minimum account age, minimum KYC level (e.g., Tier 1, Tier 2, Tier 3), minimum transaction count within a period, minimum average monthly balance, geographic restrictions (country, region), age restrictions (minimum/maximum), blacklist/watchlist check, existing loan status check (no active defaults). | Must |
| FR-PQ-001.3 | Rules SHALL be combinable with AND/OR logic and ordered by priority. | Must |
| FR-PQ-001.4 | Pre-qualification SHALL execute in under 2 seconds for a single customer. | Must |
| FR-PQ-001.5 | The system SHALL return a clear pass/fail result with specific reason codes for each failed rule. | Must |
| FR-PQ-001.6 | Pre-qualification results SHALL be cached for a configurable period (e.g., 1 hour) to avoid redundant checks within a short window. | Should |

#### FR-PQ-002: Automated Eligibility Assessment

| ID | Requirement | Priority |
|---|---|---|
| FR-PQ-002.1 | For micro-loans and overdrafts, the system SHALL support fully automated eligibility assessment where qualifying customers are instantly approved without manual intervention. | Must |
| FR-PQ-002.2 | The automation level SHALL be configurable per product: (a) fully automated — approve/reject without human review, (b) semi-automated — auto-approve within thresholds, flag edge cases for manual review, (c) manual — all applications require human review. | Must |
| FR-PQ-002.3 | SP operators SHALL be able to define and adjust automation thresholds (e.g., auto-approve if score > 700, auto-reject if score < 400, manual review for 400–700). | Must |

---

## 3. Credit Scoring

### 3.1 Overview

Lōns supports two complementary scoring models: a Rule-Based Expert Model for early-stage deployments and deterministic control, and a Data-Based Trained Model that leverages machine learning as customer data accumulates. Both models can run in parallel.

### 3.2 Functional Requirements

#### FR-CS-001: Rule-Based Expert Model

| ID | Requirement | Priority |
|---|---|---|
| FR-CS-001.1 | The system SHALL provide a configurable scorecard where SP operators define scoring factors and their weights. | Must |
| FR-CS-001.2 | Supported scoring factors SHALL include: payment history (on-time percentage), account age, average balance over 30/60/90 days, transaction frequency and volume, income consistency (deposit regularity), existing debt-to-income ratio, credit bureau score (if available), KYC completeness level, and custom factors defined by the SP. | Must |
| FR-CS-001.3 | Each factor SHALL have configurable: weight (percentage contribution to total score), scoring bands (e.g., on-time payment > 90% = 100 points, 80–90% = 75 points, < 80% = 25 points), and min/max point values. | Must |
| FR-CS-001.4 | The total credit score SHALL be normalized to a configurable range (default 0–1000). | Must |
| FR-CS-001.5 | Scorecards SHALL be versioned — each scoring event records which scorecard version was used. | Must |
| FR-CS-001.6 | SP operators SHALL be able to A/B test multiple scorecard versions simultaneously. | Should |

#### FR-CS-002: Data-Based Trained Model (AI/ML)

| ID | Requirement | Priority |
|---|---|---|
| FR-CS-002.1 | The system SHALL support deployment of machine learning scoring models trained on historical loan performance data. | Must |
| FR-CS-002.2 | ML models SHALL accept as features: all rule-based factors plus temporal patterns (spending trends, income seasonality), behavioral clusters (transaction type distribution), network features (transaction counterparty analysis), and device/channel usage patterns. | Must |
| FR-CS-002.3 | The system SHALL support model versioning — multiple model versions can coexist, with configurable traffic routing (e.g., 80% production model, 20% challenger model). | Must |
| FR-CS-002.4 | Model predictions SHALL include: credit score, probability of default (PD), recommended credit limit, confidence interval, and top contributing factors (explainability). | Must |
| FR-CS-002.5 | The system SHALL log all model inputs, outputs, and versions for auditability and model monitoring. | Must |
| FR-CS-002.6 | Model performance SHALL be monitored with automated drift detection (comparing predicted vs. actual default rates). | Should |

#### FR-CS-003: Scoring Execution

| ID | Requirement | Priority |
|---|---|---|
| FR-CS-003.1 | Scoring SHALL be triggered by: (a) loan application, (b) subscription activation, (c) scheduled periodic review, (d) significant financial event (large deposit, missed payment), or (e) manual request by SP operator. | Must |
| FR-CS-003.2 | The system SHALL support running both rule-based and ML models for the same customer and selecting the final score based on a configurable strategy: (a) rule-based only, (b) ML only, (c) higher of the two, (d) lower of the two, (e) weighted average. | Must |
| FR-CS-003.3 | Scoring execution SHALL complete within 5 seconds for a single customer including data retrieval. | Must |
| FR-CS-003.4 | The system SHALL store the complete scoring history per customer: score, model version, all input features, contributing factors, and timestamp. | Must |

#### FR-CS-004: Credit Limit Derivation

| ID | Requirement | Priority |
|---|---|---|
| FR-CS-004.1 | The system SHALL derive a recommended credit limit from the credit score using configurable limit bands per product (e.g., score 800–1000 → limit $500, score 600–799 → limit $200). | Must |
| FR-CS-004.2 | The derived limit SHALL be bounded by the product's configured min/max limits. | Must |
| FR-CS-004.3 | The system SHALL apply a total exposure cap — the sum of all credit limits across all products for a single customer SHALL NOT exceed a configurable maximum. | Must |
| FR-CS-004.4 | Credit limit derivation rules SHALL be configurable per product and per customer segment. | Should |

---

## 4. Real-Time Monitoring (Post-Approval)

### 4.1 Overview

Lōns continuously monitors borrower financial behavior after loan approval to detect risk changes early. This enables proactive loan management — adjusting terms, triggering alerts, or initiating recovery before a loan becomes delinquent.

### 4.2 Functional Requirements

#### FR-RM-001: Continuous Monitoring

| ID | Requirement | Priority |
|---|---|---|
| FR-RM-001.1 | The system SHALL maintain a live connection (webhook or polling) with EMI systems to track changes in borrower financial status: wallet balance, income deposits, spending patterns, and new financial obligations. | Must |
| FR-RM-001.2 | The system SHALL compute a real-time risk indicator for each active borrower based on incoming data. | Must |
| FR-RM-001.3 | Risk indicators SHALL be categorized: Low, Medium, High, Critical. | Must |

#### FR-RM-002: Alerts & Triggers

| ID | Requirement | Priority |
|---|---|---|
| FR-RM-002.1 | The system SHALL generate configurable alerts when: wallet balance drops below a threshold relative to upcoming payment, income deposits stop or decrease significantly, spending patterns change dramatically, the customer takes on new debt from other sources (if visible), or the customer's credit score drops below a threshold. | Must |
| FR-RM-002.2 | Alerts SHALL be delivered to: SP operators (via O&M Portal and email), the analytics engine (for aggregate risk reporting), and optionally the recovery engine (for proactive intervention). | Must |
| FR-RM-002.3 | Alert rules SHALL be configurable per product and per risk tier. | Should |

#### FR-RM-003: Adaptive Loan Management

| ID | Requirement | Priority |
|---|---|---|
| FR-RM-003.1 | Based on monitoring signals, the system SHALL support automated actions: credit limit freeze (prevent new borrowing), repayment schedule adjustment suggestion, early warning flag for SP review, and automatic escalation to recovery if risk reaches Critical. | Should |
| FR-RM-003.2 | Automated actions SHALL be configurable and require SP opt-in per action type. | Must |
