# Sprint 6 — REBUILD INSTRUCTIONS

**Context:** Sprint 6 was scaffolded but 97 out of ~110 implementation files are **empty (0 bytes)**. The file structure is correct — every file is in the right location. You need to fill them with actual implementations.

**Primary reference:** Read `SPRINT-6.md` for full acceptance criteria, interfaces, Prisma models, event contracts, and execution order.

**What already works (DO NOT overwrite):**
- `packages/common/src/encryption/aes-gcm.util.ts` (53 lines) — AES-256-GCM encrypt/decrypt ✓
- `packages/common/src/encryption/masking.util.ts` (31 lines) + `masking.util.spec.ts` (39 lines) — PII masking ✓
- `packages/common/src/encryption/index.ts` (2 lines) — exports ✓
- `services/entity-service/src/api-key/api-key.service.ts` (213 lines) — API key CRUD ✓
- `services/entity-service/src/api-key/api-key.service.spec.ts` (490 lines) — API key tests ✓
- `services/entity-service/src/api-key/api-key-rotation.service.ts` (80 lines) — rotation + revocation ✓
- `services/entity-service/src/api-key/api-key.module.ts` (9 lines) ✓
- `services/entity-service/src/audit/audit.service.ts` (77 lines) — basic audit service ✓
- `services/entity-service/src/audit/audit.module.ts` (9 lines) ✓
- `apps/rest-server/src/interceptors/response-envelope.interceptor.ts` (20 lines) — response wrapper ✓
- `apps/rest-server/src/main.ts` (48 lines) — Swagger/OpenAPI setup ✓
- `apps/rest-server/src/app.module.ts` (33 lines) — module config ✓
- `apps/rest-server/src/loan-request/loan-request.controller.ts` (31 lines) — endpoints ✓
- `apps/rest-server/src/customer/customer.controller.ts` (29 lines) — endpoints ✓
- `apps/rest-server/src/contract/contract.controller.ts` (22 lines) — endpoints ✓
- `apps/rest-server/src/repayment/repayment.controller.ts` (31 lines) — endpoints ✓
- `apps/rest-server/src/health/health.controller.ts` (16 lines) — health check ✓
- `apps/graphql-server/src/graphql/resolvers/api-key.resolver.ts` (63 lines) — GraphQL mutations ✓

---

## EMPTY FILES THAT NEED IMPLEMENTATION

Fill every file listed below. The acceptance criteria for each are in SPRINT-6.md. Follow the execution order (Wave 1 → 2 → 3 → 4).

### Wave 1 — Foundations

#### Task 2: PII Encryption (packages/common/src/encryption/)
The aes-gcm.util.ts and masking.util.ts already work. Fill these empty files:

```
packages/common/src/encryption/key-provider.interface.ts     # IKeyProvider: getKey(), rotateKey(), getCurrentKeyId()
packages/common/src/encryption/env-key.provider.ts           # Reads ENCRYPTION_KEY env var (dev/sandbox)
packages/common/src/encryption/vault-key.provider.ts         # Stub — reads env var, logs warning re: Vault
packages/common/src/encryption/key-provider.factory.ts       # Factory: selects impl based on KEY_PROVIDER env var
packages/common/src/encryption/field-encryption.middleware.ts # Prisma middleware: auto encrypt/decrypt PII fields
packages/common/src/encryption/encrypted-fields.config.ts    # Config: which model fields are encrypted
packages/common/src/encryption/key-rotation.service.ts       # rotateEncryptedField(oldKey, newKey, ...)
packages/common/src/encryption/encryption-startup.validator.ts # Fail startup if ENCRYPTION_KEY not set in prod
packages/common/src/encryption/__tests__/field-encryption.spec.ts
packages/common/src/encryption/__tests__/key-provider.spec.ts
```

#### Task 6: Observability (packages/common/src/observability/)
```
packages/common/src/observability/index.ts                   # Barrel export
packages/common/src/observability/logger.module.ts           # NestJS module wrapping LoggerService
packages/common/src/observability/logger.service.ts          # Winston/Pino JSON logger, PII masking hook, LOG_LEVEL env
packages/common/src/observability/metrics.module.ts          # NestJS module for Prometheus metrics
packages/common/src/observability/metrics.service.ts         # prom-client: http_requests_total, http_request_duration_seconds, business metrics
packages/common/src/observability/metrics.interceptor.ts     # NestJS interceptor: auto-record HTTP metrics
packages/common/src/observability/metrics.controller.ts      # GET /metrics endpoint exposing Prometheus format
packages/common/src/observability/correlation-id.middleware.ts # Read/generate X-Correlation-ID, attach to request context
packages/common/src/observability/correlation-id.context.ts  # AsyncLocalStorage for correlation ID propagation
packages/common/src/observability/prisma-slow-query.middleware.ts # Prisma $use: log queries >1s, prometheus histogram
packages/common/src/observability/health.controller.ts       # GET /health (liveness), GET /health/ready (DB check)
packages/common/src/observability/tracing.module.ts          # OpenTelemetry SDK setup, OTEL_EXPORTER_ENDPOINT, ENABLE_TRACING toggle
packages/common/src/observability/observability.module.ts    # Composite module importing Logger+Metrics+Tracing
packages/common/src/observability/__tests__/logger.spec.ts
packages/common/src/observability/__tests__/metrics.spec.ts
packages/common/src/observability/__tests__/correlation-id.spec.ts
```

#### Task 4: Audit Logging (packages/common/src/audit/)
```
packages/common/src/audit/index.ts                           # Barrel export
packages/common/src/audit/audit.constants.ts                 # Action types enum, resource types enum
packages/common/src/audit/audit-event.interceptor.ts         # NestJS interceptor: auto-capture before/after on mutations
packages/common/src/audit/audit-action.decorator.ts          # @AuditAction(type, resource) decorator for resolvers
packages/common/src/audit/audit-diff.util.ts                 # Diff two objects → { field, before, after }[]
packages/common/src/audit/audit-hash.util.ts                 # SHA-256 hash chaining: computeEntryHash(entry, previousHash)
packages/common/src/audit/__tests__/audit-event.interceptor.spec.ts
packages/common/src/audit/__tests__/audit-diff.spec.ts
packages/common/src/audit/__tests__/audit-hash.spec.ts
```

Also fill:
```
services/entity-service/src/audit/dto/audit-log-filter.dto.ts  # GraphQL input for filtering audit logs
apps/graphql-server/src/graphql/resolvers/audit.resolver.ts    # auditLogs(filters) query — SP Auditor + Platform Admin only
apps/graphql-server/src/graphql/types/audit-log.type.ts        # GraphQL ObjectType for AuditLog
```

### Wave 2 — API Hardening

#### Task 3: Rate Limiting (packages/common/src/rate-limiting/)
```
packages/common/src/rate-limiting/index.ts                    # Barrel export
packages/common/src/rate-limiting/redis-throttle.storage.ts   # Redis-backed ThrottlerStorage for @nestjs/throttler
packages/common/src/rate-limiting/tenant-throttler.guard.ts   # Guard: resolve rate limits from tenant config
packages/common/src/rate-limiting/rate-category.decorator.ts  # @RateCategory('read'|'write'|'scoring') decorator
packages/common/src/rate-limiting/rate-limit-headers.interceptor.ts # Set X-RateLimit-Limit, -Remaining, -Reset headers
packages/common/src/rate-limiting/__tests__/redis-throttle.spec.ts
packages/common/src/rate-limiting/__tests__/rate-limit-headers.spec.ts
```

#### Task 7: Security (packages/common/src/security/)
```
packages/common/src/security/index.ts                        # Barrel export
packages/common/src/security/csrf.middleware.ts               # Cookie-to-header CSRF (XSRF-TOKEN cookie, X-XSRF-TOKEN header)
packages/common/src/security/ip-whitelist.guard.ts            # Optional per-tenant IP whitelist from tenant settings
packages/common/src/security/query-complexity.plugin.ts       # Apollo plugin: max cost 1000, max depth 10
packages/common/src/security/input-sanitizer.util.ts          # Strip <script>, event handlers, javascript: URIs
packages/common/src/security/__tests__/csrf.spec.ts
packages/common/src/security/__tests__/ip-whitelist.spec.ts
packages/common/src/security/__tests__/query-complexity.spec.ts
packages/common/src/security/__tests__/input-sanitizer.spec.ts
```

#### Task 5: GraphQL Subscriptions (apps/graphql-server/src/subscriptions/)
```
apps/graphql-server/src/subscriptions/index.ts               # Barrel export
apps/graphql-server/src/subscriptions/subscription.module.ts # NestJS module registering all subscription providers
apps/graphql-server/src/subscriptions/pubsub.provider.ts     # Redis-backed PubSub (graphql-redis-subscriptions)
apps/graphql-server/src/subscriptions/subscription-auth.guard.ts # JWT validation from WebSocket connection params
apps/graphql-server/src/subscriptions/event-pubsub.bridge.ts # EventBus subscriber → Redis PubSub publisher
apps/graphql-server/src/subscriptions/loan-request.subscription.ts  # loanRequestStateChanged(productId?)
apps/graphql-server/src/subscriptions/contract.subscription.ts      # contractStateChanged(productId?)
apps/graphql-server/src/subscriptions/repayment.subscription.ts     # repaymentReceived(contractId?)
apps/graphql-server/src/subscriptions/alert.subscription.ts         # alertTriggered(severity?)
apps/graphql-server/src/subscriptions/reconciliation.subscription.ts # reconciliationExceptionCreated
apps/graphql-server/src/subscriptions/types/index.ts
apps/graphql-server/src/subscriptions/types/loan-request-state.payload.ts
apps/graphql-server/src/subscriptions/types/contract-state.payload.ts
apps/graphql-server/src/subscriptions/types/repayment-received.payload.ts
apps/graphql-server/src/subscriptions/types/alert-triggered.payload.ts
apps/graphql-server/src/subscriptions/types/reconciliation-exception.payload.ts
apps/graphql-server/src/subscriptions/__tests__/subscription-auth.spec.ts
apps/graphql-server/src/subscriptions/__tests__/event-pubsub-bridge.spec.ts
```

### Wave 3 — Features

#### Task 1: Webhook Delivery (services/notification-service/src/webhooks/)
```
services/notification-service/src/webhooks/index.ts              # Barrel export
services/notification-service/src/webhooks/types/webhook.types.ts # WebhookEndpoint, DeliveryLog, SignatureResult interfaces
services/notification-service/src/webhooks/dto/webhook-endpoint.dto.ts   # GraphQL input/type for webhook endpoints
services/notification-service/src/webhooks/dto/webhook-delivery-log.dto.ts # GraphQL type for delivery logs
services/notification-service/src/webhooks/webhook-signer.ts     # HMAC-SHA256 signing: sign(payload, secret) → signature + timestamp
services/notification-service/src/webhooks/webhook-delivery.service.ts   # Delivery engine: fan-out events to matching endpoints
services/notification-service/src/webhooks/webhook-delivery.processor.ts # BullMQ processor: HTTP POST, retry backoff (1m→5m→30m→2h→12h)
services/notification-service/src/webhooks/webhook-event.listener.ts     # EventBus subscriber: domain events → webhook delivery queue
services/notification-service/src/webhooks/__tests__/webhook-signer.spec.ts
services/notification-service/src/webhooks/__tests__/webhook-delivery.spec.ts
```

Also fill:
```
apps/graphql-server/src/graphql/resolvers/webhook.resolver.ts  # CRUD mutations + deliveryLogs query
```

#### Task 8: REST API gaps
```
apps/rest-server/src/filters/business-exception.filter.ts    # Map app errors → HTTP status + { code, message, details }
apps/rest-server/src/interceptors/idempotency.interceptor.ts # Redis-backed: cache response by X-Idempotency-Key, 24h TTL
```

### Wave 4 — Tests

#### Task 9: Integration Tests (tests/e2e/)
```
tests/e2e/webhook-delivery.e2e-spec.ts      # Endpoint CRUD → emit event → delivery + HMAC → log created
tests/e2e/pii-encryption.e2e-spec.ts        # Create customer → DB ciphertext → read plaintext → log masked
tests/e2e/rate-limiting.e2e-spec.ts         # Exceed limit → 429 + headers → wait → recovered
tests/e2e/audit-logging.e2e-spec.ts         # CRUD → audit entry + hash chain → tamper detection → platform admin tagging
tests/e2e/graphql-subscriptions.e2e-spec.ts # WebSocket auth → subscribe → domain event → received → tenant isolation
tests/e2e/observability.e2e-spec.ts         # API call → /metrics counters → correlation ID in logs → slow query logged
tests/e2e/security-hardening.e2e-spec.ts    # Complex query rejected → CSRF flow → IP whitelist → input sanitized
tests/e2e/rest-api-lifecycle.e2e-spec.ts    # Create loan → accept → repay → credit summary → envelope format
```

Also fill REST tests:
```
apps/rest-server/src/__tests__/response-envelope.spec.ts
apps/rest-server/src/__tests__/business-exception-filter.spec.ts
apps/rest-server/src/__tests__/rest-e2e.spec.ts
```

---

## WIRING FIXES REQUIRED

Beyond filling empty files, these integration points need fixing:

### 1. Register ApiKeyResolver in GraphQL server
**File:** `apps/graphql-server/src/app.module.ts`
The `api-key.resolver.ts` (63 lines) exists but is NOT imported or registered as a provider.

### 2. Wire password validation into user creation
**File:** `services/entity-service/src/user/user.service.ts`
`PasswordService.validateStrength()` exists (50 lines) but is never called. Add validation call in:
- `UserService.create()` — before hashing
- `PlatformUserService.create()` — before hashing
- Any password-change flows

### 3. Register audit interceptor globally
**Files:** `apps/graphql-server/src/app.module.ts`, `apps/rest-server/src/app.module.ts`
Once `audit-event.interceptor.ts` is implemented, register it as a global interceptor.

### 4. Register observability modules in all services
Import `ObservabilityModule` (LoggerModule + MetricsModule + TracingModule) into every service module:
- `apps/graphql-server/src/app.module.ts`
- `apps/rest-server/src/app.module.ts`
- `services/entity-service/src/entity-service.module.ts`
- `services/process-engine/src/process-engine.module.ts`
- `services/repayment-service/src/repayment-service.module.ts`
- `services/notification-service/src/notification-service.module.ts`
- `services/recovery-service/src/recovery-service.module.ts`
- `services/settlement-service/src/settlement-service.module.ts`
- `services/reconciliation-service/src/reconciliation-service.module.ts`
- `services/integration-service/src/integration-service.module.ts`
- `apps/scheduler/src/scheduler.module.ts`

### 5. Register rate limiting in API servers
**Files:** `apps/graphql-server/src/app.module.ts`, `apps/rest-server/src/app.module.ts`
Import `ThrottlerModule` with `RedisThrottleStorage`, register `TenantThrottlerGuard` globally.

### 6. Register subscription module and WebSocket transport
**File:** `apps/graphql-server/src/app.module.ts`, `apps/graphql-server/src/main.ts`
Import `SubscriptionModule`, enable WebSocket transport in Apollo Server.

### 7. Register query complexity plugin
**File:** `apps/graphql-server/src/app.module.ts`
Add `QueryComplexityPlugin` to Apollo Server plugins.

### 8. Write Sprint 6 Prisma migration
**File:** `packages/database/prisma/migrations/20260327163721_sprint6_webhook_audit_hardening/migration.sql`
Must create:
- `webhook_endpoints` table (id, tenant_id, url, events[], auth_method, secret, active, timestamps, deleted_at)
- `webhook_delivery_logs` table (id, webhook_endpoint_id, event, payload, http_status, response_body, retry_count, status, next_retry_at, delivered_at, created_at)
- Add `access_type`, `entry_hash`, `previous_hash` columns to audit_logs table
- Add indexes on webhook_endpoints(tenant_id), delivery_logs(webhook_endpoint_id, status, created_at), audit_logs(entry_hash)

### 9. Add missing npm dependencies
**`apps/graphql-server/package.json`:** add `graphql-ws`, `graphql-redis-subscriptions`, `graphql-query-complexity`
**`packages/common/package.json`:** add `prom-client`, `winston` (or `pino`), `@opentelemetry/api`, `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`, `@nestjs/throttler`

---

## CRITICAL RULES REMINDER

1. **Money as string:** All monetary amounts are `string` (Decimal). Never `float` or `number`.
2. **Tenant isolation:** Every query must include `tenantId`. No cross-tenant access.
3. **PII masking:** Phone → `+233***7890`, NationalID → `GHA-***-XXX`, email → `a***@b.com`. PII must NEVER appear in logs.
4. **Idempotency:** All mutations accept `idempotencyKey`.
5. **Soft deletes:** Use `deletedAt` — no hard deletes on business data.
6. **Append-only:** Ledger entries and audit logs — no updates, no deletes.
7. **Event-driven:** All state transitions emit events to EventBus. Consumers must be idempotent.
8. **UUIDv7:** All primary keys use time-sortable UUID v7.
9. **Cursor pagination:** All list queries use Relay connections pattern.
10. **Encryption at rest:** PII fields encrypted with AES-256-GCM via IKeyProvider abstraction.
11. **Structured logging:** JSON format, correlation IDs, PII masking on Prisma queries + HTTP bodies + stack traces.
12. **Audit immutability:** Hash-chained entries with `previousHash` for tamper detection.
