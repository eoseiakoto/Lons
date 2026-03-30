# Sprint 7 — Claude Code Implementation Instructions

**Sprint:** 7 (Jun 19 – Jun 30, 2026)
**Objective:** Staging readiness for SP prospect testing
**Scope:** Application code changes only (DEV-01 through DEV-13). Infrastructure tasks (DE-01 through DE-08) are handled by the Deployment Engineer.
**Prepared by:** PM (Claude) based on BA Sprint 7 Staging Readiness Directive and Environment Strategy & Adapter Configuration Plan.

---

## Parallelization Strategy

Tasks are organized into 4 parallel tracks. Agents can work on independent tracks simultaneously. Dependencies within tracks must be respected.

| Track | Tasks | Can Start Immediately? |
|-------|-------|----------------------|
| A: Adapter Infrastructure | DEV-01 → DEV-02, DEV-03, DEV-04, DEV-05 (parallel after DEV-01) → DEV-11 → DEV-12 | DEV-01 starts immediately |
| B: API & Seed Data | DEV-06 (independent), DEV-07 (after DEV-01 + DEV-03) | DEV-06 starts immediately |
| C: Feedback & Debug | DEV-08 + DEV-09 (both independent) → DEV-10 (after DEV-09) | Both start immediately |
| D: Integration Tests | DEV-13 (after DEV-02 through DEV-07) | Last to start |

**Critical path:** DEV-01 → DEV-02/03 → DEV-07 → DE-04 (DE team) → E2E validation.

**Priority legend:** Must = blocks staging E2E testing. Should = enhances quality but can defer.

---

## TRACK A: Adapter Infrastructure

### DEV-01: WalletProviderConfig + NotificationProviderConfig Prisma Models [MUST — START FIRST]

**Monday.com ID:** 11621710454
**Service/Module:** packages/database
**Story Points:** 5
**Dependencies:** None — this is the root dependency for the entire sprint
**Related:** FR-IA-003, FR-IA-004 (Docs/09-integrations.md §1.2)

#### What to Build

Add two new Prisma models and two new enums to `packages/database/prisma/schema.prisma`, then generate and run the migration.

#### 1. New Enums

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

#### 2. WalletProviderConfig Model

```prisma
model WalletProviderConfig {
  id                    String                @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId              String                @map("tenant_id") @db.Uuid
  providerType          WalletProviderType    @map("provider_type")
  environmentMode       AdapterEnvironmentMode @map("environment_mode")
  displayName           String                @map("display_name") @db.VarChar(255)
  apiBaseUrl            String?               @map("api_base_url") @db.VarChar(512)
  credentialsSecretRef  String?               @map("credentials_secret_ref") @db.VarChar(512)
  webhookSigningKeyRef  String?               @map("webhook_signing_key_ref") @db.VarChar(512)
  configJson            Json?                 @map("config_json") @db.JsonB
  isActive              Boolean               @default(true) @map("is_active")
  isDefault             Boolean               @default(false) @map("is_default")
  createdAt             DateTime              @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt             DateTime              @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt             DateTime?             @map("deleted_at") @db.Timestamptz(6)

  tenant                Tenant                @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, providerType, isActive], name: "uq_wallet_provider_active")
  @@index([tenantId])
  @@map("wallet_provider_configs")
}
```

#### 3. NotificationProviderConfig Model

```prisma
model NotificationProviderConfig {
  id                    String                    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId              String                    @map("tenant_id") @db.Uuid
  providerType          NotificationProviderType  @map("provider_type")
  environmentMode       AdapterEnvironmentMode    @map("environment_mode")
  displayName           String                    @map("display_name") @db.VarChar(255)
  credentialsSecretRef  String?                   @map("credentials_secret_ref") @db.VarChar(512)
  configJson            Json?                     @map("config_json") @db.JsonB
  isActive              Boolean                   @default(true) @map("is_active")
  isDefault             Boolean                   @default(false) @map("is_default")
  createdAt             DateTime                  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt             DateTime                  @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt             DateTime?                 @map("deleted_at") @db.Timestamptz(6)

  tenant                Tenant                    @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, providerType, isActive], name: "uq_notification_provider_active")
  @@index([tenantId])
  @@map("notification_provider_configs")
}
```

#### 4. NotificationMockLog Model (for DEV-05)

```prisma
model NotificationMockLog {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String    @map("tenant_id") @db.Uuid
  channel         String    @db.VarChar(20)  // SMS, EMAIL, PUSH
  recipient       String    @db.VarChar(255)
  templateId      String?   @map("template_id") @db.VarChar(100)
  renderedContent String    @map("rendered_content") @db.Text
  status          String    @db.VarChar(20)  // SENT, FAILED
  correlationId   String?   @map("correlation_id") @db.VarChar(100)
  createdAt       DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)

  tenant          Tenant    @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@index([correlationId])
  @@map("notification_mock_log")
}
```

#### 5. Update Tenant Model

Add relation fields to the existing `Tenant` model:

```prisma
// Add these relation fields to the Tenant model
walletProviderConfigs       WalletProviderConfig[]
notificationProviderConfigs NotificationProviderConfig[]
notificationMockLogs        NotificationMockLog[]
```

#### 6. Migration

```bash
cd packages/database
npx prisma migrate dev --name add_adapter_config_models
npx prisma generate
```

#### 7. Shared Types

Export the new enums and types from `packages/shared-types/` so other services can import them.

#### Acceptance Criteria
- [ ] All 3 models and 3 enums added to schema.prisma
- [ ] Migration runs cleanly on a fresh database
- [ ] `npx prisma generate` succeeds
- [ ] Shared types exported
- [ ] No breaking changes to existing models
- [ ] RLS policy documented (tenant_id scoping) — RLS SQL should be added to migration

---

### DEV-02: WalletAdapterResolver Service [MUST]

**Monday.com ID:** 11621706791
**Service/Module:** integration-service
**Story Points:** 5
**Dependencies:** DEV-01
**Related:** FR-IA-001, FR-DW-004.2 (Docs/09-integrations.md §1.2, §2.4)

#### What to Build

Create a `WalletAdapterResolver` service in `services/integration-service/src/adapters/` that replaces global env-var-based adapter selection with per-tenant database-driven resolution.

#### Implementation Details

**File:** `services/integration-service/src/adapters/wallet-adapter-resolver.service.ts`

```typescript
@Injectable()
export class WalletAdapterResolver {
  // Dependencies: PrismaService, RedisService, MtnMomoAdapter, MpesaAdapter, GenericWalletAdapter, MockWalletAdapter

  async resolve(tenantId: string): Promise<IWalletAdapter> {
    // 1. Check Redis cache: key = `wallet-config:${tenantId}`, TTL = 60s
    // 2. If cache miss, query WalletProviderConfig where tenantId + isActive + isDefault
    // 3. Production environment guard:
    //    if (process.env.ALLOW_MOCK_ADAPTERS === 'false' && config.providerType === 'MOCK') {
    //      throw new ForbiddenException('Mock adapters not allowed in this environment');
    //      // Log audit entry
    //    }
    // 4. Based on providerType, instantiate adapter:
    //    - MOCK → MockWalletAdapter (pass config.configJson for failure_rate, latency, etc.)
    //    - MTN_MOMO → MtnMomoAdapter (pass environmentMode, credentials from Secrets Manager)
    //    - MPESA → MpesaAdapter (pass environmentMode, credentials from Secrets Manager)
    //    - AIRTEL_MONEY → placeholder (throw NotImplemented for now)
    //    - GENERIC → GenericWalletAdapter (pass full configJson)
    // 5. Cache the config in Redis (not the adapter instance — just the config for fast lookup)
    // 6. Return the adapter instance
  }

  async invalidateCache(tenantId: string): Promise<void> {
    // Delete Redis key on config change
  }
}
```

#### Key Design Decisions
- **Cache config, not adapters** — adapter instances are lightweight to create; caching the config avoids serialization issues
- **60s TTL** — balances freshness with database load. Config changes take up to 60s to propagate (acceptable for staging)
- **Production guard** — `ALLOW_MOCK_ADAPTERS` env var, set to `true` in staging Helm values, `false` in production
- **Existing adapters unchanged** — MTN MoMo, M-Pesa, Generic adapters keep their current implementation; only instantiation changes

#### Integration Point
Update `services/integration-service/src/integration-service.module.ts` to register the resolver. Update any service that currently injects a wallet adapter directly (e.g., disbursement flows in process-engine) to use the resolver instead.

#### Acceptance Criteria
- [ ] WalletAdapterResolver resolves correct adapter per tenant
- [ ] Redis caching with 60s TTL works
- [ ] Production guard blocks MOCK when ALLOW_MOCK_ADAPTERS=false
- [ ] Audit log entry on production guard violation
- [ ] Cache invalidation on config change
- [ ] Unit tests with mock Redis and mock Prisma

---

### DEV-03: Full MockWalletAdapter [MUST]

**Monday.com ID:** 11621722701
**Service/Module:** integration-service
**Story Points:** 8
**Dependencies:** DEV-01
**Related:** FR-DW-001.1 (Docs/09-integrations.md §2.2)

#### What to Build

Upgrade the existing mock wallet adapter from `services/process-engine/src/disbursement/adapters/mock-wallet.adapter.ts` (which only handles disbursement) into a full `IWalletAdapter` implementation. Place the new version in `services/integration-service/src/adapters/mock/mock-wallet.adapter.ts`.

#### Interface Implementation

The adapter must implement all 7 operations defined in `services/integration-service/src/adapters/wallet-adapter.types.ts`:

| Operation | Mock Behavior |
|-----------|--------------|
| `getCustomerInfo(walletId)` | Return synthetic customer data keyed by walletId. Support configurable KYC levels (full, partial, none) via config_json. |
| `getBalance(walletId)` | Return configurable balance (default: 50000.0000). Adjust dynamically after disburse/collect calls using in-memory state. |
| `getTransactionHistory(walletId, dateRange)` | Return synthetic transactions. Generate deposits, withdrawals, transfers with configurable volume. |
| `disburse(walletId, amount, ref)` | Succeed unless random < failure_rate. Generate transaction reference. Update in-memory balance. Record for getBalance/getTransactionHistory consistency. |
| `collect(walletId, amount, ref)` | Succeed if mock balance >= amount (else INSUFFICIENT_FUNDS). Configurable failure_rate for network/timeout errors. |
| `getTransactionStatus(txRef)` | Return status for previously mocked transactions. Support configurable delay before PENDING → COMPLETED transition. |
| `registerWebhook(events, url)` | Record the registration. After disburse/collect, send HTTP callback to registered URL after webhook_delay_ms. |

#### Configurable Parameters (from config_json)

```typescript
interface MockWalletConfig {
  failure_rate: number;        // 0.0–1.0, default 0.0
  latency_ms: number;          // simulated delay, default 100
  webhook_delay_ms: number;    // callback delay, default 2000
  initial_balance: number;     // default 50000.0000
  supported_currencies: string[]; // default ["GHS", "KES", "NGN"]
}
```

#### In-Memory State Management
- Use a `Map<string, MockWalletState>` to track per-wallet balances and transaction history within the adapter instance
- State is ephemeral (resets on service restart) — this is acceptable for mock purposes
- Use `Decimal` from `@prisma/client/runtime/library` or a decimal library for all balance calculations — **never float**

#### Webhook Delivery
- When `registerWebhook` is called, store the callback URL and event types
- After `disburse` or `collect` completes, use `setTimeout` (webhook_delay_ms) to POST a callback to registered URLs
- Callback payload should match the structure real providers would send (see FR-DW-001.1)
- Use `HttpService` (Axios) for webhook delivery; catch and log failures but don't throw

#### Latency Simulation
- Every operation should `await sleep(config.latency_ms)` before returning
- This helps UI developers build loading states and helps test timeout handling

#### Acceptance Criteria
- [ ] All 7 IWalletAdapter operations implemented
- [ ] Configurable via config_json parameters
- [ ] In-memory balance tracking (disburse decrements, collect increments)
- [ ] Webhook callback delivery with configurable delay
- [ ] Latency simulation on all operations
- [ ] Failure rate simulation (random failures based on config)
- [ ] Unit tests for each operation including edge cases
- [ ] Money handled as Decimal, never float

---

### DEV-04: NotificationAdapterResolver [MUST]

**Monday.com ID:** 11621706879
**Service/Module:** notification-service
**Story Points:** 3
**Dependencies:** DEV-01
**Related:** FR-NS-001.3 (Docs/09-integrations.md §6.1)

#### What to Build

Create a `NotificationAdapterResolver` service in `services/notification-service/src/adapters/` following the same pattern as DEV-02 (WalletAdapterResolver).

#### Implementation Details

**File:** `services/notification-service/src/adapters/notification-adapter-resolver.service.ts`

```typescript
@Injectable()
export class NotificationAdapterResolver {
  async resolve(tenantId: string, channel: 'SMS' | 'EMAIL' | 'PUSH'): Promise<INotificationAdapter> {
    // 1. Check Redis cache: key = `notification-config:${tenantId}`, TTL = 60s
    // 2. Query NotificationProviderConfig for tenant's active default
    // 3. Based on providerType:
    //    - CONSOLE → ConsoleNotificationAdapter (existing)
    //    - RECORDING_MOCK → RecordingNotificationAdapter (DEV-05)
    //    - AFRICAS_TALKING → AfricasTalkingAdapter (existing)
    //    - TWILIO → placeholder (throw NotImplemented)
    //    - SMTP → EmailNotificationAdapter (existing)
    //    - FCM → placeholder (throw NotImplemented)
    // 4. Return adapter instance
  }
}
```

#### Integration
- Update `services/notification-service/src/adapters/notification-adapter.factory.ts` to delegate to the resolver when a tenant context is available
- Fallback to existing factory behavior (env-var based) when no NotificationProviderConfig exists for the tenant — backward compatibility

#### Acceptance Criteria
- [ ] Resolves correct notification adapter per tenant
- [ ] Redis caching with 60s TTL
- [ ] Falls back to existing factory when no config exists
- [ ] Unit tests

---

### DEV-05: RecordingNotificationAdapter [MUST]

**Monday.com ID:** 11621710464
**Service/Module:** notification-service
**Story Points:** 5
**Dependencies:** DEV-01
**Related:** FR-NS-001.3

#### What to Build

Create a `RecordingNotificationAdapter` that implements the notification adapter interface and stores all dispatched notifications in the `notification_mock_log` table (defined in DEV-01).

**File:** `services/notification-service/src/adapters/recording-notification.adapter.ts`

#### Implementation Details

```typescript
@Injectable()
export class RecordingNotificationAdapter implements INotificationAdapter {
  constructor(private prisma: PrismaService) {}

  async send(params: {
    tenantId: string;
    channel: 'SMS' | 'EMAIL' | 'PUSH';
    recipient: string;
    templateId: string;
    renderedContent: string;
    correlationId?: string;
  }): Promise<{ success: boolean; messageId: string }> {
    // 1. Insert into notification_mock_log table
    // 2. Return success with generated messageId
    // 3. Also log to console for debugging visibility
  }
}
```

#### Staging-Only GraphQL Query

Add a test query to retrieve mock notification logs. **Guard with environment check** — only available when `ALLOW_MOCK_ADAPTERS=true`:

```graphql
query notificationMockLogs($tenantId: String!, $correlationId: String) {
  notificationMockLogs(tenantId: $tenantId, correlationId: $correlationId) {
    id
    channel
    recipient
    templateId
    renderedContent
    status
    correlationId
    createdAt
  }
}
```

Add this query to `apps/graphql-server/` with an environment guard decorator.

#### Acceptance Criteria
- [ ] All notifications stored in notification_mock_log table
- [ ] GraphQL query to retrieve logs (staging-only)
- [ ] Environment guard prevents query in production
- [ ] Console logging for debug visibility
- [ ] Unit tests

---

### DEV-11: GraphQL Mutations for WalletProviderConfig CRUD [SHOULD]

**Monday.com ID:** 11621695473
**Service/Module:** graphql-server
**Story Points:** 5
**Dependencies:** DEV-01, DEV-02
**Related:** FR-DW-001.1

#### What to Build

Add GraphQL mutations for managing WalletProviderConfig records. These are admin operations for SP Admins to configure their wallet provider.

#### Mutations

```graphql
mutation createWalletProviderConfig(input: CreateWalletProviderConfigInput!): WalletProviderConfig!
mutation updateWalletProviderConfig(id: ID!, input: UpdateWalletProviderConfigInput!): WalletProviderConfig!
mutation deactivateWalletProviderConfig(id: ID!): WalletProviderConfig!
mutation setDefaultWalletProvider(id: ID!): WalletProviderConfig!
mutation testWalletConnection(id: ID!): ConnectionTestResult!
```

#### Authorization
- `createWalletProviderConfig`, `updateWalletProviderConfig`, `deactivateWalletProviderConfig`, `setDefaultWalletProvider` require `sp_admin` role
- `testWalletConnection` requires `sp_admin` or `sp_operator` role
- All operations scoped to the tenant from JWT context

#### Test Connection
The `testWalletConnection` mutation should:
1. Load the WalletProviderConfig by ID
2. Instantiate the adapter via WalletAdapterResolver
3. Call a health check operation (e.g., `getBalance` with a test wallet ID)
4. Return `{ success: boolean, latencyMs: number, errorMessage?: string }`

#### Acceptance Criteria
- [ ] All 5 mutations implemented
- [ ] Authorization guards for sp_admin role
- [ ] Tenant scoping via JWT
- [ ] Test connection validates adapter config
- [ ] Idempotency key support on create/update mutations
- [ ] Unit tests

---

### DEV-12: O&M Portal Integration Settings Page [SHOULD]

**Monday.com ID:** 11621695414
**Service/Module:** admin-portal
**Story Points:** 8
**Dependencies:** DEV-11
**Related:** FR-AP-INT

#### What to Build

Add a new page at `/settings/integrations` in the admin portal (Next.js app at `apps/admin-portal/`).

#### SP Admin View (`/settings/integrations`)

- **Current Wallet Provider** card showing active provider, environment mode, status
- **Provider Selection** dropdown: Mock, MTN MoMo, M-Pesa, Airtel Money, Generic
- **Configuration Form** (dynamic based on provider):
  - Mock: failure_rate slider, latency_ms input, webhook_delay_ms input
  - MTN MoMo: API key, API secret, subscription key, environment (sandbox/production)
  - M-Pesa: consumer key, consumer secret, shortcode, passkey, environment
  - Generic: base URL, auth header key/value, custom config JSON
- **Test Connection** button → calls `testWalletConnection` mutation → shows success/failure with latency
- **Activate/Deactivate** toggle
- **Notification Provider** section (same pattern for notification config)

#### Platform Admin View (`/platform/integrations`)

- Table of all SP integration configs across tenants
- Columns: SP Name, Wallet Provider, Environment Mode, Status, Last Tested
- Click row → opens detail view

#### UI Components
- Follow existing admin portal patterns (check `apps/admin-portal/src/app/(portal)/` for layout patterns)
- Use existing UI component library (shadcn/ui or whatever the portal currently uses)
- Form validation on credential fields
- Loading states during test connection

#### Acceptance Criteria
- [ ] SP Admin can view and configure wallet provider
- [ ] SP Admin can test connection
- [ ] Platform Admin can view all SP configs
- [ ] Form validation
- [ ] Loading states and error handling

---

## TRACK B: API & Seed Data

### DEV-06: Expand REST API for SP System-to-System Integration [MUST]

**Monday.com ID:** 11621722832
**Service/Module:** rest-server
**Story Points:** 13
**Dependencies:** None — can start immediately
**Related:** Docs/07-api-specifications.md §3

#### What to Build

Expand the REST API at `apps/rest-server/` with comprehensive endpoints for SP system-to-system integration. Currently the REST server has endpoints in: `customer/`, `contract/`, `loan-request/`, `product/`, `repayment/`, `webhook/`. These need to be expanded.

#### New/Expanded Endpoints

All endpoints are authenticated via API Key + Secret in headers (`X-API-Key` + `X-API-Secret`). Tenant resolved from API key.

**Customer Management:**
| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/customers` | Create or sync a customer record from SP's system |
| GET | `/v1/customers/:id` | Get customer detail including KYC status, wallet info |
| GET | `/v1/customers` | List customers with pagination, search, filter |

**Loan Origination:**
| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/loan-requests` | Submit loan request with full payload (customer, product, amount, term) |
| GET | `/v1/loan-requests/:id` | Get loan request status and details |
| GET | `/v1/loan-requests` | List loan requests with filters (status, date range) |

**Contract & Schedule:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/contracts/:id` | Get contract detail (status, balance, DPD) |
| GET | `/v1/contracts/:id/schedule` | Get repayment schedule |
| GET | `/v1/contracts` | List contracts with filters |

**Repayment:**
| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/repayments` | Record a payment (amount, contract reference, payment method) |
| GET | `/v1/repayments` | List repayments with filter by contractId, date range |

**Webhooks:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/webhooks` | List registered webhooks |
| POST | `/v1/webhooks` | Register a new webhook (events, callback URL) |
| DELETE | `/v1/webhooks/:id` | Remove a webhook registration |

**API Key Management:**
| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/api-keys/rotate` | Rotate API secret (returns new secret, old one remains valid for 24h) |

#### Implementation Notes

- **Reuse existing service layer** — the REST controllers should call the same service classes that the GraphQL resolvers use. Do NOT duplicate business logic.
- **OpenAPI/Swagger documentation** — use `@nestjs/swagger` decorators (`@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiProperty`) on all controllers and DTOs. The Swagger UI should be accessible at `/api/docs` on the REST server.
- **Authentication** — implement an `ApiKeyGuard` that validates `X-API-Key` + `X-API-Secret` headers against the existing API key records in the database. Resolve tenant context from the API key.
- **Error format** — use structured error responses: `{ code: string, message: string, details?: object }` per CLAUDE.md rules.
- **Pagination** — use offset-based pagination for REST (different from GraphQL cursor-based): `?page=1&limit=20`. Return `{ data: [], meta: { page, limit, total, totalPages } }`.
- **Idempotency** — POST endpoints accept `X-Idempotency-Key` header.

#### Acceptance Criteria
- [ ] All 14 endpoints implemented and functional
- [ ] API Key + Secret authentication working
- [ ] Tenant scoping from API key
- [ ] OpenAPI/Swagger docs at /api/docs
- [ ] Structured error responses
- [ ] Pagination on list endpoints
- [ ] Idempotency key support on POST endpoints
- [ ] Integration tests for critical paths (create customer → create loan request → record repayment)

---

### DEV-07: Comprehensive Staging Seed Script [MUST]

**Monday.com ID:** 11621706912
**Service/Module:** packages/database
**Story Points:** 8
**Dependencies:** DEV-01 (Prisma models), DEV-03 (MockWalletAdapter for config references)
**Related:** Environment Strategy doc Section 5

#### What to Build

Extend `packages/database/prisma/seed.ts` with an `ENVIRONMENT=staging` flag that provisions comprehensive test data.

#### Seed Data Specification

**1. Service Providers (Tenants):**

| SP Name | Country | Products | Wallet Provider | Currency | Lenders |
|---------|---------|----------|----------------|----------|---------|
| GhanaLend Financial | Ghana | All 4 types (Overdraft, Micro-Loan, BNPL, Invoice Factoring) | Mock (simulating MTN MoMo) | GHS | 2 lender configs |
| KenyaCredit Ltd | Kenya | Overdraft, Micro-loan, BNPL | Mock (simulating M-Pesa) | KES | 1 lender config |
| NaijaFunds Inc | Nigeria | Micro-loan, BNPL, Invoice Factoring | Mock (simulating Generic) | NGN | 2 lender configs |

Per SP, create: SP Admin user, SP Operator user, SP Analyst user, SP Auditor user. Pre-generate API credentials (client ID + secret). Provision webhook signing key.

Also create: 1 Platform Admin user (superadmin@lons.io).

**2. WalletProviderConfig per SP:**
- GhanaLend: providerType=MOCK, displayName="Mock MTN MoMo (Staging)", environmentMode=SANDBOX, configJson with initial_balance=50000, supported_currencies=["GHS"]
- KenyaCredit: providerType=MOCK, displayName="Mock M-Pesa (Staging)", environmentMode=SANDBOX, configJson with initial_balance=100000, supported_currencies=["KES"]
- NaijaFunds: providerType=MOCK, displayName="Mock Generic Wallet (Staging)", environmentMode=SANDBOX, configJson with initial_balance=200000, supported_currencies=["NGN"]

**3. NotificationProviderConfig per SP:**
- All SPs: providerType=RECORDING_MOCK, displayName="Recording Mock (Staging)", environmentMode=SANDBOX

**4. Loan Products per SP:**
- Active products: at least 1 per product type enabled for the SP (full config per FR-LP-002.1)
- Suspended product: 1 product suspended — existing contracts managed, no new applications
- Discontinued product: 1 read-only with completed/defaulted contracts
- Draft product: 1 in draft state, not yet activated

**5. Customers & Contracts per SP (minimum 16 profiles):**

| Customer Profile | Contract State(s) |
|-----------------|-------------------|
| New customer (no history) | Pre-qualification check only, no contracts |
| Active borrower — current | 1 active contract, all repayments on time, 0 DPD |
| Active borrower — multiple products | 2+ active contracts across different product types |
| Overdue — 30 DPD | 1 contract, 30 days past due, reminder notifications sent |
| Overdue — 60 DPD | 1 contract, 60 days past due, in collections queue |
| Overdue — 90+ DPD | 1 contract, 90+ days past due, escalated recovery action |
| Defaulted | 1 contract written off. Customer still active. |
| Fully repaid | 1 completed contract, all repayments settled, contract closed |
| Partial early repayment | 1 active contract with partial early repayment recorded |
| Restructured | 1 contract restructured with new repayment schedule |
| Blacklisted customer | Blacklisted for fraud. Pre-qualification must reject. |
| Watchlist customer | On watchlist — requires manual review |
| High credit score | Score > 800. Auto-approved. |
| Low credit score | Score < 400. Auto-rejected. |
| Borderline credit score | Score in manual review range. Pending approval. |
| Expired consent | Revoked data access consent — system must not pull wallet data |

**6. Financial Records:**
- Ledger entries: double-entry records for all seeded contracts (disbursements, repayments, fees, interest accruals, penalties)
- Reconciliation records: 2 completed daily reconciliation batches + 1 with exceptions (unmatched transactions, amount mismatches)
- Settlement records: 1 completed revenue settlement cycle with revenue sharing splits
- Notification history: mock notification records for approval, disbursement confirmation, repayment reminders, overdue alerts, collections notices
- Audit log entries: product creation, customer onboarding, loan approval, configuration changes

#### Implementation Notes

- **Conditional execution:** Check `process.env.ENVIRONMENT === 'staging'` to run the staging seed. The default seed (dev) should remain unchanged.
- **Idempotent:** Running the staging seed twice should not create duplicates. Use `upsert` where possible, or check existence before creating.
- **Use existing tenant-onboarding patterns:** The codebase already has tenant provisioning logic — extend it rather than rewriting.
- **Money as Decimal:** All monetary amounts in seed data must use string representations (e.g., `"50000.0000"`) per CLAUDE.md rules.
- **Realistic dates:** Use dates relative to `new Date()` so the seed data always looks current. E.g., "30 DPD" customer should have a due date 30 days in the past.

#### Acceptance Criteria
- [ ] 3 SPs with full user sets and API credentials
- [ ] WalletProviderConfig and NotificationProviderConfig for each SP
- [ ] All 4 product types per SP (where applicable) in various states
- [ ] 16+ customer profiles per SP covering all lifecycle stages
- [ ] Ledger entries, reconciliation records, settlement records
- [ ] Notification history, audit logs
- [ ] Blacklisted, watchlist, and expired consent customers
- [ ] Idempotent execution
- [ ] Script runs successfully: `ENVIRONMENT=staging pnpm --filter database db:seed`

---

## TRACK C: Feedback & Debug

### DEV-08: Staging Debug Mode [MUST]

**Monday.com ID:** 11621697359
**Service/Module:** admin-portal
**Story Points:** 8
**Dependencies:** None — can start immediately
**Related:** Staging Readiness Directive §3.4

#### What to Build

Implement a debug panel in the Admin Portal accessible when `STAGING_DEBUG_MODE=true` (env var). This helps SP prospects and the team understand system behavior during testing.

#### Implementation

**Location:** `apps/admin-portal/src/app/(portal)/debug/page.tsx` (new page) + a collapsible debug sidebar component

**Debug Panel Sections:**

1. **API Call Log** — Real-time list of all API requests/responses made by the current user session:
   - Method, URL, status code, response time
   - Expandable to see request/response bodies
   - Filter by endpoint, status code

2. **Adapter Operation Log** — Mock wallet and notification adapter activity:
   - Operation type (disburse, collect, getBalance, etc.)
   - Input parameters, response, latency
   - Pull from notification_mock_log table and a new adapter_operation_log (or use Redis pub/sub for real-time)

3. **Event Bus Activity** — Events emitted by the system:
   - Event name, payload, timestamp
   - Filter by event type
   - Use WebSocket subscription to display in real-time

4. **State Machine Transitions** — Loan request and contract state changes:
   - Entity ID, from state → to state, timestamp, trigger
   - Timeline view per loan/contract

5. **Scoring Breakdowns** — Credit scoring factor contributions:
   - Score components, weights, individual scores
   - Rule-based vs ML model breakdown

6. **Timing Information** — Operation timing for each major flow step:
   - Total request time, database query time, adapter call time, queue processing time

#### Environment Guard
```typescript
// In layout or middleware
if (process.env.NEXT_PUBLIC_STAGING_DEBUG_MODE !== 'true') {
  // Don't render debug panel/page
  // Return 404 or redirect
}
```

#### Implementation Approach
- Start simple: a `/debug` page with tabbed sections showing log entries in tables
- Use Server-Sent Events (SSE) or polling for real-time updates
- Backend endpoints needed: `GET /debug/api-logs`, `GET /debug/adapter-logs`, `GET /debug/events`, `GET /debug/state-transitions` — all guarded by environment check and admin role

#### Acceptance Criteria
- [ ] Debug page accessible at /debug when STAGING_DEBUG_MODE=true
- [ ] Not accessible when env var is false/missing
- [ ] API call logs visible with request/response details
- [ ] Adapter operation logs visible
- [ ] Event bus activity visible
- [ ] State machine transitions visible
- [ ] Scoring breakdowns visible
- [ ] Timing information displayed

---

### DEV-09: Feedback Collection System [MUST]

**Monday.com ID:** 11621697317
**Service/Module:** admin-portal
**Story Points:** 8
**Dependencies:** None — can start immediately
**Related:** Staging Readiness Directive §3.4

#### What to Build

Add a feedback collection system to the admin portal for SP prospects to report issues and suggestions.

#### 1. Prisma Model

Add to `packages/database/prisma/schema.prisma`:

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
```

Update Tenant and User models with the relation field.

#### 2. GraphQL Mutations & Queries

```graphql
mutation submitFeedback(input: SubmitFeedbackInput!): Feedback!
query feedbacks(tenantId: String, status: FeedbackStatus, category: FeedbackCategory): FeedbackConnection!
mutation updateFeedbackStatus(id: ID!, status: FeedbackStatus!): Feedback!
```

#### 3. Admin Portal UI

**Floating Feedback Button** — persistent on all portal pages for SP users:
- Floating action button (bottom-right) labeled "Send Feedback"
- Opens a modal/drawer with the feedback form

**Feedback Form:**
- Category dropdown (Bug, Feature Request, UX Issue, Integration Question, Other)
- Severity dropdown (Critical, Major, Minor, Suggestion)
- Description (rich text or textarea)
- Screenshot upload (file input → S3 upload → store URL)
- Current page URL (auto-captured from `window.location`)
- Debug context (auto-attached if debug mode is active)
- Submit button

**Platform Admin View** — `/platform/feedback`:
- Table listing all feedback across all SPs
- Columns: SP Name, User, Category, Severity, Description (truncated), Status, Date
- Filters: by SP, category, severity, status
- Click row → detail view with full description, screenshot, debug context
- Status update dropdown (Acknowledged, In Progress, Resolved, Closed)

#### Acceptance Criteria
- [ ] Feedback Prisma model and migration
- [ ] GraphQL mutations for submit and status update
- [ ] Floating feedback button on all SP portal pages
- [ ] Feedback form with all fields
- [ ] Screenshot upload functional
- [ ] Auto-capture page URL and debug context
- [ ] Platform Admin feedback list page with filters
- [ ] Platform Admin can update feedback status

---

### DEV-10: Feedback Survey / NPS Widget [SHOULD]

**Monday.com ID:** 11621697362
**Service/Module:** admin-portal
**Story Points:** 3
**Dependencies:** DEV-09
**Related:** Staging Readiness Directive §4.1

#### What to Build

Add an NPS (Net Promoter Score) widget to the SP Admin dashboard.

#### 1. Prisma Model

```prisma
model SurveyResponse {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId  String   @map("tenant_id") @db.Uuid
  userId    String   @map("user_id") @db.Uuid
  score     Int      // 0-10 NPS scale
  comment   String?  @db.Text
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  tenant    Tenant   @relation(fields: [tenantId], references: [id])
  user      User     @relation(fields: [userId], references: [id])

  @@index([tenantId])
  @@map("survey_responses")
}
```

#### 2. NPS Widget on Dashboard

- Display on the SP Admin dashboard: "How likely are you to recommend Lōns to another institution?"
- 0–10 scale with clickable numbers (0 = Not at all likely, 10 = Extremely likely)
- Optional comment field after scoring
- Only show once per session (use React state to track dismissal)
- Store response via `submitSurveyResponse` GraphQL mutation

#### 3. Platform Admin Aggregate View

- On `/platform/feedback` page, add an NPS Summary section:
  - Overall NPS score (Promoters % - Detractors %)
  - Breakdown: Promoters (9-10), Passives (7-8), Detractors (0-6)
  - Trend over time (if enough data)
  - Recent comments

#### Acceptance Criteria
- [ ] SurveyResponse model and migration
- [ ] NPS widget on SP Admin dashboard
- [ ] Score submission via GraphQL
- [ ] Platform Admin NPS aggregate view
- [ ] Widget shows once per session

---

## TRACK D: Integration Tests

### DEV-13: Integration Tests for Staging Dataset [SHOULD]

**Monday.com ID:** 11621704320
**Service/Module:** packages/common (test utilities)
**Story Points:** 5
**Dependencies:** DEV-02, DEV-03, DEV-04, DEV-05, DEV-06, DEV-07
**Related:** QA

#### What to Build

Write an integration test suite runnable via `pnpm test:staging` that validates the staging environment end-to-end.

#### Test Scenarios

1. **Loan Lifecycle per Product Type** — For each of the 4 product types:
   - Create loan request → scoring → approval → offer → contract → disbursement → repayment → settlement
   - All using mock wallet adapter
   - Verify each state transition emits correct events

2. **Adapter Switching Mid-Lifecycle** — Verify that:
   - Changing an SP's WalletProviderConfig does not affect in-flight transactions
   - Active contracts continue using the adapter that initiated them
   - New operations use the new adapter

3. **Notification Recording Verification** — For each lifecycle stage:
   - Query notification_mock_log
   - Verify correct notifications sent (approval, disbursement confirmation, repayment reminder, overdue alert)

4. **Reconciliation with Exceptions** — Verify:
   - Seeded reconciliation batch with exceptions is queryable
   - Unmatched transactions and amount mismatches are properly flagged

5. **Settlement with Revenue Sharing** — Verify:
   - Settlement records show correct revenue splits between SP and lender
   - Double-entry ledger entries balance

#### Implementation
- Place tests in a new `tests/staging/` directory at the repo root
- Use Jest with longer timeouts (staging tests may be slower)
- Tests should be able to run against a live staging environment (configurable base URL)
- Add `"test:staging": "jest --config tests/staging/jest.config.ts"` to root package.json

#### Acceptance Criteria
- [ ] Loan lifecycle tests for all 4 product types
- [ ] Adapter switching test
- [ ] Notification recording verification
- [ ] Reconciliation exception verification
- [ ] Settlement revenue sharing verification
- [ ] Tests pass against staging seed data
- [ ] Runnable via `pnpm test:staging`

---

## Appendix: New Monday.com Item IDs

| Task | Monday.com ID | Track |
|------|--------------|-------|
| DEV-01 | 11621710454 | A |
| DEV-02 | 11621706791 | A |
| DEV-03 | 11621722701 | A |
| DEV-04 | 11621706879 | A |
| DEV-05 | 11621710464 | A |
| DEV-06 | 11621722832 | B |
| DEV-07 | 11621706912 | B |
| DEV-08 | 11621697359 | C |
| DEV-09 | 11621697317 | C |
| DEV-10 | 11621697362 | C |
| DEV-11 | 11621695473 | A |
| DEV-12 | 11621695414 | A |
| DEV-13 | 11621704320 | D |
| DE-01 | 11621695509 | Infra |
| DE-02 | 11621695485 | Infra |
| DE-03 | 11621695418 | Infra |
| DE-04 | 11621687243 | Infra |
| DE-05 | 11621695505 | Infra |
| DE-06 | 11621687102 | Infra |
| DE-07 | 11621695517 | Infra |
| DE-08 | 11621695425 | Infra |

## Appendix: Deferred Items (Sprints 8-9)

Original Sprint 7 tasks moved to later sprints:

**Sprint 8:**
- 11618352021 — Docs: Architecture diagram, config guide, go-live checklist
- 11618338117 — AWS: Cost estimation, savings plans, teardown automation
- 11618338088 — CI: Path-based triggers & load test in pre-prod

**Sprint 9:**
- 11618344411 — Security: Penetration testing coordination
- 11618338195 — GO-LIVE: Final production deployment & verification
