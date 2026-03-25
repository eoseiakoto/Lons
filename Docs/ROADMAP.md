# Lōns Development Roadmap

Detailed task breakdown for each development phase. Each task references the specific requirements it implements.

---

## Phase 1: Foundation (Weeks 1–3)

### 1.1 Monorepo Setup
- [ ] Initialize Turborepo with pnpm workspaces
- [ ] Create `pnpm-workspace.yaml` with all app/service/package paths
- [ ] Configure `turbo.json` with build, dev, test, lint pipelines
- [ ] Set up root `tsconfig.json` with path aliases
- [ ] Set up ESLint + Prettier shared config (`packages/eslint-config/`)
- [ ] Create `.env.example` with all required environment variables
- [ ] Create `docker-compose.yml` for PostgreSQL 16 + Redis 7

### 1.2 Shared Packages
- [ ] `packages/shared-types/` — TypeScript interfaces for all entities (mirror `Docs/11-data-models.md`)
- [ ] `packages/common/` — Utilities: pagination helpers, date/time, error classes, financial math (Decimal operations, rounding, amortization calculations)
- [ ] `packages/event-contracts/` — Event type definitions, payload schemas, event names enum
- [ ] `packages/database/` — Prisma schema (all entities from `Docs/11-data-models.md`)

### 1.3 Database
- [ ] Write Prisma schema covering all entities in `Docs/11-data-models.md`
- [ ] Platform schema: `tenants`, `platform_users`
- [ ] Tenant schema: `users`, `roles`, `lenders`, `customers`, `customer_consents`, `products`, `product_versions`, `subscriptions`, `loan_requests`, `scoring_results`, `contracts`, `repayment_schedule`, `disbursements`, `repayments`, `ledger_entries`, `audit_logs`, `notifications`, `webhook_configs`, `webhook_deliveries`
- [ ] Configure RLS policies for tenant isolation
- [ ] Create initial migration
- [ ] Write seed data script (demo tenant, admin user, sample products, test customers)

### 1.4 Authentication & Authorization
- [ ] Implement JWT service (RS256 sign/verify, token generation, refresh flow)
- [ ] Implement API key authentication (client ID + secret, hashed storage)
- [ ] Implement RBAC middleware (role → permissions mapping)
- [ ] Implement tenant context middleware (extract tenant from JWT, set PostgreSQL session variable)
- [ ] Implement MFA (TOTP) for portal users
- [ ] Implement account lockout after failed attempts (FR-SEC-001.5)

### 1.5 Entity Service
- [ ] NestJS module for Service Providers (tenant CRUD — platform admin only)
- [ ] NestJS module for Users (CRUD within tenant, role assignment) — `Docs/04-entity-management.md` §1.3
- [ ] NestJS module for Roles (CRUD, permission management) — `Docs/04-entity-management.md` §1.3
- [ ] NestJS module for Lenders (CRUD within tenant) — `Docs/04-entity-management.md` §1.4
- [ ] NestJS module for Customers (CRUD, search, financial profile, blacklist/watchlist) — `Docs/04-entity-management.md` §3
- [ ] NestJS module for Products (CRUD, versioning, lifecycle management) — `Docs/04-entity-management.md` §2
- [ ] NestJS module for Subscriptions (activate/deactivate, limit management)

### 1.6 GraphQL Server
- [ ] Set up NestJS app with Apollo Server integration
- [ ] Implement GraphQL resolvers for all entity types
- [ ] Implement cursor-based pagination (Relay connections pattern)
- [ ] Implement query complexity analysis and depth limiting
- [ ] Implement field-level authorization for sensitive fields
- [ ] Write unit tests for all resolvers

### 1.7 Phase 1 Deliverables
- [ ] All entity CRUD operations working via GraphQL
- [ ] Authentication and RBAC fully functional
- [ ] Seed data populates a working demo environment
- [ ] Docker Compose runs the full local stack
- [ ] 80%+ unit test coverage on business logic

---

## Phase 2: Loan Processing Core (Weeks 4–6)

### 2.1 Pre-Qualification Engine
- [ ] Implement configurable rules engine — `Docs/02-qualification-scoring.md` §2 (FR-PQ-001)
- [ ] Support rule types: account age, KYC level, transaction count, balance, geo, age, blacklist
- [ ] AND/OR logic combinator with priority ordering
- [ ] Caching of pre-qualification results (configurable TTL)
- [ ] < 2 second execution target
- [ ] Return pass/fail with specific reason codes

### 2.2 Rule-Based Credit Scoring
- [ ] Implement configurable scorecard — `Docs/02-qualification-scoring.md` §3.2 (FR-CS-001)
- [ ] Scoring factors: payment history, account age, avg balance, txn frequency, income, DTI, KYC level, custom
- [ ] Configurable weights, bands, min/max per factor
- [ ] Score normalization to 0–1000 range
- [ ] Scorecard versioning
- [ ] Credit limit derivation from score bands (FR-CS-004)
- [ ] Total exposure cap enforcement

### 2.3 Process Engine
- [ ] Implement loan request state machine — `Docs/05-process-engine.md` §3
  - [ ] RECEIVED → VALIDATED → PRE_QUALIFIED → SCORED → APPROVED/REJECTED/MANUAL_REVIEW → OFFER_SENT → ACCEPTED/DECLINED/EXPIRED → CONTRACT_CREATED → DISBURSING → DISBURSED/DISBURSEMENT_FAILED
- [ ] Request validation (FR-LR-002)
- [ ] Pre-qualification integration (invoke rules engine)
- [ ] Scoring integration (invoke scoring service)
- [ ] Approval engine with configurable workflows: auto, semi-auto, single-level, multi-level (FR-AE-001, FR-AE-002)
- [ ] Offer generation with full cost-of-credit calculation (FR-OG-001)
- [ ] Offer expiry handling (FR-OG-002)
- [ ] Customer acceptance/decline/timeout
- [ ] Idempotent request processing (FR-PE-003)
- [ ] Event emission on every state transition

### 2.4 Contract Creation
- [ ] Generate contract from accepted offer — `Docs/05-process-engine.md` §6
- [ ] Human-readable contract number generation (e.g., LON-2024-00001)
- [ ] Terms snapshot (product version freeze)
- [ ] Contract state machine: ACTIVE → PERFORMING → DUE → OVERDUE → DELINQUENT → DEFAULT → WRITTEN_OFF → SETTLED → CANCELLED

### 2.5 Disbursement Service
- [ ] Implement disbursement processing — `Docs/05-process-engine.md` §7
- [ ] Create mock wallet adapter for testing (simulates success/failure/delay)
- [ ] Retry logic with configurable policy
- [ ] Rollback on permanent failure
- [ ] Disbursement confirmation handling (webhook callback)

### 2.6 Repayment Engine
- [ ] Repayment schedule generation — `Docs/03-repayments-recovery.md` §1.2 (FR-RP-002)
  - [ ] Equal installments (EMI formula)
  - [ ] Reducing balance
  - [ ] Balloon payment
  - [ ] Bullet payment
- [ ] Payment processing with waterfall allocation (FR-RP-001.3)
- [ ] Auto-deduction on due date (with retry on insufficient balance)
- [ ] Manual and advance repayment support
- [ ] Early settlement calculation (FR-RP-003)
- [ ] Contract balance updates after each payment

### 2.7 Notification Service (Basic)
- [ ] Implement notification service with pluggable channels
- [ ] Console/log adapter (for development)
- [ ] Template engine with variable substitution (`{{customer_name}}`, `{{amount}}`, etc.)
- [ ] Notification events: activation, offer, acceptance, disbursement, payment reminder, payment received, overdue

### 2.8 Phase 2 Deliverables
- [ ] Complete loan lifecycle: apply → score → approve → disburse → repay → settle
- [ ] Working for overdraft and micro-loan product types
- [ ] All state transitions emit events
- [ ] Integration tests covering the full happy path and key error paths

---

## Phase 3: Post-Processing & Management (Weeks 7–9)

### 3.1 Ledger Engine
- [ ] Double-entry ledger implementation — `Docs/06-post-process.md` §1 (FR-ST-002)
- [ ] Append-only entries (no updates, no deletes)
- [ ] Entry types: disbursement, interest_accrual, fee, penalty, repayment, adjustment, write_off, reversal
- [ ] Running balance calculation
- [ ] Statement generation (FR-ST-001)

### 3.2 Interest Accrual Scheduler
- [ ] Daily interest accrual job for all active contracts
- [ ] Support flat, reducing balance, and tiered accrual methods
- [ ] Accrual entries posted to ledger
- [ ] Configurable accrual timing (daily, on due date)

### 3.3 Overdue Detection & Classification
- [ ] Daily aging job — `Docs/03-repayments-recovery.md` §2 (FR-DM-001)
- [ ] Configurable aging buckets (Current, Watch, Substandard, Doubtful, Loss)
- [ ] Automatic contract state transitions based on DPD
- [ ] Configurable actions per bucket transition (notifications, limit changes, recovery referral)

### 3.4 Penalty Management
- [ ] Penalty calculation and application — `Docs/03-repayments-recovery.md` §2.2 (FR-DM-002)
- [ ] Flat fee, percentage, compound penalty modes
- [ ] Regulatory caps
- [ ] Penalty waiver workflow

### 3.5 Revenue Settlement
- [ ] Settlement calculation engine — `Docs/06-post-process.md` §2
- [ ] Configurable revenue sharing rules (percentage, tiered, waterfall)
- [ ] Scheduled settlement runs (daily/weekly/monthly)
- [ ] Settlement report generation per party
- [ ] Approval workflow for settlements

### 3.6 Reconciliation
- [ ] Daily reconciliation batch — `Docs/06-post-process.md` §3
- [ ] Compare internal records vs. external (wallet provider) records
- [ ] Exception classification (unmatched, orphaned, amount mismatch)
- [ ] Exception severity levels and escalation

### 3.7 Collections Workflow
- [ ] Collections queue with prioritization — `Docs/03-repayments-recovery.md` §4
- [ ] Collections actions logging (reminders, contact attempts, promises-to-pay)
- [ ] Promise-to-pay tracking and broken promise detection
- [ ] Loan restructuring support (FR-AR-005)

### 3.8 Portfolio Analytics
- [ ] Compute PAR (1, 7, 30, 60, 90), NPL ratio, write-off ratio — `Docs/06-post-process.md` §4 (FR-DFL-002)
- [ ] Provisioning calculations per classification bucket
- [ ] Vintage analysis
- [ ] Metrics API endpoints

### 3.9 Phase 3 Deliverables
- [ ] Interest accrues correctly on all active contracts
- [ ] Overdue contracts are automatically classified and penalized
- [ ] Revenue is calculated and split per sharing rules
- [ ] Daily reconciliation runs and flags exceptions
- [ ] Portfolio metrics are accurate and queryable

---

## Phase 4: Admin Portal (Weeks 10–13)

### 4.1 Portal Setup
- [ ] Next.js project with TypeScript, Tailwind CSS, shadcn/ui
- [ ] Authentication (login, MFA, session management)
- [ ] Layout: sidebar navigation, header with user/tenant context
- [ ] RBAC-enforced route and component protection
- [ ] Apollo Client for GraphQL data fetching
- [ ] Responsive design (desktop 1280px+, tablet 768px+)

### 4.2 Dashboard — `Docs/08-admin-portal.md` §2
- [ ] Key metrics cards (active loans, disbursements, repayments, PAR, NPL)
- [ ] Trend charts (disbursement volume, repayment collection, PAR trends)
- [ ] Filterable by product type, date range, customer segment
- [ ] Alerts panel

### 4.3 Product Management — `Docs/08-admin-portal.md` §3
- [ ] Product list with status, type, contract count
- [ ] Multi-step product creation wizard
- [ ] Product detail view with version history and diff
- [ ] Edit with version creation

### 4.4 Customer Management — `Docs/08-admin-portal.md` §4
- [ ] Customer search (name, phone, ID)
- [ ] Customer detail tabs: Profile, Credit Summary, Contracts, Payments, Financial Profile, Activity
- [ ] Actions: blacklist, watchlist, score refresh, notes

### 4.5 Loan Operations — `Docs/08-admin-portal.md` §5
- [ ] Application queue (manual review items with SLA tracking)
- [ ] Active contracts list with filtering and bulk actions
- [ ] Contract detail view with full history, ledger, and action buttons

### 4.6 Collections — `Docs/08-admin-portal.md` §6
- [ ] Collections dashboard (overdue summary, recovery rates)
- [ ] Collections queue with AI recommendations
- [ ] Action logging (contact attempts, promises, restructuring)

### 4.7 Reports — `Docs/08-admin-portal.md` §7
- [ ] Standard reports: disbursement, repayment, portfolio quality, revenue, reconciliation
- [ ] Date range selection, product filtering
- [ ] CSV and PDF export
- [ ] Scheduled report delivery (email)

### 4.8 Settings — `Docs/08-admin-portal.md` §8
- [ ] Organization profile and branding
- [ ] User management
- [ ] API key management
- [ ] Webhook configuration
- [ ] Notification template editor
- [ ] Audit log viewer (searchable, filterable, immutable)

### 4.9 Phase 4 Deliverables
- [ ] Fully functional admin portal
- [ ] All CRUD operations work through the UI
- [ ] Dashboard reflects real-time data
- [ ] Reports are accurate and exportable

---

## Phase 5: Integrations & AI (Weeks 14–17)

### 5.1 Wallet Adapters — `Docs/09-integrations.md` §2
- [ ] Standard wallet adapter interface (`packages/shared-types/`)
- [ ] MTN MoMo adapter (Collections, Disbursements, KYC, Balance)
- [ ] M-Pesa Daraja adapter (B2C, C2B, Status, Balance)
- [ ] Generic configurable wallet adapter
- [ ] Circuit breaker, retry, timeout on all adapters

### 5.2 Notification Adapters — `Docs/09-integrations.md` §6
- [ ] SMS adapter (Africa's Talking or Twilio)
- [ ] Email adapter (SMTP / transactional service)
- [ ] Push notification adapter (FCM)
- [ ] Delivery status tracking

### 5.3 Credit Bureau — `Docs/09-integrations.md` §4
- [ ] Credit bureau query adapter (configurable per country)
- [ ] Batch reporting to credit bureau (positive/negative data)
- [ ] Response caching

### 5.4 ML Scoring Service — `Docs/02-qualification-scoring.md` §3.2 (FR-CS-002)
- [ ] Python FastAPI service setup
- [ ] Feature engineering pipeline
- [ ] Model training pipeline (scikit-learn / LightGBM)
- [ ] Model versioning and A/B traffic routing
- [ ] Prediction API: score, PD, recommended limit, confidence, explainability
- [ ] Model drift detection

### 5.5 AI Recovery — `Docs/03-repayments-recovery.md` §3
- [ ] Predictive default analysis (FR-AR-001)
- [ ] Recovery strategy recommendation engine (FR-AR-002)
- [ ] Transaction fee-based recovery (FR-AR-003)
- [ ] Network analysis for guarantor identification (FR-AR-004)
- [ ] Feedback loop (track strategy outcomes to improve recommendations)

### 5.6 Real-Time Monitoring — `Docs/02-qualification-scoring.md` §4
- [ ] Continuous borrower risk indicator computation (FR-RM-001)
- [ ] Configurable alert rules and triggers (FR-RM-002)
- [ ] Automated protective actions (limit freeze, schedule adjustment) (FR-RM-003)

### 5.7 Phase 5 Deliverables
- [ ] End-to-end loan flow with real wallet integration (sandbox)
- [ ] SMS notifications delivered
- [ ] ML scoring running alongside rule-based scoring
- [ ] AI recovery recommendations visible in collections queue

---

## Phase 6: Hardening & Production (Weeks 18–21)

### 6.1 API Completion
- [ ] Webhook delivery system with retry and signing — `Docs/07-api-specifications.md` §4
- [ ] REST API for simple integrations — `Docs/07-api-specifications.md` §3
- [ ] OpenAPI 3.1 spec generation
- [ ] Rate limiting (per tenant, per endpoint category) — `Docs/07-api-specifications.md` §6
- [ ] GraphQL subscriptions (WebSocket) — `Docs/07-api-specifications.md` §2.3

### 6.2 Security Hardening — `Docs/10-security-compliance.md`
- [ ] PII encryption at rest (AES-256-GCM) with key management
- [ ] Comprehensive audit logging (all events from FR-SEC-008)
- [ ] Log masking for PII
- [ ] WAF configuration
- [ ] Vulnerability scanning in CI
- [ ] Dependency vulnerability monitoring
- [ ] IP whitelisting support

### 6.3 Performance & Reliability — `Docs/12-non-functional.md`
- [ ] Load testing (k6 or Artillery) against performance targets
- [ ] Query optimization (slow query detection, index tuning)
- [ ] Connection pooling optimization
- [ ] Graceful degradation under load
- [ ] Database read replicas for reporting

### 6.4 Infrastructure — `Docs/13-deployment.md`
- [ ] Dockerfiles for all services (multi-stage builds)
- [ ] Helm charts for Kubernetes deployment
- [ ] Terraform for cloud infrastructure
- [ ] CI/CD pipeline (lint → test → build → scan → deploy staging → promote)
- [ ] Monitoring: Prometheus + Grafana dashboards
- [ ] Logging: centralized aggregation (Loki/ELK)
- [ ] Distributed tracing (OpenTelemetry + Jaeger/Tempo)
- [ ] Backup and restore procedures
- [ ] Runbooks for common operations

### 6.5 Phase 6 Deliverables
- [ ] Production-ready deployment
- [ ] All security controls active
- [ ] Performance meets SLA targets
- [ ] Monitoring and alerting operational
- [ ] Documentation complete
