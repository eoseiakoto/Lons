# Service Dependency Map

This document provides a comprehensive map of all services in the Lōns platform, their runtime dependencies, communication patterns, and critical paths. Used for operational planning, incident response, and capacity planning.

**Last Updated:** 2026-03-29

---

## Architecture Overview

The Lōns platform is composed of 6 core applications, 9 microservices, and 3 infrastructure dependencies:

```
┌─────────────────────────────────────────────────────────────┐
│                      Clients (Web, Mobile)                   │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────▼────┐   ┌──────▼──────┐   ┌───▼──────┐
    │  Admin  │   │    GraphQL  │   │   REST   │
    │ Portal  │   │   Server    │   │  Server  │
    │ (Next.js)   │ (NestJS)    │   │(NestJS)  │
    └────┬────┘   └──────┬──────┘   └───┬──────┘
         │               │               │
         └───────────────┼───────────────┘
                         │
         ┌───────────────┴───────────────┐
         │   Microservices (NestJS/Py)  │
         │                               │
    ┌────▼────────────────────────────┐
    │  Entity  │ Process │ Repayment   │ ← Loan Origination & Repayment
    │ Service  │ Engine  │  Service    │
    └──────────┴─────────┴─────────────┘
    ┌────────────────────────────────┐
    │ Notification │ Settlement │    │ ← Post-Processing
    │  Service     │ Service    │ ... │
    └──────────────┴────────────┴─────┘
    ┌────────────────────────────────┐
    │ Scoring │ Recovery │ Integration│ ← Specialized Services
    │Service  │ Service  │ Service    │
    └──────────┴──────────┴───────────┘
         │
         └─────────────┬──────────────────┐
                       │                  │
                  ┌────▼─────┐      ┌─────▼────┐
                  │PostgreSQL │      │  Redis   │
                  │ (Primary) │      │ (Cache/Q)│
                  └───────────┘      └──────────┘
                       │
                  Scheduler
                  (Cron Jobs)
```

---

## Applications

### 1. Admin Portal (`apps/admin-portal`)

**Technology:** Next.js (React, TypeScript)
**Port:** 3100
**Replicas:** 2–3 (dev: 1)

**Responsibilities:**
- O&M dashboard (key metrics, health)
- Product management (create/edit/delete loan products)
- Customer search and detail views
- Loan application queue (origination workflow)
- Collections dashboard and queue
- Reports (portfolio, aging, revenue)
- Settings, audit log viewer

**Dependencies:**
- GraphQL Server (primary)
- REST Server (secondary, webhooks)
- PostgreSQL (via API)
- Redis (via API, caching)

**Communication:**
- Outbound: GraphQL (ws + http), REST (http)
- Inbound: None (stateless frontend)

**Failure Impact:**
- Operations team cannot view portfolio or manage products
- No risk to loan processing or repayment (API-driven)

---

### 2. GraphQL Server (`apps/graphql-server`)

**Technology:** NestJS (TypeScript)
**Port:** 3000
**Replicas:** 2–10 (depends on env)

**Responsibilities:**
- Primary API gateway for loan operations
- Code-first GraphQL (Apollo Server)
- Entity CRUD (tenants, customers, products, lenders)
- Loan request submission and state transitions
- Subscription streams (real-time updates)
- Audit log queries

**Modules Imported:**
- entity-service (customer, product, lender CRUD)
- process-engine (loan origination)
- repayment-service (schedule queries)
- notification-service (event publishing)
- settlement-service (revenue queries)
- reconciliation-service (ledger queries)
- integration-service (adapter status)
- recovery-service (collections queue)

**Dependencies:**
- PostgreSQL (primary)
- Redis (rate limiting, throttler storage, cache)
- All microservices (via imports, async event queue)

**Communication:**
- Inbound: HTTP (REST for health checks, WebSocket for subscriptions)
- Outbound: PostgreSQL, Redis, BullMQ (async events)

**Critical Paths:**
1. Loan origination: customer → loan request → scoring → offer → acceptance → disbursement
2. Repayment posting: payment → schedule lookup → allocation → settlement
3. Collections: overdue detection → collection queue → recovery strategy

**Failure Impact:**
- All frontend clients (admin portal, mobile) unable to submit loans
- No new originations, repayments, or customer queries
- Existing scheduled jobs continue (but no API access to check status)

**Dependency Chain:**
```
GraphQL Server
  ├─ PostgreSQL (schema: all tables)
  ├─ Redis (rate limiting, cache)
  ├─ Entity Service (customer CRUD, PII)
  ├─ Process Engine (scoring, approval logic)
  ├─ Repayment Service (schedules, allocations)
  ├─ Notification Service (event dispatch)
  ├─ Settlement Service (revenue calculations)
  ├─ Reconciliation Service (ledger queries)
  ├─ Integration Service (wallet status)
  └─ Recovery Service (collections queue)
```

---

### 3. REST Server (`apps/rest-server`)

**Technology:** NestJS (TypeScript)
**Port:** 3001
**Replicas:** 2–10

**Responsibilities:**
- Secondary API for integrations (webhook receivers, partner APIs)
- Webhook endpoints (wallet callbacks, bureau responses)
- Simple CRUD for limited integrations
- Health/status endpoints

**Modules Imported:**
- Same as GraphQL Server (via shared service modules)

**Dependencies:**
- PostgreSQL
- Redis
- All microservices

**Communication:**
- Inbound: HTTP (POST for webhooks, GET for health)
- Outbound: PostgreSQL, Redis, BullMQ

**Failure Impact:**
- External webhooks (wallet ACK, SMS delivery reports) fail to process
- Partner API integrations blocked
- Loan processing continues (no immediate impact)
- Repayment callbacks accumulate, causing reconciliation delays

---

### 4. Scheduler (`apps/scheduler`)

**Technology:** NestJS (TypeScript)
**Port:** 3002
**Replicas:** 1 (single instance, critical path)

**Responsibilities:**
- Cron jobs: interest accrual, aging classification, overdue detection
- Daily batch: reconciliation, settlement generation
- Penalty calculations and application
- Notification reminders (e.g., payment due notices)

**Modules Imported:**
- repayment-service (schedule processing)
- settlement-service (revenue generation)
- reconciliation-service (daily batch)
- notification-service (reminder dispatch)

**Dependencies:**
- PostgreSQL
- Redis (BullMQ for distributed task queue)
- Notification Service (async)

**Communication:**
- Outbound: PostgreSQL (RW), Redis (job queue), BullMQ (async events)
- Inbound: None (cron-driven)

**Schedule:**
- Interest accrual: daily 00:30 UTC
- Aging/overdue: daily 01:00 UTC
- Settlement batch: daily 02:00 UTC
- Reconciliation batch: daily 03:00 UTC
- Reminder notifications: hourly

**Failure Impact:**
- Interest not accrued (revenue loss)
- Overdue loans not classified (portfolio accuracy)
- Settlement not generated (payment reconciliation blocked)
- **Critical:** If scheduler down for >24 hours, operational integrity at risk

---

## Microservices

### 5. Entity Service (`services/entity-service`)

**Technology:** NestJS (TypeScript)
**Replicas:** 1 (library module, not standalone service)

**Responsibilities:**
- Tenant CRUD
- Customer CRUD (including PII: national_id, phone, full_name)
- Product CRUD
- Lender CRUD
- Role and permission management

**Database Tables:**
- `tenants`, `tenant_users`
- `customers`, `customer_relationships`
- `products`, `product_features`
- `lenders`, `lender_agreements`
- `roles`, `permissions`

**PII Handling:**
- Encrypts national_id, full_name, phone (AES-256-GCM)
- Field-level authorization (read:customer:sensitive role)

**Dependencies:**
- PostgreSQL (primary)
- Redis (cache, optional)

**Communication:**
- Called by: GraphQL, REST, Process Engine, Notification Service
- Outbound: PostgreSQL

**Failure Impact:**
- Customer creation/updates blocked
- All services cannot fetch customer data
- Cascades to loan origination, repayment, notifications

---

### 6. Process Engine (`services/process-engine`)

**Technology:** NestJS (TypeScript)
**Replicas:** 1 (library module)

**Responsibilities:**
- Loan request → disbursement pipeline orchestration
- Pre-qualification rules
- Credit scoring integration
- Approval logic
- Contract creation
- Offer generation and expiry

**Workflow:**
```
1. Loan Request Submission
   ├─ Pre-qualification (rules engine)
   ├─ Credit Scoring (scoring-service)
   ├─ Approval Decision (rules)
   ├─ Offer Generation
   └─ Offer Expiry (scheduler)

2. Offer Acceptance
   ├─ Contract Creation
   ├─ Customer Signature Verification
   └─ Event: contract.accepted

3. Disbursement
   ├─ Wallet Adapter Call (integration-service)
   ├─ Ledger Entry (double-entry)
   └─ Event: disbursal.completed
```

**Dependencies:**
- Entity Service (customer lookup)
- Scoring Service (credit score)
- Integration Service (disbursement)
- Notification Service (offer emails)
- PostgreSQL

**Communication:**
- Called by: GraphQL Server
- Outbound: Entity Service, Scoring Service, Integration Service, PostgreSQL

**Critical Path:**
Loan origination (highest priority):
```
Request → Qualification → Scoring → Approval → Offer → Acceptance → Disbursement
```

**Failure Impact:**
- No new loans can be originated
- Existing offers expire (economic loss)

---

### 7. Repayment Service (`services/repayment-service`)

**Technology:** NestJS (TypeScript)
**Replicas:** 1 (library module)

**Responsibilities:**
- Repayment schedule generation (amortization)
- Payment posting and waterfall allocation
- Overdue detection and aging
- Penalty calculation
- Principal/interest/fee separation

**Database Tables:**
- `repayment_schedules`
- `repayment_schedule_installments`
- `repayment_transactions`

**Algorithms:**
- Amortization schedule (banker's rounding, deterministic)
- Waterfall allocation: penalties → interest → principal
- Aging: 0–30, 31–60, 61–90, 90+ days

**Dependencies:**
- Entity Service (customer lookup)
- PostgreSQL (read/write)
- Redis (cache, optional)

**Communication:**
- Called by: GraphQL, REST, Scheduler, Settlement Service
- Outbound: PostgreSQL, Entity Service

**Critical Path:**
Repayment processing:
```
Payment → Lookup Schedule → Allocate Waterfall → Update Balance → Settlement
```

**Failure Impact:**
- Payments not posted (receivables not updated)
- Repayment schedules cannot be generated
- Settlement calculations blocked (no payment data)

---

### 8. Notification Service (`services/notification-service`)

**Technology:** NestJS (TypeScript)
**Replicas:** 1 (async worker, can scale via BullMQ)

**Responsibilities:**
- SMS dispatch (Africa's Talking, Twilio)
- Email dispatch
- Push notifications
- Notification logging and delivery tracking

**Adapters:**
- SMS: Africa's Talking, Twilio
- Email: SendGrid, SES
- Push: Firebase Cloud Messaging

**Channels:**
- Offer notifications (email/SMS)
- Payment due reminders (SMS)
- Repayment confirmation (email)
- Collection attempts (SMS/email)
- System alerts (email)

**Dependencies:**
- Entity Service (customer phone/email, encrypted)
- External SMS/Email providers (async)
- PostgreSQL (logging)
- Redis (BullMQ queue)

**Communication:**
- Inbound: BullMQ events (from all services)
- Outbound: PostgreSQL (logging), external APIs (SMS/email)

**Failure Impact:**
- Customers don't receive payment reminders (collections impact)
- Loan offers not communicated (legal compliance risk)
- Collection SMSs not sent (recovery delays)

---

### 9. Scoring Service (`services/scoring-service`)

**Technology:** Python FastAPI
**Port:** 8000
**Replicas:** 2–10

**Responsibilities:**
- Rule-based credit scoring (FR-CS-001)
- ML model inference (future: FR-CS-002)
- Pre-qualification logic
- Risk assessment

**Rules Engine:**
- Customer age, income, tenure
- Loan amount vs. income ratio
- Existing exposure
- Default risk estimation

**ML Service (Phase 5):**
- Feature engineering
- Gradient boosting model (XGBoost/LightGBM)
- Real-time inference

**Dependencies:**
- PostgreSQL (customer data lookups, optional)
- Redis (model cache, optional)
- External credit bureau (future)

**Communication:**
- Inbound: HTTP/gRPC from Process Engine
- Outbound: PostgreSQL (customer lookups), external bureau

**Failure Impact:**
- New loans cannot be scored
- Loan origination pipeline blocked
- Scoring request timeout should trigger fallback (conservative approval)

---

### 10. Settlement Service (`services/settlement-service`)

**Technology:** NestJS (TypeScript)
**Replicas:** 1 (library module)

**Responsibilities:**
- Revenue recognition calculations
- Settlement generation (daily/monthly)
- Interest income, fees income
- Lender payouts

**Database Tables:**
- `settlements`
- `settlement_ledger_lines`

**Workflow:**
```
Scheduler (daily 02:00 UTC)
  ├─ Query repayment transactions (24h window)
  ├─ Aggregate revenue by lender/product
  ├─ Apply accrual rules
  ├─ Create settlement record
  └─ Generate ledger entries (append-only)
```

**Dependencies:**
- Repayment Service (transaction data)
- PostgreSQL (settlement records, ledger)

**Communication:**
- Called by: Scheduler, GraphQL (query settlements)
- Outbound: PostgreSQL

**Failure Impact:**
- Settlement not generated (revenue tracking delayed)
- Lender payouts blocked (partner dissatisfaction)

---

### 11. Reconciliation Service (`services/reconciliation-service`)

**Technology:** NestJS (TypeScript)
**Replicas:** 1 (library module)

**Responsibilities:**
- Daily reconciliation batch
- Wallet balance verification
- Ledger integrity checks
- Discrepancy detection

**Workflow:**
```
Scheduler (daily 03:00 UTC)
  ├─ Fetch wallet balance from adapter
  ├─ Calculate expected balance from ledger
  ├─ Compare and flag discrepancies
  ├─ Alert if variance > threshold
  └─ Generate reconciliation report
```

**Dependencies:**
- Integration Service (wallet balance)
- PostgreSQL (ledger, reconciliation records)

**Communication:**
- Called by: Scheduler
- Outbound: Integration Service, PostgreSQL

**Failure Impact:**
- Daily reconciliation not run (wallet integrity unknown)
- Discrepancies not detected (operational risk)

---

### 12. Integration Service (`services/integration-service`)

**Technology:** NestJS (TypeScript)
**Replicas:** 1 (library module)

**Responsibilities:**
- Wallet adapters (MTN MoMo, M-Pesa, generic)
- Credit bureau integrations
- Telecom system APIs
- External API request/response handling
- Retry logic, circuit breaking

**Adapters:**
- Wallet: MTN MoMo, M-Pesa, mock (dev)
- Bureau: Equifax, TransUnion, mock (dev)
- Telecom: Africa's Talking, Twilio, mock (dev)

**Dependencies:**
- External APIs (async)
- PostgreSQL (logging)

**Communication:**
- Called by: Process Engine (disbursement), Repayment Service (payment verification), Reconciliation Service (balance check)
- Outbound: External APIs, PostgreSQL (logging)

**Failure Impact:**
- Disbursements blocked (loan money not sent)
- Payment verification fails (reconciliation impact)
- Bureau lookups timeout (scoring delayed)

---

### 13. Recovery Service (`services/recovery-service`)

**Technology:** NestJS (TypeScript)
**Replicas:** 1 (library module)

**Responsibilities:**
- Collections queue management
- AI-driven recovery strategy (Phase 5)
- Collections workflow orchestration
- Recovery KPI tracking

**Workflow:**
```
Scheduler (overdue detection)
  ├─ Identify loans > 30 days overdue
  ├─ Create collection queue item
  ├─ Assign strategy (contact → payment plan → escalate)
  └─ Notify recovery team via Admin Portal
```

**Dependencies:**
- PostgreSQL (collections queue, strategy logs)
- Notification Service (SMS/email dispatch)
- Integration Service (bureau escalation)

**Communication:**
- Called by: Scheduler (overdue → collection queue), Admin Portal (queue update)
- Outbound: PostgreSQL, Notification Service, Integration Service

**Failure Impact:**
- Collections queue not created (overdue loans not actioned)
- Recovery delays (bad debt increases)

---

## Infrastructure Dependencies

### 14. PostgreSQL Database

**Technology:** PostgreSQL 16+
**Configuration:** External RDS (production), Docker Compose (dev)
**Port:** 5432
**HA:** Multi-AZ in production, automated backups

**Databases:**
- `platform` schema (global: tenants, system config)
- Per-tenant schema (data isolation via RLS)

**Critical Tables:**
- `customers` (PII: encrypted national_id, phone, name)
- `loan_requests` (contract lifecycle)
- `repayment_schedules` (amortization)
- `ledger_entries` (append-only, double-entry)
- `audit_logs` (immutable)

**Dependencies:**
- All services (entity-service, process-engine, repayment-service, etc.)
- Backup: S3 (automated daily snapshots)

**Failure Impact:**
- **Critical:** All services lose data access
- Entire platform down (loan origination, repayment, operations)
- RTO: 5–10 min (failover to replica)

---

### 15. Redis

**Technology:** Redis 7+
**Configuration:** External ElastiCache (production), Docker Compose (dev)
**Port:** 6379
**HA:** Cluster mode with auto-failover in production

**Use Cases:**
- Rate limiting (Throttler)
- Cache (customer lookups, product catalogs)
- BullMQ message queue (async events)
- Session storage (JWT refresh tokens, TBD)

**Critical Queues (BullMQ):**
- `loan.origination` → Process Engine → Scoring Service
- `notification.dispatch` → Notification Service
- `settlement.generate` → Settlement Service
- `reconciliation.run` → Reconciliation Service

**Dependencies:**
- GraphQL Server (rate limiting, cache)
- REST Server (rate limiting, cache)
- All microservices (BullMQ queue)

**Failure Impact:**
- Rate limiting disabled (API vulnerable to abuse)
- Message queue stalls (async jobs accumulate)
- Cache misses (performance degradation)
- **Workaround:** Rebuild queue from database, restart services

---

### 16. Kubernetes Infrastructure

**Technology:** EKS (AWS)
**High Availability:** Multi-AZ, auto-scaling

**Core Components:**
- API Server (managed)
- etcd (managed)
- Control Plane (managed)
- Worker Nodes (auto-scaling groups)

**Networking:**
- NetworkPolicy (egress/ingress rules)
- Ingress (NGINX controller, load balancer)
- Service mesh (optional: Istio)

**Storage:**
- EBS volumes (database, logging)
- S3 (log archival, backups)

**Observability:**
- CloudWatch Logs (application logs)
- CloudWatch Metrics (CPU, memory, network)
- Prometheus (custom metrics, optional)

---

## Communication Patterns

### Synchronous (HTTP/gRPC)

| Caller | Callee | Protocol | Use Case | Timeout |
|--------|--------|----------|----------|---------|
| GraphQL Server | Entity Service | HTTP | Customer CRUD | 5s |
| GraphQL Server | Process Engine | HTTP | Loan origination | 30s |
| GraphQL Server | Repayment Service | HTTP | Schedule queries | 5s |
| Process Engine | Scoring Service | HTTP | Credit score | 10s |
| Process Engine | Integration Service | HTTP | Disbursement | 30s |
| Repayment Service | Entity Service | HTTP | Customer lookup | 5s |
| Reconciliation Service | Integration Service | HTTP | Wallet balance | 15s |

### Asynchronous (BullMQ)

| Producer | Consumer | Event | SLA |
|----------|----------|-------|-----|
| Process Engine | Notification Service | contract.created | 2h |
| Repayment Service | Settlement Service | repayment.received | 24h |
| Scheduler | Notification Service | reminder.due | 4h |
| Scheduler | Reconciliation Service | reconciliation.start | 12h |
| Recovery Service | Notification Service | collection.attempt | 2h |

---

## Critical Paths & SLOs

### Critical Path 1: Loan Origination

**Steps:**
1. Customer submits loan request (GraphQL)
2. Pre-qualification rules applied (Process Engine)
3. Credit score retrieved (Scoring Service)
4. Approval decision (Process Engine logic)
5. Offer generated and sent (Notification Service)
6. Customer accepts offer
7. Contract created
8. Disbursement executed (Integration Service)

**SLO:** P95 < 5s (end-to-end, excluding scoring)
**Scoring SLO:** P95 < 3s

**Failure points:**
- Scoring Service timeout → fallback to conservative approval
- Integration Service timeout → async retry (user notified)

**Recovery Time:** Automatic retry on failure; manual escalation if > 3 retries

---

### Critical Path 2: Repayment Processing

**Steps:**
1. Customer submits payment (mobile wallet or bank transfer)
2. Payment webhook received (REST Server)
3. Repayment schedule looked up (Repayment Service)
4. Waterfall allocation applied
5. Balance updated (PostgreSQL)
6. Settlement event emitted
7. Confirmation sent (Notification Service)

**SLO:** P95 < 2s (excluding external wallet)
**Daily Volume:** 10,000+ transactions

**Failure points:**
- Webhook receiver down → manual reconciliation catch-up
- Schedule lookup fails → payment held in staging area
- Allocation error → ledger integrity check flags (reconciliation)

---

### Critical Path 3: Daily Settlement

**Steps:**
1. Scheduler triggers settlement batch (02:00 UTC)
2. Query repayment transactions (24h window)
3. Aggregate revenue by lender/product
4. Create settlement record
5. Generate ledger entries
6. Emit settlement.completed event

**SLO:** Complete within 1 hour (02:00–03:00 UTC)

**Failure impact:**
- Delayed settlement (lender reporting delayed)
- Reconciliation batch runs before settlement (data inconsistency)

**Dependency Order:** Settlement must complete before Reconciliation

---

### Critical Path 4: Overdue Detection & Collections

**Steps:**
1. Scheduler detects loans > 30 days overdue (01:00 UTC)
2. Create collection queue items
3. Notify recovery team (Admin Portal)
4. Recovery team assigns strategy
5. Notifications sent (SMS/email)
6. Payment received → remove from queue

**SLO:** Detection < 1h, notification < 2h
**Daily Volume:** 100–1000 overdue accounts (env-dependent)

---

## Dependency Matrix

| Service | GraphQL | REST | Scheduler | Entity | Process | Repay | Notif | Settle | Reconcile | Integration | Recovery | Scoring |
|---------|---------|------|-----------|--------|---------|-------|-------|--------|-----------|-------------|----------|---------|
| **PostgreSQL** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| **Redis** | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Kubernetes** | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |
| **Entity Service** | ✓ | ✓ | ✗ | — | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Process Engine** | ✓ | ✓ | ✗ | ✓ | — | ✗ | ✓ | ✗ | ✗ | ✓ | ✗ | ✓ |
| **Repayment Service** | ✓ | ✓ | ✓ | ✓ | ✗ | — | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| **Notification Service** | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | — | ✗ | ✗ | ✗ | ✓ | ✗ |
| **Settlement Service** | ✓ | ✗ | ✓ | ✗ | ✗ | ✓ | ✗ | — | ✗ | ✗ | ✗ | ✗ |
| **Reconciliation Service** | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | — | ✓ | ✗ | ✗ |
| **Integration Service** | ✗ | ✗ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✓ | — | ✓ | ✗ |
| **Recovery Service** | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ | — | ✗ |
| **Scoring Service** | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | — |

Legend:
- ✓ = direct dependency (call or import)
- ✗ = no direct dependency
- — = service itself

---

## Failure Scenarios & Impact

### Scenario 1: PostgreSQL Down

**Trigger:** Database connection refused, replicas unavailable

**Immediate Impact:**
- All API requests fail (GraphQL, REST)
- Scheduler jobs fail on first DB query
- Message queue accumulates events (BullMQ still works)

**Timeline:**
- 0–5 min: AWS RDS failover (automatic, to replica)
- 5–15 min: Connection pools refresh, traffic resumes
- 15+ min: Manual intervention required

**Mitigation:**
- Pre-warmed replicas in standby
- CloudWatch alarm triggers SNS notification
- Runbook: `RUNBOOK-DATABASE-FAILOVER.md`

---

### Scenario 2: Redis Down

**Trigger:** ElastiCache cluster unavailable

**Immediate Impact:**
- Rate limiting disabled (all requests pass)
- BullMQ queue inaccessible (async jobs block)
- Cache misses (performance degradation)

**Workaround:**
- Restart affected services (they will rebuild queue from database)
- Monitor queue depth during recovery
- Manual retry of failed async jobs

**Mitigation:**
- Multi-AZ Redis cluster mode
- CloudWatch alarm on replication lag
- Temporary disk-based queue fallback (optional)

---

### Scenario 3: Scoring Service Down

**Trigger:** All pods crashed, startup failures

**Immediate Impact:**
- Loan origination blocked (scoring required)
- Requests timeout after 10s (fallback logic)

**Fallback:**
- Process Engine uses conservative approval rule (loan-to-income < 30%)
- Customers notified of "pending review" (manual approval)
- Recovery team escalates to underwriting

**Mitigation:**
- Multi-replica deployment (k8s auto-scaling)
- Readiness probes detect unhealthy pods
- Gradual rollout of new versions

---

### Scenario 4: Notification Service Overloaded

**Trigger:** Queue depth exceeds threshold, delivery lag > 2h

**Immediate Impact:**
- Payment due reminders delayed
- Offer notifications delayed (customer doesn't know about loan decision)

**Workaround:**
- Scale up notification workers (auto-scaling)
- Prioritize offer emails (higher SLA)
- Deprioritize low-priority reminders

**Mitigation:**
- Separate high/low priority queues
- Auto-scaling based on queue depth
- Dead-letter queue for failed deliveries

---

### Scenario 5: Scheduler Stopped

**Trigger:** Pod terminated, not restarting

**Immediate Impact:**
- No new interest accruals (after 24h, revenue lag visible)
- Overdue loans not detected (after 1h, collections delayed)
- No settlement generation (lender reports delayed)

**Recovery Time:**
- Manual pod restart: 2–5 min
- Job execution backfill: depends on which jobs missed

**Mitigation:**
- Single-replica scheduler with guaranteed restarts
- Pod disruption budgets (PDB)
- Manual trigger endpoint (for job backfill)

---

## Operational Runbooks

Reference these runbooks for common operational tasks:

| Task | Runbook |
|------|---------|
| Database failover | `RUNBOOK-DATABASE-FAILOVER.md` |
| Scaling services | `RUNBOOK-SCALING.md` |
| Incident response | `RUNBOOK-INCIDENT-RESPONSE.md` |
| Log investigation | `Docs/PII-MASKING-AUDIT.md` (log inspection section) |
| Deployment | `Docs/13-deployment.md` |
| Monitoring | `Docs/12-non-functional.md` |

---

## Monitoring & Alerting

### Key Metrics

| Metric | Threshold | Alert |
|--------|-----------|-------|
| GraphQL P95 latency | > 1s | Page on-call |
| Scoring service P95 latency | > 5s | Page on-call |
| Database connection pool utilization | > 80% | Warn |
| BullMQ queue depth (async jobs) | > 10,000 | Warn |
| Failed repayments (per hour) | > 10 | Page on-call |
| PII patterns in logs | > 0 | Page on-call (immediate) |
| Kubernetes node CPU utilization | > 80% | Trigger auto-scaling |
| PostgreSQL replica lag | > 1s | Page on-call |

### Dashboards

- **Operational Dashboard:** Key metrics (latency, error rates, queue depth)
- **Loan Origination Dashboard:** Requests/min, scoring time, approval rate
- **Repayment Dashboard:** Transactions/min, allocation errors, settlement lag
- **Infrastructure Dashboard:** Pod health, node capacity, database health

---

## References

- **Architecture Overview:** `Docs/00-overview.md`
- **Data Models:** `Docs/11-data-models.md`
- **API Specifications:** `Docs/07-api-specifications.md`
- **Deployment:** `Docs/13-deployment.md`
- **Security & Compliance:** `Docs/10-security-compliance.md`
- **Non-Functional Requirements:** `Docs/12-non-functional.md`
- **PII Masking:** `Docs/PII-MASKING-AUDIT.md`
