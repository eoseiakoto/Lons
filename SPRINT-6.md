# Sprint 6 — Phase 6: Hardening & Production Readiness

**Sprint:** 6 of 7
**Dates:** Jun 5 – Jun 18, 2026
**Total Story Points:** 65 (increased from 62 via BA feedback scope additions to Tasks 2, 4, 6, 7 — within demonstrated velocity of ~60-70pts)
**Phase Focus:** Phase 6 — Hardening & Production Readiness (core hardening; infrastructure/deployment deferred to Sprint 7)

---

## BA Review Changes (v2)

This brief incorporates feedback from the Business Analyst review:

1. **Task 1 (Webhooks):** Clarified exhausted-retry alerting path — SP operator notification via notification-service, not just event emission.
2. **Task 2 (PII Encryption):** Added `IKeyProvider` interface with `EnvKeyProvider` (dev) and `VaultKeyProvider` (production stub) per FR-SEC-006.2. Database backup encryption noted as Sprint 7 dependency.
3. **Task 4 (Audit Logging):** Added Platform Admin cross-tenant access tagging (FR-SEC-004.4/FR-SEC-008.3). Added hash chaining for audit log tamper protection. Sprint 7 duplicate item #11605426990 dropped (8pts freed).
4. **Task 6 (Observability):** Added Prisma slow query logging middleware (NFR-DB-004, threshold >1s). Expanded PII masking scope to cover Prisma query events, HTTP request/response bodies, and error stack traces.
5. **Task 7 (Security):** Added password complexity enforcement wiring (validation exists but not called in user creation). Added `rotateApiKey` mutation for API key rotation workflow (FR-AUTH-001.4). Account lockout confirmed already implemented.
6. **Sprint 7 updates:** Audit logging duplicate dropped (50pts → 42pts). MFA/TOTP implementation added (~5pts). Sprint 5 deferrals (network analysis, real-time monitoring, registerWebhook, fee-based recovery) accepted as post-launch backlog — all "Should" priority.

---

## Sprint Goals

1. Complete the webhook delivery system with retry logic, HMAC signing, and delivery log
2. Finish PII encryption at rest (AES-256-GCM field-level encryption, key management integration)
3. Wire rate limiting/throttling per tenant across all API endpoints
4. Build comprehensive audit logging with append-only store, cross-service event capture
5. Add GraphQL subscriptions for real-time events (WebSocket transport)
6. Implement observability stack: structured JSON logging, Prometheus metrics, distributed tracing
7. Harden security: CSP headers, CSRF protection, query complexity analysis, input validation audit

---

## Tasks

### Task 1: Webhook Delivery System
**Points:** 8 | **Priority:** Critical | **Service:** `notification-service`, `entity-service`

The current webhook infrastructure is ~20% complete — webhook events are defined in event-contracts but there is no delivery engine, retry mechanism, or delivery log. This task implements the full outbound webhook system per FR-WH-001 and FR-WH-002.

**Reference:** `Docs/07-api-specifications.md` §4 (FR-WH-001, FR-WH-002)

**Acceptance Criteria:**
- [ ] Webhook configuration CRUD in entity-service:
  - `WebhookEndpoint` Prisma model: `id`, `tenantId`, `url`, `events` (string[]), `authMethod` (enum: hmac, bearer, basic_auth), `secret` (encrypted), `active`, `createdAt`, `updatedAt`, `deletedAt`
  - GraphQL mutations: `createWebhookEndpoint`, `updateWebhookEndpoint`, `deleteWebhookEndpoint` (soft delete)
  - GraphQL query: `webhookEndpoints(tenantId)` with filtering by event type and active status
  - Idempotency key support on create mutation
- [ ] Webhook delivery engine in notification-service:
  - BullMQ job queue `webhook-delivery` — receives events from EventBus, fans out to matching tenant endpoints
  - Payload format: `{ event, timestamp, tenantId, data, webhookId }` per FR-WH-002.1
  - HMAC-SHA256 signing of payload body using tenant webhook secret (FR-WH-002.2)
  - `X-Webhook-Signature` header on every delivery
  - HTTP POST with 10-second timeout
- [ ] Retry with exponential backoff: 1 min → 5 min → 30 min → 2 hours → 12 hours (configurable per tenant) per FR-WH-002.3
- [ ] After all retries exhausted (FR-WH-002.4): log failure, emit `webhook.delivery_failed` event, **and trigger SP operator notification** via notification-service (email/SMS to SP admin contacts) — SPs must be proactively informed when they're missing events, not just have it logged
- [ ] `WebhookDeliveryLog` Prisma model: `id`, `webhookEndpointId`, `event`, `payload`, `httpStatus`, `responseBody` (truncated), `retryCount`, `status` (pending/delivered/failed), `createdAt`
- [ ] GraphQL query: `webhookDeliveryLogs(endpointId)` with pagination, filtering by status/event/date (FR-WH-002.5)
- [ ] Unit tests for HMAC signing, retry logic, fan-out matching
- [ ] Integration test: emit event → delivery attempted → log created

**New files:**
```
services/notification-service/src/webhooks/webhook-delivery.service.ts
services/notification-service/src/webhooks/webhook-delivery.processor.ts
services/notification-service/src/webhooks/webhook-signer.ts
services/notification-service/src/webhooks/webhook.resolver.ts
services/notification-service/src/webhooks/dto/webhook-endpoint.dto.ts
services/notification-service/src/webhooks/dto/webhook-delivery-log.dto.ts
services/notification-service/src/webhooks/__tests__/webhook-delivery.spec.ts
services/notification-service/src/webhooks/__tests__/webhook-signer.spec.ts
packages/database/prisma/migrations/XXXXXX_add_webhook_tables/migration.sql
```

**Files to modify:**
```
packages/database/prisma/schema.prisma                         # Add WebhookEndpoint + WebhookDeliveryLog models
packages/event-contracts/src/events.enum.ts                    # Add webhook.delivery_failed event
services/notification-service/src/notification-service.module.ts  # Register webhook providers
apps/graphql-server/src/graphql/resolvers/index.ts             # Register webhook resolver
```

---

### Task 2: PII Encryption at Rest
**Points:** 8 | **Priority:** Critical | **Service:** `packages/common`, `packages/database`, cross-service

Sprint 5 completed the Decimal migration for monetary fields. PII encryption is ~50% started — Prisma schema has the fields but no application-level AES-256-GCM encryption. This task implements field-level encryption for all PII per FR-SEC-006.

**Reference:** `Docs/10-security-compliance.md` §3 (FR-SEC-005, FR-SEC-006, FR-SEC-007)

**Acceptance Criteria:**
- [ ] Encryption utility in `packages/common/src/encryption/`:
  - `encrypt(plaintext: string, key: Buffer): { ciphertext: string, iv: string, tag: string }` — AES-256-GCM
  - `decrypt(ciphertext: string, iv: string, tag: string, key: Buffer): string`
  - Support for key rotation: `rotateEncryptedField(oldKey, newKey, ciphertext, iv, tag)` without downtime (FR-SEC-006.3)
- [ ] `IKeyProvider` interface for key management abstraction (FR-SEC-006.2, BA feedback):
  - `getKey(keyId?: string): Promise<Buffer>` — retrieve encryption key
  - `rotateKey(): Promise<{ newKeyId: string }>` — trigger key rotation
  - **`EnvKeyProvider`** implementation: reads `ENCRYPTION_KEY` from environment variable (dev/sandbox)
  - **`VaultKeyProvider`** implementation: stub that reads from HashiCorp Vault API (production path — stub returns env var but logs warning; real Vault integration is Sprint 7 infrastructure)
  - Factory pattern: `KeyProviderFactory` selects implementation based on `KEY_PROVIDER` env var (`env` | `vault`)
  - Note: Database backup encryption (FR-SEC-006.4) is an infrastructure concern deferred to Sprint 7 K8s/Helm task
- [ ] Prisma middleware or extension that automatically encrypts/decrypts designated fields on read/write:
  - Encrypted fields: `national_id`, `phone`, `email`, `date_of_birth`, `full_name` (when stored with national_id), KYC document references
  - Configuration: decorator or schema annotation marking which fields are encrypted
  - Transparent to service code — services read/write plaintext, middleware handles crypto
- [ ] PII masking utility (extend existing if present):
  - Phone: `+233***7890` — show country code + last 4
  - National ID: `GHA-***-XXX` — show prefix + last 3
  - Email: `a***@domain.com` — first char + domain
  - Used in all log outputs and API responses for unauthorized callers (FR-SEC-007.2)
- [ ] Migration script to encrypt existing plaintext PII data in place (idempotent, resumable)
- [ ] Environment variable validation: fail startup if `ENCRYPTION_KEY` not set in production
- [ ] Unit tests: encrypt/decrypt roundtrip, key rotation, masking formats
- [ ] Integration test: create customer with PII → verify DB stores ciphertext → read back plaintext

**New files:**
```
packages/common/src/encryption/aes-gcm.service.ts
packages/common/src/encryption/field-encryption.middleware.ts
packages/common/src/encryption/pii-masking.util.ts
packages/common/src/encryption/key-provider.interface.ts
packages/common/src/encryption/env-key.provider.ts
packages/common/src/encryption/vault-key.provider.ts
packages/common/src/encryption/key-provider.factory.ts
packages/common/src/encryption/__tests__/aes-gcm.spec.ts
packages/common/src/encryption/__tests__/field-encryption.spec.ts
packages/common/src/encryption/__tests__/pii-masking.spec.ts
packages/common/src/encryption/__tests__/key-provider.spec.ts
packages/database/prisma/migrations/XXXXXX_encrypt_existing_pii/migration.sql
scripts/encrypt-existing-pii.ts
```

**Files to modify:**
```
packages/database/prisma/schema.prisma                   # Annotate encrypted fields (comments or @map)
packages/common/src/index.ts                              # Export encryption utilities
services/entity-service/src/customer/customer.service.ts  # Integrate encryption middleware
services/entity-service/src/customer/customer.module.ts   # Register encryption provider
apps/graphql-server/src/graphql/resolvers/customer.resolver.ts  # Field-level auth for PII display
```

---

### Task 3: Rate Limiting & Throttling
**Points:** 5 | **Priority:** High | **Service:** `apps/graphql-server`, `apps/rest-server`, `packages/common`

Rate limiting is ~10% done — an API key guard exists but the NestJS ThrottlerModule is not wired. This task implements per-tenant, per-endpoint-category rate limiting per FR-RL-001 through FR-RL-004.

**Reference:** `Docs/07-api-specifications.md` §6 (FR-RL-001 through FR-RL-004)

**Acceptance Criteria:**
- [ ] Redis-backed rate limiter using `@nestjs/throttler` with custom storage (Redis):
  - Default limits per endpoint category: read ops 1000 req/min, write ops 200 req/min, scoring/qualification 100 req/min (FR-RL-001)
  - Rate limits resolved from tenant configuration — premium tenants can have higher limits (FR-RL-003)
  - Rate limit key: `{tenantId}:{apiKeyId}:{endpointCategory}`
- [ ] Rate limit headers on every response (FR-RL-004):
  - `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- [ ] HTTP 429 response with `Retry-After` header when limit exceeded (FR-RL-002)
- [ ] `@RateCategory(category)` decorator for NestJS resolvers/controllers to classify endpoints
- [ ] Apply to both GraphQL and REST servers
- [ ] Tenant rate limit configuration: stored in tenant settings, editable via GraphQL mutation by Platform Admin
- [ ] Unit tests for rate limit calculation, header generation, category classification
- [ ] Integration test: exceed limit → verify 429 → wait → verify recovery

**New files:**
```
packages/common/src/rate-limiting/redis-throttle.storage.ts
packages/common/src/rate-limiting/rate-category.decorator.ts
packages/common/src/rate-limiting/rate-limit-headers.interceptor.ts
packages/common/src/rate-limiting/tenant-rate-config.service.ts
packages/common/src/rate-limiting/__tests__/redis-throttle.spec.ts
packages/common/src/rate-limiting/__tests__/rate-limit-headers.spec.ts
```

**Files to modify:**
```
apps/graphql-server/src/app.module.ts          # Register ThrottlerModule with Redis storage
apps/rest-server/src/app.module.ts             # Register ThrottlerModule with Redis storage
apps/graphql-server/src/graphql/resolvers/*.ts  # Add @RateCategory decorators
apps/rest-server/src/controllers/*.ts           # Add @RateCategory decorators
packages/common/src/index.ts                    # Export rate-limiting utilities
```

---

### Task 4: Comprehensive Audit Logging
**Points:** 8 | **Priority:** Critical | **Service:** cross-service, `packages/common`, `packages/database`

Audit logging is ~40% done — the audit log Prisma model and basic audit service exist, but event capture is manual and inconsistent across services. This task implements comprehensive, automatic audit logging per FR-SEC-008.

**Reference:** `Docs/10-security-compliance.md` §4 (FR-SEC-008)

**Acceptance Criteria:**
- [ ] Audit event interceptor (NestJS interceptor) that automatically captures:
  - Authentication events: login, logout, failed attempts, MFA (FR-SEC-008.1)
  - Data access events: who viewed which customer records
  - Data modification events: before/after values for all entity mutations
  - Configuration changes: product, tenant, user, role modifications
  - Financial events: disbursement, repayment, settlement, write-off
  - API key management: creation, rotation, revocation
  - Administrative actions: user creation, role assignment, blacklist management
- [ ] Each audit entry includes all required fields (FR-SEC-008.2):
  - `eventId` (UUID), `timestamp` (UTC, microsecond precision), `actor` (userId or service name), `actorIp`, `tenantId`, `actionType`, `resourceType`, `resourceId`, `beforeValue` (JSONB), `afterValue` (JSONB), `correlationId`
- [ ] Append-only storage (FR-SEC-008.3):
  - PostgreSQL table with `INSERT`-only permissions (no UPDATE/DELETE grants for application role)
  - Separate audit schema or database role restriction
- [ ] Platform Admin cross-tenant access logging (FR-SEC-004.4/FR-SEC-008.3, BA feedback):
  - Each audit entry includes `accessType` field: `'tenant_scoped'` (normal) or `'platform_admin_cross_tenant'` (Platform Admin accessing tenant data)
  - Platform Admin entries include the admin's home tenant + target tenant in the audit record
  - Separate queryable dimension for compliance reporting — regulators expect privileged access tracked distinctly
- [ ] Audit log tamper protection (BA feedback — fintech compliance):
  - Hash chaining: each audit entry includes `previousHash` field (SHA-256 of previous entry's `eventId + timestamp + actionType + resourceId + previousHash`)
  - Integrity verification utility: `verifyAuditChain(startDate, endDate): { valid: boolean, brokenAt?: eventId }`
  - Combined with INSERT-only DB grants, this ensures silent deletion/modification is detectable
- [ ] Configurable retention: minimum 7 years (FR-SEC-008.4) — partition by month for performance
- [ ] GraphQL query: `auditLogs(filters)` — filterable by actor, resource, action, date range, tenant
  - Only accessible to SP Auditor and Platform Admin roles
- [ ] Cross-service integration: EventBus subscriber that captures audit events emitted from any service
- [ ] Unit tests for interceptor, before/after diff capture, field masking of PII in audit entries
- [ ] Integration test: perform mutation → verify audit entry created with correct before/after

**New files:**
```
packages/common/src/audit/audit-event.interceptor.ts
packages/common/src/audit/audit-event.emitter.ts
packages/common/src/audit/audit-diff.util.ts
packages/common/src/audit/audit.constants.ts
packages/common/src/audit/__tests__/audit-event.interceptor.spec.ts
packages/common/src/audit/__tests__/audit-diff.spec.ts
services/entity-service/src/audit/audit-log.resolver.ts
services/entity-service/src/audit/dto/audit-log-filter.dto.ts
packages/database/prisma/migrations/XXXXXX_audit_log_partitioning/migration.sql
```

**Files to modify:**
```
packages/database/prisma/schema.prisma                    # Refine AuditLog model, add partitioning
packages/common/src/index.ts                               # Export audit utilities
apps/graphql-server/src/app.module.ts                      # Register audit interceptor globally
apps/rest-server/src/app.module.ts                         # Register audit interceptor globally
services/entity-service/src/entity-service.module.ts       # Register audit resolver
packages/event-contracts/src/events.enum.ts                # Add audit.entry_created event
```

---

### Task 5: GraphQL Subscriptions (Real-Time)
**Points:** 5 | **Priority:** High | **Service:** `apps/graphql-server`

GraphQL subscriptions are ~5% complete — Apollo Server is configured but no PubSub or WebSocket transport exists. This task implements real-time subscriptions per FR-GQL-003.

**Reference:** `Docs/07-api-specifications.md` §2.1 (FR-GQL-003)

**Acceptance Criteria:**
- [ ] WebSocket transport using `graphql-ws` protocol (FR-GQL-003.1):
  - Apollo Server subscription plugin with `graphql-ws` library
  - WebSocket authentication: validate JWT from connection params
  - Tenant scoping: clients only receive events for their tenant (FR-GQL-003.2)
- [ ] Redis-backed PubSub (`graphql-redis-subscriptions`):
  - Channel pattern: `{tenantId}:{eventType}` for tenant isolation
  - Scales horizontally across multiple GraphQL server instances
- [ ] Subscription resolvers for (FR-GQL-001.3):
  - `loanRequestStateChanged(productId?)` — filter by product optional (FR-GQL-003.3)
  - `contractStateChanged(productId?)`
  - `repaymentReceived(contractId?)`
  - `alertTriggered(severity?)`
  - `reconciliationExceptionCreated`
- [ ] EventBus → PubSub bridge: subscriber that listens to relevant domain events and publishes to Redis PubSub
- [ ] Connection lifecycle management: heartbeat, reconnection handling, max connections per tenant
- [ ] Unit tests for tenant filtering, auth validation, PubSub bridge
- [ ] Integration test: emit domain event → subscription receives real-time update

**New files:**
```
apps/graphql-server/src/subscriptions/pubsub.provider.ts
apps/graphql-server/src/subscriptions/subscription-auth.guard.ts
apps/graphql-server/src/subscriptions/event-pubsub.bridge.ts
apps/graphql-server/src/subscriptions/loan-request.subscription.ts
apps/graphql-server/src/subscriptions/contract.subscription.ts
apps/graphql-server/src/subscriptions/repayment.subscription.ts
apps/graphql-server/src/subscriptions/alert.subscription.ts
apps/graphql-server/src/subscriptions/reconciliation.subscription.ts
apps/graphql-server/src/subscriptions/__tests__/subscription-auth.spec.ts
apps/graphql-server/src/subscriptions/__tests__/event-pubsub-bridge.spec.ts
```

**Files to modify:**
```
apps/graphql-server/src/app.module.ts                # Register subscription module, PubSub provider
apps/graphql-server/package.json                     # Add graphql-ws, graphql-redis-subscriptions
apps/graphql-server/src/main.ts                      # Enable WebSocket transport
```

---

### Task 6: Observability Stack
**Points:** 8 | **Priority:** High | **Service:** cross-service, `packages/common`

Observability is ~20% done — basic console logging exists across services but no structured JSON logging, no Prometheus metrics, and no distributed tracing. This task implements the full observability stack per NFR-MO, NFR-LG, NFR-TR, and NFR-AL.

**Reference:** `Docs/12-non-functional.md` §4 (NFR-MO-001 through NFR-TR-003)

**Acceptance Criteria:**
- [ ] Structured JSON logging (NFR-LG-001):
  - Replace console.log with Winston or Pino logger configured for JSON output
  - Every log entry includes: `timestamp`, `service`, `level`, `correlationId`, `tenantId`, `message`
  - Log levels: error, warn, info, debug (configurable via `LOG_LEVEL` env var)
  - PII masking hook: automatically masks sensitive fields before logging (NFR-LG-004)
  - PII masking must cover ALL log sources (BA feedback — CLAUDE.md absolute rule): Prisma query events (WHERE clauses may contain PII), HTTP request/response bodies, error stack traces (which may embed PII from variables). Use existing `maskPII()` from `packages/common/src/masking/pii-masker.ts`
  - Shared `LoggerModule` in `packages/common` — importable by all services
- [ ] Prisma slow query logging (NFR-DB-004, BA feedback):
  - Prisma `$use` middleware that measures query duration
  - Queries exceeding threshold (configurable via `SLOW_QUERY_THRESHOLD_MS` env var, default: 1000ms) logged at `warn` level with query details (table, operation, duration — PII masked)
  - Prometheus histogram: `prisma_query_duration_seconds` (labels: model, operation)
- [ ] Prometheus metrics (NFR-MO-001):
  - `/metrics` endpoint on every NestJS service exposing:
    - `http_requests_total` (counter, labels: method, route, status)
    - `http_request_duration_seconds` (histogram, labels: method, route)
    - `http_request_errors_total` (counter, labels: method, route, error_code)
    - Custom business metrics (NFR-MO-002): `loan_applications_total`, `disbursement_amount_total`, `repayment_amount_total`, `approval_rate`
  - NestJS interceptor for automatic HTTP metric collection
  - Prometheus client: `prom-client`
- [ ] Correlation ID propagation (NFR-TR-002):
  - Middleware that reads or generates `X-Correlation-ID` header on incoming requests
  - Propagated through all downstream service calls and EventBus messages
  - Included in all log entries and audit records
- [ ] OpenTelemetry tracing (NFR-TR-001, NFR-TR-003):
  - Basic OpenTelemetry SDK setup with trace ID propagation
  - Exportable to Jaeger/Tempo (configurable via env var `OTEL_EXPORTER_ENDPOINT`)
  - Auto-instrumentation for HTTP, PostgreSQL, Redis, BullMQ
  - `ENABLE_TRACING` env var to toggle (default off in dev)
- [ ] Health check endpoints: `GET /health` on every service (liveness + readiness)
- [ ] Unit tests for logger configuration, metric recording, correlation ID propagation

**New files:**
```
packages/common/src/observability/logger.module.ts
packages/common/src/observability/logger.service.ts
packages/common/src/observability/metrics.module.ts
packages/common/src/observability/metrics.service.ts
packages/common/src/observability/metrics.interceptor.ts
packages/common/src/observability/correlation-id.middleware.ts
packages/common/src/observability/tracing.module.ts
packages/common/src/observability/tracing.setup.ts
packages/common/src/observability/health.controller.ts
packages/common/src/observability/__tests__/logger.spec.ts
packages/common/src/observability/__tests__/metrics.spec.ts
packages/common/src/observability/__tests__/correlation-id.spec.ts
```

**Files to modify:**
```
packages/common/src/index.ts                          # Export observability modules
packages/common/package.json                          # Add winston/pino, prom-client, @opentelemetry/*
apps/graphql-server/src/app.module.ts                 # Import LoggerModule, MetricsModule, TracingModule
apps/rest-server/src/app.module.ts                    # Import LoggerModule, MetricsModule, TracingModule
services/entity-service/src/entity-service.module.ts  # Import observability modules
services/process-engine/src/process-engine.module.ts  # Import observability modules
services/repayment-service/src/repayment-service.module.ts  # Import observability modules
services/notification-service/src/notification-service.module.ts  # Import observability modules
services/recovery-service/src/recovery-service.module.ts  # Import observability modules
services/settlement-service/src/settlement-service.module.ts  # Import observability modules
services/reconciliation-service/src/reconciliation-service.module.ts  # Import observability modules
services/integration-service/src/integration-service.module.ts  # Import observability modules
apps/scheduler/src/scheduler.module.ts                # Import observability modules
```

---

### Task 7: Security Hardening
**Points:** 5 | **Priority:** High | **Service:** `apps/graphql-server`, `apps/rest-server`, `apps/admin-portal`

Security is ~45% done — JWT auth, RBAC, helmet middleware exist, but CSP headers are incomplete, CSRF protection is missing, GraphQL query complexity is not enforced, and input validation needs auditing. This task hardens the platform per FR-SEC-012 through FR-SEC-017.

**Reference:** `Docs/10-security-compliance.md` §6 (FR-SEC-012 through FR-SEC-017)

**Acceptance Criteria:**
- [ ] Content Security Policy (CSP) for admin portal (FR-SEC-014):
  - Strict CSP headers via helmet configuration
  - `script-src 'self'`, `style-src 'self' 'unsafe-inline'` (for CSS-in-JS), `img-src 'self' data:`, `connect-src 'self' {api-url}`
  - Report-only mode initially, switch to enforce after validation
- [ ] CSRF protection (FR-SEC-015):
  - CSRF token middleware for admin portal (cookie-to-header pattern)
  - All state-changing admin portal requests include CSRF token
  - REST API excluded (uses API key auth, not cookies)
- [ ] GraphQL query complexity analysis (FR-GQL-002.3):
  - `graphql-query-complexity` plugin for Apollo Server
  - Configurable maximum query cost (default: 1000)
  - Depth limiting (default: 10 levels) (FR-GQL-002.2)
  - Cost calculation: field weights + multiplier for list/connection fields
  - Reject queries exceeding complexity with descriptive error
- [ ] Input validation audit:
  - Verify all GraphQL inputs use `class-validator` decorators
  - Verify all REST inputs have validation pipes
  - Add missing validations: string length limits, enum validation, date format validation
  - SQL injection prevention: verify all Prisma queries use parameterized inputs (no raw SQL without escaping)
  - XSS prevention: sanitize HTML in any user-provided text fields (notes, descriptions)
- [ ] Password complexity enforcement wiring (FR-SEC-001.2, BA feedback):
  - `PasswordService.validateStrength()` already exists (12+ chars, mixed case, digit, special char) but is **not called during user creation**
  - Wire validation into `UserService.create()`, `PlatformUserService.create()`, and all password-change flows
  - Return clear validation error messages listing which requirements are unmet
- [ ] API key rotation workflow (FR-AUTH-001.4, BA feedback):
  - GraphQL mutation: `rotateApiKey(apiKeyId, name?)` — creates new key, returns plaintext once, old key remains active for grace period
  - Grace period configurable (default: 24 hours) — old key marked `deprecatedAt`, still valid until `expiresAt` = `deprecatedAt + gracePeriod`
  - `revokeApiKey(apiKeyId)` mutation for immediate revocation
  - Schema already supports multiple active keys per tenant (`@@unique([tenantId, name])`)
- [ ] IP whitelisting for API access (FR-SEC-016):
  - Optional per-tenant IP whitelist stored in tenant config
  - NestJS guard that checks request IP against whitelist (if configured)
  - Bypass for admin portal (separate auth flow)
- [ ] Unit tests for CSP header validation, CSRF flow, query complexity rejection, IP whitelist guard

**New files:**
```
packages/common/src/security/csrf.middleware.ts
packages/common/src/security/ip-whitelist.guard.ts
packages/common/src/security/query-complexity.plugin.ts
packages/common/src/security/input-sanitizer.util.ts
packages/common/src/security/__tests__/csrf.spec.ts
packages/common/src/security/__tests__/ip-whitelist.spec.ts
packages/common/src/security/__tests__/query-complexity.spec.ts
packages/common/src/security/__tests__/input-sanitizer.spec.ts
```

**Files to modify:**
```
apps/graphql-server/src/app.module.ts           # Register query complexity plugin, IP whitelist guard
apps/rest-server/src/app.module.ts              # Register IP whitelist guard
apps/admin-portal/next.config.js                # CSP headers configuration
apps/admin-portal/src/middleware.ts              # CSRF token middleware
packages/common/src/index.ts                     # Export security utilities
```

---

### Task 8: REST API Completion & OpenAPI
**Points:** 8 | **Priority:** High | **Service:** `apps/rest-server`

The REST API is ~70% done — basic endpoints exist but are incomplete. Several critical endpoints are missing, and there is no OpenAPI specification. This task completes the REST API per FR-REST-001 and FR-REST-002.

**Reference:** `Docs/07-api-specifications.md` §3 (FR-REST-001, FR-REST-002)

**Acceptance Criteria:**
- [ ] Complete all required REST endpoints (FR-REST-001.1):
  - `POST /v1/loan-requests` — create a loan request (verify or add)
  - `POST /v1/loan-requests/{id}/accept` — accept offer (verify or add)
  - `POST /v1/repayments` — record a repayment (verify or add)
  - `GET /v1/customers/{id}/credit-summary` — get credit summary (add if missing)
  - `GET /v1/contracts/{id}` — get contract details (verify or add)
  - `GET /v1/health` — health check (verify or add)
- [ ] Consistent envelope format on all responses (FR-REST-001.2):
  - `{ "data": {...}, "meta": { "requestId": "...", "timestamp": "..." }, "errors": [...] }`
  - NestJS interceptor to wrap all responses automatically
- [ ] Structured error responses (FR-REST-001.3):
  - `{ "code": "INSUFFICIENT_CREDIT_LIMIT", "message": "...", "details": {...} }`
  - Global exception filter mapping application errors to HTTP status codes
  - Standard HTTP status codes (400, 401, 403, 404, 409, 422, 429, 500)
- [ ] OpenAPI 3.1 specification (FR-REST-002.1, FR-REST-002.2):
  - Auto-generated from NestJS decorators using `@nestjs/swagger`
  - All endpoints documented with request/response schemas, error codes, auth requirements
  - Swagger UI available at `/api/docs` in development/staging (FR-REST-002.3)
- [ ] Apply idempotency key pattern on all POST endpoints
- [ ] Tenant-scoped: all endpoints resolve tenant from API key or JWT
- [ ] Unit tests for response envelope, error formatting, idempotency
- [ ] Integration test: full REST request lifecycle (create loan request → accept → repay)

**New files:**
```
apps/rest-server/src/interceptors/response-envelope.interceptor.ts
apps/rest-server/src/filters/http-exception.filter.ts
apps/rest-server/src/controllers/customer.controller.ts        # If missing
apps/rest-server/src/controllers/contract.controller.ts        # If missing
apps/rest-server/src/controllers/health.controller.ts
apps/rest-server/src/dto/common-response.dto.ts
apps/rest-server/src/__tests__/response-envelope.spec.ts
apps/rest-server/src/__tests__/http-exception-filter.spec.ts
apps/rest-server/src/__tests__/rest-e2e.spec.ts
```

**Files to modify:**
```
apps/rest-server/src/main.ts                          # Swagger setup, global filters/interceptors
apps/rest-server/src/app.module.ts                    # Register new controllers
apps/rest-server/src/controllers/loan-request.controller.ts  # Add missing endpoints, decorators
apps/rest-server/src/controllers/repayment.controller.ts     # Add missing endpoints, decorators
apps/rest-server/package.json                          # Add @nestjs/swagger
```

---

### Task 9: Sprint 6 Integration Tests & Verification
**Points:** 7 | **Priority:** High | **Service:** cross-service

End-to-end verification that all Sprint 6 hardening features work together correctly.

**Acceptance Criteria:**
- [ ] Webhook E2E test: create webhook endpoint → trigger loan state change → verify delivery + log + HMAC signature
- [ ] PII encryption E2E test: create customer with PII → verify encrypted in DB → read back decrypted → verify masked in logs
- [ ] Rate limiting E2E test: send requests exceeding limit → verify 429 + headers → wait for reset → verify resumed
- [ ] Audit logging E2E test: perform CRUD operations → verify audit entries with before/after → verify append-only (attempt update → fails)
- [ ] Subscription E2E test: open WebSocket → create loan request → verify subscription fires → close connection
- [ ] Observability E2E test: make API calls → verify Prometheus /metrics endpoint returns counters → verify correlation ID in logs
- [ ] Security E2E test: send overly complex GraphQL query → verify rejection → test CSRF flow → test IP whitelist
- [ ] REST API E2E test: full lifecycle via REST (create loan → accept → repay → get summary) → verify envelope format
- [ ] All existing Sprint 1-5 tests continue to pass (regression)

**New files:**
```
tests/e2e/webhook-delivery.e2e-spec.ts
tests/e2e/pii-encryption.e2e-spec.ts
tests/e2e/rate-limiting.e2e-spec.ts
tests/e2e/audit-logging.e2e-spec.ts
tests/e2e/graphql-subscriptions.e2e-spec.ts
tests/e2e/observability.e2e-spec.ts
tests/e2e/security-hardening.e2e-spec.ts
tests/e2e/rest-api-lifecycle.e2e-spec.ts
```

---

## Execution Order

Tasks should be implemented in the following waves to respect dependencies:

### Wave 1 — Foundations (can run in parallel)
- **Task 2: PII Encryption** — shared encryption utility needed by other tasks for PII masking
- **Task 6: Observability** — shared logger/metrics modules needed by all services
- **Task 4: Audit Logging** — interceptor used globally once available

### Wave 2 — API Hardening (depends on Wave 1 observability)
- **Task 3: Rate Limiting** — uses Redis, benefits from observability metrics
- **Task 7: Security Hardening** — depends on nothing, but benefits from structured logging
- **Task 5: GraphQL Subscriptions** — depends on nothing, but PubSub uses Redis

### Wave 3 — Features (depends on Wave 1 for logging/metrics)
- **Task 1: Webhook Delivery** — uses EventBus, benefits from observability + audit
- **Task 8: REST API Completion** — benefits from audit interceptor + rate limiting

### Wave 4 — Verification
- **Task 9: Integration Tests** — must run after all other tasks complete

---

## Appendix A: Event Contracts (New)

```typescript
// packages/event-contracts/src/events.enum.ts (additions)

// Webhook events
'webhook.delivery_attempted'    // { webhookEndpointId, event, httpStatus }
'webhook.delivery_failed'       // { webhookEndpointId, event, retryCount, lastError }
'webhook.delivery_succeeded'    // { webhookEndpointId, event, httpStatus }

// Audit events
'audit.entry_created'           // { eventId, actionType, resourceType, resourceId }

// Subscription bridge events (internal — EventBus → PubSub)
// These reuse existing domain events:
'loan_request.state_changed'    // already exists
'contract.state_changed'        // already exists
'repayment.received'            // already exists
'alert.triggered'               // already exists
'reconciliation.exception_created'  // already exists
```

---

## Appendix B: Key Interfaces & Types

```typescript
// services/notification-service/src/webhooks/webhook-signer.ts
interface WebhookSignatureResult {
  signature: string;       // HMAC-SHA256 hex digest
  timestamp: number;       // Unix timestamp included in signing payload
  signedPayload: string;   // `${timestamp}.${JSON.stringify(body)}`
}

// packages/common/src/encryption/aes-gcm.service.ts
interface EncryptionResult {
  ciphertext: string;      // Base64-encoded
  iv: string;              // Base64-encoded (16 bytes)
  authTag: string;         // Base64-encoded (16 bytes)
}

// packages/common/src/encryption/key-provider.interface.ts (BA feedback)
interface IKeyProvider {
  getKey(keyId?: string): Promise<Buffer>;
  rotateKey(): Promise<{ newKeyId: string }>;
  getCurrentKeyId(): string;
}

// packages/common/src/rate-limiting/tenant-rate-config.service.ts
interface TenantRateConfig {
  tenantId: string;
  readOpsPerMin: number;    // Default: 1000
  writeOpsPerMin: number;   // Default: 200
  scoringOpsPerMin: number; // Default: 100
}

// packages/common/src/audit/audit-event.interceptor.ts
interface AuditEntry {
  eventId: string;           // UUIDv7
  timestamp: Date;           // UTC, microsecond precision
  actor: string;             // userId or service name
  actorIp: string;
  tenantId: string;
  actionType: string;        // e.g., 'customer.created', 'product.updated'
  resourceType: string;
  resourceId: string;
  beforeValue: object | null;
  afterValue: object | null;
  correlationId: string;
}

// packages/common/src/observability/metrics.service.ts
interface ServiceMetrics {
  httpRequestsTotal: Counter;
  httpRequestDuration: Histogram;
  httpRequestErrors: Counter;
  // Business metrics
  loanApplicationsTotal: Counter;
  disbursementAmountTotal: Counter;
  repaymentAmountTotal: Counter;
}
```

---

## Appendix C: New Prisma Models

```prisma
// WebhookEndpoint
model WebhookEndpoint {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String    @map("tenant_id") @db.Uuid
  url           String
  events        String[]  // e.g., ['contract.state_changed', 'repayment.received']
  authMethod    String    @map("auth_method") // hmac | bearer | basic_auth
  secret        String    // Encrypted at rest
  active        Boolean   @default(true)
  createdAt     DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt     DateTime  @updatedAt @map("updated_at") @db.Timestamptz
  deletedAt     DateTime? @map("deleted_at") @db.Timestamptz
  deliveryLogs  WebhookDeliveryLog[]
  @@map("webhook_endpoints")
}

// WebhookDeliveryLog
model WebhookDeliveryLog {
  id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  webhookEndpointId   String   @map("webhook_endpoint_id") @db.Uuid
  event               String
  payload             Json     @db.JsonB
  httpStatus          Int?     @map("http_status")
  responseBody        String?  @map("response_body") @db.Text
  retryCount          Int      @default(0) @map("retry_count")
  status              String   // pending | delivered | failed
  createdAt           DateTime @default(now()) @map("created_at") @db.Timestamptz
  webhookEndpoint     WebhookEndpoint @relation(fields: [webhookEndpointId], references: [id])
  @@map("webhook_delivery_logs")
}
```

---

## Appendix D: Complete New File Tree

```
# Task 1 — Webhook Delivery System
services/notification-service/src/webhooks/webhook-delivery.service.ts
services/notification-service/src/webhooks/webhook-delivery.processor.ts
services/notification-service/src/webhooks/webhook-signer.ts
services/notification-service/src/webhooks/webhook.resolver.ts
services/notification-service/src/webhooks/dto/webhook-endpoint.dto.ts
services/notification-service/src/webhooks/dto/webhook-delivery-log.dto.ts
services/notification-service/src/webhooks/__tests__/webhook-delivery.spec.ts
services/notification-service/src/webhooks/__tests__/webhook-signer.spec.ts
packages/database/prisma/migrations/XXXXXX_add_webhook_tables/migration.sql

# Task 2 — PII Encryption at Rest
packages/common/src/encryption/aes-gcm.service.ts
packages/common/src/encryption/field-encryption.middleware.ts
packages/common/src/encryption/pii-masking.util.ts
packages/common/src/encryption/key-provider.interface.ts
packages/common/src/encryption/env-key.provider.ts
packages/common/src/encryption/vault-key.provider.ts
packages/common/src/encryption/key-provider.factory.ts
packages/common/src/encryption/__tests__/aes-gcm.spec.ts
packages/common/src/encryption/__tests__/field-encryption.spec.ts
packages/common/src/encryption/__tests__/pii-masking.spec.ts
packages/common/src/encryption/__tests__/key-provider.spec.ts
packages/database/prisma/migrations/XXXXXX_encrypt_existing_pii/migration.sql
scripts/encrypt-existing-pii.ts

# Task 3 — Rate Limiting & Throttling
packages/common/src/rate-limiting/redis-throttle.storage.ts
packages/common/src/rate-limiting/rate-category.decorator.ts
packages/common/src/rate-limiting/rate-limit-headers.interceptor.ts
packages/common/src/rate-limiting/tenant-rate-config.service.ts
packages/common/src/rate-limiting/__tests__/redis-throttle.spec.ts
packages/common/src/rate-limiting/__tests__/rate-limit-headers.spec.ts

# Task 4 — Comprehensive Audit Logging
packages/common/src/audit/audit-event.interceptor.ts
packages/common/src/audit/audit-event.emitter.ts
packages/common/src/audit/audit-diff.util.ts
packages/common/src/audit/audit.constants.ts
packages/common/src/audit/__tests__/audit-event.interceptor.spec.ts
packages/common/src/audit/__tests__/audit-diff.spec.ts
services/entity-service/src/audit/audit-log.resolver.ts
services/entity-service/src/audit/dto/audit-log-filter.dto.ts
packages/database/prisma/migrations/XXXXXX_audit_log_partitioning/migration.sql

# Task 5 — GraphQL Subscriptions
apps/graphql-server/src/subscriptions/pubsub.provider.ts
apps/graphql-server/src/subscriptions/subscription-auth.guard.ts
apps/graphql-server/src/subscriptions/event-pubsub.bridge.ts
apps/graphql-server/src/subscriptions/loan-request.subscription.ts
apps/graphql-server/src/subscriptions/contract.subscription.ts
apps/graphql-server/src/subscriptions/repayment.subscription.ts
apps/graphql-server/src/subscriptions/alert.subscription.ts
apps/graphql-server/src/subscriptions/reconciliation.subscription.ts
apps/graphql-server/src/subscriptions/__tests__/subscription-auth.spec.ts
apps/graphql-server/src/subscriptions/__tests__/event-pubsub-bridge.spec.ts

# Task 6 — Observability Stack
packages/common/src/observability/logger.module.ts
packages/common/src/observability/logger.service.ts
packages/common/src/observability/metrics.module.ts
packages/common/src/observability/metrics.service.ts
packages/common/src/observability/metrics.interceptor.ts
packages/common/src/observability/correlation-id.middleware.ts
packages/common/src/observability/tracing.module.ts
packages/common/src/observability/tracing.setup.ts
packages/common/src/observability/health.controller.ts
packages/common/src/observability/__tests__/logger.spec.ts
packages/common/src/observability/__tests__/metrics.spec.ts
packages/common/src/observability/__tests__/correlation-id.spec.ts

# Task 7 — Security Hardening
packages/common/src/security/csrf.middleware.ts
packages/common/src/security/ip-whitelist.guard.ts
packages/common/src/security/query-complexity.plugin.ts
packages/common/src/security/input-sanitizer.util.ts
packages/common/src/security/__tests__/csrf.spec.ts
packages/common/src/security/__tests__/ip-whitelist.spec.ts
packages/common/src/security/__tests__/query-complexity.spec.ts
packages/common/src/security/__tests__/input-sanitizer.spec.ts

# Task 8 — REST API Completion & OpenAPI
apps/rest-server/src/interceptors/response-envelope.interceptor.ts
apps/rest-server/src/filters/http-exception.filter.ts
apps/rest-server/src/controllers/customer.controller.ts
apps/rest-server/src/controllers/contract.controller.ts
apps/rest-server/src/controllers/health.controller.ts
apps/rest-server/src/dto/common-response.dto.ts
apps/rest-server/src/__tests__/response-envelope.spec.ts
apps/rest-server/src/__tests__/http-exception-filter.spec.ts
apps/rest-server/src/__tests__/rest-e2e.spec.ts

# Task 9 — Integration Tests & Verification
tests/e2e/webhook-delivery.e2e-spec.ts
tests/e2e/pii-encryption.e2e-spec.ts
tests/e2e/rate-limiting.e2e-spec.ts
tests/e2e/audit-logging.e2e-spec.ts
tests/e2e/graphql-subscriptions.e2e-spec.ts
tests/e2e/observability.e2e-spec.ts
tests/e2e/security-hardening.e2e-spec.ts
tests/e2e/rest-api-lifecycle.e2e-spec.ts
```

---

## Appendix E: Sprint 7 Deferral List

The following items are **explicitly deferred to Sprint 7** (Jun 19–30, final sprint). Estimated ~42pts after dropping audit logging duplicate.

### Sprint 7 Scope:
1. **Dockerfiles & multi-stage builds** for all services (NFR-INF-001) — ~5pts
2. **Helm charts** for Kubernetes deployment (NFR-IAC-002) — ~5pts
3. **CI/CD pipeline** — GitHub Actions: lint, test, build, security scan, deploy (NFR-CI-001, NFR-CD-001) — ~5pts
4. **Performance optimization & load testing** (NFR-SC, response time targets) — ~8pts
5. **Monitoring dashboards** — Grafana dashboards for Prometheus metrics (NFR-MO-003) — ~5pts
6. **Documentation & runbooks** (NFR-OPS-003, NFR-MT-006) — ~3pts
7. **MFA/TOTP implementation** (FR-SEC-001.1, Must — BA-identified gap) — ~5pts: TOTP secret generation, QR code setup flow, verification on login, enforcement for all O&M Portal users. Schema fields `mfaSecret`/`mfaEnabled` already exist on User and PlatformUser models
8. **VaultKeyProvider real implementation** — connect to HashiCorp Vault API (stub delivered in Sprint 6)
9. **Database backup encryption** (FR-SEC-006.4) — configure in K8s/Helm
10. **Full regression & launch readiness** — ~5pts

### Dropped from Sprint 7:
- ~~Comprehensive audit logging for all mutations~~ (item #11605426990, 8pts) — **duplicate**, fully covered by Sprint 6 Task 4

### Accepted as Post-Launch Backlog (BA confirmed — all "Should" priority):
- Network-based guarantor analysis (FR-AR-004) — Sprint 5 stub/mock only
- Real-time event-driven monitoring — Sprint 5 batch only, real-time deferred
- `registerWebhook` full implementation — Sprint 5 stub only
- Transaction fee-based recovery enforcement — Sprint 5 strategy only
- Docker Compose enhancement for full local dev stack

---

## Appendix F: Critical Rules Reminder

1. **Money as string:** All monetary amounts are `string` (Decimal). Never use `float` or `number`. Python: `str(Decimal(...))`. TypeScript: `Decimal` from Prisma.
2. **Banker's rounding:** Round half to even for all financial math. Use `bankersRound()` from `@lons/common`.
3. **Tenant isolation:** Every query must include `tenantId`. No cross-tenant data access. Set `app.current_tenant` PostgreSQL session variable.
4. **PII masking:** Phone → `+233***7890`, NationalID → `GHA-***-XXX`, email → `a***@b.com`. PII must NEVER appear in logs.
5. **Idempotency:** All mutations accept `idempotencyKey`. Same key = same result, no duplicates.
6. **Soft deletes:** Use `deletedAt` — no hard deletes on business data.
7. **Append-only:** Ledger entries and audit logs are append-only — no updates, no deletes.
8. **Event-driven:** All state transitions emit events to EventBus. Consumers must be idempotent.
9. **UUIDv7:** All primary keys use time-sortable UUID v7.
10. **Cursor pagination:** All list queries use Relay connections pattern (cursor-based).
11. **Encryption at rest:** All PII fields encrypted with AES-256-GCM. Key via `IKeyProvider` abstraction — `EnvKeyProvider` for dev, `VaultKeyProvider` stub for production path.
12. **Structured logging:** JSON format, correlation IDs, no PII in logs. PII masking covers Prisma queries, HTTP bodies, and stack traces.
13. **Audit immutability:** Audit log entries are hash-chained. Each entry includes `previousHash` for tamper detection.
