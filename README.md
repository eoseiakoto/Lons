# Lons Platform

A B2B2C fintech platform enabling financial institutions to offer and manage loan products (Overdraft, Micro-Loan, BNPL, Invoice Factoring) through digital wallets and telecom systems. Built for underbanked demographics in African markets.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | 20+ |
| Backend | NestJS (TypeScript) | 10.3.0 |
| Database | PostgreSQL | 16 |
| ORM | Prisma | 5.14.0 |
| Cache / Queue | Redis + BullMQ | 7 |
| GraphQL | Apollo Server | 4.10.0 |
| Admin Portal | Next.js (React) | 14.2.0 |
| ML Scoring | Python FastAPI | 0.109.0 |
| Auth | JWT (RS256) | — |
| Monorepo | Turborepo + pnpm | 2.3.0 / 9.15.0 |
| Testing | Jest / Pytest | 29.7.0 / 8.0.0 |
| Linting | ESLint + Prettier | — |

---

## Repository Structure

```
lons/
├── apps/
│   ├── admin-portal/           # Next.js SP Admin Portal — glassmorphism UI (port 3100)
│   ├── platform-portal/        # Next.js Platform Admin Portal (port 3200)
│   ├── graphql-server/         # NestJS GraphQL API (port 3000)
│   ├── rest-server/            # NestJS REST API + Swagger (port 3001)
│   └── scheduler/              # Cron jobs: interest accrual, aging, reconciliation (port 3003)
├── services/
│   ├── entity-service/         # Tenants, users, roles, customers, products, lenders
│   ├── process-engine/         # Loan request → scoring → approval → disbursement
│   ├── repayment-service/      # Schedule generation, payment processing, waterfall allocation
│   ├── settlement-service/     # Revenue calculation, settlement runs
│   ├── reconciliation-service/ # Daily reconciliation batch
│   ├── notification-service/   # SMS, email, push notification adapters
│   ├── integration-service/    # Wallet adapters (MTN MoMo, M-Pesa), credit bureau
│   ├── recovery-service/       # AI-driven recovery strategy recommendations
│   └── scoring-service/        # Python FastAPI ML credit scoring (port 8000)
├── packages/
│   ├── common/                 # Decimal math, pagination, encryption, errors
│   ├── database/               # Prisma schema, migrations, seed data
│   ├── shared-types/           # TypeScript interfaces and enums
│   ├── event-contracts/        # Event bus message schemas
│   └── eslint-config/          # Shared ESLint configuration
├── infrastructure/
│   └── docker/                 # Docker Compose, init SQL
├── scripts/
│   ├── setup-test-env.sh       # One-time environment setup
│   ├── test-platform.sh        # Comprehensive E2E test suite
│   └── load-test.js            # k6 load test script
├── .github/workflows/          # CI/CD pipelines
├── Docs/                       # Requirements documents (00–13)
├── CREDENTIALS.md              # All access credentials and URLs
└── CLAUDE.md                   # AI assistant instructions
```

---

## Quick Start

### Prerequisites

- **Node.js** 20+ (see `.nvmrc`)
- **pnpm** 9+ (`npm install -g pnpm@9`)
- **Docker** and Docker Compose
- **Python** 3.11+ (optional, for ML scoring service)

### 1. Clone and Install

```bash
git clone <repo-url> && cd lons
pnpm install
```

### 2. Start Infrastructure

```bash
docker compose up -d
```

This starts:
- **PostgreSQL 16** on `localhost:5432` (user: `lons`, password: `lons_dev_password`, db: `lons`)
- **Redis 7** on `localhost:6379`

### 3. Configure Environment

```bash
cp .env.example .env
```

The defaults work for local development. See [Environment Variables](#environment-variables) for details.

### 4. Database Setup

```bash
# Run migrations
pnpm db:migrate:dev -- --name init

# Seed test data
pnpm db:seed
```

### 5. Build and Run

```bash
# Build all packages
pnpm build

# Start all services in development mode (hot reload)
pnpm dev
```

### 6. Start Python Scoring Service (Optional)

```bash
cd services/scoring-service
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --port 8000
```

### 7. Verify

| Service | URL | Expected |
|---|---|---|
| SP Admin Portal | http://localhost:3100 | Glass login (org: `quickcash-gh`) |
| Platform Admin Portal | http://localhost:3200 | Glass login (email only) |
| GraphQL Playground | http://localhost:3000/graphql | Apollo Sandbox |
| REST API / Swagger | http://localhost:3001/api/docs | OpenAPI UI |
| REST Health | http://localhost:3001/v1/health | `{"status":"ok"}` |
| Scoring Health | http://localhost:8000/health | `{"status":"ok"}` |
| Prisma Studio | `pnpm db:studio` | Database GUI |

See [CREDENTIALS.md](CREDENTIALS.md) for all login credentials.

---

## Test Credentials

See [CREDENTIALS.md](CREDENTIALS.md) for the complete list of all credentials, URLs, and ports.

### Quick Access

| Portal | URL | Org / Email | Password |
|---|---|---|---|
| Platform Admin | http://localhost:3200 | `admin@lons.io` | `AdminPass123!@#` |
| SP Admin (Ghana) | http://localhost:3100 | `quickcash-gh` / `spadmin@quickcash.gh` | `SpAdmin123!@#` |
| SP Admin (Kenya) | http://localhost:3100 | `pesa-express-ke` / `spadmin@pesaexpress.ke` | `SpAdmin123!@#` |
| SP Admin (Nigeria) | http://localhost:3100 | `nairalend-ng` / `spadmin@nairalend.ng` | `SpAdmin123!@#` |

---

## Seed Data

After running `pnpm db:seed`, 3 multi-country tenants are created with realistic data:

### Tenants

| Name | Slug | Country | Currency | Plan | Lender |
|---|---|---|---|---|---|
| QuickCash Ghana | `quickcash-gh` | GHA | GHS | Professional | GoldStar Capital |
| Pesa Express Kenya | `pesa-express-ke` | KEN | KES | Enterprise | Savanna Finance |
| NairaLend Nigeria | `nairalend-ng` | NGA | NGN | Starter | Atlas Microfinance |

### Per Tenant

- **5 users** (SP Admin, Operator, Analyst, Auditor, Collections)
- **4 products** (Overdraft, Micro-Loan, BNPL, Invoice Factoring) — mix of active/draft/suspended
- **20 customers** with country-specific names, phone numbers, KYC levels
- **10 subscriptions** linking customers to products
- **15 loan requests** across all statuses (received → disbursed, rejected, declined)
- **8 contracts** (3 active, 2 overdue, 1 delinquent, 1 default, 1 settled)
- **Repayment schedules and payment history**

### Total Seed Data
- 3 tenants, 15 users, 3 lenders, 12 products, 60 customers
- 30 subscriptions, 45 loan requests, 24 contracts
- 100+ repayment schedule entries, 48+ repayments

---

## Authentication

### Login Flow

**Platform Admin** (manages all tenants):
```graphql
mutation {
  loginPlatformUser(email: "admin@lons.io", password: "AdminPass123!@#") {
    accessToken
    refreshToken
    user { id email }
  }
}
```

**Tenant User** (by organization slug — recommended):
```graphql
mutation {
  loginBySlug(
    slug: "demo-sp"
    email: "spadmin@demo.lons.io"
    password: "SpAdmin123!@#"
  ) {
    accessToken
    refreshToken
  }
}
```

**Tenant User** (by tenant ID — legacy):
```graphql
mutation {
  loginTenantUser(
    tenantId: "<tenant_id>"
    email: "spadmin@demo.lons.io"
    password: "SpAdmin123!@#"
  ) {
    accessToken
    refreshToken
  }
}
```

**Token Refresh**:
```graphql
mutation {
  refreshToken(refreshToken: "<refresh_token>") {
    accessToken
    refreshToken
  }
}
```

### JWT Tokens

- Algorithm: RS256
- Access token expiry: 3600 seconds (1 hour)
- Refresh token expiry: 604800 seconds (7 days)
- Payload: `{ sub, tenantId, role, permissions, type, iat, exp }`

Use the access token in the `Authorization` header:
```
Authorization: Bearer <access_token>
```

---

## GraphQL API

**Endpoint**: `http://localhost:3000/graphql`

### Key Queries

```graphql
# List entities (cursor-based pagination)
tenants(pagination: { first: 20, after: "<cursor>" }) { edges { node { ... } } pageInfo { ... } totalCount }
products(pagination: { first: 20 }, type: "overdraft", status: "active") { ... }
customers(pagination: { first: 20 }, status: "active") { ... }
lenders(pagination: { first: 5 }) { ... }

# Single entity
tenant(id: "<id>") { id name schemaName status planTier currency country }
product(id: "<id>") { id code name type minAmount maxAmount interestRate }
customer(id: "<id>") { id fullName phone email status kycLevel }
loanRequest(id: "<id>") { id status requestedAmount scoringResult { score riskTier } }
contract(id: "<id>") { id status principalAmount totalOutstanding daysPastDue }

# Loan lifecycle
loanRequests(pagination: { first: 20 }, status: "approved") { ... }
contracts(pagination: { first: 20 }, status: "active") { ... }
repaymentSchedule(contractId: "<id>") { installmentNumber dueDate totalDue status }
repayments(contractId: "<id>", pagination: { first: 20 }) { ... }
earlySettlementQuote(contractId: "<id>") { totalSettlement }

# Analytics
collectionsMetrics { totalOverdue totalDelinquent overdueAmount }
portfolioMetrics { totalContracts activeContracts totalDisbursed totalOutstanding }
settlementRuns(first: 20) { ... }
```

### Key Mutations

```graphql
# Products
createProduct(input: { ... }, idempotencyKey: "<key>") { id status }
updateProduct(id: "<id>", input: { name: "New Name" }) { id }
activateProduct(id: "<id>") { id status }
suspendProduct(id: "<id>") { id status }

# Subscriptions
activateSubscription(customerId: "<id>", productId: "<id>", creditLimit: 5000) { id }
deactivateSubscription(id: "<id>") { id }

# Loan lifecycle
createLoanRequest(input: {
  customerId: "<id>"
  productId: "<id>"
  requestedAmount: 1000
  requestedTenor: 14
  currency: "GHS"
  channel: "mobile_app"
}, idempotencyKey: "<key>") { id status }

processLoanRequest(loanRequestId: "<id>") { id status scoringResult { score } }
acceptOffer(loanRequestId: "<id>") { id contractId }
declineOffer(loanRequestId: "<id>") { id }

# Repayments
processRepayment(
  contractId: "<id>"
  amount: 500
  currency: "GHS"
  method: "manual"
  source: "wallet"
  externalRef: "PAY-001"
) { id amount allocatedPrincipal allocatedInterest }

# Collections
logCollectionsAction(contractId: "<id>", actionType: "call", notes: "...") { id }
addToBlacklist(customerId: "<id>", reason: "Fraud") { id status }
removeFromBlacklist(customerId: "<id>") { id status }

# Settlement
calculateSettlement(periodStart: "2026-03-01", periodEnd: "2026-03-31") { id totalRevenue }
approveSettlement(runId: "<id>") { id status }
```

---

## REST API

**Base URL**: `http://localhost:3001/v1`
**Swagger UI**: `http://localhost:3001/api/docs`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/v1/health` | Health check (status, version, uptime) |
| POST | `/v1/customers` | Register a customer |
| GET | `/v1/customers/:id` | Get customer details |
| GET | `/v1/customers/:id/credit-summary` | Credit score and limits |
| POST | `/v1/loan-requests` | Create a loan request |
| GET | `/v1/loan-requests/:id` | Get loan request status |
| POST | `/v1/loan-requests/:id/accept` | Accept a loan offer |
| POST | `/v1/repayments` | Record a repayment |
| GET | `/v1/contracts/:id` | Get contract details |
| GET | `/v1/contracts/:id/schedule` | Get repayment schedule |
| GET | `/v1/products` | List available products |
| POST | `/v1/webhooks` | Register a webhook |
| GET | `/v1/webhooks` | List registered webhooks |

**Authentication**: `Authorization: Bearer <token>` or `X-API-Key` + `X-API-Secret` headers.
**Rate limiting**: 100 requests per 60 seconds (HTTP 429 with `Retry-After` header).

---

## ML Scoring Service (Python)

**Base URL**: `http://localhost:8000`

### Health Check

```bash
curl http://localhost:8000/health
# {"status":"ok","service":"Lons Scoring Service","model_version":"v1.0-mock"}
```

### Score a Customer

```bash
curl -X POST http://localhost:8000/score \
  -H "Content-Type: application/json" \
  -d '{
    "customer_id": "uuid-here",
    "features": {
      "account_age_days": 365,
      "kyc_level": 3,
      "payment_history_pct": 95,
      "transaction_frequency": 20,
      "existing_debt_ratio": 15,
      "income_consistency": 85,
      "requested_amount": 1000
    },
    "model_version": "v1.0-mock"
  }'
```

**Response**:
```json
{
  "score": 850.0,
  "probability_of_default": 0.15,
  "recommended_limit": "5000.0",
  "confidence": 1.0,
  "risk_tier": "low",
  "contributing_factors": [
    { "name": "payment_history_pct", "impact": 0.18 },
    { "name": "income_consistency", "impact": 0.15 }
  ],
  "model_version": "v1.0-mock"
}
```

### Scoring Factors

| Factor | Weight | Description |
|---|---|---|
| `payment_history_pct` | 30% | Percentage of on-time payments |
| `account_age_days` | 15% | Days since account creation |
| `transaction_frequency` | 15% | Monthly transaction count |
| `existing_debt_ratio` | 15% | Current debt as % of income |
| `income_consistency` | 15% | Income stability score (0-100) |
| `kyc_level` | 10% | KYC verification level (0-3) |

### Risk Tiers

| Score Range | Tier | Default Probability |
|---|---|---|
| 750+ | Low | < 25% |
| 500–749 | Medium | 25–50% |
| 300–499 | High | 50–70% |
| 0–299 | Critical | > 70% |

---

## Loan Lifecycle

```
Create Request → Validate → Pre-Qualify → Score → Approve/Reject
                                                      ↓
                              Decline ← Offer → Accept
                                                   ↓
                                            Create Contract
                                                   ↓
                                              Disburse Funds
                                                   ↓
                                         Generate Schedule
                                                   ↓
                                          Process Repayments
                                                   ↓
                                          Settled / Default
```

### Loan Request Statuses

`received` → `validated` → `pre_qualified` → `scored` → `approved` / `rejected` → `offer_sent` → `accepted` / `declined` → `contract_created` → `disbursing` → `disbursed`

### Contract Statuses

`active` → `performing` → `due` → `overdue` → `delinquent` → `default_status` → `written_off` / `settled` / `cancelled`

### Repayment Waterfall Allocation

Priority order when processing a payment:
1. Overdue penalties
2. Overdue interest
3. Overdue principal
4. Current fees
5. Current interest
6. Current principal

---

## Integration Adapters (Phase 5)

All adapters run in **sandbox mode** — they log operations instead of calling real APIs.

### Wallet Adapters

| Adapter | Provider | Operations |
|---|---|---|
| MTN MoMo | MTN Mobile Money | disburse, collect, getBalance, getTransactionStatus |
| M-Pesa | Safaricom M-Pesa | disburse, collect, getBalance, getTransactionStatus |

### Notification Adapters

| Channel | Adapter | Mode |
|---|---|---|
| SMS | Africa's Talking | Sandbox (logs to console + DB) |
| Email | SMTP | Sandbox (logs to console + DB) |
| Console | Built-in | Development logging |

### Credit Bureau

- Mock adapter returning synthetic credit data
- 24-hour response caching
- Consent verification before queries

### Resilience Patterns

All external calls include:
- **Circuit breaker** — opens after 5 consecutive failures, half-open after 30s cooldown
- **Retry** — exponential backoff (1s, 2s, 4s, 8s), max 3 retries
- **Timeout** — configurable, default 30 seconds

---

## Recovery Strategies (AI Engine)

The recovery service recommends strategies based on days past due (DPD):

| DPD Range | Strategy | Success Probability |
|---|---|---|
| 0–30 | Grace period extension (7 days) | 75% |
| 8–60 | Restructure (extend tenor 30 days) | 60% |
| 31+ | Partial settlement (70% of outstanding) | 45% |
| Any (auto-deduction) | Fee recovery (2% per transaction) | 55% |
| 90+ | External collections escalation | 20% |

---

## Port Map

| Service | Port | Protocol |
|---|---|---|
| GraphQL Server | 3000 | HTTP |
| REST Server + Swagger | 3001 | HTTP |
| SP Admin Portal | 3100 | HTTP |
| Platform Admin Portal | 3200 | HTTP |
| Scheduler | 3003 | HTTP |
| Scoring Service (Python) | 8000 | HTTP |
| PostgreSQL | 5432 | TCP |
| Redis | 6379 | TCP |

---

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://lons:lons_dev_password@localhost:5432/lons
DATABASE_POOL_SIZE=20

# Redis
REDIS_URL=redis://localhost:6379

# Authentication
JWT_PRIVATE_KEY=./keys/private.pem
JWT_PUBLIC_KEY=./keys/public.pem
JWT_EXPIRY=3600
REFRESH_TOKEN_EXPIRY=604800

# Encryption (PII at rest)
ENCRYPTION_KEY=<base64-encoded-32-byte-key>
ENCRYPTION_IV_LENGTH=16

# Service URLs
SCORING_SERVICE_URL=http://localhost:8000
NOTIFICATION_SERVICE_URL=http://localhost:3003
INTEGRATION_SERVICE_URL=http://localhost:3004

# Server Ports
PORT=3000
REST_PORT=3001

# External APIs (sandbox mode, leave empty for mock)
MTN_MOMO_API_KEY=
MTN_MOMO_API_SECRET=
MTN_MOMO_ENVIRONMENT=sandbox
AFRICAS_TALKING_API_KEY=
AFRICAS_TALKING_USERNAME=

# Observability
LOG_LEVEL=debug
ENABLE_TRACING=false
```

---

## Commands Reference

```bash
# Development
pnpm dev                                # Run all services (hot reload)
pnpm --filter graphql-server dev        # Single service
pnpm --filter admin-portal dev          # Admin portal only

# Database
pnpm db:migrate:dev -- --name <name>    # Create migration
pnpm db:migrate                         # Apply migrations
pnpm db:seed                            # Seed test data
pnpm db:studio                          # Open Prisma Studio
pnpm db:generate                        # Regenerate Prisma client

# Build
pnpm build                              # Build all packages
pnpm --filter <package> build           # Build specific package

# Testing
pnpm test                               # All unit tests (Jest + Pytest)
pnpm --filter <package> test            # Specific service tests
./scripts/test-platform.sh              # E2E test suite (50+ tests)

# Linting
pnpm lint                               # Check all packages
pnpm lint:fix                           # Auto-fix issues
pnpm format                             # Format with Prettier
pnpm format:check                       # Check formatting

# Docker
docker compose up -d                    # Start PostgreSQL + Redis
docker compose down                     # Stop infrastructure

# Cleanup
pnpm clean                              # Remove all dist/ and node_modules/
```

---

## Testing

### Unit Tests

```bash
pnpm test
```

Runs Jest tests across all TypeScript packages and Pytest for the scoring service. Current coverage: 88+ test cases.

### E2E Test Suite

```bash
# First-time setup
./scripts/setup-test-env.sh

# Start all services
pnpm dev  # Terminal 1

# Run E2E tests
./scripts/test-platform.sh  # Terminal 2
```

The E2E script covers 50+ test cases across 12 sections:

| # | Section | Tests |
|---|---|---|
| 0 | Infrastructure health | REST, GraphQL, Scoring service |
| 1 | Authentication | Login, refresh, invalid credentials |
| 2 | Entity management | Tenants, products, customers, lenders, pagination |
| 3 | Product management | Create, idempotency, activate, suspend |
| 4 | Loan lifecycle | Subscription, request, processing, offer acceptance |
| 5 | Contract & repayment | Fetch, schedule, payment, balance update, settlement quote |
| 6 | Collections & recovery | Metrics, actions, portfolio overview |
| 7 | Settlement | Calculate, list runs |
| 8 | ML scoring | High/low scores, missing features, model versioning |
| 9 | Edge cases | Blacklist/unblacklist, rejected requests |
| 10 | Filters & queries | By type, status, date |
| 11 | Authorization | Unauthenticated/invalid token rejection |
| 12 | REST API | Health endpoint fields |

---

## Development Phases

| Phase | Status | Description |
|---|---|---|
| 1. Foundation | Done | Monorepo, DB, auth, entity CRUD, GraphQL |
| 2. Loan Processing | Done | State machine, scoring, disbursement, repayment |
| 3. Post-Processing | Done | Ledger, accrual, aging, settlement, reconciliation |
| 4. Admin Portal | Done | Next.js dashboard, product/customer/loan management |
| 5. Integrations & AI | Done | Wallet adapters, SMS/email, credit bureau, ML scoring, recovery |
| 6. Hardening | Done | Rate limiting, Swagger/OpenAPI, audit logging, webhooks, Dockerfiles, CI/CD, tenant slug login |
| 7. Portal Redesign | Done | Glassmorphism UI, Platform Admin Portal, multi-country data, REST API expansion |

---

## Documentation

Detailed requirements for each module:

| Document | Topic |
|---|---|
| `Docs/00-overview.md` | Architecture, glossary, tech rationale |
| `Docs/01-loan-portfolio.md` | Loan product types and rules |
| `Docs/02-qualification-scoring.md` | Credit scoring and pre-qualification |
| `Docs/03-repayments-recovery.md` | Repayments, collections, recovery |
| `Docs/04-entity-management.md` | Tenants, customers, products |
| `Docs/05-process-engine.md` | Loan request pipeline |
| `Docs/06-post-process.md` | Ledger, settlement, reconciliation |
| `Docs/07-api-specifications.md` | GraphQL, REST, webhooks |
| `Docs/08-admin-portal.md` | Admin UI specifications |
| `Docs/09-integrations.md` | External system adapters |
| `Docs/10-security-compliance.md` | Security, auth, encryption |
| `Docs/11-data-models.md` | Database schema |
| `Docs/12-non-functional.md` | Performance, scaling |
| `Docs/13-deployment.md` | Infrastructure, CI/CD |
| `Docs/ROADMAP.md` | Development phases |

---

## License

Proprietary. All rights reserved.
