# Lōns Platform — Claude Code Instructions

## Project Overview

Lōns is a B2B2C fintech platform enabling financial institutions to offer and manage loan products (Overdraft, Micro-Loan, BNPL, Invoice Factoring) through digital wallets and telecom systems. It targets underbanked demographics in African markets.

**Read `Docs/00-overview.md` first for full context, then consult the specific doc for whichever module you're working on.**

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Backend Framework | NestJS (TypeScript) | Latest stable |
| Primary Database | PostgreSQL | 16+ |
| ORM | Prisma | Latest stable |
| Cache | Redis | 7+ |
| Message Queue | BullMQ (Redis-backed) | Latest stable |
| GraphQL | Apollo Server (NestJS integration) | Latest stable |
| Admin Portal | Next.js (React, TypeScript) | Latest stable |
| AI/ML Service | Python, FastAPI | 3.11+, Latest stable |
| Authentication | JWT (RS256) + OAuth 2.0 | — |
| Monorepo Tooling | Turborepo | Latest stable |
| Package Manager | pnpm | Latest stable |
| Testing | Jest (TS), Pytest (Python) | Latest stable |
| Linting | ESLint + Prettier (TS), Ruff (Python) | Latest stable |

---

## Repository Structure

```
lons/
├── apps/
│   ├── admin-portal/           # Next.js O&M Portal
│   ├── graphql-server/         # NestJS GraphQL API
│   ├── rest-server/            # NestJS REST API
│   └── scheduler/              # Cron job service (interest accrual, aging, reminders)
├── services/
│   ├── entity-service/         # SP, product, customer CRUD
│   ├── process-engine/         # Loan request → disbursement pipeline
│   ├── scoring-service/        # Python FastAPI — credit scoring (rule-based + ML)
│   ├── repayment-service/      # Repayment processing, schedule management
│   ├── recovery-service/       # AI-driven recovery, collections
│   ├── settlement-service/     # Revenue calculation, settlement generation
│   ├── reconciliation-service/ # Daily reconciliation batch
│   ├── notification-service/   # Multi-channel notification dispatch
│   ├── integration-service/    # Wallet/telecom/bureau adapters
│   └── analytics-service/      # Data aggregation, metrics
├── packages/
│   ├── shared-types/           # Shared TypeScript types/interfaces
│   ├── common/                 # Shared utilities, constants, helpers
│   ├── database/               # Prisma schema, migrations, seed data
│   └── event-contracts/        # Event bus message schemas (TypeScript)
├── infrastructure/
│   ├── terraform/              # Cloud infrastructure
│   ├── helm/                   # Kubernetes Helm charts
│   └── docker/                 # Dockerfiles, docker-compose (local dev)
├── Docs/                       # Requirements documents (00–13)
├── CLAUDE.md                   # This file
├── turbo.json
├── package.json
├── pnpm-workspace.yaml
└── .env.example
```

---

## Critical Development Rules

### Money & Financial Calculations

- **NEVER use `float` or `number` for monetary amounts.** Use `Decimal` (Prisma) / `DECIMAL(19,4)` (PostgreSQL).
- All money in API responses: `{ "amount": "1234.5678", "currency": "GHS" }` — amount is a STRING, never a number.
- Use banker's rounding (round half to even) for all financial math.
- All interest/fee calculations must be deterministic and reproducible.
- Financial calculations should live in a shared utility (`packages/common/src/financial/`) with comprehensive unit tests.

### Multi-Tenancy

- Every database table in tenant schemas uses Row-Level Security (RLS).
- Tenant context is resolved from JWT at the API gateway and set as a PostgreSQL session variable: `SET app.current_tenant = '<tenant_id>'`.
- **NEVER** construct queries that access data across tenants (except platform admin operations in the `platform` schema).
- Every service function that touches the database must receive tenant context — no implicit globals.

### Database

- Primary keys: UUID v7 (time-sortable). Use `@default(dbgenerated("gen_random_uuid()"))` in Prisma or generate in application code.
- All tables must have `created_at` and `updated_at` (timestamptz, UTC).
- No hard deletes for business data — use `deleted_at` (soft delete).
- Ledger entries and audit logs are **append-only** — no updates, no deletes.
- All foreign keys must have indexes.
- Migrations must be backward-compatible (see Docs/13-deployment.md §3.3).

### API Design

- GraphQL is the primary API. Use code-first approach with NestJS decorators.
- REST is secondary — limited to simple integration endpoints and webhooks.
- All list queries use cursor-based pagination (Relay connections pattern).
- All mutations accept an `idempotencyKey` parameter.
- Error responses use structured format: `{ code: string, message: string, details?: object }`.
- Sensitive fields (national_id, phone) require field-level authorization.

### Event-Driven Architecture

- All loan state transitions emit events to the message queue.
- Event schema is defined in `packages/event-contracts/`.
- Events follow the format: `{ event: "contract.state_changed", tenantId, timestamp, data, correlationId }`.
- Consumers must be idempotent — the same event delivered twice must not cause duplicate side effects.

### Security

- PII fields encrypted at rest (AES-256-GCM): national_id, full_name (when paired with ID), phone, email, date_of_birth.
- Encryption keys managed via environment variables pointing to a key management service.
- PII must NEVER appear in logs — mask as `+233***7890`, `GHA-***-XXX`.
- All user inputs validated and sanitized (class-validator in NestJS).
- CORS, CSRF, rate limiting configured on all public endpoints.

### Testing

- Business logic: unit tests (Jest/Pytest) with 80%+ coverage.
- Critical paths: integration tests covering loan origination → disbursement → repayment → settlement.
- Financial calculations: property-based tests ensuring rounding, allocation, and schedule generation are correct.
- API: e2e tests for GraphQL and REST endpoints.
- Every PR must pass all tests before merge.

---

## Development Phases

Development follows this phased approach. Complete each phase before moving to the next. See `Docs/ROADMAP.md` for detailed breakdown.

### Phase 1: Foundation
Set up monorepo, database schema, authentication, and core entity CRUD.
- Monorepo scaffolding (Turborepo, pnpm, shared packages)
- Prisma schema for all entities (Docs/11-data-models.md)
- Database migrations and seed data
- Authentication service (JWT, API keys, RBAC)
- Entity service (tenants, users, roles, customers, products, lenders)
- Basic GraphQL server with entity queries/mutations
- Docker Compose for local development (PostgreSQL, Redis)

### Phase 2: Loan Processing Core
Implement the loan lifecycle pipeline.
- Pre-qualification rules engine (Docs/02-qualification-scoring.md §2)
- Rule-based credit scoring (Docs/02-qualification-scoring.md §3.2 FR-CS-001)
- Process engine: request → validation → scoring → approval → offer → acceptance (Docs/05-process-engine.md)
- Contract creation
- Disbursement service (with mock wallet adapter)
- Repayment engine: schedule generation, payment processing, waterfall allocation (Docs/03-repayments-recovery.md §1)
- Notification service (with console/log adapter initially)

### Phase 3: Post-Processing & Management
Implement everything that happens after disbursement.
- Ledger engine (double-entry, append-only) (Docs/06-post-process.md §1)
- Interest accrual scheduler
- Overdue detection and aging classification (Docs/03-repayments-recovery.md §2)
- Penalty calculation and application
- Revenue settlement engine (Docs/06-post-process.md §2)
- Daily reconciliation batch (Docs/06-post-process.md §3)
- Collections queue and workflow (Docs/03-repayments-recovery.md §4)

### Phase 4: Admin Portal
Build the O&M web interface.
- Next.js project setup with authentication
- Dashboard with key metrics (Docs/08-admin-portal.md §2)
- Product management screens (create/edit wizard) (Docs/08-admin-portal.md §3)
- Customer search and detail views (Docs/08-admin-portal.md §4)
- Loan operations: application queue, contract views (Docs/08-admin-portal.md §5)
- Collections dashboard and queue (Docs/08-admin-portal.md §6)
- Standard reports (Docs/08-admin-portal.md §7)
- Settings and audit log viewer (Docs/08-admin-portal.md §8)

### Phase 5: Integrations & AI
Connect to real external systems and add intelligence.
- Wallet adapter: MTN MoMo (Docs/09-integrations.md §2.2)
- Wallet adapter: M-Pesa (Docs/09-integrations.md §2.3)
- Generic wallet adapter (configurable) (Docs/09-integrations.md §2.4)
- SMS notification adapter (Africa's Talking / Twilio)
- Credit bureau integration (Docs/09-integrations.md §4)
- ML scoring service (Python FastAPI) (Docs/02-qualification-scoring.md §3.2 FR-CS-002)
- AI recovery strategy engine (Docs/03-repayments-recovery.md §3)
- Real-time monitoring and alerting (Docs/02-qualification-scoring.md §4)

### Phase 6: Hardening & Production Readiness
Prepare for production deployment.
- Webhook delivery system (Docs/07-api-specifications.md §4)
- REST API with OpenAPI spec (Docs/07-api-specifications.md §3)
- Rate limiting and throttling (Docs/07-api-specifications.md §6)
- Comprehensive audit logging (Docs/10-security-compliance.md §4)
- PII encryption at rest (Docs/10-security-compliance.md §3)
- Performance optimization and load testing (Docs/12-non-functional.md)
- Kubernetes Helm charts and CI/CD pipeline (Docs/13-deployment.md)
- Monitoring stack (Prometheus + Grafana)
- Documentation and runbooks

---

## Key Reference Documents

Always consult the relevant requirements document before implementing a feature:

| Working On | Read |
|---|---|
| Any loan product (overdraft, micro-loan, BNPL, factoring) | `Docs/01-loan-portfolio.md` |
| Credit scoring or pre-qualification | `Docs/02-qualification-scoring.md` |
| Repayments, collections, or recovery | `Docs/03-repayments-recovery.md` |
| Tenants, customers, products, or lenders | `Docs/04-entity-management.md` |
| Loan request → disbursement pipeline | `Docs/05-process-engine.md` |
| Statements, settlements, reconciliation, or defaults | `Docs/06-post-process.md` |
| GraphQL, REST, or webhook APIs | `Docs/07-api-specifications.md` |
| Admin portal UI | `Docs/08-admin-portal.md` |
| External system integrations | `Docs/09-integrations.md` |
| Security, auth, encryption, or compliance | `Docs/10-security-compliance.md` |
| Database schema or entity relationships | `Docs/11-data-models.md` |
| Performance, scaling, or monitoring | `Docs/12-non-functional.md` |
| Infrastructure, CI/CD, or deployment | `Docs/13-deployment.md` |

---

## Naming Conventions

| Item | Convention | Example |
|---|---|---|
| Database tables | snake_case, plural | `loan_requests`, `ledger_entries` |
| Database columns | snake_case | `created_at`, `total_outstanding` |
| TypeScript files | kebab-case | `loan-request.service.ts` |
| TypeScript classes | PascalCase | `LoanRequestService` |
| TypeScript interfaces | PascalCase with prefix | `ILoanRequest`, `ICreateProductInput` |
| TypeScript enums | PascalCase | `ContractStatus`, `RepaymentMethod` |
| GraphQL types | PascalCase | `LoanRequest`, `Customer` |
| GraphQL queries | camelCase | `loanRequests`, `customer` |
| GraphQL mutations | camelCase, verb-first | `createLoanRequest`, `acceptOffer` |
| REST endpoints | kebab-case, plural nouns | `/v1/loan-requests`, `/v1/customers` |
| Event names | dot.separated | `contract.state_changed`, `repayment.received` |
| Environment variables | UPPER_SNAKE_CASE | `DATABASE_URL`, `JWT_SECRET` |
| NestJS modules | PascalCase + Module | `LoanRequestModule` |
| NestJS services | PascalCase + Service | `LoanRequestService` |
| NestJS controllers | PascalCase + Controller | `LoanRequestController` |
| NestJS resolvers | PascalCase + Resolver | `LoanRequestResolver` |
| Python files | snake_case | `scoring_engine.py` |
| Python classes | PascalCase | `ScoringEngine` |
| Test files | same name + `.spec.ts` or `_test.py` | `loan-request.service.spec.ts` |

---

## Environment Variables

Create `.env` files from `.env.example`. Required variables:

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/lons
DATABASE_POOL_SIZE=20

# Redis
REDIS_URL=redis://localhost:6379

# Authentication
JWT_PRIVATE_KEY=<RS256 private key path>
JWT_PUBLIC_KEY=<RS256 public key path>
JWT_EXPIRY=3600
REFRESH_TOKEN_EXPIRY=604800

# Encryption
ENCRYPTION_KEY=<AES-256 key — 32 bytes base64>
ENCRYPTION_IV_LENGTH=16

# Services
SCORING_SERVICE_URL=http://localhost:8000
NOTIFICATION_SERVICE_URL=http://localhost:3003
INTEGRATION_SERVICE_URL=http://localhost:3004

# External (Phase 5)
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

## Common Commands

```bash
# Install dependencies
pnpm install

# Run all services locally
pnpm dev

# Run a specific app/service
pnpm --filter admin-portal dev
pnpm --filter graphql-server dev

# Database
pnpm --filter database db:migrate       # Run migrations
pnpm --filter database db:seed          # Seed data
pnpm --filter database db:studio        # Open Prisma Studio

# Testing
pnpm test                               # All tests
pnpm --filter process-engine test       # Specific service
pnpm test:e2e                           # E2E tests

# Linting
pnpm lint                               # All packages
pnpm lint:fix                           # Auto-fix

# Build
pnpm build                              # All packages
pnpm --filter admin-portal build        # Specific app

# Docker (local development)
docker compose up -d                    # Start PostgreSQL, Redis
docker compose down                     # Stop services
```
