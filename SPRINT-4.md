# Sprint 4 Development Brief — Phase 5: Integrations

**Sprint:** 4 of 7
**Dates:** May 8 – May 21, 2026
**Phase:** Phase 5 — Integrations & AI (Part 1: Integrations)
**Story Points:** 60
**Tasks:** 8

---

## Sprint Goal

Build production-realistic wallet adapters, SMS notification provider, expanded credit bureau integration, integration health monitoring, and API documentation. All adapters follow the established adapter pattern with realistic sandbox behavior — they simulate real provider APIs (OAuth flows, callbacks, error scenarios) without hitting live endpoints.

---

## Context & What's Already Built

Sprint 4 builds on a solid integration foundation from Phases 1–3:

### Existing Adapter Infrastructure
- **Wallet adapter interface** (`IWalletAdapter`): `transfer()`, `collect()`, `getBalance()`, `getTransactionStatus()` — defined in `services/process-engine/src/disbursement/adapters/wallet-adapter.interface.ts` (43 lines)
- **MockWalletAdapter**: 209 lines with configurable success/failure rates, network delays, transaction state tracking — in `services/process-engine/src/disbursement/adapters/mock-wallet.adapter.ts`
- **MTN MoMo stub**: 30 lines, logs only — `services/integration-service/src/adapters/mtn-momo.adapter.ts`
- **M-Pesa stub**: 30 lines, logs only — `services/integration-service/src/adapters/mpesa.adapter.ts`

### Existing Notification Infrastructure
- **NotificationService**: 319 lines, event-driven dispatch, template rendering, multi-channel routing — `services/notification-service/src/notification.service.ts`
- **Template renderer**: 106 lines, 10+ templates, variable interpolation — `services/notification-service/src/templates/template-renderer.ts`
- **SMS adapter stub**: 34 lines, logs only — `services/notification-service/src/adapters/sms-notification.adapter.ts`
- **Email adapter stub**: 34 lines, logs only — `services/notification-service/src/adapters/email-notification.adapter.ts`
- **AdapterFactory**: 21 lines — `services/notification-service/src/adapters/notification-adapter.factory.ts`

### Existing Credit Bureau Infrastructure
- **ICreditBureauAdapter** interface: `queryReport()`, `submitPositiveData()`, `submitNegativeData()` — `services/integration-service/src/credit-bureau/credit-bureau.interface.ts`
- **CreditBureauService**: 36 lines with 24h cache — `services/integration-service/src/credit-bureau/credit-bureau.service.ts`
- **MockCreditBureauAdapter**: 36 lines, random score generation — `services/integration-service/src/credit-bureau/mock-credit-bureau.adapter.ts`

### Resilience Patterns
- **Circuit breaker**: 69 lines, 3-state (CLOSED/OPEN/HALF_OPEN) — `services/integration-service/src/resilience/circuit-breaker.ts`
- **Retry utility**: 30 lines, exponential backoff — `services/integration-service/src/resilience/retry.ts`
- **Webhook handler**: 28 lines, HMAC-SHA256 verification — `services/integration-service/src/webhook/webhook.service.ts`

### Existing Disbursement Flow
- **DisbursementService**: 317 lines, async transfer with retries, status transitions, event emission — `services/process-engine/src/disbursement/disbursement.service.ts`
- Currently injects `MockWalletAdapter` as `WALLET_ADAPTER` provider

### Shared Types & Events
- `INotification`, `IDisbursement` interfaces in `packages/shared-types/src/interfaces/`
- `NotificationChannel`, `NotificationStatus`, `DisbursementStatus` enums in `packages/shared-types/src/enums/`
- `WebhookEventType` enum in `packages/shared-types/src/enums/webhook.enum.ts`
- Event contracts: `DISBURSEMENT_COMPLETED`, `DISBURSEMENT_FAILED`, `REPAYMENT_RECEIVED`, `REPAYMENT_FAILED` in `packages/event-contracts/src/events.enum.ts`

---

## Tasks

### Task 1: Realistic MTN MoMo Wallet Adapter (13 pts) — Critical

**Goal:** Replace the 30-line MTN MoMo stub with a full-fidelity sandbox adapter that simulates the real MoMo Open API behavior.

**Requirements (Docs/09-integrations.md §2.2, FR-DW-002):**

**Implementation:**

1. **OAuth 2.0 Authentication Flow** (`services/integration-service/src/adapters/mtn-momo/mtn-auth.service.ts`)
   - Simulate API key + user provisioning + token refresh cycle
   - Token cache with TTL (default 3600s), auto-refresh on expiry
   - Configurable credentials via environment variables: `MTN_MOMO_API_KEY`, `MTN_MOMO_API_SECRET`, `MTN_MOMO_ENVIRONMENT`

2. **Collections Adapter** (`services/integration-service/src/adapters/mtn-momo/mtn-collections.adapter.ts`)
   - `requestToPay(walletId, amount, reference)` — debit customer wallet
   - Async callback pattern: returns `202 Accepted` with reference, then resolves via callback
   - Simulates realistic delays (2-5 seconds) and outcomes:
     - 75% success, 10% pending (resolves in 5-15s), 10% insufficient funds, 5% other failure
   - Callback URL registration and delivery simulation

3. **Disbursement Adapter** (`services/integration-service/src/adapters/mtn-momo/mtn-disbursement.adapter.ts`)
   - `transfer(walletId, amount, reference)` — credit customer wallet
   - Same async pattern with callbacks
   - Implements `IWalletAdapter` interface

4. **Account Info** (`services/integration-service/src/adapters/mtn-momo/mtn-account.adapter.ts`)
   - `getCustomerInfo(walletId)` — returns mock KYC data
   - `getBalance(walletId)` — returns simulated balance
   - `getTransactionStatus(reference)` — lookup from in-memory/Redis state

5. **Webhook Handler** (`services/integration-service/src/adapters/mtn-momo/mtn-webhook.handler.ts`)
   - Inbound callback verification (signature check)
   - Event parsing and routing to EventBus
   - Idempotency via Redis

6. **Module & Config** (`services/integration-service/src/adapters/mtn-momo/mtn-momo.module.ts`)
   - NestJS module registering all MTN adapters
   - Environment-based config (sandbox vs. production URL switching)
   - Provider registration as `MTN_WALLET_ADAPTER`

7. **Tests** (`services/integration-service/src/adapters/mtn-momo/__tests__/`)
   - Unit tests for auth flow, collection, disbursement, webhook handling
   - Test configurable failure rates and retry behavior

**Acceptance Criteria:**
- [ ] OAuth flow simulates token acquisition, caching, and refresh
- [ ] Collections (requestToPay) returns async reference and resolves via callback
- [ ] Disbursements transfer funds with realistic delays and error scenarios
- [ ] Transaction status queries return accurate state
- [ ] Webhook handler validates signatures and prevents duplicate processing
- [ ] Circuit breaker activates after 5 consecutive failures
- [ ] All operations log external API calls with correlation ID, timing, and status
- [ ] Can be swapped in for MockWalletAdapter in DisbursementService without code changes

---

### Task 2: Realistic M-Pesa Wallet Adapter (8 pts) — High

**Goal:** Replace the 30-line M-Pesa stub with a sandbox adapter simulating the Safaricom Daraja API.

**Requirements (Docs/09-integrations.md §2.3, FR-DW-003):**

**Implementation:**

1. **Auth Service** (`services/integration-service/src/adapters/mpesa/mpesa-auth.service.ts`)
   - Basic Auth → Bearer token exchange (Daraja pattern)
   - Token cache with 59-minute TTL
   - Configurable: `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_ENVIRONMENT`

2. **B2C Disbursement** (`services/integration-service/src/adapters/mpesa/mpesa-b2c.adapter.ts`)
   - `transfer(phone, amount, reference)` — business-to-customer payment
   - Callback URL with result/timeout handling
   - Queue timeout callback after configurable delay

3. **C2B Repayment** (`services/integration-service/src/adapters/mpesa/mpesa-c2b.adapter.ts`)
   - `collect(phone, amount, reference)` — register C2B URLs, simulate STK push
   - Validation URL + confirmation URL callbacks
   - STK push simulation with PIN prompt timeout

4. **Status & Balance** (`services/integration-service/src/adapters/mpesa/mpesa-status.adapter.ts`)
   - `getTransactionStatus(reference)` — query API simulation
   - `getBalance()` — account balance query

5. **Module & Config** (`services/integration-service/src/adapters/mpesa/mpesa.module.ts`)
   - Registered as `MPESA_WALLET_ADAPTER`

6. **Tests** (`services/integration-service/src/adapters/mpesa/__tests__/`)

**Acceptance Criteria:**
- [ ] Auth simulates Daraja token exchange with expiry
- [ ] B2C disbursement with async callback resolution
- [ ] C2B collection with STK push simulation and validation/confirmation callbacks
- [ ] Transaction status queries
- [ ] Implements `IWalletAdapter` interface — swappable with MTN adapter
- [ ] Error scenarios: timeout, insufficient balance, invalid phone, service unavailable

---

### Task 3: Generic Configurable Wallet Adapter (8 pts) — High

**Goal:** Build a JSON-configuration-driven wallet adapter that any wallet provider can be integrated through without code changes.

**Requirements (Docs/09-integrations.md §2.4, FR-DW-004):**

**Implementation:**

1. **Adapter Config Schema** (`services/integration-service/src/adapters/generic/wallet-config.schema.ts`)
   ```typescript
   interface IWalletAdapterConfig {
     providerId: string;
     name: string;
     baseUrl: string;
     auth: {
       type: 'oauth2' | 'api_key' | 'basic' | 'hmac';
       tokenUrl?: string;
       clientId?: string;
       clientSecret?: string;
       apiKeyHeader?: string;
     };
     endpoints: {
       disburse: { method: string; path: string; bodyMapping: Record<string, string>; };
       collect: { method: string; path: string; bodyMapping: Record<string, string>; };
       balance: { method: string; path: string; };
       status: { method: string; path: string; };
     };
     responseMapping: {
       referenceField: string;
       statusField: string;
       statusValues: { success: string; pending: string; failed: string; };
     };
     webhook?: {
       signatureHeader: string;
       signatureAlgorithm: 'hmac-sha256' | 'hmac-sha512';
       eventMapping: Record<string, string>;
     };
     resilience: {
       timeoutMs: number;
       maxRetries: number;
       circuitBreakerThreshold: number;
     };
   }
   ```

2. **Generic Adapter** (`services/integration-service/src/adapters/generic/generic-wallet.adapter.ts`)
   - Reads config from database (per-tenant provider configuration)
   - Builds HTTP requests from config mappings
   - Transforms responses using `responseMapping`
   - Applies resilience patterns from config
   - Implements `IWalletAdapter` interface

3. **Config Storage** — Prisma model for `WalletProviderConfig` table:
   - `id`, `tenantId`, `providerId`, `name`, `config` (JSONB), `isActive`, `createdAt`, `updatedAt`

4. **GraphQL Mutations** for config management:
   - `createWalletProvider(input)`, `updateWalletProvider(id, input)`, `testWalletProvider(id)` (dry-run)

5. **Tests** — unit tests for config parsing, request building, response mapping

**Acceptance Criteria:**
- [ ] Adapter can be configured via JSON without code changes
- [ ] Supports 4 auth types: OAuth 2.0, API key, Basic, HMAC
- [ ] Request/response field mapping transforms provider-specific formats to standard `IWalletAdapter` responses
- [ ] Webhook signature verification works with configurable algorithm
- [ ] Resilience settings (timeout, retries, circuit breaker) applied per provider config
- [ ] GraphQL mutations allow admins to create and test configurations
- [ ] Config stored per-tenant in database

---

### Task 4: SMS Notification Adapter — Africa's Talking Mock (5 pts) — High

**Goal:** Replace the 34-line SMS stub with a realistic Africa's Talking simulator supporting delivery reports and bulk SMS.

**Requirements (Docs/09-integrations.md §6.1, FR-NS-001):**

**Implementation:**

1. **Africa's Talking Adapter** (`services/notification-service/src/adapters/africas-talking/at-sms.adapter.ts`)
   - `send(phone, message)` — single SMS dispatch
   - `sendBulk(recipients[], message)` — batch SMS (up to 100 per call)
   - Simulates: 85% delivered, 10% sent-not-delivered, 5% failed
   - Delivery latency simulation: 1-10 seconds
   - Message ID generation and tracking
   - Cost calculation per message (based on country code)

2. **Delivery Report Handler** (`services/notification-service/src/adapters/africas-talking/at-dlr.handler.ts`)
   - Simulates delivery report callbacks
   - Updates notification status: sent → delivered or sent → failed
   - Retry logic for undelivered messages (up to 3 retries)

3. **Config** (`services/notification-service/src/adapters/africas-talking/at-config.ts`)
   - `AFRICAS_TALKING_API_KEY`, `AFRICAS_TALKING_USERNAME`, `AFRICAS_TALKING_SENDER_ID`
   - Sandbox mode auto-detection

4. **Update Notification Adapter Factory** — Register AT adapter as the SMS channel provider
   - Factory selects: console (dev), africas-talking (staging/prod)

5. **Tests** — single send, bulk send, DLR handling, retry on failure

**Acceptance Criteria:**
- [ ] Single and bulk SMS dispatch with realistic delivery simulation
- [ ] Delivery report callbacks update notification status
- [ ] Failed messages retried up to 3 times
- [ ] Cost tracking per message
- [ ] PII masking in all logs (phone numbers masked)
- [ ] Plugs into existing NotificationAdapterFactory seamlessly

---

### Task 5: Credit Bureau Full Integration (8 pts) — High

**Goal:** Expand the 36-line mock credit bureau to a production-realistic integration with batch reporting, consent tracking, and multi-bureau support.

**Requirements (Docs/09-integrations.md §4, FR-CB-001, FR-CB-002; Docs/02-qualification-scoring.md §1.2, FR-DI-002):**

**Implementation:**

1. **Expand ICreditBureauAdapter** (`services/integration-service/src/credit-bureau/credit-bureau.interface.ts`)
   - Add: `submitBatchReport(data[])`, `getQueryCost()`, `verifyConsent(customerId)`
   - Add response types: `CreditReport` with score, active loans, defaults, enquiries, payment history

2. **Ghana Credit Bureau Mock** (`services/integration-service/src/credit-bureau/ghana-xcb.adapter.ts`)
   - Simulates XDS/TransUnion Ghana format
   - Returns realistic report: credit score (300-850), active facilities, arrears history, enquiry count
   - Query cost tracking (e.g., GHS 5 per query)

3. **Kenya Credit Bureau Mock** (`services/integration-service/src/credit-bureau/kenya-crb.adapter.ts`)
   - Simulates CRB Africa / Metropol format
   - Kenya-specific scoring bands and report structure

4. **Batch Reporting Service** (`services/integration-service/src/credit-bureau/batch-reporting.service.ts`)
   - Scheduled batch: collects loan events since last report
   - Categories: new originations, repayment updates, defaults, closures, write-offs
   - Configurable schedule (daily/weekly/monthly) per tenant
   - Report format follows bureau requirements

5. **Consent Tracking** (`services/integration-service/src/credit-bureau/consent.service.ts`)
   - Records customer consent for credit bureau queries
   - Consent expiry (configurable, default 12 months)
   - Blocks queries for customers without valid consent
   - Prisma model: `CreditBureauConsent` (customerId, tenantId, bureauId, consentDate, expiryDate, consentMethod)

6. **Enhanced Credit Bureau Service** — Update existing service:
   - Multi-bureau support (select bureau per tenant/country)
   - Fallback: if primary bureau fails, try secondary
   - Query cost accumulator with monthly limits/alerts

7. **Tests** — query with/without consent, batch reporting, multi-bureau fallback, cache behavior

**Acceptance Criteria:**
- [ ] Supports Ghana (XDS) and Kenya (CRB) bureau formats
- [ ] Consent verified before every query — blocks without valid consent
- [ ] Batch reporting runs on schedule with correct event categorization
- [ ] Query cost tracked per tenant with configurable monthly limits
- [ ] 24-hour cache prevents redundant queries
- [ ] Multi-bureau fallback: primary fails → tries secondary
- [ ] All PII masked in logs

---

### Task 6: Integration Health Monitoring (5 pts) — Medium

**Goal:** Build a monitoring layer that tracks health of all external integrations and exposes metrics via GraphQL.

**Requirements (Docs/09-integrations.md §7, FR-IM-001 to FR-IM-004):**

**Implementation:**

1. **Integration Health Service** (`services/integration-service/src/monitoring/integration-health.service.ts`)
   - Track per-adapter metrics: uptime, avg response time, error rate, last success/failure, circuit breaker state
   - Rolling window (1h, 24h, 7d) for metrics aggregation
   - In-memory + Redis-backed for persistence

2. **Health Check Scheduler** (`services/integration-service/src/monitoring/health-check.scheduler.ts`)
   - Periodic ping to each adapter's health endpoint (every 60s)
   - Records latency and availability

3. **Alert Service** (`services/integration-service/src/monitoring/integration-alert.service.ts`)
   - Configurable thresholds: error rate > X%, avg latency > Yms, circuit breaker open
   - Alert delivery: EventBus event → notification service → SP operator
   - Alert deduplication (don't spam for same ongoing issue)

4. **GraphQL Resolvers** (`apps/graphql-server/src/graphql/resolvers/integration-health.resolver.ts`)
   - `integrationHealth` query: returns status of all adapters for tenant
   - `integrationMetrics(adapterId, window)`: detailed metrics for specific adapter
   - `integrationAlerts`: active alerts list

5. **API Call Logger Middleware** — Intercept all outbound HTTP calls:
   - Log: timestamp, endpoint, method, response status, response time, correlation ID
   - Store in `IntegrationApiLog` table

6. **Tests** — health check cycle, alert triggering, metrics aggregation

**Acceptance Criteria:**
- [ ] Health status for all active adapters visible via GraphQL
- [ ] Metrics: uptime %, avg response time, error rate over 1h/24h/7d windows
- [ ] Circuit breaker status included in health response
- [ ] Alerts triggered when error rate or latency exceeds thresholds
- [ ] All external API calls logged with correlation ID and timing
- [ ] Alert deduplication prevents notification spam

---

### Task 7: Postman Collections for SP-Facing APIs (5 pts) — Medium

**Goal:** Create comprehensive Postman collections documenting all GraphQL and REST API endpoints for SP integrators.

**Implementation:**

1. **GraphQL Collection** (`docs/postman/lons-graphql-api.postman_collection.json`)
   - All queries: `customers`, `customer`, `loanRequests`, `contracts`, `products`, `repaymentSchedule`, `statements`, `settlementRuns`, `reconciliationBatches`, `collectionsQueue`, `integrationHealth`
   - All mutations: `createLoanRequest`, `acceptOffer`, `processRepayment`, `createProduct`, `updateProduct`, `approveApplication`, `rejectApplication`, `restructureContract`, `waivePenalty`, `assignCollector`, `logCollectionAction`, `createWalletProvider`, `testWalletProvider`
   - Organized by domain: Entity Management, Loan Lifecycle, Repayments, Collections, Settlements, Integrations

2. **REST Collection** (`docs/postman/lons-rest-api.postman_collection.json`)
   - Webhook endpoints: `/v1/webhooks/mtn-momo`, `/v1/webhooks/mpesa`, `/v1/webhooks/africas-talking`
   - Health: `/health`, `/ready`
   - Integration callbacks: disbursement callback, repayment callback

3. **Environment Files**
   - `lons-local.postman_environment.json` — localhost:3000, test JWT
   - `lons-sandbox.postman_environment.json` — sandbox URLs, sandbox credentials

4. **Pre-request Scripts** — JWT token generation, idempotency key generation

5. **Test Scripts** — Response validation, status code checks, schema validation

**Acceptance Criteria:**
- [ ] All GraphQL queries and mutations documented with example variables
- [ ] All REST/webhook endpoints documented
- [ ] Environment files for local and sandbox
- [ ] Pre-request scripts auto-generate auth tokens and idempotency keys
- [ ] Test scripts validate response schemas
- [ ] Collection organized by domain with descriptive folder names

---

### Task 8: Integration End-to-End Tests (8 pts) — Critical

**Goal:** Comprehensive integration tests that exercise the full flow through new adapters: wallet disbursement → notification → credit bureau → monitoring.

**Implementation:**

1. **Wallet Integration Tests** (`services/integration-service/src/__tests__/integration/wallet-integration.spec.ts`)
   - MTN MoMo: auth → disbursement → callback → status check
   - M-Pesa: auth → B2C → callback → C2B → STK push → confirmation
   - Generic adapter: load config → disbursement → response mapping
   - Cross-adapter: same test suite running against MTN, M-Pesa, and generic adapters

2. **Notification Integration Tests** (`services/notification-service/src/__tests__/integration/notification-integration.spec.ts`)
   - SMS via Africa's Talking: send → DLR callback → status update
   - Bulk SMS: batch send → delivery tracking
   - Template rendering + channel routing end-to-end

3. **Credit Bureau Integration Tests** (`services/integration-service/src/__tests__/integration/credit-bureau-integration.spec.ts`)
   - Query with consent → cache → re-query (from cache)
   - Query without consent → blocked
   - Batch report generation with mixed events
   - Multi-bureau fallback on primary failure

4. **Full Lifecycle Test** (`services/integration-service/src/__tests__/integration/full-lifecycle.spec.ts`)
   - Loan request → scoring → approval → MTN MoMo disbursement → callback → contract active → repayment via M-Pesa C2B → notification sent → credit bureau positive report
   - Exercises: wallet adapter, notification adapter, credit bureau adapter, monitoring logger

5. **Monitoring Tests** (`services/integration-service/src/__tests__/integration/monitoring-integration.spec.ts`)
   - Health check cycle → metrics aggregation → alert triggering
   - Circuit breaker: force failures → circuit opens → half-open → recovery

**Acceptance Criteria:**
- [ ] All 3 wallet adapters tested: MTN, M-Pesa, generic
- [ ] Notification flow tested: event → template → SMS adapter → DLR
- [ ] Credit bureau tested: consent, query, cache, batch report, fallback
- [ ] Full lifecycle test passes: loan → disburse → repay → notify → report
- [ ] Monitoring test: health metrics, alerts, circuit breaker transitions
- [ ] All tests idempotent and independent (can run in any order)

---

## Execution Order

```
Task 3 (Generic Wallet Adapter)     ← Foundation for Tasks 1 & 2
   ↓
Task 1 (MTN MoMo) + Task 2 (M-Pesa)  ← In parallel, both extend IWalletAdapter
   ↓
Task 4 (SMS Adapter)                ← Independent, can start early
   ↓
Task 5 (Credit Bureau)             ← Independent, can start early
   ↓
Task 6 (Integration Monitoring)    ← Depends on adapters being in place
   ↓
Task 7 (Postman Collections)       ← Depends on all endpoints being defined
   ↓
Task 8 (Integration Tests)         ← Last — exercises all adapters end-to-end
```

**Recommended:** Start Tasks 3, 4, and 5 in parallel (they're independent). Then Tasks 1 and 2 in parallel (both extend the generic adapter pattern). Then Tasks 6, 7, and 8 sequentially.

---

## Sprint 4 Impact on Monday.com

The 6 existing Sprint 4 "To Do" items need replanning:
- **Move to Sprint 4:** All Sprint 5 integration items (originally planned before Phase 4 was completed early)
- **Defer to Sprint 5:** "Platform portal: tenant management screens" and "Admin portal E2E tests" (Phase 4 overflow — Sprint 5 has room since we're ahead of schedule)
- **New Sprint 4 items to create:** Integration monitoring, integration E2E tests (replacing the old Phase 4 items)

---

## Key References

| Topic | Document |
|---|---|
| Wallet adapter specs | Docs/09-integrations.md §2 |
| Credit bureau specs | Docs/09-integrations.md §4, Docs/02-qualification-scoring.md §1.2 |
| Notification specs | Docs/09-integrations.md §6 |
| Integration monitoring | Docs/09-integrations.md §7 |
| API specifications | Docs/07-api-specifications.md |
| Adapter pattern | FR-IA-001 to FR-IA-005 |
| PII masking rules | Docs/10-security-compliance.md §3 |

---

## Definition of Done

- [ ] All 8 tasks pass acceptance criteria
- [ ] All adapters implement `IWalletAdapter` or `INotificationAdapter` interfaces
- [ ] Circuit breaker and retry patterns applied to all external calls
- [ ] PII masked in all logs (phone, email, national ID)
- [ ] All external API calls logged with correlation ID and timing
- [ ] Unit tests for each adapter with 80%+ coverage
- [ ] Integration tests pass end-to-end
- [ ] Postman collections importable and functional
- [ ] No regressions in existing Sprint 1–3 tests

---

## Appendix A: Exact Interfaces to Implement Against

### IWalletAdapter (all wallet adapters MUST implement this)

```typescript
// File: services/process-engine/src/disbursement/adapters/wallet-adapter.interface.ts
export interface TransferParams {
  destination: string;
  amount: string;       // ALWAYS string (Decimal)
  currency: string;
  reference: string;
}

export interface TransferResult {
  success: boolean;
  externalRef?: string;
  failureReason?: string;
}

export interface BalanceInfo {
  available: string;    // ALWAYS string (Decimal)
  currency: string;
  lastUpdated: Date;
}

export interface CollectionParams {
  source: string;
  amount: string;       // ALWAYS string (Decimal)
  currency: string;
  reference: string;
  reason?: string;
}

export interface TransactionStatusResult {
  reference: string;
  status: 'pending' | 'completed' | 'failed' | 'reversed';
  amount?: string;
  completedAt?: Date;
  failureReason?: string;
}

export interface IWalletAdapter {
  transfer(params: TransferParams): Promise<TransferResult>;
  collect?(params: CollectionParams): Promise<TransferResult>;
  getBalance?(walletId: string): Promise<BalanceInfo>;
  getTransactionStatus?(reference: string): Promise<TransactionStatusResult>;
}

export const WALLET_ADAPTER = 'WALLET_ADAPTER';
```

### ICreditBureauAdapter (credit bureau adapters MUST implement this)

```typescript
// File: services/integration-service/src/credit-bureau/credit-bureau.interface.ts
export interface CreditReport {
  customerId: string;
  bureauScore: number;
  scoreRange: { min: number; max: number };
  activeLoans: number;
  totalOutstanding: string;  // Decimal string
  defaultHistory: { count: number; totalAmount: string };
  enquiryCount: number;
  lastUpdated: Date;
}

export interface ICreditBureauAdapter {
  queryReport(nationalId: string, consent: boolean): Promise<CreditReport | null>;
  submitPositiveData(data: { customerId: string; contractId: string; amount: string; status: string }): Promise<boolean>;
  submitNegativeData(data: { customerId: string; contractId: string; amount: string; reason: string }): Promise<boolean>;
}

export const CREDIT_BUREAU_ADAPTER = 'CREDIT_BUREAU_ADAPTER';
```

### NotificationAdapterFactory (update to register new SMS adapter)

```typescript
// File: services/notification-service/src/adapters/notification-adapter.factory.ts
@Injectable()
export class NotificationAdapterFactory {
  constructor(
    private consoleAdapter: ConsoleNotificationAdapter,
    private smsAdapter: SmsNotificationAdapter,
    private emailAdapter: EmailNotificationAdapter,
  ) {}

  getAdapter(channel: string) {
    switch (channel) {
      case 'sms': return this.smsAdapter;
      case 'email': return this.emailAdapter;
      default: return this.consoleAdapter;
    }
  }
}
```

### IntegrationServiceModule (update to register new adapters)

```typescript
// File: services/integration-service/src/integration-service.module.ts
@Module({
  imports: [PrismaModule, EventBusModule],
  providers: [
    MtnMomoAdapter,
    MpesaAdapter,
    CreditBureauService,
    { provide: CREDIT_BUREAU_ADAPTER, useClass: MockCreditBureauAdapter },
    WebhookService,
  ],
  exports: [MtnMomoAdapter, MpesaAdapter, CreditBureauService, WebhookService],
})
export class IntegrationServiceModule {}
```

---

## Appendix B: Key Enums Available in `packages/shared-types/src/enums/`

- `DisbursementStatus`: PENDING, PROCESSING, COMPLETED, FAILED, REVERSED
- `NotificationChannel`: SMS, PUSH, EMAIL, IN_APP
- `NotificationStatus`: SENT, DELIVERED, FAILED, PENDING
- `ConsentType`: DATA_ACCESS, AUTO_DEDUCTION, CREDIT_REPORTING, ALTERNATIVE_DATA, COMMUNICATIONS
- `ProductType`: OVERDRAFT, MICRO_LOAN, BNPL, INVOICE_FINANCING
- `RiskTier`: LOW, MEDIUM, HIGH, CRITICAL
- `ContractStatus`: ACTIVE, OVERDUE, DELINQUENT, DEFAULT, SETTLED, WRITTEN_OFF, RESTRUCTURED, CANCELLED, CLOSED

---

## Appendix C: Event Types Available (packages/event-contracts/src/events.enum.ts)

Key integration-relevant events (67 total across 9 categories):
- `DISBURSEMENT_COMPLETED`, `DISBURSEMENT_FAILED`
- `REPAYMENT_RECEIVED`, `REPAYMENT_FAILED`
- `INTEREST_ACCRUED`, `CONTRACT_AGED`
- `PENALTY_APPLIED`, `PENALTY_WAIVED`
- `SETTLEMENT_CALCULATED`, `SETTLEMENT_APPROVED`, `SETTLEMENT_EXECUTED`
- `RECONCILIATION_COMPLETED`, `RECONCILIATION_EXCEPTION_CREATED`
- `COLLECTIONS_ASSIGNED`, `COLLECTIONS_ACTION_LOGGED`, `COLLECTIONS_PTP_RECORDED`

---

## Appendix D: Files to Modify (Existing)

| File | Modification |
|---|---|
| `services/integration-service/src/adapters/mtn-momo.adapter.ts` | Replace with new module at `adapters/mtn-momo/` |
| `services/integration-service/src/adapters/mpesa.adapter.ts` | Replace with new module at `adapters/mpesa/` |
| `services/integration-service/src/integration-service.module.ts` | Register new adapter modules, monitoring, generic adapter |
| `services/integration-service/src/credit-bureau/credit-bureau.interface.ts` | Add batch report and consent methods |
| `services/integration-service/src/credit-bureau/credit-bureau.service.ts` | Multi-bureau support, fallback, cost tracking |
| `services/notification-service/src/adapters/notification-adapter.factory.ts` | Register Africa's Talking adapter for SMS channel |
| `services/notification-service/src/notification-service.module.ts` | Register AT adapter and DLR handler |
| `packages/database/prisma/schema.prisma` | Add `WalletProviderConfig`, `CreditBureauConsent`, `IntegrationApiLog` models |

## Appendix E: New Files to Create

```
services/integration-service/src/
├── adapters/
│   ├── mtn-momo/                          # Task 1
│   │   ├── mtn-auth.service.ts
│   │   ├── mtn-collections.adapter.ts
│   │   ├── mtn-disbursement.adapter.ts
│   │   ├── mtn-account.adapter.ts
│   │   ├── mtn-webhook.handler.ts
│   │   ├── mtn-momo.module.ts
│   │   └── __tests__/
│   │       ├── mtn-auth.spec.ts
│   │       ├── mtn-collections.spec.ts
│   │       ├── mtn-disbursement.spec.ts
│   │       └── mtn-webhook.spec.ts
│   ├── mpesa/                             # Task 2
│   │   ├── mpesa-auth.service.ts
│   │   ├── mpesa-b2c.adapter.ts
│   │   ├── mpesa-c2b.adapter.ts
│   │   ├── mpesa-status.adapter.ts
│   │   ├── mpesa.module.ts
│   │   └── __tests__/
│   │       ├── mpesa-auth.spec.ts
│   │       ├── mpesa-b2c.spec.ts
│   │       └── mpesa-c2b.spec.ts
│   └── generic/                           # Task 3
│       ├── wallet-config.schema.ts
│       ├── generic-wallet.adapter.ts
│       ├── generic-auth.service.ts
│       ├── generic-wallet.module.ts
│       └── __tests__/
│           ├── generic-wallet.spec.ts
│           └── config-parsing.spec.ts
├── credit-bureau/                         # Task 5 (expand existing)
│   ├── ghana-xcb.adapter.ts
│   ├── kenya-crb.adapter.ts
│   ├── batch-reporting.service.ts
│   └── consent.service.ts
├── monitoring/                            # Task 6
│   ├── integration-health.service.ts
│   ├── health-check.scheduler.ts
│   ├── integration-alert.service.ts
│   ├── api-call-logger.middleware.ts
│   └── __tests__/
│       └── integration-health.spec.ts
└── __tests__/integration/                 # Task 8
    ├── wallet-integration.spec.ts
    ├── credit-bureau-integration.spec.ts
    ├── full-lifecycle.spec.ts
    └── monitoring-integration.spec.ts

services/notification-service/src/
├── adapters/
│   └── africas-talking/                   # Task 4
│       ├── at-sms.adapter.ts
│       ├── at-dlr.handler.ts
│       ├── at-config.ts
│       └── __tests__/
│           └── at-sms.spec.ts
└── __tests__/integration/                 # Task 8
    └── notification-integration.spec.ts

apps/graphql-server/src/graphql/resolvers/
└── integration-health.resolver.ts         # Task 6

docs/postman/                              # Task 7
├── lons-graphql-api.postman_collection.json
├── lons-rest-api.postman_collection.json
├── lons-local.postman_environment.json
└── lons-sandbox.postman_environment.json
```

---

## Appendix F: Critical Rules Reminder

1. **Money is ALWAYS `string` (Decimal)** — never `float` or `number` for amounts
2. **Tenant isolation** — every DB query gets tenant context from JWT; every adapter call includes `tenantId`
3. **PII masking** — phone as `+233***7890`, email as `e***@domain.com`, national ID as `GHA-***-XXX` in ALL logs
4. **Idempotency** — all external API calls and webhook handlers must be idempotent
5. **Append-only ledger** — no updates or deletes to ledger entries
6. **UUIDv7** primary keys — time-sortable
7. **`created_at` + `updated_at`** (timestamptz, UTC) on all new tables
8. **Soft deletes** — `deleted_at` for business data, never hard delete
9. **Banker's rounding** (round half to even) for all financial math
