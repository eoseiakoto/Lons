# DEV-SPRINT-17 — Scoring/EMI Integration + Entity Management + BA Fix Items

**Date:** 2026-05-10 (updated 2026-05-17)
**Sprint:** 17
**Theme:** Wire live EMI data into scoring pipeline; configurable scorecards; customer de-duplication and financial profiles; BA-reviewed fix items from Sprints 15/16
**Total SP:** ~58
**Tracks:** A (Scoring & EMI Integration, 31 SP) | B (Entity Management, 23 SP) | C (BA Fix Items, 4 SP)

---

## Prerequisites

Read these documents before starting:

| Document | Why |
|---|---|
| `CLAUDE.md` | All conventions, money rules, naming, multi-tenancy |
| `Docs/02-qualification-scoring.md` | FR-DI-001, FR-DI-002, FR-CS-001, FR-PQ-001 |
| `Docs/04-entity-management.md` | FR-SP-001, FR-CM-001, FR-CM-002, FR-CM-003 |
| `Docs/09-integrations.md` | Adapter pattern, circuit breaker, retry |
| `Docs/11-data-models.md` | Schema conventions, existing models |
| `Docs/10-security-compliance.md` | FR-SEC-002 (API key generation), FR-SEC-006 (encryption at rest) |

---

## Scope Overview

| # | Item | Priority | SP | Track |
|---|------|----------|-----|-------|
| S17-1 | Live EMI data pull for scoring | High | 8 | A — Scoring |
| S17-2 | EMI data-pull configuration | High | 5 | A — Scoring |
| S17-3 | Wire credit bureau into scoring pipeline + fallback | High | 5 | A — Scoring |
| S17-4 | Scorecard loaded from tenant/product config | High | 5 | A — Scoring |
| S17-5 | Add avg balance, credit bureau score, custom factors | High | 5 | A — Scoring |
| S17-6 | Min-transaction-count and min-avg-balance pre-qualification rules | High | 3 | A — Scoring |
| S17-7 | Auto-provision API credentials + webhook signing key on tenant onboarding | High | 5 | B — Entity |
| S17-8 | Customer de-duplication with configurable matching rules | High | 5 | B — Entity |
| S17-9 | Customer financial profile aggregation service | High | 8 | B — Entity |
| S17-10 | Customer credit summary service | High | 5 | B — Entity |
| S17-FIX-1 | PRODUCT_CONFIG_CHANGE trigger enum + implementation | High | 1 | C — BA Fixes |
| S17-FIX-2 | `advancePayment` restores credit to availableLimit | High | 1 | C — BA Fixes |
| S17-FIX-3 | Shared wallet adapter consumed by process-engine/repayment | High | 1 | C — BA Fixes |
| S17-FIX-4 | Post-overdue payment reminders (1d/3d/7d after due) | Medium | 0.5 | C — BA Fixes |
| S17-FIX-5 | Scope `SUSPEND_BORROWING` to triggering product only | Medium | 0.5 | C — BA Fixes |
| | **Total** | | **~58** | |

---

## Critical Rules (apply to every item)

1. **Money:** `Decimal(19,4)` in PostgreSQL, `Prisma.Decimal` in TypeScript, string `"1234.5678"` in API responses. Never use `number` for monetary amounts. Use banker's rounding from `@lons/common`.
2. **Multi-tenancy:** Every new table must include `tenant_id UUID NOT NULL`, RLS policies in the migration, and the `@@index([tenantId])` in Prisma. Every service method receives `tenantId` explicitly.
3. **Timestamps:** All tables: `created_at TIMESTAMPTZ DEFAULT now()`, `updated_at TIMESTAMPTZ`. Soft delete where appropriate via `deleted_at`.
4. **Primary keys:** UUID v7 via `@default(dbgenerated("gen_random_uuid()"))`.
5. **Secrets at rest:** API secrets and webhook signing keys encrypted with AES-256-GCM before storage. Use the existing encryption utilities in `packages/common/src/encryption/`.
6. **PII in logs:** Never log national IDs, phone numbers, or emails in cleartext. Use `maskNationalId`, `maskPhone` from `@lons/common`.
7. **Idempotency:** All mutations accept `idempotencyKey`. All event consumers must be idempotent.
8. **Tests:** Unit tests for all business logic (Jest). Integration tests for database-touching services. Target 80%+ coverage on new code.
9. **Audit logging:** All create/update/delete operations on new entities must emit audit log entries via the existing `AuditService`.

---

## Track A: Scoring & EMI Integration (31 SP)

### S17-1: Live EMI Data Pull for Scoring (8 SP)

**Requirement:** FR-DI-001.1
**Problem:** The scoring engine currently hardcodes two features in `services/process-engine/src/scoring/scoring.service.ts` (lines 103-106):
```typescript
transaction_frequency: 15, // Default neutral (no transaction data in Phase 2)
income_consistency: 60,    // Default neutral (no income data in Phase 2)
```
This sprint replaces those placeholders with real data pulled from EMI systems via the integration service.

#### 1. EMI Data Pull Adapter Interface

**File:** `services/integration-service/src/emi-data/emi-data-adapter.interface.ts`

Define the interface that all EMI data pull adapters must implement:

```typescript
export interface IEmiDataAdapter {
  /** Pull transaction history for a customer from the EMI */
  getTransactionHistory(
    walletId: string,
    dateRange: { from: Date; to: Date },
  ): Promise<EmiTransaction[]>;

  /** Pull current wallet balance */
  getWalletBalance(walletId: string): Promise<EmiBalance>;

  /** Pull income pattern analysis (deposits classified as income) */
  getIncomePatterns(
    walletId: string,
    periodDays: number,
  ): Promise<EmiIncomePattern>;

  /** Pull full customer financial snapshot for scoring */
  getFinancialSnapshot(walletId: string): Promise<EmiFinancialSnapshot>;

  /** Health check */
  isAvailable(): Promise<boolean>;
}

export const EMI_DATA_ADAPTER = 'EMI_DATA_ADAPTER';
```

Define the data types:

```typescript
export interface EmiTransaction {
  transactionId: string;
  type: 'credit' | 'debit';
  amount: string; // Decimal string
  currency: string;
  category?: string; // e.g. 'salary', 'transfer', 'merchant', 'utility'
  counterpartyId?: string;
  timestamp: Date;
  status: 'completed' | 'pending' | 'failed';
}

export interface EmiBalance {
  walletId: string;
  currentBalance: string; // Decimal string
  currency: string;
  asOf: Date;
}

export interface EmiIncomePattern {
  walletId: string;
  periodDays: number;
  totalIncome: string;
  transactionCount: number;
  /** % of days in period that had income deposits (0-100) */
  depositRegularity: number;
  /** Standard deviation of deposit amounts divided by mean (lower = more consistent) */
  incomeVolatility: number;
  averageDeposit: string;
  lastDepositDate: Date | null;
}

export interface EmiFinancialSnapshot {
  walletId: string;
  currentBalance: string;
  currency: string;
  /** Average daily balance over last 90 days */
  averageBalance90d: string;
  /** Average daily balance over last 30 days */
  averageBalance30d: string;
  /** Total transactions in last 30 days */
  transactionCount30d: number;
  /** Total transactions in last 90 days */
  transactionCount90d: number;
  /** Income consistency score (0-100) based on deposit regularity */
  incomeConsistency: number;
  /** Ratio of income to expenses (>1 means net positive) */
  incomeExpenseRatio: string;
  fetchedAt: Date;
}
```

#### 2. Mock EMI Data Adapter

**File:** `services/integration-service/src/emi-data/mock-emi-data.adapter.ts`

Implement `IEmiDataAdapter` with realistic mock data. Use the exact same data shapes as above. Generate deterministic data based on `walletId` hash so the same wallet always returns the same mock data (important for test reproducibility).

**File:** `services/integration-service/src/emi-data/mock-emi-data.adapter.spec.ts` -- unit tests.

#### 3. EMI Data Pull Service

**File:** `services/integration-service/src/emi-data/emi-data.service.ts`

Wraps the adapter with:
- Circuit breaker (use existing `CircuitBreaker` from `src/resilience/circuit-breaker.ts`)
- Retry with exponential backoff (use existing `retryWithBackoff` from `src/resilience/retry.ts`)
- Caching of `EmiFinancialSnapshot` per walletId (configurable TTL, default 1 hour)
- Logging (no PII)

#### 4. EMI Data Module

**File:** `services/integration-service/src/emi-data/emi-data.module.ts`

Register the module. Use `EMI_DATA_ADAPTER` injection token with `MockEmiDataAdapter` as the default provider.

**File:** `services/integration-service/src/emi-data/index.ts` -- barrel export.

Register the module in `services/integration-service/src/integration-service.module.ts`.

#### 5. Customer Financial Data Model

Create a Prisma model to persist EMI financial snapshots so scoring has historical data and does not depend on EMI availability at scoring time:

**Add to `packages/database/prisma/schema.prisma`:**

```prisma
model CustomerFinancialData {
  id                   String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId             String   @map("tenant_id") @db.Uuid
  customerId           String   @map("customer_id") @db.Uuid
  source               String   @db.VarChar(50) // 'emi', 'credit_bureau', 'manual'
  sourceProvider       String?  @map("source_provider") @db.VarChar(100) // e.g. 'mtn_momo', 'mpesa'
  walletId             String?  @map("wallet_id") @db.VarChar(255)
  currentBalance       Decimal? @map("current_balance") @db.Decimal(19, 4)
  averageBalance30d    Decimal? @map("average_balance_30d") @db.Decimal(19, 4)
  averageBalance90d    Decimal? @map("average_balance_90d") @db.Decimal(19, 4)
  transactionCount30d  Int?     @map("transaction_count_30d")
  transactionCount90d  Int?     @map("transaction_count_90d")
  incomeConsistency    Int?     @map("income_consistency") // 0-100
  incomeExpenseRatio   Decimal? @map("income_expense_ratio") @db.Decimal(7, 4)
  currency             String   @db.VarChar(3)
  rawData              Json?    @map("raw_data") // full snapshot for audit
  fetchedAt            DateTime @map("fetched_at") @db.Timestamptz(6)
  createdAt            DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  customer Customer @relation(fields: [customerId], references: [id])

  @@index([tenantId])
  @@index([customerId])
  @@index([customerId, source, fetchedAt])
  @@map("customer_financial_data")
}
```

Add `financialData CustomerFinancialData[]` to the `Customer` model's relations.

**Migration:** Create a migration that adds the table and applies RLS:
```sql
ALTER TABLE customer_financial_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON customer_financial_data
  USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

#### 6. Wire EMI Data into Scoring Service

**Modify:** `services/process-engine/src/scoring/scoring.service.ts`

Update `gatherFeatures()` to pull live EMI data:

```typescript
private async gatherFeatures(
  tenantId: string,
  customerId: string,
  customer: { createdAt: Date; kycLevel: string },
): Promise<ScoringInput> {
  // ... existing account_age_days, payment_history_pct, existing_debt_ratio logic stays ...

  // Pull latest EMI financial data from customer_financial_data table
  const latestFinancialData = await this.prisma.customerFinancialData.findFirst({
    where: {
      tenantId,
      customerId,
      source: 'emi',
    },
    orderBy: { fetchedAt: 'desc' },
  });

  let transactionFrequency = 15; // fallback for customers with no EMI data
  let incomeConsistency = 60;    // fallback
  let averageBalance = null;
  let creditBureauScore = null;

  if (latestFinancialData) {
    transactionFrequency = latestFinancialData.transactionCount30d ?? 15;
    incomeConsistency = latestFinancialData.incomeConsistency ?? 60;
    averageBalance = latestFinancialData.averageBalance30d
      ? Number(latestFinancialData.averageBalance30d)
      : null;
  }

  // Pull latest credit bureau data
  const bureauData = await this.prisma.customerFinancialData.findFirst({
    where: {
      tenantId,
      customerId,
      source: 'credit_bureau',
    },
    orderBy: { fetchedAt: 'desc' },
  });

  if (bureauData?.rawData) {
    const raw = bureauData.rawData as Record<string, unknown>;
    creditBureauScore = typeof raw.bureauScore === 'number' ? raw.bureauScore : null;
  }

  return {
    account_age_days: accountAgeDays,
    kyc_level: KYC_NUMERIC[customer.kycLevel] ?? 0,
    payment_history_pct: paymentHistoryPct,
    transaction_frequency: transactionFrequency,
    existing_debt_ratio: existingDebtRatio,
    income_consistency: incomeConsistency,
    average_balance: averageBalance,       // new (S17-5)
    credit_bureau_score: creditBureauScore, // new (S17-5)
  };
}
```

**Important:** The fallback values (15, 60) must remain for customers who have no EMI data yet. The scoring engine must not fail if EMI data is missing. Add a `dataCompleteness` field to the scoring result indicating what % of features had real data vs. fallbacks.

#### 7. EMI Data Sync Job

**File:** `services/integration-service/src/emi-data/emi-data-sync.job.ts`

A BullMQ job that:
1. Fetches all customers with active subscriptions for a given tenant
2. For each customer, calls `emiDataService.getFinancialSnapshot(walletId)`
3. Upserts the result into `customer_financial_data`
4. Runs on a configurable schedule (default: every 6 hours)

This job is registered via the scheduler service. For now, create the job processor and queue registration. The scheduler integration can be simple (a cron-triggered queue push).

**Tests:** `emi-data-sync.job.spec.ts` -- test the sync logic with mocked adapter.

---

### S17-2: EMI Data-Pull Configuration (5 SP)

**Requirement:** FR-DI-001.2

#### 1. Prisma Model

**Add to schema:**

```prisma
model EmiIntegrationConfig {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId         String   @map("tenant_id") @db.Uuid
  name             String   @db.VarChar(255) // e.g. "MTN MoMo Ghana"
  provider         String   @db.VarChar(100) // e.g. 'mtn_momo', 'mpesa', 'generic'
  /** Encrypted API credentials */
  credentials      String?  @db.Text // AES-256-GCM encrypted JSON
  /** Base URL for the EMI API */
  baseUrl          String?  @map("base_url") @db.VarChar(500)
  /** Data field mapping rules (EMI field names -> Lons field names) */
  fieldMappings    Json?    @map("field_mappings")
  /** Sync frequency in minutes */
  syncFrequencyMin Int      @default(360) @map("sync_frequency_min") // 6 hours
  /** Retry policy */
  retryPolicy      Json?    @map("retry_policy") // { maxRetries: 3, backoffMs: 1000 }
  /** Whether this integration is active */
  isActive         Boolean  @default(true) @map("is_active")
  /** Last successful sync timestamp */
  lastSyncAt       DateTime? @map("last_sync_at") @db.Timestamptz(6)
  /** Last sync error, if any */
  lastSyncError    String?  @map("last_sync_error") @db.Text
  createdAt        DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt        DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt        DateTime? @map("deleted_at") @db.Timestamptz(6)

  @@unique([tenantId, name])
  @@index([tenantId])
  @@index([isActive])
  @@map("emi_integration_configs")
}
```

**Migration** with RLS policy.

#### 2. Configuration Service

**File:** `services/integration-service/src/emi-data/emi-integration-config.service.ts`

CRUD operations for EMI integration configs. Encrypt `credentials` before storage, decrypt on read. Validate field mappings shape. Expose:
- `create(tenantId, input)` -- create new config
- `update(tenantId, configId, input)` -- update config (audit logged)
- `findAll(tenantId)` -- list configs for tenant
- `findById(tenantId, configId)` -- get single config (credentials decrypted)
- `deactivate(tenantId, configId)` -- soft deactivate
- `testConnection(tenantId, configId)` -- test the EMI connection

**Tests:** `emi-integration-config.service.spec.ts`

#### 3. GraphQL Resolvers

**File:** `apps/graphql-server/src/emi-config/emi-config.resolver.ts`

Queries:
- `emiIntegrationConfigs(tenantId)` -- list all EMI configs for tenant
- `emiIntegrationConfig(id)` -- get single config

Mutations:
- `createEmiIntegrationConfig(input)` -- create
- `updateEmiIntegrationConfig(id, input)` -- update
- `deactivateEmiIntegrationConfig(id)` -- deactivate
- `testEmiConnection(id)` -- test connection

**Guard:** Require `tenant:update` or a new `integration:manage` permission.

**Do not return** decrypted credentials in GraphQL responses. Return `credentialsSet: boolean` instead.

#### 4. Admin Portal Settings Page

**File:** `apps/admin-portal/src/app/[locale]/(protected)/settings/integrations/emi/page.tsx`

Simple settings page:
- List existing EMI integrations with name, provider, status, last sync time
- Add new integration form (name, provider dropdown, credentials fields, base URL, sync frequency, field mappings JSON editor)
- Edit existing integration
- Test connection button
- Deactivate toggle

Follow existing admin portal patterns (use existing UI components, i18n strings, slide-over panels).

---

### S17-3: Wire Credit Bureau into Scoring Pipeline + Fallback (5 SP)

**Requirement:** FR-DI-002.4

**Problem:** The credit bureau adapter exists at `services/integration-service/src/credit-bureau/` but the scoring service in `process-engine` does not call it. They operate independently.

#### 1. Credit Bureau Scoring Feature Extractor

**File:** `services/process-engine/src/scoring/credit-bureau-feature.extractor.ts`

This service bridges the integration-service credit bureau with the scoring pipeline:

```typescript
@Injectable()
export class CreditBureauFeatureExtractor {
  constructor(
    private creditBureauService: CreditBureauService,
    private prisma: PrismaService,
  ) {}

  /**
   * Attempt to pull credit bureau data and extract scoring features.
   * If bureau is unavailable, returns null (scoring proceeds without it).
   */
  async extractFeatures(
    tenantId: string,
    customerId: string,
    nationalId: string,
    consent: boolean,
  ): Promise<CreditBureauFeatures | null> {
    if (!consent) {
      return null; // Cannot query bureau without consent
    }

    try {
      const report = await Promise.race([
        this.creditBureauService.queryReport(nationalId, consent),
        this.timeout(10_000), // 10s hard timeout
      ]);

      if (!report) return null;

      // Store bureau result in customer_financial_data for historical record
      await this.prisma.customerFinancialData.create({
        data: {
          tenantId,
          customerId,
          source: 'credit_bureau',
          currency: 'N/A',
          rawData: report as unknown as Prisma.InputJsonValue,
          fetchedAt: new Date(),
        },
      });

      return {
        bureauScore: report.bureauScore,
        activeLoans: report.activeLoans,
        totalOutstanding: report.totalOutstanding,
        defaultCount: report.defaultHistory.count,
        enquiryCount: report.enquiryCount,
        bureauAvailable: true,
      };
    } catch (error) {
      // Bureau unavailable -- log and return null (fallback)
      this.logger.warn(
        `Credit bureau unavailable for customer ${customerId}: ${error.message}`,
      );
      return null;
    }
  }

  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Credit bureau timeout')), ms),
    );
  }
}

export interface CreditBureauFeatures {
  bureauScore: number;
  activeLoans: number;
  totalOutstanding: string;
  defaultCount: number;
  enquiryCount: number;
  bureauAvailable: boolean;
}
```

#### 2. Integrate into Scoring Service

**Modify:** `services/process-engine/src/scoring/scoring.service.ts`

In `scoreCustomer()`:
1. After gathering internal features, call `creditBureauFeatureExtractor.extractFeatures()`
2. Merge bureau features into `inputFeatures` if available
3. Set a `confidenceFlag` on the scoring result:
   - `"full"` -- all data sources available
   - `"partial_no_bureau"` -- bureau unavailable, scored with internal data only
   - `"partial_no_emi"` -- EMI data unavailable
   - `"minimal"` -- neither bureau nor EMI data available

Store the confidence flag in the `inputFeatures` JSON under a `_metadata` key:
```json
{
  "account_age_days": 180,
  "credit_bureau_score": 650,
  "_metadata": {
    "dataCompleteness": "partial_no_emi",
    "bureauAvailable": true,
    "emiDataAge": null,
    "scoredAt": "2026-05-15T10:30:00Z"
  }
}
```

#### 3. Consent Check

Before calling the credit bureau, check the customer's consent record:

```typescript
const creditReportingConsent = await this.prisma.customerConsent.findFirst({
  where: {
    customerId,
    consentType: 'credit_reporting',
    granted: true,
    revokedAt: null,
  },
});
```

Only call the bureau if consent exists and is not revoked.

#### 4. Tests

- `credit-bureau-feature.extractor.spec.ts` -- unit tests with mocked bureau service
- Test bureau available: features extracted correctly
- Test bureau timeout: returns null, scoring proceeds
- Test bureau error: returns null, scoring proceeds
- Test no consent: returns null without calling bureau
- Integration test: full scoring flow with and without bureau data

---

### S17-4: Scorecard Loaded from Tenant/Product Config (5 SP)

**Requirement:** FR-CS-001.1

**Problem:** The scorecard is hardcoded as `DEFAULT_SCORECARD` in `scoring.service.ts` (lines 6-19). This must be loaded from the database per product/tenant.

#### 1. Prisma Model

**Add to schema:**

```prisma
model ScorecardConfig {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String   @map("tenant_id") @db.Uuid
  productId     String?  @map("product_id") @db.Uuid // null = tenant default
  name          String   @db.VarChar(255)
  version       String   @db.VarChar(50)
  /** The scorecard definition: factors, weights, bands, risk tiers, limit bands */
  config        Json     // shape matches ScorecardConfig type in scorecard-engine.ts
  /** Score range */
  scoreRangeMin Decimal  @default(0) @map("score_range_min") @db.Decimal(7, 2)
  scoreRangeMax Decimal  @default(1000) @map("score_range_max") @db.Decimal(7, 2)
  /** Whether this is the active scorecard for this product/tenant */
  isActive      Boolean  @default(false) @map("is_active")
  createdBy     String?  @map("created_by") @db.Uuid
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)
  deletedAt     DateTime? @map("deleted_at") @db.Timestamptz(6)

  product Product? @relation(fields: [productId], references: [id])

  @@unique([tenantId, productId, version])
  @@index([tenantId])
  @@index([productId])
  @@index([isActive])
  @@map("scorecard_configs")
}
```

Add `scorecardConfigs ScorecardConfig[]` to the `Product` model.

**Migration** with RLS policy.

#### 2. Scorecard Config Service

**File:** `services/process-engine/src/scoring/scorecard/scorecard-config.service.ts`

```typescript
@Injectable()
export class ScorecardConfigService {
  constructor(private prisma: PrismaService) {}

  /**
   * Load the active scorecard for a given product.
   * Fallback chain: product-specific -> tenant default -> hardcoded default
   */
  async getActiveScorecard(
    tenantId: string,
    productId: string,
  ): Promise<ScorecardConfig> {
    // 1. Try product-specific scorecard
    const productScorecard = await this.prisma.scorecardConfig.findFirst({
      where: { tenantId, productId, isActive: true, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (productScorecard) {
      return this.parseConfig(productScorecard);
    }

    // 2. Try tenant default (productId = null)
    const tenantDefault = await this.prisma.scorecardConfig.findFirst({
      where: { tenantId, productId: null, isActive: true, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (tenantDefault) {
      return this.parseConfig(tenantDefault);
    }

    // 3. Hardcoded default (existing DEFAULT_SCORECARD)
    return DEFAULT_SCORECARD;
  }

  async create(tenantId: string, input: CreateScorecardInput): Promise<ScorecardConfigRecord> { ... }
  async activate(tenantId: string, scorecardId: string): Promise<void> { ... }
  async listVersions(tenantId: string, productId?: string): Promise<ScorecardConfigRecord[]> { ... }
}
```

#### 3. Update Scoring Service

**Modify:** `services/process-engine/src/scoring/scoring.service.ts`

Replace:
```typescript
const scorecard = DEFAULT_SCORECARD; // In production, load from product config
```
With:
```typescript
const scorecard = await this.scorecardConfigService.getActiveScorecard(tenantId, productId);
```

Keep `DEFAULT_SCORECARD` as the ultimate fallback (do not remove it).

#### 4. Seed Default Scorecard

In the database seed script (`packages/database/prisma/seed.ts`), insert the existing `DEFAULT_SCORECARD` as a `ScorecardConfig` record for each seed tenant with `isActive: true` and `productId: null` (tenant default).

#### 5. GraphQL Resolvers

**File:** `apps/graphql-server/src/scorecard/scorecard.resolver.ts`

Queries:
- `scorecardConfigs(productId?)` -- list all scorecard versions for a product (or tenant defaults)
- `activeScorecardConfig(productId)` -- get the active scorecard for a product

Mutations:
- `createScorecardConfig(input)` -- create new version
- `activateScorecardConfig(id)` -- set a scorecard version as active (deactivates previous)

**Guard:** Require `product:update` permission.

#### 6. Tests

- `scorecard-config.service.spec.ts` -- test fallback chain (product -> tenant -> default)
- Update `scoring.service` tests to verify scorecard is loaded from DB
- Test that different products use different scorecards

---

### S17-5: Add avg_balance, credit_bureau_score, custom_factors (5 SP)

**Requirement:** FR-CS-001.2

#### 1. Extend ScoringInput Type

**Modify:** `services/process-engine/src/scoring/scorecard/scorecard-engine.ts`

`ScoringInput` is already a `Record<string, number | string | null | undefined>` -- no type change needed, but document the new supported factor names.

#### 2. Add New Default Factors

Add three new factors to `DEFAULT_SCORECARD` in `scoring.service.ts`:

```typescript
{ name: 'average_balance', weight: 0, bands: [
  { min: 500, max: null, points: 100 },
  { min: 200, max: 499, points: 70 },
  { min: 50, max: 199, points: 40 },
  { min: 0, max: 49, points: 10 },
]},
{ name: 'credit_bureau_score', weight: 0, bands: [
  { min: 700, max: null, points: 100 },
  { min: 500, max: 699, points: 70 },
  { min: 300, max: 499, points: 40 },
  { min: 0, max: 299, points: 10 },
]},
{ name: 'custom_factors', weight: 0, bands: [
  { min: 80, max: null, points: 100 },
  { min: 50, max: 79, points: 70 },
  { min: 20, max: 49, points: 40 },
  { min: 0, max: 19, points: 10 },
]},
```

**Important:** Set `weight: 0` in the default scorecard so these new factors have no effect until a tenant explicitly configures weights in their scorecard config (S17-4). This ensures backward compatibility.

#### 3. Normalization

If `credit_bureau_score` comes from different bureaus with different ranges (e.g., 0-850 vs 0-1000), normalize to a 0-100 scale before feeding into the scorecard. Add a utility:

**File:** `services/process-engine/src/scoring/feature-normalizer.ts`

```typescript
export function normalizeBureauScore(
  score: number,
  sourceRange: { min: number; max: number },
  targetRange: { min: number; max: number } = { min: 0, max: 100 },
): number {
  const normalized = ((score - sourceRange.min) / (sourceRange.max - sourceRange.min))
    * (targetRange.max - targetRange.min) + targetRange.min;
  return Math.round(Math.min(targetRange.max, Math.max(targetRange.min, normalized)));
}
```

#### 4. Custom Factors

The `custom_factors` feature is a JSON blob stored per customer that tenants can populate with SP-specific signals. Store in `CustomerFinancialData.rawData` under a `customFactors` key. The scoring input value is a single aggregated numeric score (0-100) that the tenant's scorecard config defines how to derive.

For this sprint, implement a simple average of all numeric custom factor values. More sophisticated aggregation can be added later.

#### 5. Tests

- Test normalization function with various input ranges
- Test that weight=0 factors don't affect score (backward compat)
- Test scoring with all new factors populated
- Test scoring with new factors missing (fallback to defaults)

---

### S17-6: Min-Transaction-Count and Min-Avg-Balance Pre-Qualification Rules (3 SP)

**Requirement:** FR-PQ-001.2

#### 1. Locate Pre-Qualification Engine

Find the pre-qualification rules engine in `process-engine`. If it uses the product's `eligibility_rules` JSONB field, add the two new rule types there.

#### 2. Add New Rule Types

Add support for two new pre-qualification rule types:

```typescript
interface PreQualificationRule {
  type: 'min_account_age' | 'min_kyc_level' | 'min_transaction_count' | 'min_average_balance' | /* existing types... */;
  value: number | string;
  period?: number; // days -- for transaction_count and average_balance
}
```

- **`min_transaction_count`**: Reject if customer has fewer than `value` transactions in the last `period` days. Pull from `CustomerFinancialData.transactionCount30d` (or `transactionCount90d` depending on period).
- **`min_average_balance`**: Reject if customer's average balance over `period` days is below `value`. Pull from `CustomerFinancialData.averageBalance30d` (or `averageBalance90d`).

#### 3. Early Rejection

These rules must execute BEFORE entering the scoring pipeline. If either rule fails:
- Return a clear rejection with reason codes: `PRE_QUAL_INSUFFICIENT_TRANSACTIONS` or `PRE_QUAL_INSUFFICIENT_BALANCE`
- Do not call the scoring engine (save compute)
- Log the rejection for analytics

#### 4. Configurable per Product

Store thresholds in the product's `eligibility_rules` JSONB:

```json
{
  "rules": [
    { "type": "min_account_age", "value": 90 },
    { "type": "min_kyc_level", "value": "tier_1" },
    { "type": "min_transaction_count", "value": 10, "period": 30 },
    { "type": "min_average_balance", "value": "50.0000", "period": 30 }
  ]
}
```

#### 5. Graceful Handling When No EMI Data

If `CustomerFinancialData` has no records for this customer, the pre-qualification rules that depend on EMI data should:
- **Not auto-reject** -- treat as "data not available" and skip that specific rule
- Log a warning: "Pre-qualification rule min_transaction_count skipped: no EMI data"
- Set a flag on the result: `emiDataMissing: true`

This allows new customers who haven't been synced yet to still proceed to scoring.

#### 6. Tests

- Test each new rule type: pass, fail, skip (no data)
- Test combination of rules (AND logic)
- Test that rejection short-circuits scoring
- Test configurable thresholds per product

---

## Track B: Entity Management (23 SP)

### S17-7: Auto-Provision API Credentials + Webhook Signing Key on Tenant Onboarding (5 SP)

**Requirement:** FR-SP-001.2

**Problem:** `services/entity-service/src/tenant/tenant-onboarding.service.ts` creates the tenant, roles, and admin user but does not auto-generate API credentials or webhook signing keys.

#### 1. Modify Tenant Onboarding Service

**Modify:** `services/entity-service/src/tenant/tenant-onboarding.service.ts`

After step 3 (create admin user), add:

```typescript
// 4. Auto-generate API key pair
const apiKeyService = /* inject ApiKeyService */;
const apiKey = await apiKeyService.createApiKey(tenant.id, {
  name: 'Default API Key',
  rateLimitPerMin: 60,
});

// 5. Generate webhook signing secret
const webhookSecret = crypto.randomBytes(32).toString('hex');
const encryptedWebhookSecret = encrypt(webhookSecret); // AES-256-GCM

await tx.tenant.update({
  where: { id: tenant.id },
  data: {
    settings: {
      ...(tenantSettings as Record<string, unknown>),
      webhookSigningKeyEncrypted: encryptedWebhookSecret,
    },
  },
});
```

#### 2. Return Secrets in Onboarding Response

The onboarding response should include the API key plaintext and webhook signing secret **exactly once**. After this response, the plaintext API secret is never retrievable again (per FR-SEC-002.3).

Update the return type:

```typescript
return {
  tenant,
  roles,
  adminUser,
  apiCredentials: {
    clientId: apiKey.id,
    clientSecret: apiKey.plaintext, // shown only once
    rateLimitPerMin: 60,
  },
  webhookSigningSecret: webhookSecret, // shown only once
};
```

#### 3. Webhook Signing Key Storage

The webhook signing key must be stored encrypted (AES-256-GCM) in the tenant's settings JSONB. Add a helper method to retrieve and decrypt it:

**File:** `services/entity-service/src/tenant/tenant.service.ts` -- add method:

```typescript
async getWebhookSigningKey(tenantId: string): Promise<string> {
  const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const settings = tenant.settings as Record<string, unknown>;
  if (!settings?.webhookSigningKeyEncrypted) {
    throw new NotFoundError('Webhook signing key not configured for tenant', tenantId);
  }
  return decrypt(settings.webhookSigningKeyEncrypted as string);
}
```

#### 4. Webhook Key Rotation

Add a mutation to rotate the webhook signing key:

```typescript
async rotateWebhookSigningKey(tenantId: string): Promise<{ newSecret: string }> {
  const newSecret = crypto.randomBytes(32).toString('hex');
  const encrypted = encrypt(newSecret);
  await this.prisma.tenant.update({
    where: { id: tenantId },
    data: {
      settings: {
        // merge with existing settings
        webhookSigningKeyEncrypted: encrypted,
      },
    },
  });
  return { newSecret }; // shown only once
}
```

**Guard:** `tenant:update` permission.

#### 5. Tests

- Test onboarding returns API credentials and webhook secret
- Test API key is usable for authentication
- Test webhook secret is encrypted at rest
- Test webhook key rotation generates a new key
- Test old webhook key is invalidated after rotation

---

### S17-8: Customer De-Duplication with Configurable Matching Rules (5 SP)

**Requirement:** FR-CM-001.3

**Problem:** `services/entity-service/src/customer/customer.service.ts` only checks for duplicates by `externalId`. The spec requires configurable matching rules: (nationalId) OR (phone + dateOfBirth) OR (email + fullName).

#### 1. Prisma Model for Matching Rules

**Add to schema:**

```prisma
model CustomerMatchingRule {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId      String   @map("tenant_id") @db.Uuid
  /** Rule name for display */
  name          String   @db.VarChar(255)
  /** Fields to match on (AND within a rule) */
  matchFields   Json     @map("match_fields") // e.g. ["nationalId"] or ["phonePrimary", "dateOfBirth"]
  /** Priority order (lower = checked first) */
  priority      Int      @default(0)
  /** Whether this rule is active */
  isActive      Boolean  @default(true) @map("is_active")
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt     DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  @@index([tenantId])
  @@map("customer_matching_rules")
}
```

**Migration** with RLS. Seed default rules for each tenant:
1. `{ name: "National ID", matchFields: ["nationalId"], priority: 1 }`
2. `{ name: "Phone + DOB", matchFields: ["phonePrimary", "dateOfBirth"], priority: 2 }`
3. `{ name: "Email + Name", matchFields: ["email", "fullName"], priority: 3 }`

#### 2. De-Duplication Service

**File:** `services/entity-service/src/customer/customer-dedup.service.ts`

```typescript
@Injectable()
export class CustomerDedupService {
  constructor(private prisma: PrismaService) {}

  /**
   * Check for duplicate customers using tenant's matching rules.
   * Returns the first match found (by rule priority) or null.
   */
  async findDuplicate(
    tenantId: string,
    candidateData: CustomerCreateInput,
  ): Promise<{ match: Customer; matchedRule: string } | null> {
    const rules = await this.prisma.customerMatchingRule.findMany({
      where: { tenantId, isActive: true },
      orderBy: { priority: 'asc' },
    });

    // If no rules configured, fall back to default externalId check
    if (rules.length === 0) {
      return this.checkByExternalId(tenantId, candidateData);
    }

    for (const rule of rules) {
      const matchFields = rule.matchFields as string[];
      const match = await this.checkRule(tenantId, candidateData, matchFields);
      if (match) {
        return { match, matchedRule: rule.name };
      }
    }

    return null;
  }

  private async checkRule(
    tenantId: string,
    data: CustomerCreateInput,
    fields: string[],
  ): Promise<Customer | null> {
    // Build WHERE clause: all fields must match (AND)
    const where: Prisma.CustomerWhereInput = {
      tenantId,
      deletedAt: null,
    };

    for (const field of fields) {
      const value = (data as Record<string, unknown>)[field];
      if (value === null || value === undefined || value === '') {
        return null; // Can't match on missing field
      }
      (where as Record<string, unknown>)[field] = value;
    }

    return this.prisma.customer.findFirst({ where });
  }
}
```

**Important performance note:** The matching fields (`nationalId`, `phonePrimary`, `email`) are encrypted at rest. The existing encrypted field search mechanism (hash-based lookup via `_hash` columns from Sprint 13B) must be used. Ensure the `checkRule` method uses the hash columns for encrypted fields, not cleartext comparison.

#### 3. Integrate into Customer Creation

**Modify:** `services/entity-service/src/customer/customer.service.ts`

In `create()`, replace the simple `externalId` duplicate check with:

```typescript
async create(tenantId: string, data: CustomerCreateInput) {
  // Check for duplicates using configurable matching rules
  const duplicateResult = await this.dedupService.findDuplicate(tenantId, data);

  if (duplicateResult) {
    // Return existing customer instead of creating duplicate
    this.logger.log(
      `Duplicate customer found via rule "${duplicateResult.matchedRule}": ${duplicateResult.match.id}`,
    );
    return {
      customer: duplicateResult.match,
      isDuplicate: true,
      matchedRule: duplicateResult.matchedRule,
    };
  }

  // No duplicate found -- create new customer
  const customer = await this.prisma.customer.create({ ... });
  return { customer, isDuplicate: false, matchedRule: null };
}
```

**Breaking change note:** The return type of `create()` changes. Update all callers to handle the new shape `{ customer, isDuplicate, matchedRule }`.

#### 4. GraphQL: Customer Merge Mutation

**File:** `apps/graphql-server/src/customer/customer-merge.resolver.ts`

```graphql
mutation mergeCustomers(
  sourceCustomerId: ID!
  targetCustomerId: ID!
): CustomerMergeResult!
```

Merge logic:
1. Move all contracts, loan requests, scoring results, subscriptions, etc. from source to target
2. Merge metadata (target wins on conflict)
3. Soft-delete the source customer
4. Audit log the merge with both customer IDs

**Guard:** `customer:update` permission. Admin-only operation.

#### 5. Tests

- Test each default matching rule individually
- Test rule priority (first match wins)
- Test with missing fields (rule skipped)
- Test create returns existing customer on duplicate
- Test merge operation preserves all associated records
- Test with encrypted fields (hash-based lookup)

---

### S17-9: Customer Financial Profile Aggregation Service (8 SP)

**Requirement:** FR-CM-002.1
**Depends on:** S17-8 (de-dup first -- profile must aggregate across merged records)

#### 1. Financial Profile Service

**File:** `services/entity-service/src/customer/customer-financial-profile.service.ts`

Aggregates financial data per customer from multiple sources:

```typescript
@Injectable()
export class CustomerFinancialProfileService {
  constructor(private prisma: PrismaService) {}

  async getProfile(
    tenantId: string,
    customerId: string,
  ): Promise<CustomerFinancialProfile> {
    // 1. Total loans across all products
    const totalLoans = await this.prisma.contract.count({
      where: { tenantId, customerId, deletedAt: null },
    });

    // 2. Active contracts
    const activeContracts = await this.prisma.contract.count({
      where: {
        tenantId,
        customerId,
        status: { in: ['active', 'performing', 'due', 'overdue'] },
      },
    });

    // 3. Repayment history score (% on-time payments)
    const totalScheduleEntries = await this.prisma.repaymentScheduleEntry.count({
      where: {
        contract: { tenantId, customerId },
      },
    });
    const onTimeEntries = await this.prisma.repaymentScheduleEntry.count({
      where: {
        contract: { tenantId, customerId },
        status: 'paid',
      },
    });
    const repaymentScore = totalScheduleEntries > 0
      ? Math.round((onTimeEntries / totalScheduleEntries) * 100)
      : null;

    // 4. Average loan size (Decimal math)
    const avgLoanResult = await this.prisma.contract.aggregate({
      where: { tenantId, customerId, deletedAt: null },
      _avg: { principalAmount: true },
    });

    // 5. Default rate
    const defaultedContracts = await this.prisma.contract.count({
      where: {
        tenantId,
        customerId,
        status: { in: ['defaulted', 'written_off'] },
      },
    });
    const defaultRate = totalLoans > 0
      ? Math.round((defaultedContracts / totalLoans) * 100)
      : 0;

    // 6. Latest EMI financial data
    const latestEmiData = await this.prisma.customerFinancialData.findFirst({
      where: { tenantId, customerId, source: 'emi' },
      orderBy: { fetchedAt: 'desc' },
    });

    // 7. Total outstanding balance
    const outstandingResult = await this.prisma.contract.aggregate({
      where: {
        tenantId,
        customerId,
        status: { in: ['active', 'performing', 'due', 'overdue'] },
      },
      _sum: { outstandingAmount: true },
    });

    return {
      customerId,
      totalLoans,
      activeContracts,
      repaymentScore,
      averageLoanSize: avgLoanResult._avg?.principalAmount?.toString() ?? '0',
      defaultRate,
      defaultedContracts,
      totalOutstandingBalance: outstandingResult._sum?.outstandingAmount?.toString() ?? '0',
      latestWalletBalance: latestEmiData?.currentBalance?.toString() ?? null,
      averageBalance30d: latestEmiData?.averageBalance30d?.toString() ?? null,
      transactionCount30d: latestEmiData?.transactionCount30d ?? null,
      incomeConsistency: latestEmiData?.incomeConsistency ?? null,
      lastUpdated: new Date(),
    };
  }
}
```

#### 2. Caching

Use Redis to cache the computed profile (TTL: 15 minutes). Cache key: `fin_profile:{tenantId}:{customerId}`.

Invalidate cache when:
- A new contract is created for the customer
- A repayment is recorded
- EMI data is synced
- Customer is merged

Use the existing event bus to listen for these events and invalidate.

#### 3. GraphQL Resolver

**File:** `apps/graphql-server/src/customer/customer-financial-profile.resolver.ts`

```graphql
type CustomerFinancialProfile {
  customerId: ID!
  totalLoans: Int!
  activeContracts: Int!
  repaymentScore: Int
  averageLoanSize: String!
  defaultRate: Int!
  defaultedContracts: Int!
  totalOutstandingBalance: String!
  latestWalletBalance: String
  averageBalance30d: String
  transactionCount30d: Int
  incomeConsistency: Int
  lastUpdated: DateTime!
}

extend type Query {
  customerFinancialProfile(customerId: ID!): CustomerFinancialProfile!
}
```

**Guard:** `customer:read` permission.

#### 4. Admin Portal Customer Detail

Add the financial profile to the existing customer detail page. Display as a summary card showing key metrics. The exact admin portal page location depends on the existing customer detail layout -- find it and add a new section.

#### 5. Tests

- Test profile aggregation with various contract states
- Test with no contracts (new customer)
- Test with mixed contract statuses
- Test cache invalidation
- Test repayment score calculation accuracy
- Test default rate calculation

---

### S17-10: Customer Credit Summary Service (5 SP)

**Requirement:** FR-CM-003.1

#### 1. Credit Summary Service

**File:** `services/entity-service/src/customer/customer-credit-summary.service.ts`

```typescript
@Injectable()
export class CustomerCreditSummaryService {
  constructor(private prisma: PrismaService) {}

  async getSummary(
    tenantId: string,
    customerId: string,
  ): Promise<CustomerCreditSummary> {
    // 1. Latest credit score
    const latestScore = await this.prisma.scoringResult.findFirst({
      where: { tenantId, customerId },
      orderBy: { createdAt: 'desc' },
    });

    // 2. Total credit limits across all active subscriptions
    const subscriptions = await this.prisma.subscription.findMany({
      where: { tenantId, customerId, status: 'active' },
      select: { creditLimit: true, availableLimit: true, productId: true },
    });

    const totalCreditLimit = subscriptions.reduce(
      (sum, s) => add(sum, s.creditLimit?.toString() ?? '0'),
      '0',
    );

    const totalAvailableCredit = subscriptions.reduce(
      (sum, s) => add(sum, s.availableLimit?.toString() ?? '0'),
      '0',
    );

    const totalUtilizedCredit = subtract(totalCreditLimit, totalAvailableCredit);

    // 3. Active and overdue contracts
    const activeContracts = await this.prisma.contract.count({
      where: { tenantId, customerId, status: { in: ['active', 'performing', 'due'] } },
    });

    const overdueContracts = await this.prisma.contract.count({
      where: { tenantId, customerId, status: 'overdue' },
    });

    // 4. Worst delinquency status
    const worstContract = await this.prisma.contract.findFirst({
      where: {
        tenantId,
        customerId,
        status: { in: ['overdue', 'defaulted', 'written_off'] },
      },
      orderBy: { daysOverdue: 'desc' },
      select: { status: true, daysOverdue: true },
    });

    let worstDelinquency = 'current';
    if (worstContract) {
      const days = worstContract.daysOverdue ?? 0;
      if (days >= 90) worstDelinquency = '90_dpd';
      else if (days >= 60) worstDelinquency = '60_dpd';
      else if (days >= 30) worstDelinquency = '30_dpd';
      else worstDelinquency = 'overdue';
    }

    // 5. Total outstanding balance
    const outstandingResult = await this.prisma.contract.aggregate({
      where: {
        tenantId,
        customerId,
        status: { in: ['active', 'performing', 'due', 'overdue'] },
      },
      _sum: { outstandingAmount: true },
    });

    // 6. Also check credit lines (overdraft)
    const creditLines = await this.prisma.creditLine.findMany({
      where: { tenantId, customerId, status: { in: ['active', 'performing'] } },
      select: { approvedLimit: true, availableBalance: true, outstandingAmount: true },
    });

    const creditLineLimits = creditLines.reduce(
      (sum, cl) => add(sum, cl.approvedLimit.toString()),
      '0',
    );
    const creditLineOutstanding = creditLines.reduce(
      (sum, cl) => add(sum, cl.outstandingAmount.toString()),
      '0',
    );

    return {
      customerId,
      currentScore: latestScore?.score?.toString() ?? null,
      scoreModelVersion: latestScore?.modelVersion ?? null,
      riskTier: latestScore?.riskTier ?? null,
      totalExposure: add(totalCreditLimit, creditLineLimits),
      totalCreditLimit: add(totalCreditLimit, creditLineLimits),
      totalUtilizedCredit: add(totalUtilizedCredit, creditLineOutstanding),
      totalAvailableCredit: subtract(
        add(totalCreditLimit, creditLineLimits),
        add(totalUtilizedCredit, creditLineOutstanding),
      ),
      activeContracts,
      overdueContracts,
      worstDelinquency,
      totalOutstandingBalance: add(
        outstandingResult._sum?.outstandingAmount?.toString() ?? '0',
        creditLineOutstanding,
      ),
      lastScoreDate: latestScore?.createdAt ?? null,
    };
  }
}
```

#### 2. GraphQL Resolver

**File:** `apps/graphql-server/src/customer/customer-credit-summary.resolver.ts`

```graphql
type CustomerCreditSummary {
  customerId: ID!
  currentScore: String
  scoreModelVersion: String
  riskTier: String
  totalExposure: String!
  totalCreditLimit: String!
  totalUtilizedCredit: String!
  totalAvailableCredit: String!
  activeContracts: Int!
  overdueContracts: Int!
  worstDelinquency: String!
  totalOutstandingBalance: String!
  lastScoreDate: DateTime
}

extend type Query {
  customerCreditSummary(customerId: ID!): CustomerCreditSummary!
}
```

**Guard:** `customer:read` permission.

#### 3. Cache with Redis

Cache TTL: 5 minutes. Key: `credit_summary:{tenantId}:{customerId}`.

Invalidate on: new contract, repayment, scoring result, subscription change, credit line change.

#### 4. Admin Portal Integration

Add the credit summary to the customer detail page as a prominent card at the top. Show:
- Credit score with risk tier badge (color-coded: green/yellow/orange/red)
- Total exposure vs. available credit (bar or gauge visual)
- Active/overdue contract counts
- Worst delinquency status
- Outstanding balance

#### 5. Tests

- Test summary with no data (new customer)
- Test with active subscriptions and contracts
- Test with overdraft credit lines included
- Test worst delinquency calculation at various DPD levels
- Test Decimal math accuracy for all monetary aggregations
- Test cache invalidation

---

## Dependency Graph

```
S17-1 (EMI data pull) ─────────────┐
S17-2 (EMI config) ────────────────┤
                                    ├─> S17-3 (credit bureau wiring) ─┐
                                    │                                  ├─> S17-5 (new factors)
S17-4 (scorecard from DB) ─────────┘                                  │
                                                                       └─> S17-6 (pre-qual rules)

S17-7 (API credentials) ── standalone

S17-8 (customer de-dup) ──> S17-9 (financial profile) ──> S17-10 (credit summary)

Track C (all independent — can run in parallel with Tracks A/B):
  S17-FIX-1 (trigger enum)
  S17-FIX-2 (advancePayment credit restore)
  S17-FIX-3 (shared wallet adapter wiring)
  S17-FIX-4 (post-overdue reminders)
  S17-FIX-5 (scope SUSPEND_BORROWING)
```

**Recommended build order:**
1. S17-1 + S17-4 + S17-7 + S17-8 + **all Track C items** (parallel, no dependencies)
2. S17-2 + S17-5 (depend on S17-1 model)
3. S17-3 (depends on S17-1 model + S17-4 scorecard)
4. S17-6 (depends on S17-1 + S17-3)
5. S17-9 (depends on S17-8)
6. S17-10 (depends on S17-9)

---

## Database Migration Checklist

This sprint adds these new tables/models. Each migration must include RLS:

| Model | Table Name | RLS Required |
|---|---|---|
| `CustomerFinancialData` | `customer_financial_data` | Yes |
| `EmiIntegrationConfig` | `emi_integration_configs` | Yes |
| `ScorecardConfig` | `scorecard_configs` | Yes |
| `CustomerMatchingRule` | `customer_matching_rules` | Yes |

Run `pnpm --filter database db:migrate` after adding models.

---

## Track C: BA Fix Items (4 SP)

**Context:** These items were identified during BA reviews of Sprints 15 and 16, and dispositioned by the PM to Sprint 17. All are independent of Tracks A/B and can be implemented in any order.

**References:**
- `Docs/PM-RESPONSE-BA-SPRINT-15-2026-05-15.md` (F-BA-S15-3, -4, -11)
- `Docs/PM-RESPONSE-BA-SPRINT-16-2026-05-17.md` (F-BA-S16-2, -5)

---

### S17-FIX-1 — PRODUCT_CONFIG_CHANGE trigger enum + implementation (1 SP)

**Monday ID:** 12029697469
**Finding:** F-BA-S15-3 — The trigger enum in `bnpl-credit-line-adjustment.service.ts` diverges from the spec. `PRODUCT_CONFIG_CHANGE` is absent — when an operator changes a product's credit limit configuration, existing credit lines should be re-evaluated.

**Files:**
- `services/entity-service/src/bnpl-credit-line/bnpl-credit-line-adjustment.service.ts`

**Fix:**

1. Add `PRODUCT_CONFIG_CHANGE` to the `CreditLineAdjustmentTrigger` enum (or whatever enum/union defines valid trigger types):

   ```typescript
   export type CreditLineAdjustmentTrigger =
     | 'CREDIT_SCORE_CHANGE'
     | 'REPAYMENT_BEHAVIOUR'
     | 'MANUAL'
     | 'PRODUCT_CONFIG_CHANGE';  // ← ADD
   ```

2. Add a new method `evaluateProductConfigChange(tenantId, productId, configChange)` that:
   - Queries all ACTIVE credit lines for the given product
   - For each line, checks if the new `product.maxAmount` is below the current `approvedLimit`
   - If so, reduces `approvedLimit` to the new max and recalculates `availableLimit`
   - Writes an adjustment record with trigger `PRODUCT_CONFIG_CHANGE` and reason describing the config change

3. Wire this into the product update flow: when `Product.maxAmount` or `Product.minAmount` changes, emit `PRODUCT_CONFIG_CHANGED` event. The adjustment service subscribes and invokes `evaluateProductConfigChange`.

**Tests:**
- Product maxAmount reduced below existing credit line's approvedLimit → line reduced
- Product maxAmount increased → no change to existing lines (they can grow via normal triggers)
- Product maxAmount reduced but line's approvedLimit is already below → no change
- Adjustment record created with trigger `PRODUCT_CONFIG_CHANGE`

---

### S17-FIX-2 — `advancePayment` restores credit to availableLimit (1 SP)

**Monday ID:** 12029696361
**Finding:** F-BA-S15-4 — When a customer makes an advance payment (paying an installment before its due date), the repaid principal should restore `availableLimit` on the credit line. Currently the `availableLimit` only increases on the full settlement of a contract, creating silent under-credit on prepayments.

**Files:**
- `services/entity-service/src/bnpl-credit-line/bnpl-credit-line.service.ts`
- `services/process-engine/src/bnpl/bnpl-origination.service.ts` (or wherever the BNPL repayment event is handled)

**Fix:**

1. Add a method `restoreAvailableLimit(tenantId, creditLineId, amount)` to `BnplCreditLineService`:

   ```typescript
   async restoreAvailableLimit(
     tenantId: string,
     creditLineId: string,
     amount: string, // Decimal string — the principal portion of the repayment
   ): Promise<void> {
     await this.prisma.$executeRawUnsafe(`
       UPDATE bnpl_credit_lines
       SET available_limit = LEAST(
         available_limit + $1::DECIMAL(19,4),
         approved_limit
       ),
       updated_at = NOW()
       WHERE id = $2::UUID
         AND tenant_id = $3::UUID
         AND status = 'active'
     `, amount, creditLineId, tenantId);
   }
   ```

   The `LEAST(..., approved_limit)` cap ensures `availableLimit` never exceeds `approvedLimit`.

2. Subscribe to `REPAYMENT_RECEIVED` events for BNPL contracts. When a repayment allocates principal (i.e., `allocatedPrincipal > 0`), call `restoreAvailableLimit` with the principal amount.

3. **Important:** Only restore for revolving credit lines (BNPL). Micro-loan credit lines are NOT revolving — they restore only on full contract settlement. Add a product-type check before restoring.

**Tests:**
- Repayment with principal allocation restores availableLimit by that amount
- availableLimit never exceeds approvedLimit (cap at approved)
- Non-BNPL (micro-loan) repayments do NOT restore limit
- Credit line in non-active status → no restoration
- Concurrent restorations use atomic SQL (no TOCTOU)

---

### S17-FIX-3 — Shared wallet adapter consumed by process-engine/repayment (1 SP)

**Monday ID:** 12029692327
**Finding:** F-BA-S15-11 — The shared wallet adapter (`services/integration-service/src/wallet/`) exists but is not yet consumed by `process-engine` or `repayment-service`. Both services still use inline mock implementations. Must connect before Phase 5 live adapters can be wired in.

**Files:**
- `services/process-engine/src/bnpl/bnpl-origination.service.ts` — disbursement call
- `services/repayment-service/src/payment/payment.service.ts` — collection/debit call
- `services/integration-service/src/wallet/wallet-adapter.interface.ts` — the shared interface

**Fix:**

1. In `process-engine`, replace any inline mock wallet call in the disbursement path with an injected `IWalletAdapter`:

   ```typescript
   constructor(
     @Inject(WALLET_ADAPTER) private readonly walletAdapter: IWalletAdapter,
   ) {}
   ```

   The `disburse()` call should use `this.walletAdapter.transfer(...)` with the standard interface.

2. In `repayment-service`, replace any inline mock wallet call in the debit/collection path with the same injected adapter.

3. Both services should import from `@lons/integration-service` (or wherever the adapter token is exported). The `MockWalletAdapter` should be the default binding (registered in the respective module's `providers` array) until Phase 5 wires real adapters.

4. Ensure the adapter interface supports both `transfer` (disbursement) and `debit` (collection) operations. If it only has `transfer`, add a `debit(walletId, amount, reference)` method to the interface and the mock.

**Tests:**
- Disbursement calls `walletAdapter.transfer()` (mock verifies call shape)
- Collection calls `walletAdapter.debit()` (mock verifies call shape)
- Adapter failure throws `IntegrationError` that the service handles gracefully (retry or fail the operation)

---

### S17-FIX-4 — Post-overdue payment reminders (0.5 SP)

**Finding:** F-BA-S16-2 — Sprint 16's `PaymentReminderJob` only handles pre-due reminders (3d/1d/due-day before). No post-overdue reminders are configured. Customers who miss a payment should get escalating reminders at 1-day, 3-day, and 7-day post-due.

**Files:**
- `apps/scheduler/src/jobs/payment-reminder.job.ts`
- `services/notification-service/src/templates/template-renderer.ts`

**Fix:**

1. In `PaymentReminderJob`, after the existing pre-due fan-out, add a second pass that queries `RepaymentScheduleEntry` rows with:
   - `status = 'overdue'` (or `dueDate < today AND status IN ('pending', 'partial')`)
   - `daysPastDue` computed as `today - dueDate`

2. Match `daysPastDue` against a post-overdue schedule: `[1, 3, 7]` days after due date. Use the same idempotency mechanism (`payment_overdue_reminder.{days}:{entryId}` eventType discriminator).

3. Add templates to `template-renderer.ts`:

   ```typescript
   'payment_overdue_reminder.1': {
     sms: 'Hi {{customerName}}, your payment of {{currency}} {{amount}} was due yesterday. Please pay now to avoid penalties.',
     // ... other channels
   },
   'payment_overdue_reminder.3': {
     sms: 'Hi {{customerName}}, your payment of {{currency}} {{amount}} is 3 days overdue. A penalty may apply if not paid soon.',
     // ...
   },
   'payment_overdue_reminder.7': {
     sms: 'Hi {{customerName}}, your payment of {{currency}} {{amount}} is 7 days overdue. Your account may be escalated to collections.',
     // ...
   },
   ```

4. The post-overdue schedule should be configurable per product via `product.notificationConfig.paymentReminders.overdueSchedule` (array of day offsets), with the default `[1, 3, 7]` when absent.

**Tests:**
- Overdue installment at 1 day past due gets reminder
- Overdue installment at 3 days past due gets reminder
- Same installment doesn't get duplicate reminder for same day offset
- Non-overdue installments are not picked up in the overdue pass

---

### S17-FIX-5 — Scope `SUSPEND_BORROWING` to triggering product (0.5 SP)

**Finding:** F-BA-S16-5 — `AgingActionService.SUSPEND_BORROWING` suspends ALL active subscriptions for the customer regardless of product type. This should be scoped to subscriptions for the same product that triggered the aging transition, unless explicitly configured for cross-product suspension.

**File:** `services/process-engine/src/aging/aging-action.service.ts`

**Fix:**

1. The `SUSPEND_BORROWING` handler currently does:
   ```typescript
   await this.prisma.subscription.updateMany({
     where: { tenantId, customerId, status: 'active' },
     data: { status: 'suspended', updatedAt: new Date() },
   });
   ```

2. Replace with product-scoped suspension by default:
   ```typescript
   const scope = action.scope ?? 'product'; // default to product-scoped

   const where: Prisma.SubscriptionWhereInput = {
     tenantId,
     customerId,
     status: 'active',
   };

   if (scope === 'product') {
     // Only suspend subscriptions for the same product
     where.productId = contract.productId;
   }
   // scope === 'all' suspends all products (existing behaviour, opt-in)

   await this.prisma.subscription.updateMany({ where, data: { status: 'suspended', updatedAt: new Date() } });
   ```

3. Update the `AgingBucketConfig` actions JSONB schema to support an optional `scope` field on `SUSPEND_BORROWING` actions:
   ```json
   { "type": "SUSPEND_BORROWING", "scope": "product" }
   ```
   or
   ```json
   { "type": "SUSPEND_BORROWING", "scope": "all" }
   ```

   Default to `"product"` when omitted (backward compatible — existing seeded configs have no `scope` field, so they get product-scoped behaviour, which is the safer default).

4. Pass `contract` (or at minimum `contract.productId`) into the action handler so it knows which product triggered the transition.

**Tests:**
- Default (no scope field): only subscriptions for the same product are suspended
- `scope: 'product'`: same behaviour as default
- `scope: 'all'`: all active subscriptions for the customer are suspended
- Already-suspended subscriptions are not affected (updateMany skips them)

---

## Exit Criteria

All of the following must be true before this sprint is complete:

1. Scoring engine pulls `transaction_frequency` and `income_consistency` from `CustomerFinancialData` (live EMI data) instead of hardcoded values
2. If EMI data is missing, scoring falls back gracefully to default values (no errors)
3. Credit bureau results feed into the scoring pipeline as additional features
4. If credit bureau is unavailable or times out, scoring proceeds with a lower confidence flag
5. Scorecards are loaded from the database per product/tenant, with fallback to the hardcoded default
6. New scoring factors (`average_balance`, `credit_bureau_score`, `custom_factors`) are supported with weight=0 by default
7. Pre-qualification rules `min_transaction_count` and `min_average_balance` reject early when configured
8. New tenants automatically receive API credentials and a webhook signing key during onboarding
9. Customer creation checks for duplicates using configurable matching rules (not just externalId)
10. `customerFinancialProfile(customerId)` GraphQL query returns aggregated financial data
11. `customerCreditSummary(customerId)` GraphQL query returns credit exposure data
12. All new tables have RLS policies
13. All secrets (API keys, webhook signing keys, EMI credentials) are encrypted at rest
14. All tests pass with 80%+ coverage on new code
15. No regressions in existing scoring, customer creation, or tenant onboarding flows

**Track C — BA Fix Items:**
16. `PRODUCT_CONFIG_CHANGE` trigger evaluates and reduces credit lines when product maxAmount is lowered
17. BNPL advance payment restores `availableLimit` by the principal amount (capped at `approvedLimit`)
18. `process-engine` and `repayment-service` consume the shared `IWalletAdapter` interface (no inline mocks)
19. Post-overdue reminders fire at 1/3/7 days after due date with escalating tone
20. `SUSPEND_BORROWING` defaults to product-scoped (only same-product subscriptions suspended)
