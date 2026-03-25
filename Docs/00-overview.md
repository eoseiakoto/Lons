# Lōns Platform — Overview & Architecture

## 1. Product Vision

Lōns is a B2B2C fintech platform that enables financial institutions to offer and manage loan products through digital wallets and telecom systems. Lōns is not a lender — it is the technology backbone that powers lending for Electronic Money Issuers (EMIs), micro-credit institutions, banks, and licensed lenders.

The platform targets underbanked demographics — blue-collar workers, lower-income earners, smallholder farmers, and small business owners — particularly in African markets where traditional credit bureaus are sparse or non-existent. By leveraging AI-driven credit scoring with non-traditional data sources (mobile money transactions, utility payments, behavioral signals), Lōns opens financial access where it was previously unavailable.

### Core Value Proposition

- **For Lending Institutions**: A turnkey loan management system with AI-driven scoring, automated disbursement, and intelligent recovery — reducing operational cost and expanding reach.
- **For EMIs & Digital Wallets**: Revenue generation through integrated lending products (overdrafts, micro-loans, BNPL) offered directly within their ecosystem.
- **For End Users**: Instant access to credit through their existing mobile money wallets, with fair scoring that considers real financial behavior rather than traditional credit history.

---

## 2. Platform Scope

Lōns covers the complete loan lifecycle across four product types:

| Product Type | Description |
|---|---|
| **Overdraft** | Short-term credit triggered when wallet balance is insufficient for a transaction |
| **Micro-Loan** | Small-amount loans disbursed directly to the borrower's wallet |
| **Buy-Now-Pay-Later (BNPL)** | Installment-based purchase financing at point of sale |
| **Invoice Discounting / Factoring** | B2B lending against outstanding invoices (including reverse-factoring) |

Each product type follows a shared lifecycle: Product Configuration → Subscription → Pre-Qualification → Scoring → Approval → Disbursement → Repayment → Recovery → Settlement → Reporting.

---

## 3. Glossary

| Term | Definition |
|---|---|
| **SP (Service Provider)** | The lending institution or organization using Lōns to offer loan products |
| **EMI (Electronic Money Issuer)** | A licensed entity that issues electronic money (e.g., MTN Mobile Money, M-Pesa) |
| **O&M Portal** | Operations & Maintenance Portal — the admin interface used by SP operators |
| **LMS** | Loan Management System — the core Lōns backend |
| **Pre-Qualification** | Initial automated assessment of a customer's eligibility before formal application |
| **Qualification** | Full credit assessment and scoring to determine loan terms |
| **Credit Limit** | Maximum amount a customer can borrow, dynamically adjusted based on behavior |
| **Disbursement** | The act of transferring approved loan funds to the borrower's wallet/account |
| **Contract** | A binding loan agreement created when a customer accepts an approved offer |
| **Revenue Settlement** | Distribution of fees/interest between SPs, lenders, and platform |
| **Reconciliation** | Daily verification that all loan account balances match expected values |
| **NPL (Non-Performing Loan)** | A loan where repayments are significantly overdue per regulatory definitions |
| **Delinquent Account** | An account with missed payments that hasn't yet reached NPL classification |
| **BNPL** | Buy-Now-Pay-Later — a point-of-sale installment financing product |
| **Factoring** | Selling invoices at a discount to obtain immediate cash |
| **Reverse-Factoring** | Buyer-initiated invoice financing where the buyer's creditworthiness secures funding |
| **KYC** | Know Your Customer — identity verification and due diligence |
| **AML** | Anti-Money Laundering — regulatory compliance for detecting financial crime |
| **Tenant** | A Service Provider organization within the multi-tenant platform |
| **Webhook** | An HTTP callback triggered by a system event, used for real-time integrations |
| **GraphQL** | Primary API query language used by Lōns for flexible data access |
| **REST** | Secondary API interface with limited capabilities for simpler integrations |

---

## 4. High-Level System Architecture

### 4.1 Architecture Style

Lōns follows a **microservice architecture** delivered as a **multi-tenant SaaS platform**. Each functional domain operates as an independent service with its own data boundaries, communicating through well-defined APIs and an event bus.

### 4.2 Architecture Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                      INTERFACE LAYER                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   GraphQL    │  │  REST API    │  │     Webhooks         │  │
│  │  (Primary)   │  │ (Secondary)  │  │  (Event Callbacks)   │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                       API GATEWAY                               │
│  Authentication · Rate Limiting · Tenant Resolution · Routing   │
├─────────────────────────────────────────────────────────────────┤
│                      ENTITY LAYER                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Service    │  │    Loan      │  │     Customer         │  │
│  │  Providers   │  │  Products    │  │     Management       │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                      PROCESS LAYER                              │
│  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌────────┐ ┌──────────┐ │
│  │ Loan    │ │ Credit   │ │Approval │ │  Loan  │ │   Loan   │ │
│  │Requests │ │  Check   │ │ Engine  │ │Contract│ │ Disburse │ │
│  └─────────┘ └──────────┘ └─────────┘ └────────┘ └──────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                    POST-PROCESS LAYER                           │
│  ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌────────┐ ┌─────────┐ │
│  │Statement │ │ Revenue │ │Repayment │ │Reconcil│ │ Default │ │
│  │  Engine  │ │Settlement│ │ Tracking │ │-iation │ │ Mgmt    │ │
│  └──────────┘ └─────────┘ └──────────┘ └────────┘ └─────────┘ │
├─────────────────────────────────────────────────────────────────┤
│                     SUPPORTING LAYER                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │  Audit Log   │  │Notifications │  │     Analytics        │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                   INTEGRATION LAYER                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │Digital Wallet│  │   Telecom    │  │   Credit Bureau      │  │
│  │  Adapters    │  │  Adapters    │  │    Adapters          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│                    DATA & AI LAYER                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ PostgreSQL   │  │    Redis     │  │    AI/ML Engine       │  │
│  │  (Primary)   │  │   (Cache)    │  │  (Scoring/Recovery)  │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Backend Framework** | NestJS (TypeScript) | Microservice-native, first-class GraphQL, strong typing for financial math |
| **Primary Database** | PostgreSQL 16+ | ACID compliance, decimal precision, row-level security for multi-tenancy |
| **ORM** | Prisma | Type-safe queries, schema migrations, introspection |
| **Cache** | Redis | Session management, rate limiting, real-time scoring cache |
| **Message Queue** | RabbitMQ / Bull | Async job processing (disbursements, notifications, reconciliation) |
| **API** | GraphQL (Apollo) + REST (OpenAPI) | GraphQL for rich queries, REST for simple webhook/integration endpoints |
| **Admin Portal** | Next.js (React) | Server-side rendering, API routes, TypeScript consistency |
| **AI/ML** | Python (FastAPI microservice) | Credit scoring models, recovery prediction, data harvesting |
| **Authentication** | JWT + OAuth 2.0 | Tenant-scoped tokens, SP operator auth, API key management |
| **File Storage** | S3-compatible (MinIO) | Loan documents, KYC uploads, reports |
| **Monitoring** | Prometheus + Grafana | Real-time metrics, alerting, SLA tracking |
| **Event Bus** | Redis Streams / RabbitMQ | Inter-service communication, event sourcing for audit trail |

### 4.4 Multi-Tenancy Model

Lōns uses a **shared database, separate schemas** approach:

- Each Service Provider (tenant) gets an isolated PostgreSQL schema
- A shared `platform` schema holds cross-tenant data (platform config, billing)
- Row-Level Security (RLS) policies enforce data isolation at the database level
- Tenant context is resolved from the JWT token at the API Gateway and propagated to every service

### 4.5 Service Communication

- **Synchronous**: GraphQL federation for client-facing queries; gRPC for internal service-to-service calls
- **Asynchronous**: Event bus for state transitions (loan approved, payment received, default triggered); job queues for scheduled tasks (reconciliation, batch reporting, reminder notifications)

---

## 5. User Roles

| Role | Description | Access Level |
|---|---|---|
| **Platform Admin** | Lōns platform operator | Full system access, tenant management, platform configuration |
| **SP Admin** | Service Provider administrator | Tenant-level configuration, user management, product setup |
| **SP Operator** | Day-to-day SP staff | Loan management, customer support, reporting |
| **SP Analyst** | Reporting and analytics user | Read-only access to dashboards and reports |
| **API Consumer** | External system integrating via API | Scoped API access per integration agreement |
| **End User (Borrower)** | Loan customer | Indirect access through SP's wallet/app — no direct portal login |

---

## 6. Module Dependency Map

```
09-integrations ──────┐
                      ▼
04-entity-management ──► 02-qualification-scoring
        │                        │
        ▼                        ▼
01-loan-portfolio ──► 05-process-engine ──► 03-repayments-recovery
                              │                      │
                              ▼                      ▼
                      06-post-process ◄──────────────┘
                              │
                      ┌───────┴───────┐
                      ▼               ▼
              07-api-specs    08-admin-portal
                      │               │
                      ▼               ▼
              10-security    11-data-models
                      │
                      ▼
              12-non-functional ──► 13-deployment
```

---

## 7. Document Index

| Document | Description | Status |
|---|---|---|
| `00-overview.md` | This document — vision, glossary, architecture | ✅ Complete |
| `01-loan-portfolio.md` | Loan product types: Overdraft, Micro-Loan, BNPL, Factoring | ✅ Complete |
| `02-qualification-scoring.md` | Pre-qualification, AI scoring, credit bureau integration | ✅ Complete |
| `03-repayments-recovery.md` | Repayment engine, AI-driven recovery, collections | ✅ Complete |
| `04-entity-management.md` | Service providers, loan products, customer management | ✅ Complete |
| `05-process-engine.md` | Loan lifecycle: request → approval → contract → disburse | ✅ Complete |
| `06-post-process.md` | Statements, revenue settlement, reconciliation, defaults | ✅ Complete |
| `07-api-specifications.md` | GraphQL schema, REST endpoints, webhooks | ✅ Complete |
| `08-admin-portal.md` | O&M Portal screens, workflows, dashboards | ✅ Complete |
| `09-integrations.md` | Digital wallets, telecom systems, credit bureaus | ✅ Complete |
| `10-security-compliance.md` | Authentication, encryption, audit, regulatory | ✅ Complete |
| `11-data-models.md` | Database schema, entity relationships, migrations | ✅ Complete |
| `12-non-functional.md` | Performance, scalability, availability, SLAs | ✅ Complete |
| `13-deployment.md` | Infrastructure, CI/CD, environments, monitoring | ✅ Complete |
