# Sprint 7 — Claude Code Implementation Prompt

**You are a senior full-stack TypeScript/NestJS/Next.js developer implementing Sprint 7 for the Lōns fintech lending platform. This sprint focuses exclusively on making the staging environment fully operational so real SP (Service Provider) prospects can test the complete platform.**

---

## MANDATORY READING BEFORE YOU START

Read these files first — they contain critical rules and context:

1. **`CLAUDE.md`** (root) — project rules, naming conventions, money handling (NEVER float), multi-tenancy (RLS), testing requirements
2. **`Docs/SPRINT-7-IMPLEMENTATION.md`** — detailed specs for every task with acceptance criteria
3. **`Docs/09-integrations.md`** — integration architecture requirements (FR-IA-001 through FR-IA-005, FR-DW-001.1)
4. **`Docs/07-api-specifications.md`** — API design patterns, error format, pagination
5. **`Docs/04-entity-management.md`** — entity CRUD patterns, tenant onboarding (FR-SP-001, FR-SP-002)

---

## WHAT YOU ARE BUILDING

Sprint 7 transforms the Lōns platform from "code that compiles" into "a staging environment SP prospects can actually use." Specifically:

1. **Per-tenant adapter configuration** — SPs need their own wallet and notification provider configs, stored in the database, resolved per-tenant at runtime (replacing global env vars)
2. **Full mock adapters** — Mock wallet adapter implementing all 7 IWalletAdapter operations with configurable behavior. Recording notification adapter that stores all notifications for test verification.
3. **REST API expansion** — 14 endpoints for SP system-to-system integration with OpenAPI docs
4. **Comprehensive staging seed data** — 3 SPs (Ghana/Kenya/Nigeria), 16+ customer profiles per SP, all contract states, ledger entries, reconciliation with exceptions
5. **Debug mode** — A staging-only debug panel showing API logs, adapter operations, events, state machine transitions, scoring breakdowns
6. **Feedback collection** — Feedback form + NPS widget for SP prospects to report issues and rate the platform

---

## TASK EXECUTION ORDER & PARALLELIZATION

There are 13 DEV tasks across 4 parallel tracks. You should maximize parallelism where dependencies allow.

### Track A: Adapter Infrastructure (DEV-01 → DEV-02, DEV-03, DEV-04, DEV-05 → DEV-11 → DEV-12)
### Track B: API & Seed Data (DEV-06 immediate; DEV-07 after DEV-01 + DEV-03)
### Track C: Feedback & Debug (DEV-08 + DEV-09 immediate; DEV-10 after DEV-09)
### Track D: Integration Tests (DEV-13 — last, after DEV-02 through DEV-07)

**Critical path:** DEV-01 → DEV-02/03 → DEV-07. Start DEV-01 FIRST.

**Must items (63 points — sprint commitment):** DEV-01 through DEV-09
**Should items (21 points — best effort, may slip):** DEV-10, DEV-11, DEV-12, DEV-13

---

## DEV-01: WalletProviderConfig + NotificationProviderConfig Prisma Models [MUST, CRITICAL — START FIRST]

**File:** `packages/database/prisma/schema.prisma`

### Add 3 new enums:

```prisma
enum WalletProviderType {
  MOCK
  MTN_MOMO
  MPESA
  AIRTEL_MONEY
  GENERIC
}

enum NotificationProviderType {
  CONSOLE
  RECORDING_MOCK
  AFRICAS_TALKING
  TWILIO
  SMTP
  FCM
}

enum AdapterEnvironmentMode {
  SANDBOX
  PRODUCTION
}
```

### Add 3 new models:

**WalletProviderConfig:**

```prisma
model WalletProviderConfig {
  id                    String                 @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId              String                 @map("tenant_id") @db.Uuid
  providerType          WalletProviderType     @map("provider_type")
  environmentMode       AdapterEnvironmentMode @map("environment_mode")
  displayName           String                 @map("display_name") @db.VarChar(255)
  apiBaseUrl            String?                @map("api_base_url") @db.VarChar(512)
  credentialsSecretRef  String?                @map("credentials_secret_ref") @db.VarChar(512)
  webhookSigningKeyRef  String?                @map("webhook_signing_key_ref") @db.VarChar(512)
  configJson            Json?                  @map("config_json") @db.JsonB
  isActive              Boolean                @default(true) @map("is_active")
  isDefault             Boolean                @default(false) @map("is_default")
  createdAt             DateTime               @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt             DateTime               @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt             DateTime?              @map("deleted_at") @db.Timestamptz(6)

  tenant                Tenant                 @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, providerType, isActive], name: "uq_wallet_provider_active")
  @@index([tenantId])
  @@map("wallet_provider_configs")
}
```

**NotificationProviderConfig:**

```prisma
model NotificationProviderConfig {
  id                    String                     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId              String                     @map("tenant_id") @db.Uuid
  providerType          NotificationProviderType   @map("provider_type")
  environmentMode       AdapterEnvironmentMode     @map("environment_mode")
  displayName           String                     @map("display_name") @db.VarChar(255)
  credentialsSecretRef  String?                    @map("credentials_secret_ref") @db.VarChar(512)
  configJson            Json?                      @map("config_json") @db.JsonB
  isActive              Boolean                    @default(true) @map("is_active")
  isDefault             Boolean                    @default(false) @map("is_default")
  createdAt             DateTime                   @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt             DateTime                   @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt             DateTime?                  @map("deleted_at") @db.Timestamptz(6)

  tenant                Tenant                     @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, providerType, isActive], name: "uq_notification_provider_active")
  @@index([tenantId])
  @@map("notification_provider_configs")
}
```

**NotificationMockLog:**

```prisma
model NotificationMockLog {
  id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String   @map("tenant_id") @db.Uuid
  channel         String   @db.VarChar(20)
  recipient       String   @db.VarChar(255)
  templateId      String?  @map("template_id") @db.VarChar(100)
  renderedContent String   @map("rendered_content") @db.Text
  status          String   @db.VarChar(20)
  correlationId   String?  @map("correlation_id") @db.VarChar(100)
  createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  tenant          Tenant   @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@index([correlationId])
  @@map("notification_mock_log")
}
```

### Update Tenant model (at line ~259):

Add these relation fields to the existing Tenant model:

```prisma
walletProviderConfigs       WalletProviderConfig[]
notificationProviderConfigs NotificationProviderConfig[]
notificationMockLogs        NotificationMockLog[]
```

### Add Feedback and SurveyResponse models (for DEV-09/DEV-10):

```prisma
enum FeedbackCategory {
  BUG
  FEATURE_REQUEST
  UX_ISSUE
  INTEGRATION_QUESTION
  OTHER
}

enum FeedbackSeverity {
  CRITICAL
  MAJOR
  MINOR
  SUGGESTION
}

enum FeedbackStatus {
  NEW
  ACKNOWLEDGED
  IN_PROGRESS
  RESOLVED
  CLOSED
}

model Feedback {
  id             String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId       String           @map("tenant_id") @db.Uuid
  userId         String           @map("user_id") @db.Uuid
  category       FeedbackCategory
  severity       FeedbackSeverity
  description    String           @db.Text
  screenshotUrl  String?          @map("screenshot_url") @db.VarChar(512)
  pageUrl        String?          @map("page_url") @db.VarChar(512)
  debugContext   Json?            @map("debug_context") @db.JsonB
  status         FeedbackStatus   @default(NEW)
  createdAt      DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime         @updatedAt @map("updated_at") @db.Timestamptz(6)

  tenant         Tenant           @relation(fields: [tenantId], references: [id])
  user           User             @relation(fields: [userId], references: [id])

  @@index([tenantId])
  @@index([status])
  @@map("feedbacks")
}

model SurveyResponse {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String   @map("tenant_id") @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  score     Int
  comment   String?  @db.Text
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  user      User     @relation(fields: [userId], references: [id])

  @@index([tenantId])
  @@map("survey_responses")
}
```

Also add `feedbacks Feedback[]` and `surveyResponses SurveyResponse[]` relations to both the Tenant and User models.

### Run migration:

```bash
cd packages/database
npx prisma migrate dev --name add_sprint7_adapter_feedback_models
npx prisma generate
```

### Add RLS SQL in the migration:

Include Row-Level Security policies in the migration SQL for all new tables:

```sql
ALTER TABLE wallet_provider_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY wallet_provider_configs_tenant_isolation ON wallet_provider_configs
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Repeat for notification_provider_configs, notification_mock_log, feedbacks, survey_responses
```

### Export shared types from `packages/shared-types/`:

Export the new enums (`WalletProviderType`, `NotificationProviderType`, `AdapterEnvironmentMode`, `FeedbackCategory`, `FeedbackSeverity`, `FeedbackStatus`) so other services can import them.

### Tests:

- Verify migration runs on fresh database
- Verify `prisma generate` succeeds
- Verify no breaking changes to existing models

---

## DEV-02: WalletAdapterResolver Service [MUST, CRITICAL]

**Depends on:** DEV-01
**File:** `services/integration-service/src/adapters/wallet-adapter-resolver.service.ts` (new)

Create a service that replaces global env-var wallet adapter selection with per-tenant database-driven resolution.

### Existing code context:

- Current IWalletAdapter interface is at `services/process-engine/src/disbursement/adapters/wallet-adapter.interface.ts` — it defines `transfer()`, `collect()`, `getBalance()`, `getTransactionStatus()`
- Extended types are at `services/integration-service/src/adapters/wallet-adapter.types.ts` — adds `WalletCustomerInfo`, `WalletTransaction`, `DateRange`, `WebhookRegistration`
- Existing adapters: `services/integration-service/src/adapters/mtn-momo/`, `mpesa/`, `generic-wallet/`
- Existing mock: `services/process-engine/src/disbursement/adapters/mock-wallet.adapter.ts` (limited scope)

### Implementation:

```typescript
@Injectable()
export class WalletAdapterResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    // Inject existing adapter classes
  ) {}

  async resolve(tenantId: string): Promise<IWalletAdapter> {
    // 1. Check Redis: key = `wallet-config:${tenantId}`, TTL = 60s
    // 2. Cache miss → query WalletProviderConfig WHERE tenantId + isActive=true + isDefault=true + deletedAt IS NULL
    // 3. PRODUCTION GUARD:
    //    if (process.env.ALLOW_MOCK_ADAPTERS === 'false' && config.providerType === 'MOCK') {
    //      // Log audit entry
    //      throw new ForbiddenException('Mock adapters are not permitted in this environment');
    //    }
    // 4. Instantiate adapter based on providerType:
    //    MOCK → new MockWalletAdapter(config.configJson)
    //    MTN_MOMO → MtnMomoAdapter (pass environmentMode + credentials from Secrets Manager via credentialsSecretRef)
    //    MPESA → MpesaAdapter (pass environmentMode + credentials)
    //    AIRTEL_MONEY → throw new NotImplementedException('Airtel Money adapter coming in Phase 5')
    //    GENERIC → GenericWalletAdapter (pass configJson)
    // 5. Cache config in Redis (60s TTL)
    // 6. Return adapter
  }

  async invalidateCache(tenantId: string): Promise<void> {
    await this.redis.del(`wallet-config:${tenantId}`);
  }
}
```

### Integration:

- Register in `services/integration-service/src/integration-service.module.ts`
- Update any service currently injecting wallet adapters directly to use the resolver
- Export from integration-service barrel

### Key rules:

- Cache the CONFIG (JSON-serializable), not the adapter instance
- 60s TTL is acceptable — config changes take up to 60s to propagate
- On cache invalidation (config update), delete the Redis key
- ALWAYS check `deletedAt IS NULL` (soft delete per CLAUDE.md)

### Tests:

- Unit test: resolves correct adapter per providerType
- Unit test: Redis caching works (second call hits cache)
- Unit test: production guard blocks MOCK when ALLOW_MOCK_ADAPTERS=false
- Unit test: throws when no config found for tenant
- Unit test: cache invalidation works

---

## DEV-03: Full MockWalletAdapter [MUST, CRITICAL]

**Depends on:** DEV-01
**File:** `services/integration-service/src/adapters/mock/mock-wallet.adapter.ts` (new directory + file)

Upgrade the limited mock from process-engine into a full IWalletAdapter implementation. This is the primary adapter SP prospects will use on staging.

### The adapter must implement these 7 operations:

| Operation | Behavior |
|-----------|----------|
| `getCustomerInfo(walletId: string)` | Return synthetic customer data keyed by walletId. KYC level configurable (full/partial/none). Deterministic — same walletId always returns same customer. |
| `getBalance(walletId: string)` | Return configurable balance (default 50000.0000). Track in-memory state. After disburse → balance decreases. After collect → balance increases. |
| `getTransactionHistory(walletId: string, dateRange: DateRange)` | Return synthetic transactions. Mix of deposits, withdrawals, transfers. Configurable volume. |
| `disburse(walletId: string, amount: string, reference: string)` | Succeed unless `Math.random() < failure_rate`. Generate txRef. Deduct from in-memory balance. Record for history consistency. Trigger webhook callback after delay. |
| `collect(walletId: string, amount: string, reference: string)` | If mock balance < amount → fail with INSUFFICIENT_FUNDS. Otherwise succeed (subject to failure_rate). Add to in-memory balance. Trigger webhook. |
| `getTransactionStatus(reference: string)` | Return status for previously mocked transactions. Configurable delay before PENDING → COMPLETED transition. |
| `registerWebhook(events: string[], callbackUrl: string)` | Store registration in memory. After disburse/collect, POST callback to registered URLs after webhook_delay_ms. |

### Configurable parameters (from `configJson` on WalletProviderConfig):

```typescript
interface MockWalletConfig {
  failure_rate: number;           // 0.0–1.0, default 0.0
  latency_ms: number;             // simulated response delay, default 100
  webhook_delay_ms: number;       // callback delay, default 2000
  initial_balance: number;        // starting balance, default 50000.0000
  supported_currencies: string[]; // default ["GHS", "KES", "NGN"]
}
```

### Critical rules:

- **ALL monetary amounts as strings/Decimal — NEVER float** (per CLAUDE.md)
- In-memory state via `Map<string, MockWalletState>` — ephemeral, resets on restart, acceptable for mock
- Latency simulation: `await new Promise(r => setTimeout(r, config.latency_ms))` before every operation
- Webhook delivery: use `HttpService` (Axios) to POST callbacks. Catch errors, log them, don't throw.
- Deterministic customer info: hash walletId to generate consistent name/KYC/status

### Tests:

- Test each of the 7 operations
- Test failure_rate simulation
- Test balance tracking across disburse/collect
- Test INSUFFICIENT_FUNDS on collect
- Test webhook callback delivery
- Test latency simulation adds delay

---

## DEV-04: NotificationAdapterResolver [MUST, CRITICAL]

**Depends on:** DEV-01
**File:** `services/notification-service/src/adapters/notification-adapter-resolver.service.ts` (new)

Same pattern as DEV-02 but for notification adapters. The existing factory is at `services/notification-service/src/adapters/notification-adapter.factory.ts` — it switches on channel (sms/email/default→console).

### Implementation:

```typescript
@Injectable()
export class NotificationAdapterResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly consoleAdapter: ConsoleNotificationAdapter,
    private readonly smsAdapter: SmsNotificationAdapter,
    private readonly emailAdapter: EmailNotificationAdapter,
    // RecordingNotificationAdapter (from DEV-05)
  ) {}

  async resolve(tenantId: string, channel: 'SMS' | 'EMAIL' | 'PUSH'): Promise<INotificationAdapter> {
    // 1. Redis cache: `notification-config:${tenantId}`, TTL 60s
    // 2. Query NotificationProviderConfig
    // 3. Based on providerType:
    //    CONSOLE → consoleAdapter
    //    RECORDING_MOCK → recordingAdapter
    //    AFRICAS_TALKING → existing AfricasTalkingAdapter
    //    TWILIO → throw NotImplementedException
    //    SMTP → emailAdapter
    //    FCM → throw NotImplementedException
    // 4. Return adapter
  }
}
```

### Backward compatibility:

- If no NotificationProviderConfig exists for the tenant, fall back to the existing factory behavior (env-var based channel switching)
- Update `notification-adapter.factory.ts` to delegate to the resolver when tenant context is available

### Tests:

- Resolves correct adapter per providerType
- Falls back to factory when no config exists
- Redis caching with 60s TTL

---

## DEV-05: RecordingNotificationAdapter [MUST, CRITICAL]

**Depends on:** DEV-01
**File:** `services/notification-service/src/adapters/recording-notification.adapter.ts` (new)

Stores all dispatched notifications in the `notification_mock_log` table for E2E test verification.

### Implementation:

```typescript
@Injectable()
export class RecordingNotificationAdapter implements INotificationAdapter {
  constructor(private readonly prisma: PrismaService) {}

  async send(params: {
    tenantId: string;
    channel: 'SMS' | 'EMAIL' | 'PUSH';
    recipient: string;
    templateId?: string;
    renderedContent: string;
    correlationId?: string;
  }): Promise<{ success: boolean; messageId: string }> {
    const record = await this.prisma.notificationMockLog.create({
      data: {
        tenantId: params.tenantId,
        channel: params.channel,
        recipient: params.recipient,
        templateId: params.templateId,
        renderedContent: params.renderedContent,
        status: 'SENT',
        correlationId: params.correlationId,
      },
    });

    // Also log to console for debugging
    console.log(`[RECORDING] ${params.channel} → ${params.recipient}: ${params.templateId}`);

    return { success: true, messageId: record.id };
  }
}
```

### Staging-only GraphQL query:

Add to the GraphQL server (`apps/graphql-server/`) a query for retrieving mock notification logs. **Guard with environment check** — return error if `ALLOW_MOCK_ADAPTERS !== 'true'`:

```graphql
type NotificationMockLog {
  id: ID!
  channel: String!
  recipient: String!
  templateId: String
  renderedContent: String!
  status: String!
  correlationId: String
  createdAt: DateTime!
}

type Query {
  notificationMockLogs(tenantId: String!, correlationId: String, channel: String): [NotificationMockLog!]!
}
```

### Tests:

- Stores notification in database
- Query returns stored notifications
- Query is blocked when ALLOW_MOCK_ADAPTERS is false

---

## DEV-06: Expand REST API [MUST, CRITICAL — can start immediately, no dependencies]

**File:** `apps/rest-server/src/` — add new controllers and expand existing ones

The REST server already has: `customer/`, `contract/`, `loan-request/`, `product/`, `repayment/`, `webhook/` directories plus an `ApiKeyGuard` at `apps/rest-server/src/guards/api-key.guard.ts` and `IdempotencyInterceptor` at `apps/rest-server/src/interceptors/idempotency.interceptor.ts`.

### 14 endpoints to implement:

**Customer Management:**
- `POST /v1/customers` — create or sync a customer record from SP's system
- `GET /v1/customers/:id` — get customer detail including KYC, wallet info
- `GET /v1/customers` — list with pagination, search, filter

**Loan Origination:**
- `POST /v1/loan-requests` — submit loan request (customer, product, amount, term)
- `GET /v1/loan-requests/:id` — status and details
- `GET /v1/loan-requests` — list with filters (status, date range)

**Contract & Schedule:**
- `GET /v1/contracts/:id` — contract detail (status, balance, DPD)
- `GET /v1/contracts/:id/schedule` — repayment schedule
- `GET /v1/contracts` — list with filters

**Repayment:**
- `POST /v1/repayments` — record a payment
- `GET /v1/repayments` — list with contractId filter

**Webhooks:**
- `GET /v1/webhooks` — list registered webhooks
- `POST /v1/webhooks` — register new webhook
- `DELETE /v1/webhooks/:id` — remove webhook

**API Key:**
- `POST /v1/api-keys/rotate` — rotate API secret (old valid 24h)

### Critical rules:

1. **REUSE EXISTING SERVICE LAYER** — REST controllers must call the same service classes that GraphQL resolvers use. Do NOT duplicate business logic.
2. **Authentication** — enhance `ApiKeyGuard` to validate X-API-Key + X-API-Secret against the ApiKey records in the database. Resolve tenantId from the API key. The guard currently accepts any key (see `apps/rest-server/src/guards/api-key.guard.ts` lines 26-29) — fix this.
3. **OpenAPI/Swagger** — use `@nestjs/swagger` decorators on all controllers and DTOs. Swagger UI at `/api/docs`.
4. **Pagination** — offset-based for REST: `?page=1&limit=20`. Response: `{ data: [], meta: { page, limit, total, totalPages } }`
5. **Error format** — `{ code: string, message: string, details?: object }`
6. **Idempotency** — POST endpoints accept `X-Idempotency-Key` header (interceptor already exists)

### Also generate a Postman collection:

After implementing the OpenAPI spec, export it and generate a Postman collection with environment variables for `{{staging_base_url}}`, `{{api_key}}`, `{{api_secret}}`. Store in `Docs/postman/lons-rest-api.postman_collection.json`.

### Tests:

- Integration tests for: create customer → create loan request → get loan request → record repayment
- Auth guard validates real API keys
- Pagination works correctly
- Error responses match format

---

## DEV-07: Comprehensive Staging Seed Script [MUST, CRITICAL]

**Depends on:** DEV-01, DEV-03
**File:** `packages/database/prisma/seed.ts` — extend with ENVIRONMENT=staging conditional

The existing seed.ts is 1180 lines. Extend it — don't rewrite.

### Trigger:

```typescript
if (process.env.ENVIRONMENT === 'staging') {
  await seedStagingData(prisma);
}
```

### Seed data specification:

**3 Service Providers:**

| SP | Country | Currency | Products | Mock Wallet Display |
|----|---------|----------|----------|-------------------|
| GhanaLend Financial | GH | GHS | All 4 types | "Mock MTN MoMo (Staging)" |
| KenyaCredit Ltd | KE | KES | Overdraft, Micro-loan, BNPL | "Mock M-Pesa (Staging)" |
| NaijaFunds Inc | NG | NGN | Micro-loan, BNPL, Factoring | "Mock Generic Wallet (Staging)" |

Per SP: SP Admin, SP Operator, SP Analyst, SP Auditor users. API credentials. Webhook signing key.

Plus: 1 Platform Admin (superadmin@lons.io).

**WalletProviderConfig per SP:** providerType=MOCK, environmentMode=SANDBOX, configJson with appropriate initial_balance and supported_currencies.

**NotificationProviderConfig per SP:** providerType=RECORDING_MOCK, environmentMode=SANDBOX.

**Products per SP:** Active (1 per type), Suspended (1), Discontinued (1), Draft (1).

**16+ customer profiles per SP:**

| Profile | Contract State |
|---------|---------------|
| New customer (no history) | Pre-qual only, no contracts |
| Active borrower — current | 1 active, 0 DPD |
| Active borrower — multiple | 2+ active across product types |
| Overdue — 30 DPD | 1 contract, 30 days past due |
| Overdue — 60 DPD | 1 contract, 60 days past due, in collections |
| Overdue — 90+ DPD | 1 contract, 90+ days past due, escalated |
| Defaulted | 1 written off |
| Fully repaid | 1 completed, closed |
| Partial early repayment | 1 active with partial early payment |
| Restructured | 1 restructured with new schedule |
| Blacklisted | Blacklisted for fraud, pre-qual must reject |
| Watchlist | Requires manual review |
| High credit score (>800) | Auto-approved |
| Low credit score (<400) | Auto-rejected |
| Borderline credit score | In manual review range |
| Expired consent | Revoked data access |

**Financial records:** Ledger entries (double-entry), 2 reconciliation batches + 1 with exceptions, 1 settlement with revenue splits, notification history, audit logs.

### Critical rules:

- **Idempotent** — use `upsert` or existence checks. Running twice must not create duplicates.
- **Money as strings** — all amounts as `"50000.0000"` format
- **Realistic dates** — relative to `new Date()` so data always looks current. 30 DPD = due date 30 days ago.
- **Run command:** `ENVIRONMENT=staging pnpm --filter database db:seed`

### Tests:

- Seed runs without errors
- Seed is idempotent (run twice, same result)
- All 16 customer profiles present per SP
- All contract states queryable

---

## DEV-08: Staging Debug Mode [MUST, CRITICAL — can start immediately]

**File:** `apps/admin-portal/src/app/(portal)/debug/page.tsx` (new)

A debug panel accessible ONLY when `NEXT_PUBLIC_STAGING_DEBUG_MODE=true`.

### Sections:

1. **API Call Log** — method, URL, status, response time, expandable request/response bodies
2. **Adapter Operation Log** — wallet/notification operations, inputs, outputs, latency
3. **Event Bus Activity** — event name, payload, timestamp. Real-time via SSE or polling.
4. **State Machine Transitions** — loan request/contract state changes with timeline
5. **Scoring Breakdowns** — factor contributions, rule-based vs ML breakdown
6. **Timing Information** — total request time, DB query time, adapter call time

### Environment guard:

```typescript
if (process.env.NEXT_PUBLIC_STAGING_DEBUG_MODE !== 'true') {
  notFound(); // or redirect
}
```

### Backend endpoints needed:

Add to the GraphQL server (guarded by environment + admin role):
- `debugApiLogs(limit: Int): [DebugApiLog!]!`
- `debugAdapterLogs(limit: Int): [DebugAdapterLog!]!`
- `debugEvents(limit: Int): [DebugEvent!]!`
- `debugStateTransitions(entityId: String): [DebugStateTransition!]!`

Implementation approach: Start simple with a tabbed page showing log entries in tables. Use polling (5s interval) for near-real-time. Store debug data in Redis with short TTL (1 hour) to avoid database bloat.

### Tests:

- Page renders when env var is true
- Page returns 404 when env var is false/absent
- Debug data displays correctly

---

## DEV-09: Feedback Collection System [MUST, CRITICAL — can start immediately]

**Files:**
- Schema: already included in DEV-01 (Feedback model)
- GraphQL: `apps/graphql-server/src/feedback/` (new module)
- Portal: `apps/admin-portal/src/components/feedback/` (new) + `/platform/feedback/page.tsx` (new)

### GraphQL:

```graphql
mutation submitFeedback(input: SubmitFeedbackInput!): Feedback!
mutation updateFeedbackStatus(id: ID!, status: FeedbackStatus!): Feedback!
query feedbacks(tenantId: String, status: FeedbackStatus, category: FeedbackCategory, first: Int, after: String): FeedbackConnection!
```

### Portal components:

1. **Floating Feedback Button** — persistent bottom-right FAB on all SP portal pages. Opens modal with:
   - Category dropdown (Bug, Feature Request, UX Issue, Integration Question, Other)
   - Severity dropdown (Critical, Major, Minor, Suggestion)
   - Description textarea
   - Screenshot upload (file → S3 → store URL)
   - Auto-captured: current page URL (`window.location.href`), debug context if debug mode active
   - Submit button

2. **Platform Admin Feedback Page** at `/platform/feedback`:
   - Table: SP Name, User, Category, Severity, Description (truncated), Status, Date
   - Filters by SP, category, severity, status
   - Click → detail modal with full description, screenshot, debug context
   - Status update dropdown

### Tests:

- Submit feedback via GraphQL
- Feedback appears in platform admin list
- Status update works
- Floating button renders on portal pages

---

## DEV-10: NPS Survey Widget [SHOULD]

**Depends on:** DEV-09
**Files:**
- Schema: already included in DEV-01 (SurveyResponse model)
- Portal: `apps/admin-portal/src/components/survey/` (new)

### NPS widget on SP Admin dashboard:

- "How likely are you to recommend Lōns to another institution?" — 0-10 clickable scale
- Optional comment after scoring
- Show once per session (React state tracks dismissal)
- `submitSurveyResponse` GraphQL mutation

### Platform Admin aggregate on `/platform/feedback`:

- NPS Summary: Overall score (Promoters% - Detractors%), breakdown (Promoters 9-10, Passives 7-8, Detractors 0-6)
- Recent comments

---

## DEV-11: GraphQL CRUD for WalletProviderConfig [SHOULD]

**Depends on:** DEV-01, DEV-02

5 mutations (all require `sp_admin` role, scoped to tenant from JWT):

```graphql
createWalletProviderConfig(input: CreateWalletProviderConfigInput!): WalletProviderConfig!
updateWalletProviderConfig(id: ID!, input: UpdateWalletProviderConfigInput!): WalletProviderConfig!
deactivateWalletProviderConfig(id: ID!): WalletProviderConfig!
setDefaultWalletProvider(id: ID!): WalletProviderConfig!
testWalletConnection(id: ID!): ConnectionTestResult!
```

`testWalletConnection`: load config → instantiate adapter via WalletAdapterResolver → call `getBalance` with test wallet → return `{ success, latencyMs, errorMessage? }`

---

## DEV-12: O&M Portal Integration Settings Page [SHOULD]

**Depends on:** DEV-11

New page at `apps/admin-portal/src/app/(portal)/settings/integrations/page.tsx`:

- SP Admin view: current wallet provider card, provider selection dropdown, dynamic config form, test connection button, activate/deactivate toggle, notification provider section
- Platform Admin view at `/platform/integrations`: table of all SP configs

---

## DEV-13: Integration Tests for Staging Dataset [SHOULD]

**Depends on:** DEV-02 through DEV-07
**Directory:** `tests/staging/` (new at repo root)

Test suite runnable via `pnpm test:staging`:

1. Loan lifecycle for each of 4 product types using mock adapter
2. Adapter switching mid-lifecycle (active contracts unaffected)
3. Notification recording verification (query notification_mock_log)
4. Reconciliation with exceptions
5. Settlement with revenue sharing

Use Jest with longer timeouts. Tests run against a live staging environment (configurable base URL).

---

## GLOBAL RULES (from CLAUDE.md — do not violate):

1. **MONEY:** Never use float/number for amounts. Use Decimal (Prisma) / DECIMAL(19,4) (PostgreSQL). API responses: `{ "amount": "1234.5678", "currency": "GHS" }` — amount is a STRING.
2. **MULTI-TENANCY:** Every query must include tenant scoping. RLS on all new tables. Tenant from JWT. Never cross-tenant queries.
3. **SOFT DELETE:** No hard deletes for business data. Use `deletedAt`. Always filter `WHERE deletedAt IS NULL`.
4. **APPEND-ONLY:** Ledger entries and audit logs are append-only. No updates, no deletes.
5. **UUID v7:** All primary keys. Use `@default(dbgenerated("gen_random_uuid()"))`.
6. **TIMESTAMPS:** All tables: `createdAt` and `updatedAt` (timestamptz, UTC).
7. **PII MASKING:** PII must NEVER appear in logs. Mask: `+233***7890`, `GHA-***-XXX`.
8. **IDEMPOTENCY:** All mutations accept `idempotencyKey`. Same key = same result.
9. **ERROR FORMAT:** `{ code: string, message: string, details?: object }`.
10. **NAMING:** kebab-case files, PascalCase classes, camelCase GraphQL, snake_case DB columns.
11. **TESTING:** 80%+ coverage for business logic. Unit tests (Jest). Financial calcs need property-based tests.
