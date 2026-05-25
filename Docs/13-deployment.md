# 13 — Deployment & Infrastructure

This document defines the infrastructure, CI/CD pipeline, environment strategy, and operational requirements for deploying and running the Lōns platform.

---

## 1. Infrastructure Architecture

### 1.1 Overview

Lōns is deployed as a containerized microservice platform on cloud infrastructure, using Kubernetes for orchestration. The infrastructure supports multi-region deployment for latency and compliance requirements.

### 1.2 Compute

| ID | Requirement | Priority |
|---|---|---|
| NFR-INF-001 | All services SHALL be containerized using Docker with multi-stage builds for minimal image sizes. | Must |
| NFR-INF-002 | Container orchestration SHALL use Kubernetes (managed service: EKS, GKE, or AKS). | Must |
| NFR-INF-003 | Each microservice SHALL have configurable resource requests and limits (CPU, memory). | Must |
| NFR-INF-004 | Horizontal Pod Autoscaler (HPA) SHALL be configured for all stateless services. | Must |
| NFR-INF-005 | Node pools SHALL be separated by workload type: general (API services), compute-intensive (AI/ML scoring), and batch (reconciliation, reporting). | Should |

### 1.3 Data Stores

| Component | Technology | Configuration |
|---|---|---|
| Primary Database | PostgreSQL 16+ (managed) | Multi-AZ, streaming replication, automated backups |
| Cache | Redis 7+ (managed) | Cluster mode, persistence enabled |
| Message Queue | RabbitMQ or Redis Streams | Clustered, message persistence |
| Object Storage | S3-compatible (MinIO or cloud-native) | Versioned buckets, lifecycle policies |
| Search/Analytics | Elasticsearch or OpenSearch | For audit log search and analytics aggregation |

### 1.4 Networking

| ID | Requirement | Priority |
|---|---|---|
| NFR-NET-001 | Public traffic SHALL enter through a load balancer with TLS termination. | Must |
| NFR-NET-002 | Services SHALL communicate internally via Kubernetes service mesh or internal DNS. | Must |
| NFR-NET-003 | Database and cache instances SHALL be in private subnets, not accessible from the internet. | Must |
| NFR-NET-004 | A WAF (Web Application Firewall) SHALL protect public-facing endpoints. | Should |
| NFR-NET-005 | API Gateway (Kong, AWS API Gateway, or equivalent) SHALL handle: routing, authentication, rate limiting, and request/response transformation. | Must |

---

## 2. Environment Strategy

### 2.1 Environments

| Environment | Purpose | Data | Access |
|---|---|---|---|
| **Development** | Active development and unit testing | Synthetic/seed data | Development team |
| **Staging** | Integration testing, QA, UAT | Anonymized production-like data | Dev + QA teams |
| **Pre-Production** | Final validation before production release | Production mirror (anonymized) | Release team |
| **Production** | Live customer traffic | Real data | Operations team only |

### 2.2 Environment Requirements

| ID | Requirement | Priority |
|---|---|---|
| ID | Requirement | Priority |
|---|---|---|
| NFR-ENV-001 | All environments SHALL use identical container images — only configuration differs. | Must |
| NFR-ENV-002 | Environment-specific configuration SHALL be managed via environment variables and ConfigMaps/Secrets (never hardcoded). | Must |
| NFR-ENV-003 | Secrets (API keys, database credentials, encryption keys) SHALL be stored in a secrets manager (Vault, AWS Secrets Manager, or equivalent). | Must |
| NFR-ENV-004 | Production database credentials SHALL be rotated automatically on a configurable schedule. | Should |
| NFR-ENV-005 | Development and staging environments SHALL be resettable (teardown and rebuild from scratch) within 30 minutes. | Should |

### 2.3 Secrets bootstrap

Several application secrets are **required at boot** — missing any of them will allow services to start successfully but cause first-request failures (typically a generic 500 / "Internal server error" that masks the real cause). The application fails closed on these to prevent silent fallback to insecure defaults.

These secrets are per-environment. The value used in dev must NOT be reused in staging or prod, and vice versa.

| Variable | Purpose | Generate | Boot failure mode if missing | Rotation cost |
|---|---|---|---|---|
| `HASH_PEPPER` | HMAC-SHA-256 pepper for searchable PII hashes (`email_hash`, `tax_id_hash`, `national_id_hash`, `registration_number_hash`). Indexes the encrypted PII columns so equality lookups (e.g. login by email) work. Security Hardening SEC-5. | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | Login mutations throw `HASH_PEPPER environment variable is required for searchable hash computation`. Surfaces as a 500 to the user. | Invalidates **every** `*_hash` row. After rotation, run `pnpm tsx scripts/backfill-pii-hashes-and-encrypt.ts` to recompute all hash columns. Treat as long-lived per environment. |
| `ENCRYPTION_KEY` | AES-256-GCM key for at-rest PII encryption (encrypted columns: `email`, `national_id`, `phone`, full_name in some contexts). | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` | PrismaService boot succeeds; first encrypted-column write or read throws. | Requires re-encrypting every encrypted column. Same backfill script as `HASH_PEPPER`. |
| `ENCRYPTION_IV_LENGTH` | AES-GCM IV length. Always `16`. Documented for clarity. | (constant `16`) | First encryption operation throws. | N/A — don't change. |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | RS256 keypair for signing/verifying access + refresh + MFA tokens. Paths to PEM files. SEC-9. | `openssl genrsa -out keys/private.pem 2048 && openssl rsa -in keys/private.pem -pubout -out keys/public.pem` | In `NODE_ENV=production`, JwtService throws on boot if either path is unreadable (ephemeral keys forbidden in prod). In dev, falls back to an ephemeral keypair regenerated on every restart. | Invalidates every active access + refresh token. Plan a coordinated logout window. |

**Per-environment requirement.** Each environment (developer-laptop, CI, staging, pre-production, production) MUST hold an independent value for each of the above. Reusing a dev pepper or encryption key in staging or prod constitutes a security incident — the dev value lives in unencrypted `.env` files on developer laptops and in CI logs, which are not appropriate trust boundaries for staging/prod data.

**Onboarding a new developer:**
```bash
cp .env.example .env
# generate per-developer values for HASH_PEPPER and ENCRYPTION_KEY
node -e "console.log('HASH_PEPPER=' + require('crypto').randomBytes(32).toString('hex'))" >> .env
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))" >> .env
# generate the RSA keypair
mkdir -p keys
openssl genrsa -out keys/private.pem 2048
openssl rsa -in keys/private.pem -pubout -out keys/public.pem
# never commit any of this
```

**New secrets** introduced by future deliveries MUST be added to all three of:
1. `.env.example` with a generator-command comment and placeholder value
2. This table
3. The PR description "Migration Impact" section if the boot would fail without it (per `Docs/MIGRATION-PLAYBOOK.md` §6)

---

## 3. CI/CD Pipeline

### 3.1 Continuous Integration

| ID | Requirement | Priority |
|---|---|---|
| NFR-CI-001 | Every code push SHALL trigger: linting (ESLint/Prettier for TS, Ruff/Black for Python), unit tests, build verification (Docker image build), and security scanning (dependency vulnerabilities, SAST). | Must |
| NFR-CI-002 | Pull requests SHALL require: all CI checks passing, at least one code review approval, and no unresolved security findings (critical/high). | Must |
| NFR-CI-003 | CI pipeline SHALL complete in under 10 minutes. | Should |

### 3.2 Continuous Deployment

| ID | Requirement | Priority |
|---|---|---|
| NFR-CD-001 | Merges to the main branch SHALL trigger automatic deployment to the staging environment. | Must |
| NFR-CD-002 | Production deployments SHALL use a promotion model: staging → pre-production → production, with manual approval gate before production. | Must |
| NFR-CD-003 | Production deployments SHALL use rolling updates with zero downtime. | Must |
| NFR-CD-004 | The system SHALL support canary deployments — routing a percentage of traffic to the new version before full rollout. | Should |
| NFR-CD-005 | Rollback to the previous version SHALL be achievable within 5 minutes. | Must |

### 3.3 Database Migrations

| ID | Requirement | Priority |
|---|---|---|
| NFR-MIG-001 | Database schema changes SHALL be managed via versioned migration files (Prisma Migrate). | Must |
| NFR-MIG-002 | Migrations SHALL be backward-compatible — the previous application version must be able to operate with the new schema during rolling deployments. | Must |
| NFR-MIG-003 | Destructive migrations (column removal, table drop) SHALL go through a multi-step process: deprecate → stop using → remove (across separate deployments). | Must |
| NFR-MIG-004 | Migration execution time SHALL be monitored — long-running migrations must be optimized or run during maintenance windows. | Should |

**Operational procedure:** see `Docs/MIGRATION-PLAYBOOK.md` for the concrete pre-push checklist, local-dev pull procedure, staging/prod `migrate resolve --applied` runbook, environment-variable bootstrapping, helper commands, and troubleshooting. The playbook is the source of truth for *how* the above requirements are satisfied; this section defines *what* the requirements are.

---

## 4. Service Map

### 4.1 Microservices

| Service | Technology | Description | Scaling |
|---|---|---|---|
| `api-gateway` | Kong / NestJS | Request routing, auth, rate limiting | Horizontal |
| `graphql-server` | NestJS + Apollo | GraphQL API server | Horizontal |
| `rest-server` | NestJS | REST API server | Horizontal |
| `entity-service` | NestJS | SP, product, customer CRUD | Horizontal |
| `process-engine` | NestJS | Loan request → disbursement pipeline | Horizontal |
| `scoring-service` | Python (FastAPI) | Credit scoring (rule-based + ML) | Horizontal (GPU optional for ML) |
| `repayment-service` | NestJS | Repayment processing, schedule management | Horizontal |
| `recovery-service` | NestJS + Python | AI-driven recovery, collections | Horizontal |
| `settlement-service` | NestJS | Revenue calculation, settlement generation | Horizontal |
| `reconciliation-service` | NestJS | Daily reconciliation batch processing | Single instance (leader election) |
| `notification-service` | NestJS | Multi-channel notification dispatch | Horizontal |
| `integration-service` | NestJS | Wallet/telecom/bureau adapter management | Horizontal |
| `analytics-service` | NestJS / Python | Data aggregation, metrics computation | Horizontal |
| `admin-portal` | Next.js | O&M Portal web application | Horizontal |
| `scheduler` | NestJS (Bull) | Cron jobs: interest accrual, aging, reminders | Single instance (leader election) |

### 4.2 Shared Infrastructure

| Component | Purpose |
|---|---|
| PostgreSQL | Primary data store |
| Redis | Cache, session store, rate limiting, job queue backing |
| RabbitMQ | Event bus for inter-service messaging |
| MinIO / S3 | Document storage (KYC docs, reports, exports) |
| Elasticsearch | Audit log indexing and search |
| Prometheus + Grafana | Monitoring and dashboards |
| Jaeger / Tempo | Distributed tracing |
| Loki / ELK | Centralized logging |
| HashiCorp Vault | Secrets management |

---

## 5. Infrastructure as Code

| ID | Requirement | Priority |
|---|---|---|
| NFR-IAC-001 | All infrastructure SHALL be defined as code using Terraform (or Pulumi). | Must |
| NFR-IAC-002 | Kubernetes manifests SHALL use Helm charts for templating and versioning. | Must |
| NFR-IAC-003 | Infrastructure changes SHALL go through the same PR review process as application code. | Must |
| NFR-IAC-004 | Terraform state SHALL be stored remotely with state locking (S3 + DynamoDB or equivalent). | Must |

---

## 6. Operational Procedures

### 6.1 On-Call & Incident Management

| ID | Requirement | Priority |
|---|---|---|
| NFR-OPS-001 | A documented incident response procedure SHALL be established with severity levels (SEV1–SEV4) and corresponding response times. | Must |
| NFR-OPS-002 | Post-incident reviews SHALL be conducted for all SEV1 and SEV2 incidents. | Must |
| NFR-OPS-003 | Runbooks SHALL be maintained for common operational tasks: service restart, database failover, tenant provisioning, key rotation, and backup restoration. | Must |

### 6.2 Backup & Recovery

| ID | Requirement | Priority |
|---|---|---|
| NFR-BR-001 | Automated backups: PostgreSQL WAL archiving (continuous), daily full backups, Redis RDB snapshots (every 15 minutes). | Must |
| NFR-BR-002 | Backup retention: 30 days for daily backups, 12 months for monthly snapshots. | Must |
| NFR-BR-003 | Backup restoration SHALL be tested monthly in a non-production environment. | Should |

---

## 7. Project Repository Structure

```
lons/
├── apps/
│   ├── admin-portal/          # Next.js O&M Portal
│   ├── graphql-server/        # NestJS GraphQL API
│   ├── rest-server/           # NestJS REST API
│   └── scheduler/             # Cron job service
├── services/
│   ├── entity-service/
│   ├── process-engine/
│   ├── scoring-service/       # Python FastAPI
│   ├── repayment-service/
│   ├── recovery-service/
│   ├── settlement-service/
│   ├── reconciliation-service/
│   ├── notification-service/
│   ├── integration-service/
│   └── analytics-service/
├── packages/
│   ├── shared-types/          # Shared TypeScript types/interfaces
│   ├── common/                # Shared utilities, constants
│   ├── database/              # Prisma schema, migrations, seed
│   └── event-contracts/       # Event bus message schemas
├── infrastructure/
│   ├── terraform/             # Cloud infrastructure
│   ├── helm/                  # Kubernetes Helm charts
│   └── docker/                # Dockerfiles, docker-compose (local dev)
├── docs/                      # These requirement documents
├── turbo.json                 # Turborepo config (monorepo build orchestration)
├── package.json               # Root package.json
└── README.md
```

This monorepo structure uses Turborepo for build orchestration, ensuring consistent builds and efficient caching across all services.
