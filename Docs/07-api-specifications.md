# 07 — API Specifications

This document defines the requirements for Lōns' external and internal API interfaces.

---

## 1. API Architecture

### 1.1 Overview

Lōns exposes two external API interfaces and an internal event-driven interface:

| Interface | Protocol | Purpose | Audience |
|---|---|---|---|
| **GraphQL API** | GraphQL over HTTPS | Primary API for rich, flexible data access | SP applications, admin portal |
| **REST API** | RESTful HTTPS | Secondary API for simpler integrations and webhooks | External systems, basic integrations |
| **Event Bus** | RabbitMQ / Redis Streams | Internal async communication and external webhooks | Internal services, SP webhook receivers |

### 1.2 Design Principles

All APIs SHALL adhere to these principles:

| ID | Principle | Description |
|---|---|---|
| AP-001 | Tenant isolation | Every request is scoped to a tenant. No cross-tenant data leakage. |
| AP-002 | Idempotency | Mutating operations accept an idempotency key to prevent duplicate processing. |
| AP-003 | Pagination | All list endpoints support cursor-based pagination (GraphQL connections pattern). |
| AP-004 | Versioning | REST API uses URL versioning (e.g., /v1/). GraphQL uses schema evolution (no breaking removals). |
| AP-005 | Monetary precision | All monetary amounts are strings with explicit currency codes. Never floats. |
| AP-006 | Consistent errors | Standardized error response format across all endpoints. |
| AP-007 | Rate limiting | All endpoints are rate-limited per API key, with configurable limits per tenant. |

---

## 2. GraphQL API

### 2.1 Functional Requirements

#### FR-GQL-001: Schema Design

| ID | Requirement | Priority |
|---|---|---|
| FR-GQL-001.1 | The GraphQL schema SHALL expose the following root query types: `customers`, `customer(id)`, `products`, `product(id)`, `loanRequests`, `loanRequest(id)`, `contracts`, `contract(id)`, `repayments`, `settlements`, `reconciliationReports`, `portfolioMetrics`, and `auditLogs`. | Must |
| FR-GQL-001.2 | The schema SHALL expose mutations for: `createLoanRequest`, `acceptOffer`, `declineOffer`, `activateSubscription`, `deactivateSubscription`, `makeRepayment`, `createProduct`, `updateProduct`, `restructureLoan`, `addToBlacklist`, `removeFromBlacklist`, and `resolvReonciliationException`. | Must |
| FR-GQL-001.3 | The schema SHALL expose subscriptions (real-time) for: `loanRequestStateChanged`, `contractStateChanged`, `repaymentReceived`, `alertTriggered`, and `reconciliationExceptionCreated`. | Should |

#### FR-GQL-002: Query Capabilities

| ID | Requirement | Priority |
|---|---|---|
| FR-GQL-002.1 | All list queries SHALL support: cursor-based pagination (first/after, last/before), filtering by common fields (status, date range, product type, customer ID), sorting by configurable fields, and field selection (clients request only the fields they need). | Must |
| FR-GQL-002.2 | The schema SHALL support nested queries (e.g., customer → contracts → repayments) with configurable depth limits to prevent abuse. | Must |
| FR-GQL-002.3 | Query complexity analysis SHALL be enforced to reject overly expensive queries. | Must |

#### FR-GQL-003: Subscriptions (Real-Time)

| ID | Requirement | Priority |
|---|---|---|
| FR-GQL-003.1 | GraphQL subscriptions SHALL use WebSocket transport (graphql-ws protocol). | Should |
| FR-GQL-003.2 | Subscriptions SHALL be tenant-scoped — clients only receive events for their tenant. | Must |
| FR-GQL-003.3 | The system SHALL support subscription filtering (e.g., subscribe to state changes for a specific product only). | Should |

---

## 3. REST API

### 3.1 Functional Requirements

#### FR-REST-001: Endpoint Design

| ID | Requirement | Priority |
|---|---|---|
| FR-REST-001.1 | The REST API SHALL expose endpoints for critical operations that may be called by simple integrations: `POST /v1/loan-requests` — create a loan request, `POST /v1/loan-requests/{id}/accept` — accept offer, `POST /v1/repayments` — record a repayment, `GET /v1/customers/{id}/credit-summary` — get credit summary, `GET /v1/contracts/{id}` — get contract details, and `GET /v1/health` — health check. | Must |
| FR-REST-001.2 | REST responses SHALL follow a consistent envelope format: `{ "data": {...}, "meta": { "requestId": "...", "timestamp": "..." }, "errors": [...] }`. | Must |
| FR-REST-001.3 | Error responses SHALL use standard HTTP status codes with structured error bodies: `{ "code": "INSUFFICIENT_CREDIT_LIMIT", "message": "...", "details": {...} }`. | Must |

#### FR-REST-002: OpenAPI Specification

| ID | Requirement | Priority |
|---|---|---|
| FR-REST-002.1 | The REST API SHALL be fully documented with an OpenAPI 3.1 specification. | Must |
| FR-REST-002.2 | The specification SHALL be auto-generated from the codebase to ensure accuracy. | Should |
| FR-REST-002.3 | An interactive API explorer (Swagger UI or similar) SHALL be available for development and testing. | Should |

---

## 4. Webhooks (Outbound Events)

### 4.1 Functional Requirements

#### FR-WH-001: Webhook Configuration

| ID | Requirement | Priority |
|---|---|---|
| FR-WH-001.1 | SP operators SHALL configure webhook endpoints in the O&M Portal, specifying: target URL, events to subscribe to, authentication method (HMAC signature, bearer token, or basic auth), and active/inactive status. | Must |
| FR-WH-001.2 | Supported webhook events SHALL include: `loan_request.created`, `loan_request.approved`, `loan_request.rejected`, `contract.created`, `contract.state_changed`, `disbursement.completed`, `disbursement.failed`, `repayment.received`, `repayment.failed`, `contract.overdue`, `contract.defaulted`, `settlement.completed`, `alert.triggered`, and `customer.blacklisted`. | Must |

#### FR-WH-002: Webhook Delivery

| ID | Requirement | Priority |
|---|---|---|
| FR-WH-002.1 | Webhook payloads SHALL follow a consistent format: `{ "event": "contract.state_changed", "timestamp": "...", "tenantId": "...", "data": {...}, "webhookId": "..." }`. | Must |
| FR-WH-002.2 | Every webhook SHALL be signed with the tenant's webhook secret (HMAC-SHA256) for verification. | Must |
| FR-WH-002.3 | The system SHALL retry failed webhook deliveries with exponential backoff: retry at 1 min, 5 min, 30 min, 2 hours, 12 hours (configurable). | Must |
| FR-WH-002.4 | After all retries are exhausted, the failed delivery SHALL be logged and the SP alerted. | Must |
| FR-WH-002.5 | The O&M Portal SHALL show a webhook delivery log with: event, timestamp, HTTP status, response body, and retry count. | Must |

---

## 5. Authentication & Authorization

### 5.1 Functional Requirements

#### FR-AUTH-001: API Authentication

| ID | Requirement | Priority |
|---|---|---|
| FR-AUTH-001.1 | All API requests SHALL be authenticated using one of: (a) API Key + Secret (for server-to-server), (b) JWT Bearer Token (for user sessions — O&M Portal), or (c) OAuth 2.0 Client Credentials (for machine-to-machine). | Must |
| FR-AUTH-001.2 | API keys SHALL be scoped to a tenant and have configurable permissions (read-only, read-write, specific resource access). | Must |
| FR-AUTH-001.3 | JWT tokens SHALL include: tenant ID, user ID, role, permissions, issued-at, and expiry (configurable, default 1 hour). | Must |
| FR-AUTH-001.4 | The system SHALL support API key rotation without downtime (multiple active keys per tenant). | Must |

#### FR-AUTH-002: Authorization

| ID | Requirement | Priority |
|---|---|---|
| FR-AUTH-002.1 | Every API operation SHALL be checked against the caller's permissions (RBAC). | Must |
| FR-AUTH-002.2 | Field-level authorization SHALL be supported — sensitive fields (e.g., customer national ID) are only returned if the caller has the required permission. | Should |
| FR-AUTH-002.3 | The system SHALL log all authorization failures with: caller identity, requested resource, required permission, and timestamp. | Must |

---

## 6. API Rate Limiting & Throttling

### 6.1 Functional Requirements

| ID | Requirement | Priority |
|---|---|---|
| FR-RL-001 | The system SHALL enforce rate limits per API key with configurable limits per endpoint category: read operations (default: 1000 req/min), write operations (default: 200 req/min), and scoring/qualification (default: 100 req/min). | Must |
| FR-RL-002 | Rate limit responses SHALL use HTTP 429 with a `Retry-After` header. | Must |
| FR-RL-003 | Rate limits SHALL be configurable per tenant (premium tenants may have higher limits). | Should |
| FR-RL-004 | The system SHALL provide rate limit headers on every response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`. | Should |
