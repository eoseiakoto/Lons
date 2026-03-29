# Sprint 7 Brief — Hardening & Production Readiness (Final Sprint)

> **Sprint**: 7 of 7
> **Dates**: Jun 19 – Jun 30, 2026
> **Phase**: 6 — Hardening & Production Readiness
> **Deadline**: June 30, 2026 (firm)
> **Velocity ceiling**: ~65 story points
> **Prepared by**: PM (Claude) — Mar 28, 2026

---

## Sprint 7 Context

Sprint 7 is the **final sprint** before production launch. It transforms the platform from "runs locally" to "production-deployable with monitoring, security hardening, and CI/CD automation."

Sprint 6 delivered the core hardening features (webhook delivery, PII encryption, rate limiting, audit logging, GraphQL subscriptions, observability instrumentation, security headers, REST API completion). Sprint 7 completes the infrastructure, adds deployment automation, and resolves Sprint 6 deferrals.

**Capacity note**: Sprint 6 deferred ~15 items to Sprint 7. This brief triages all work into Must / Should / Post-Launch to stay within the ~65pt velocity ceiling.

**Capacity contingency (BA-approved)**: If infrastructure tasks (M2, M3) hit integration friction, shed Should-tier items in this order: S3 (OpenTelemetry, 5pts) first — debug tooling, not production-facing. Then S5 (Redis PubSub, 3pts) — in-memory PubSub works for single-instance launch scale. This provides an 8pt buffer before touching Must-tier work.

---

## Priority Triage

### MUST-HAVE (~40 pts) — Blocks production launch

| # | Task | Points | Rationale |
|---|------|--------|-----------|
| M1 | Dockerfiles for all services (extend multi-stage) | 3 | Root Dockerfile covers graphql-server + rest-server only. Need stages for scheduler, notification-service, process-engine, etc. |
| M2 | Kubernetes Helm charts | 8 | Zero Helm charts exist. Need charts for all services, ConfigMaps, Secrets, Ingress, service discovery. |
| M3 | CI/CD pipeline — deployment automation | 8 | Current GitHub Actions runs lint/test/build only. Need staging deploy, promotion to prod, rollback. |
| M4 | Full regression test suite & launch readiness | 8 | E2E test coverage across the full loan lifecycle. Final verification before production. |
| M5 | Redis-backed rate limiting + Retry-After header | 5 | Current in-memory ThrottlerModule resets on restart and doesn't share state across instances. Must use Redis store for production. Includes Retry-After header on 429 responses. |
| M6 | VaultKeyProvider implementation | 3 | Current PII encryption uses env-var keys directly. Need proper key management via HashiCorp Vault or cloud KMS adapter. |
| M7 | Password complexity wiring | 2 | `PasswordService.validateStrength()` exists but isn't called before hashing. Wire into registration/password-change flows. |
| M8 | BullMQ persistent webhook queue | 3 | Webhook delivery currently uses in-memory scheduling. Must use Redis-backed BullMQ for persistence across restarts. |

### SHOULD-HAVE (~25 pts) — Important, fit within capacity

| # | Task | Points | Rationale |
|---|------|--------|-----------|
| S1 | Performance optimization & load testing | 8 | Existing k6 script only tests health endpoints. Need business operation load tests (loan application, scoring, repayment) against documented SLA targets. |
| S2 | Monitoring stack — Prometheus + Grafana dashboards | 8 | MetricsInterceptor is instrumented but no Prometheus scrape config or Grafana dashboards exist. Need service dashboards, alerting rules. |
| S3 | OpenTelemetry instrumentation | 5 | Distributed tracing across services for production debugging. CorrelationIdMiddleware exists but no OTel exporter. |
| S4 | Audit log monthly partitioning + retention policy | 3 | Audit logs are append-only with no partitioning. Production volumes require monthly partitions and configurable retention. |
| S5 | Redis PubSub for GraphQL subscriptions | 3 | Current subscriptions use in-memory PubSub. Multi-instance deployment requires Redis PubSub adapter. |

### POST-LAUNCH (~18 pts) — Deferred past June 30

| # | Task | Points | Rationale |
|---|------|--------|-----------|
| P1 | MFA/TOTP for O&M Portal | 5 | Auth is secure (JWT RS256, account lockout, RBAC). MFA adds defense-in-depth but doesn't block launch. Schema fields (`mfaSecret`, `mfaEnabled`) are ready. |
| P2 | Documentation and operational runbooks | 5 | Important for ops handoff but doesn't block application deployment. Can be written in parallel post-launch. |
| P3 | EventBus audit subscriber | 2 | Audit logging works via interceptor. EventBus subscriber adds coverage for background events — enhancement, not gap. |
| P4 | @RateCategory decorator application | 2 | Rate limiting works with default tiers. Category-specific tiers are an optimization. |
| P5 | Tenant rate config mutation | 2 | Admin mutation to customize rate limits per tenant. Default limits are sufficient for launch. |
| P6 | Admin portal CSP refinement | 1 | Helmet with strict CSP is already applied. Fine-tuning directives is post-launch polish. |
| P7 | DB backup encryption | 3 | Operational infrastructure concern. Cloud-managed PostgreSQL typically handles backup encryption at the storage layer. |
| P8 | Connection lifecycle management (subscriptions) | 2 | WebSocket connection cleanup on disconnect. Current implementation works for moderate scale. |

---

## Detailed Task Specifications

### M1: Dockerfiles for All Services (3 pts)

**File to modify**: `Dockerfile` (root)

The existing multi-stage Dockerfile has stages for `graphql-server` and `rest-server`. Add additional final stages for:

- `scheduler` — `apps/scheduler`
- `notification-worker` — targets `services/notification-service` (webhook delivery processor, email dispatch)

Each stage should:
- Copy from the `builder` stage
- Set the correct `CMD` for the service entry point
- Expose the appropriate port
- Use non-root user (`node`)

Also verify the existing `services/scoring-service/Dockerfile` (Python) is production-ready:
- Uses `python:3.11-slim` (not 3.14)
- Has health check
- Runs as non-root

**Add** `docker-compose.prod.yml` alongside the existing dev compose file for production-like local testing with all services.

---

### M2: Kubernetes Helm Charts (8 pts)

**New directory**: `infrastructure/helm/lons/`

Create a Helm chart with templates for each deployable service:

```
infrastructure/helm/lons/
├── Chart.yaml
├── values.yaml              # Default values
├── values-staging.yaml      # Staging overrides
├── values-production.yaml   # Production overrides
└── templates/
    ├── _helpers.tpl
    ├── graphql-server/
    │   ├── deployment.yaml
    │   ├── service.yaml
    │   └── hpa.yaml
    ├── rest-server/
    │   ├── deployment.yaml
    │   ├── service.yaml
    │   └── hpa.yaml
    ├── scheduler/
    │   ├── deployment.yaml
    │   └── service.yaml
    ├── scoring-service/
    │   ├── deployment.yaml
    │   ├── service.yaml
    │   └── hpa.yaml
    ├── ingress.yaml
    ├── configmap.yaml
    ├── secrets.yaml
    ├── servicemonitor.yaml
    └── networkpolicy.yaml
```

Key requirements:
- All deployments use `imagePullPolicy: Always` for staging, tagged images for production
- Resource requests and limits defined for each service
- Liveness and readiness probes on `/health` endpoints
- HPA (Horizontal Pod Autoscaler) for API services: min 2, max 10, target CPU 70%
- NetworkPolicy restricting inter-service communication to required paths only
- ConfigMap for non-secret environment variables
- Sealed Secrets or ExternalSecrets for sensitive values (DATABASE_URL, JWT keys, ENCRYPTION_KEY)
- ServiceMonitor for Prometheus scraping
- Ingress with TLS termination (cert-manager annotation)
- Pod disruption budgets: minAvailable 1 for all services

---

### M3: CI/CD Pipeline — Deployment Automation (8 pts)

**File to modify**: `.github/workflows/ci.yml`
**New file**: `.github/workflows/deploy.yml`

#### Extend CI (`ci.yml`):
- Remove `|| true` from lint step (lint failures should fail the build)
- Add Docker image build + push to container registry (GitHub Container Registry)
- Add Trivy or Snyk container image scanning
- Add OWASP dependency check

#### New Deploy Workflow (`deploy.yml`):
- Triggers on merge to `main` → auto-deploy to staging
- Manual promotion: staging → production (with approval gate)
- Steps:
  1. Build Docker images (all services)
  2. Push to container registry with commit SHA tag
  3. Run Helm upgrade against staging cluster
  4. Run smoke tests against staging
  5. Wait for manual approval (GitHub environment protection)
  6. Helm upgrade against production (rolling update, zero-downtime)
  7. Post-deploy health check
  8. Automatic rollback on health check failure

#### Rollback:
- `helm rollback` on failed health checks
- Target: < 5 minute rollback time (NFR-CD-005)

---

### M4: Full Regression Test Suite & Launch Readiness (8 pts)

**New directory**: `tests/regression/`

End-to-end regression tests covering the complete loan lifecycle:

1. **Loan origination flow**: Create customer → pre-qualify → create loan request → score → approve → generate offer → accept offer → create contract → disburse
2. **Repayment flow**: Generate schedule → process payment → waterfall allocation → update balances → check payoff
3. **Overdue flow**: Miss payment → aging classification → penalty calculation → collection queue entry → recovery notification
4. **Settlement flow**: Revenue calculation → settlement generation → reconciliation batch
5. **Admin operations**: Product CRUD → customer search → contract view → audit log query
6. **Webhook delivery**: Register endpoint → trigger event → verify delivery → exhaust retries → verify exhaustion notification
7. **Multi-tenant isolation**: Verify tenant A cannot access tenant B data at API, subscription, and database levels
8. **Auth flows**: Login → JWT validation → token refresh → API key auth → WebSocket auth → rate limiting

Each test should:
- Use a dedicated test database (seeded per suite)
- Clean up after itself
- Be runnable in CI
- Report results in JUnit XML format

---

### M5: Redis-Backed Rate Limiting + Retry-After (5 pts)

**Files to modify**:
- `apps/graphql-server/src/guards/tenant-throttler.guard.ts`
- `apps/graphql-server/src/app.module.ts`
- `apps/rest-server/src/app.module.ts`

Replace the in-memory `ThrottlerModule` storage with `@nestjs/throttler`'s Redis storage:

```typescript
import { ThrottlerStorageRedisService } from '@nestjs/throttler/dist/throttler-storage-redis.service';
// Or use the community package: nestjs-throttler-storage-redis

ThrottlerModule.forRoot({
  throttlers: [{ ttl: 60000, limit: 100 }],
  storage: new ThrottlerStorageRedisService(redisClient),
})
```

**If `ThrottlerStorageRedisService` is not available in the installed version**, implement a custom `ThrottlerStorage` that uses the existing Redis connection from `@lons/common` or `ioredis`.

**Retry-After header**: When a 429 is returned, include `Retry-After: <seconds>` header indicating when the client can retry. Modify `TenantThrottlerGuard` to add this header in the `throwThrottlingException` override.

**Tenant-specific limits**: Read rate limit configuration from the `ServiceProvider` entity's settings. If no custom config exists, fall back to default tier limits:
- Standard: 100 req/min
- Premium: 500 req/min
- Enterprise: 2000 req/min

---

### M6: VaultKeyProvider Implementation (3 pts)

**File to create**: `packages/common/src/encryption/vault-key-provider.ts`
**File to modify**: `packages/common/src/encryption/key-provider.ts`

The current `createKeyProvider()` reads `ENCRYPTION_KEY` directly from `process.env`. Create a `VaultKeyProvider` class that:

1. On startup, fetches the encryption key from a configured key management service
2. Supports two backends (selected via `KEY_PROVIDER` env var):
   - `env` (default, current behavior) — reads from `ENCRYPTION_KEY` env var
   - `vault` — fetches from HashiCorp Vault at `VAULT_ADDR/v1/secret/data/lons/encryption`
3. Caches the key in memory after first fetch (with configurable TTL for rotation)
4. Exposes `getKey(): Promise<Buffer>` and `rotateKey(): Promise<void>`

For Sprint 7, the `vault` backend can use a mock/stub that reads from a local file (simulating Vault response), since we won't have a real Vault cluster in the dev environment. The interface must be production-ready.

---

### M7: Password Complexity Wiring (2 pts)

**File to modify**: `services/entity-service/src/auth/auth.service.ts` (or wherever user registration/password change is handled)

`PasswordService.validateStrength()` already exists with rules (12+ chars, mixed case, numbers, special chars). Wire it into:

1. User registration flow — call `validateStrength()` before `hashPassword()`
2. Password change/reset flow — call `validateStrength()` on the new password
3. Return a structured validation error if the password doesn't meet requirements:
   ```typescript
   { code: 'WEAK_PASSWORD', message: 'Password must be at least 12 characters...', details: { rules: [...failedRules] } }
   ```

---

### M8: BullMQ Persistent Webhook Queue (3 pts)

**Files to modify**:
- `services/notification-service/src/webhooks/webhook-delivery.processor.ts`
- `services/notification-service/src/notification-service.module.ts`

The webhook delivery processor currently uses `@Interval(30000)` to poll for retries. Replace with BullMQ:

1. Register a `BullModule.registerQueue({ name: 'webhook-delivery' })` in the notification service module
2. When a webhook delivery fails and retries remain, add a delayed job to the queue with exponential backoff
3. Create a `WebhookDeliveryConsumer` (using `@Processor('webhook-delivery')`) that processes retry jobs
4. Remove the `@Interval` polling approach
5. Configure the queue with Redis connection from environment

This ensures webhook retries survive service restarts and can be monitored via BullMQ dashboard.

---

### S1: Performance Optimization & Load Testing (8 pts)

**File to modify**: `scripts/load-test.js`
**New files**: `scripts/load-tests/` directory with scenario-specific scripts

Expand load testing to cover business operations:

1. **Loan application flow** (target: < 10s p95)
   - Authenticate → create loan request → wait for scoring → check result
2. **Repayment processing** (target: 500 txn/min)
   - Authenticate → submit payment → verify allocation
3. **GraphQL queries** (target: < 200ms p95)
   - Customer search, contract list, delivery logs with filters
4. **Concurrent tenant isolation** (target: 500 concurrent/tenant)
   - Multiple tenants hitting the API simultaneously, verify no cross-contamination

Use k6 with the existing `scripts/load-test.js` as the base. Output results in JSON for CI integration.

**Query optimization**: After load tests, identify slow queries via `pg_stat_statements` and add missing indexes or optimize N+1 patterns.

---

### S2: Monitoring Stack — Prometheus + Grafana (8 pts)

**New directory**: `infrastructure/monitoring/`

```
infrastructure/monitoring/
├── prometheus/
│   ├── prometheus.yml          # Scrape config for all services
│   └── alerting-rules.yml      # Alert rules
├── grafana/
│   ├── datasources.yaml        # Prometheus datasource
│   └── dashboards/
│       ├── api-overview.json   # Request rate, latency, error rate
│       ├── loan-pipeline.json  # Application → disbursement funnel
│       ├── repayments.json     # Payment volume, success rate
│       └── infrastructure.json # CPU, memory, pod count
└── docker-compose.monitoring.yml
```

Key alerts:
- Error rate > 5% for 5 minutes
- p99 latency > 2s for 10 minutes
- Pod restart count > 3 in 15 minutes
- Webhook delivery failure rate > 20%
- Database connection pool exhaustion
- Redis memory > 80%

The `MetricsInterceptor` already instruments all GraphQL/REST requests. Prometheus just needs a scrape target on each service's `/metrics` endpoint.

---

### S3: OpenTelemetry Instrumentation (5 pts)

**New file**: `packages/common/src/observability/tracing.ts`

Set up OpenTelemetry SDK with:
- Auto-instrumentation for HTTP, GraphQL, Prisma, Redis, BullMQ
- Exporter to Jaeger or Tempo (configurable via `OTEL_EXPORTER_OTLP_ENDPOINT`)
- Propagation of `correlationId` as trace baggage
- Sampling rate configurable via `OTEL_SAMPLING_RATE` (default 0.1 in production)

Wire into each service's `main.ts` bootstrap:
```typescript
import { initTracing } from '@lons/common';
initTracing({ serviceName: 'graphql-server' });
```

---

### S4: Audit Log Partitioning + Retention (3 pts)

**New migration**: Create PostgreSQL table partitioning on `audit_logs` by `created_at` (monthly range partitions).

```sql
-- Convert audit_logs to partitioned table
ALTER TABLE audit_logs RENAME TO audit_logs_old;
CREATE TABLE audit_logs (LIKE audit_logs_old INCLUDING ALL) PARTITION BY RANGE (created_at);

-- Create partitions for next 12 months
CREATE TABLE audit_logs_2026_06 PARTITION OF audit_logs FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
-- ... etc

-- Migrate existing data
INSERT INTO audit_logs SELECT * FROM audit_logs_old;

-- Add scheduled job to create future partitions and drop partitions older than retention period
```

Add a configurable `AUDIT_LOG_RETENTION_MONTHS` (default: 24) env var. The scheduler service should drop partitions older than the retention window.

---

### S5: Redis PubSub for GraphQL Subscriptions (3 pts)

**File to modify**: `apps/graphql-server/src/subscriptions/pubsub.provider.ts`

Replace in-memory `PubSub` with `RedisPubSub` from `graphql-redis-subscriptions`:

```typescript
import { RedisPubSub } from 'graphql-redis-subscriptions';
import Redis from 'ioredis';

export const PubSubProvider = {
  provide: 'PUB_SUB',
  useFactory: () => {
    return new RedisPubSub({
      publisher: new Redis(process.env.REDIS_URL),
      subscriber: new Redis(process.env.REDIS_URL),
    });
  },
};
```

This allows multiple GraphQL server instances to share subscription events.

---

## DO NOT Modify

- Any Sprint 1-5 business logic (entity CRUD, loan processing, repayments, settlements, reconciliation, admin portal, integrations, AI/ML scoring)
- Sprint 6 completed work (webhook delivery, PII encryption, rate limiting guards, audit interceptor, GraphQL subscriptions, REST controllers, security headers) — only extend, don't rewrite
- Prisma schema (no model changes this sprint — only migrations for partitioning)
- Scoring service Python code (no changes needed)

---

## Execution Order

Claude Code should execute in this order to manage dependencies:

1. **M1** (Dockerfiles) — prerequisite for M3 (CI/CD needs images to build)
2. **M7** (Password complexity) — quick win, no dependencies
3. **M5** (Redis rate limiting) — no infrastructure dependency
4. **M6** (VaultKeyProvider) — no infrastructure dependency
5. **M8** (BullMQ webhook queue) — no infrastructure dependency
6. **S5** (Redis PubSub) — no infrastructure dependency
7. **M2** (Helm charts) — depends on M1 (needs to know image names/ports)
8. **M3** (CI/CD) — depends on M1 + M2 (builds images, deploys charts)
9. **S2** (Monitoring) — can be parallel with M2/M3
10. **S3** (OpenTelemetry) — can be parallel with S2
11. **S4** (Audit partitioning) — standalone migration
12. **S1** (Load testing) — should run after all service changes are complete
13. **M4** (Regression suite) — final verification, run last

---

## Verification Checklist

After all tasks are complete:

- [ ] All Docker images build successfully: `docker build --target <service> .`
- [ ] Helm chart renders without errors: `helm template lons infrastructure/helm/lons/`
- [ ] CI pipeline passes with deployment steps (dry-run)
- [ ] Rate limiting uses Redis (verify with `redis-cli KEYS throttler:*`)
- [ ] Webhook retries survive service restart (kill process, restart, verify retry resumes)
- [ ] Password validation rejects weak passwords at registration/change endpoints
- [ ] VaultKeyProvider falls back to env-var provider gracefully
- [ ] Regression tests pass end-to-end
- [ ] Load tests meet SLA targets (< 200ms p95 reads, < 500ms p95 writes)
- [ ] Prometheus scrapes all services, Grafana dashboards render
- [ ] Audit log partitions created, old partition drop works
- [ ] GraphQL subscriptions work across multiple server instances (Redis PubSub)
