# Sprint 9 — Claude Code Development Prompt

**Priority: HIGH — Regulatory foundations & CI quality**
**Owner: Claude Code (DEV)**
**Date: 2026-04-14**

Sprint 9 delivers non-negotiable regulatory features (AML screening, cooling-off period, cross-product exposure limits, customer data anonymization), two portal infrastructure tasks, and three CI/code quality improvements. The regulatory items are compliance requirements — not optional features.

---

## Table of Contents

1. [AML/Sanctions Screening Adapter](#task-1)
2. [Cooling-Off Period Enforcement](#task-2)
3. [Cross-Product Exposure Rules](#task-3)
4. [Customer Data Anonymization](#task-4)
5. [CI: Prisma Migration Test Job](#task-5)
6. [CI: Post-Startup GraphQL Health Check](#task-6)
7. [Audit APP_GUARD Providers for GraphQL Context Compatibility](#task-7)
8. [Platform Portal: Cross-Tenant Query Support](#task-8)
9. [Admin Portal: Report Date Range Filtering](#task-9)

---

<a id="task-1"></a>
## Task 1: AML/Sanctions Screening Adapter

**Monday.com ID:** 11743578250
**Priority:** High
**Requirement:** FR-SEC-009.2

### Context

The platform must screen customers against AML watchlists and sanctions databases before loan disbursement. Different markets use different screening providers. Emmanuel has decided on a **provider-agnostic adapter pattern** with **ComplyAdvantage** as the initial implementation, following the existing wallet adapter pattern (`IWalletAdapter` / `WalletAdapterResolver`).

### Current State

- Customer model has a `watchlist` boolean field (schema.prisma) — data flag only, no screening logic
- `CUSTOMER_BLACKLISTED` event exists in event contracts — no screening events
- Integration service has the adapter pattern established for wallets and credit bureaus
- No AML/screening code exists anywhere in the codebase

### What to Build

**1. AML Screening Adapter Interface**

Create `services/integration-service/src/screening/` with:

```typescript
// screening.interface.ts
export interface IScreeningResult {
  customerId: string;
  tenantId: string;
  screeningId: string;           // External screening provider's reference
  status: ScreeningStatus;       // CLEAR | MATCH | POTENTIAL_MATCH | ERROR
  riskLevel: ScreeningRiskLevel; // LOW | MEDIUM | HIGH | CRITICAL
  matches: IScreeningMatch[];
  provider: string;              // 'complyadvantage' | 'mock' | etc.
  screenedAt: Date;
  rawResponse?: Record<string, unknown>; // Full provider response (encrypted at rest)
}

export interface IScreeningMatch {
  matchId: string;
  matchType: ScreeningMatchType; // SANCTIONS | PEP | ADVERSE_MEDIA | WATCHLIST
  entityName: string;
  matchScore: number;            // 0-100, provider's confidence score
  source: string;                // e.g., 'OFAC SDN', 'UN Consolidated', 'EU Sanctions'
  details?: Record<string, unknown>;
}

export enum ScreeningStatus {
  CLEAR = 'CLEAR',
  MATCH = 'MATCH',
  POTENTIAL_MATCH = 'POTENTIAL_MATCH',
  ERROR = 'ERROR',
}

export enum ScreeningRiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum ScreeningMatchType {
  SANCTIONS = 'SANCTIONS',
  PEP = 'PEP',
  ADVERSE_MEDIA = 'ADVERSE_MEDIA',
  WATCHLIST = 'WATCHLIST',
}

export interface IScreeningAdapter {
  /**
   * Screen a customer against watchlists/sanctions databases.
   * Input: customer name, national ID, date of birth, country.
   * Returns: screening result with match details.
   */
  screenCustomer(input: IScreeningInput): Promise<IScreeningResult>;

  /**
   * Get screening status for a previously initiated screening (for async providers).
   */
  getScreeningStatus(screeningId: string): Promise<IScreeningResult>;

  /**
   * Get the provider name for this adapter.
   */
  getProviderName(): string;
}

export interface IScreeningInput {
  customerId: string;
  tenantId: string;
  fullName: string;
  dateOfBirth?: string;       // ISO date
  nationalId?: string;
  country: string;            // ISO 3166-1 alpha-3
  additionalNames?: string[]; // Aliases
}
```

**2. ComplyAdvantage Adapter**

Create `services/integration-service/src/screening/complyadvantage.adapter.ts`:

- Implements `IScreeningAdapter`
- Uses ComplyAdvantage Search API v2 (`POST /searches`)
- API key from environment variable `COMPLYADVANTAGE_API_KEY`
- Maps ComplyAdvantage response to `IScreeningResult`
- Handles: sanctions lists, PEP lists, adverse media, and custom watchlists
- Configure `fuzziness` parameter (default: 0.6) for name matching sensitivity
- Timeout: 10 seconds per request
- Circuit breaker: after 3 consecutive failures, open circuit for 30 seconds

**3. Mock Screening Adapter**

Create `services/integration-service/src/screening/mock-screening.adapter.ts`:

- Used in development and staging (selected via `SCREENING_PROVIDER=mock` env var)
- Deterministic behavior for testing:
  - Any customer name containing "SANCTIONS" → returns `MATCH` with `SANCTIONS` type
  - Any customer name containing "PEP" → returns `POTENTIAL_MATCH` with `PEP` type
  - Any customer name containing "ADVERSE" → returns `POTENTIAL_MATCH` with `ADVERSE_MEDIA` type
  - All other names → returns `CLEAR`
- Simulates realistic response structure for integration testing

**4. Screening Resolver / Factory**

Create `services/integration-service/src/screening/screening.resolver.ts`:

- Factory pattern matching `WalletAdapterResolver`
- Resolves adapter based on `SCREENING_PROVIDER` env var (default: `mock`)
- Inject via NestJS DI

**5. Screening Service**

Create `services/integration-service/src/screening/screening.service.ts`:

- Orchestrates screening calls
- **Pre-disbursement hook**: The process engine must call this service before transitioning a contract to `disbursing` state. If screening returns `MATCH` or `CRITICAL`, block disbursement and flag the loan request.
- Store screening results in a new `ScreeningResult` model (see below)
- Emit events on screening completion
- Cache results per customer for configurable duration (default: 24 hours in Redis). Skip re-screening if a recent CLEAR result exists for same customer.
- For `POTENTIAL_MATCH` results: flag for manual review in admin portal (do not auto-block)

**6. Database Model**

Add to `packages/database/prisma/schema.prisma`:

```prisma
model ScreeningResult {
  id              String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String           @map("tenant_id") @db.Uuid
  customerId      String           @map("customer_id") @db.Uuid
  externalId      String?          @map("external_id") @db.VarChar(255)
  provider        String           @db.VarChar(50)
  status          ScreeningStatus  @default(CLEAR)
  riskLevel       ScreeningRiskLevel @default(LOW) @map("risk_level")
  matchCount      Int              @default(0) @map("match_count")
  matchDetails    Json?            @map("match_details")
  rawResponse     Bytes?           @map("raw_response")  // Encrypted
  screenedAt      DateTime         @default(now()) @map("screened_at") @db.Timestamptz(6)
  expiresAt       DateTime         @map("expires_at") @db.Timestamptz(6)
  reviewedBy      String?          @map("reviewed_by") @db.Uuid
  reviewedAt      DateTime?        @map("reviewed_at") @db.Timestamptz(6)
  reviewDecision  String?          @map("review_decision") @db.VarChar(50)  // 'approved' | 'blocked' | 'escalated'
  createdAt       DateTime         @default(now()) @map("created_at") @db.Timestamptz(6)

  customer        Customer         @relation(fields: [customerId], references: [id])

  @@index([tenantId])
  @@index([customerId])
  @@index([status])
  @@index([expiresAt])
  @@map("screening_results")
}

enum ScreeningStatus {
  CLEAR
  MATCH
  POTENTIAL_MATCH
  ERROR

  @@map("screening_status")
}

enum ScreeningRiskLevel {
  LOW
  MEDIUM
  HIGH
  CRITICAL

  @@map("screening_risk_level")
}
```

**7. Event Types**

Add to `packages/event-contracts/src/events.enum.ts`:

```typescript
// AML Screening events
SCREENING_INITIATED = 'screening.initiated',
SCREENING_CLEAR = 'screening.clear',
SCREENING_MATCH_FOUND = 'screening.match.found',
SCREENING_POTENTIAL_MATCH = 'screening.potential_match',
SCREENING_ERROR = 'screening.error',
SCREENING_MANUAL_REVIEW_REQUIRED = 'screening.manual_review.required',
SCREENING_MANUAL_REVIEW_COMPLETED = 'screening.manual_review.completed',
```

**8. Admin Portal (apps/admin-portal)**

- **Customer Detail Page** (`/customers/[id]`): Add a "Screening History" section/tab showing all screening results for this customer — date, provider, status (with color-coded badge: green=CLEAR, amber=POTENTIAL_MATCH, red=MATCH), risk level, match count. Click-through to screening detail.
- **Screening Manual Review Queue**: New page or section under `/loans/applications` (or a new `/screening` route). List all screening results with status `POTENTIAL_MATCH` that need manual review. Each row shows: customer name, screening date, match count, risk level, match details summary. Actions: "Approve" (mark as reviewed, decision=approved, allow disbursement to proceed), "Block" (mark as reviewed, decision=blocked, reject loan request), "Escalate" (flag for platform admin).
- **Loan Application Detail**: In the pre-qualification/scoring section, show screening check result inline — pass/fail/pending review.

**9. Platform Portal (apps/platform-portal)**

- **Tenant Detail Page** (`/tenants/[id]`): Add a "Screening Summary" card showing: total screenings this month, match rate %, pending reviews count. Link to drill-down.
- **Platform Screening Dashboard**: New page at `/screening` (or under `/system`). Cross-tenant aggregate view: total screenings (today/week/month), match rate by tenant, escalated cases requiring platform admin attention. This is the compliance officer's view.
- **Escalated Screening Review**: Platform admins can see screening results escalated by SP operators. Actions: confirm block, override to approve (with mandatory reason), flag for external investigation.

**10. Process Engine Integration**

In `services/process-engine/src/loan-request-state-machine.ts`:
- Add a screening check before the transition to `disbursing` state
- If no recent valid screening exists for the customer, initiate one
- If screening returns `MATCH` → reject loan request with reason `AML_SCREENING_MATCH`
- If screening returns `POTENTIAL_MATCH` → hold loan request in `pending_review` state (existing state or new)
- If screening returns `CLEAR` → proceed to disbursement
- If screening returns `ERROR` → retry once, then hold for manual review

**9. Environment Variables**

Add to `.env.example`:

```bash
# AML Screening
SCREENING_PROVIDER=mock
COMPLYADVANTAGE_API_KEY=
SCREENING_CACHE_TTL_HOURS=24
SCREENING_FUZZINESS=0.6
```

### Tests

- Unit: Mock adapter deterministic behavior, result caching, factory resolution
- Unit: Screening service — cache hit/miss, pre-disbursement check logic, event emission
- Integration: Process engine — loan request blocked on MATCH, held on POTENTIAL_MATCH, passed on CLEAR
- Integration: Full flow — create customer → submit loan → screening triggered → result stored → disbursement proceeds or blocks

---

<a id="task-2"></a>
## Task 2: Cooling-Off Period Enforcement

**Monday.com ID:** 11743568000
**Priority:** High
**Requirement:** FR-CP-006

### Context

After a loan contract is created and disbursed, there must be a configurable cooling-off period during which the customer can cancel the contract and return the disbursed funds. This is a consumer protection requirement in many African jurisdictions.

### Current State

- `coolingOffHours` field exists on the Product model (default: 0, meaning disabled)
- ContractStatus enum has 9 states: `active, performing, due, overdue, delinquent, default_status, written_off, settled, cancelled`
- No `COOLING_OFF` state exists
- No enforcement logic exists

### What to Build

**1. Add COOLING_OFF Contract Status**

In `packages/database/prisma/schema.prisma`, add `cooling_off` to the ContractStatus enum:

```prisma
enum ContractStatus {
  cooling_off    // NEW — customer can cancel within cooling-off period
  active
  performing
  due
  overdue
  delinquent
  default_status
  written_off
  settled
  cancelled

  @@map("contract_status")
}
```

Generate a migration for this enum change. Existing contracts are not affected.

**2. State Machine Integration**

In `services/process-engine/src/loan-request-state-machine.ts` (or the contract lifecycle service):

- After disbursement completes, if `product.coolingOffHours > 0`:
  - Set contract status to `cooling_off` instead of `active`
  - Set `coolingOffExpiresAt = disbursedAt + coolingOffHours` (store on contract metadata or new field)
  - Emit `CONTRACT_COOLING_OFF_STARTED` event
- If `product.coolingOffHours === 0`:
  - Proceed directly to `active` as today (no change to existing behavior)

**3. Cooling-Off Cancellation Endpoint**

Add a GraphQL mutation and REST endpoint:

```graphql
type Mutation {
  cancelContractDuringCoolingOff(
    contractId: ID!
    reason: String
    idempotencyKey: String!
  ): CancelCoolingOffResult!
}
```

Logic:
- Validate contract exists and belongs to tenant
- Validate contract status is `cooling_off`
- Validate current time < `coolingOffExpiresAt`
- If valid:
  - Mark contract as `cancelled` with reason `COOLING_OFF_CANCELLATION`
  - Cancel all repayment schedule installments
  - Initiate collection of disbursed amount from customer wallet (auto-deduction)
  - If collection succeeds: contract fully cancelled, emit `CONTRACT_COOLING_OFF_CANCELLED` event
  - If collection fails: flag for manual resolution (customer must return funds)
  - Zero out any accrued interest during cooling-off period (customer should not be charged)
- If cooling-off has expired: reject with `COOLING_OFF_PERIOD_EXPIRED` error

**4. Automatic Transition to Active**

Add a scheduled job (in `apps/scheduler/`) that runs every 15 minutes:
- Query all contracts with `status = cooling_off` where `coolingOffExpiresAt <= now()`
- Transition each to `active` status
- Emit `CONTRACT_COOLING_OFF_EXPIRED` event (contract is now fully active)
- Start normal repayment schedule processing

**5. Notification Flow**

On `CONTRACT_COOLING_OFF_STARTED`:
- Send notification to customer: "Your loan of {amount} has been disbursed. You have {coolingOffHours} hours to cancel if you change your mind."
- Include cancellation instructions (API endpoint or USSD code when available)

On `CONTRACT_COOLING_OFF_EXPIRED`:
- Send notification: "Your cooling-off period has ended. Your loan is now active. First repayment due on {date}."

**6. Event Types**

Add to `packages/event-contracts/src/events.enum.ts`:

```typescript
CONTRACT_COOLING_OFF_STARTED = 'contract.cooling_off.started',
CONTRACT_COOLING_OFF_CANCELLED = 'contract.cooling_off.cancelled',
CONTRACT_COOLING_OFF_EXPIRED = 'contract.cooling_off.expired',
```

**7. Admin Portal (apps/admin-portal)**

- **Contract Detail View** (`/loans/contracts/[id]`): If status is `cooling_off`, show a prominent amber banner at the top: "Cooling-off period active — expires at {datetime}. Customer may cancel this contract." Include countdown timer.
- Add a "Cancel (Cooling Off)" action button for SP operators (same as customer cancellation but operator-initiated)
- **Contract List View** (`/loans/contracts`): Add `cooling_off` as a filterable status option in the status dropdown. Display cooling-off contracts with an amber status badge.
- **Product Wizard** (`/products/new` and `/products/[id]/edit`): In the product configuration step, ensure the `coolingOffHours` field is prominently displayed with helper text: "Consumer protection period (hours) after disbursement during which the customer can cancel. Set to 0 to disable. Regulatory minimum varies by jurisdiction."

**8. Platform Portal (apps/platform-portal)**

- **Tenant Detail Page** (`/tenants/[id]`): Add a "Cooling-Off" metric card showing: active cooling-off contracts count, cancellation rate (% of contracts cancelled during cooling-off), average cooling-off duration configured across products.
- **System/Compliance Page**: If a tenant has products with `coolingOffHours = 0` in a jurisdiction where cooling-off is mandatory, show a compliance warning flag. (This can be a simple check — list tenants whose products have 0 cooling-off hours.)

### Tests

- Unit: Cooling-off activation when `coolingOffHours > 0`, bypass when 0
- Unit: Cancellation validation — correct status, within period, expired period
- Unit: Scheduler — transitions expired cooling-off contracts to active
- Integration: Full flow — disburse → cooling_off → cancel → funds collected
- Integration: Full flow — disburse → cooling_off → period expires → active → repayment starts

---

<a id="task-3"></a>
## Task 3: Cross-Product Exposure Rules

**Monday.com ID:** 11743597180
**Priority:** High
**Requirement:** FR-CP-007

### Context

A customer may have multiple active loans across different product types (micro-loan, overdraft, BNPL). The system must enforce a configurable maximum total credit exposure per customer across ALL products — not just within a single product.

### Current State

- `CreditLimitService` exists in `services/process-engine/src/scoring/credit-limit.service.ts`
- `calculateExposureCap()` already sums active contract principals per customer
- But this only considers single-product exposure (within the current loan application context)
- No cross-product aggregate limit exists
- No tenant-level or product-level maximum exposure configuration

### What to Build

**1. Exposure Configuration**

Add to the Tenant model's settings (via `TenantConfigSettings` schema in `packages/common/src/schemas/tenant-settings.schema.ts`):

```typescript
exposureRules: {
  maxCustomerExposure: string;        // e.g., "500000.00" — absolute max across all products
  maxCustomerExposureMultiplier: number; // e.g., 10 — max exposure as multiplier of monthly income (if available)
  enableCrossProductCheck: boolean;   // default: true
}
```

Also add product-level exposure rules in the Product model's `eligibilityRules` JSON:

```json
{
  "maxProductExposure": "100000.00",
  "maxActiveContractsPerProduct": 3,
  "excludeFromCrossProductCheck": false
}
```

**2. Cross-Product Exposure Service**

Create `services/process-engine/src/scoring/exposure.service.ts`:

```typescript
@Injectable()
export class ExposureService {
  /**
   * Calculate total customer exposure across ALL active products.
   * Includes: active contracts (principal outstanding), active credit lines (outstanding amount),
   * active BNPL transactions (remaining installments), funded invoices (advanced amount outstanding).
   */
  async calculateTotalExposure(tenantId: string, customerId: string): Promise<ExposureResult>;

  /**
   * Check if a new loan/credit would breach exposure limits.
   * Returns: { allowed: boolean, currentExposure, requestedAmount, limit, reason? }
   */
  async checkExposureLimit(
    tenantId: string,
    customerId: string,
    requestedAmount: Decimal,
    productId: string,
  ): Promise<ExposureLimitCheck>;
}

interface ExposureResult {
  customerId: string;
  totalExposure: Decimal;
  breakdown: {
    microLoan: Decimal;       // Sum of active micro-loan principals outstanding
    overdraft: Decimal;       // Sum of overdraft outstanding amounts
    bnpl: Decimal;            // Sum of remaining BNPL installment balances
    invoiceFactoring: Decimal; // Sum of funded invoice advance amounts outstanding
  };
  activeContractCount: number;
}

interface ExposureLimitCheck {
  allowed: boolean;
  currentExposure: Decimal;
  requestedAmount: Decimal;
  maxAllowed: Decimal;
  headroom: Decimal;         // maxAllowed - currentExposure
  reason?: string;           // If not allowed: 'TENANT_LIMIT_EXCEEDED' | 'PRODUCT_LIMIT_EXCEEDED' | 'CONTRACT_COUNT_EXCEEDED'
}
```

**3. Integration Points**

Hook the exposure check into every credit decision point:

- **Process engine pre-qualification** (`services/process-engine/src/qualification/`): Before scoring, check exposure limit. If breached, decline with `EXPOSURE_LIMIT_EXCEEDED`.
- **Overdraft drawdown** (future Sprint 10): Before approving a drawdown, verify total exposure including new drawdown amount won't breach limit.
- **BNPL checkout** (future Sprint 11): Pre-qualification check includes exposure.
- **Invoice factoring** (future Sprint 12): Before funding, check seller's total exposure.

For Sprint 9, implement the service and integrate with the existing micro-loan pre-qualification flow. The other product type integrations will be wired up in their respective sprints.

**4. Event Types**

Add to `packages/event-contracts/src/events.enum.ts`:

```typescript
EXPOSURE_LIMIT_CHECK_PASSED = 'exposure.limit.check.passed',
EXPOSURE_LIMIT_CHECK_FAILED = 'exposure.limit.check.failed',
EXPOSURE_LIMIT_WARNING = 'exposure.limit.warning',  // Approaching 80% of limit
```

**5. Admin Portal (apps/admin-portal)**

- **Customer Detail Page** (`/customers/[id]`): Add an "Exposure Summary" card showing:
  - Total exposure amount and currency
  - Breakdown by product type (micro-loan, overdraft, BNPL, invoice factoring) — show each as a row with amount and % of total
  - Limit utilization progress bar: green < 60%, amber 60-80%, red > 80%
  - Max allowed limit (from tenant settings)
  - Active contract count across all products
- **Loan Application Detail**: In the pre-qualification section, show the exposure check result inline — "Exposure check: PASSED (current: GHS 45,000 / limit: GHS 500,000)" or "FAILED: would exceed limit by GHS 12,000"
- **Tenant Settings** (`/settings/tenant`): Add an "Exposure Rules" section where SP admins can configure `maxCustomerExposure`, `enableCrossProductCheck`. Display current setting with helper text explaining cross-product exposure enforcement.

**6. Platform Portal (apps/platform-portal)**

- **Tenant Detail Page** (`/tenants/[id]`): Add an "Exposure Configuration" card showing the tenant's configured max customer exposure, whether cross-product check is enabled, and aggregate stats: average customer exposure, customers approaching limit (>80%), customers at limit.
- **Platform Settings / Defaults**: Allow platform admins to set default exposure rules that apply to newly created tenants. Existing tenants keep their current settings.

### Tests

- Unit: `calculateTotalExposure` — correctly aggregates across multiple contract types
- Unit: `checkExposureLimit` — passes when under limit, fails when over
- Unit: Handles edge cases — no active contracts (exposure = 0), product excluded from cross-check
- Integration: Loan request declined when customer total exposure + requested amount exceeds tenant limit
- Integration: Loan request proceeds when within limits

---

<a id="task-4"></a>
## Task 4: Customer Data Anonymization

**Monday.com ID:** 11743582812
**Priority:** High
**Requirement:** FR-CM-006.2

### Context

Customers have the right to request account deletion (data privacy regulations). The system must anonymize PII while preserving aggregate lending data for reporting and regulatory obligations. This is NOT a hard delete — financial records must be retained for regulatory periods (typically 7 years) but with PII removed.

### Current State

- PII masking utilities exist in `packages/common/src/masking/pii-masker.ts` (for logging/display)
- Customer model has `deletedAt` soft-delete field
- PII fields are encrypted at rest (AES-256-GCM)
- No anonymization logic or endpoints exist

### What to Build

**1. Anonymization Service**

Create `services/entity-service/src/anonymization/anonymization.service.ts`:

```typescript
@Injectable()
export class AnonymizationService {
  /**
   * Anonymize a customer's PII. Replaces identifiable data with anonymized values
   * while preserving record structure for financial reporting.
   *
   * Prerequisites:
   * - All active contracts must be settled, cancelled, or written off
   * - No outstanding balance on any product
   * - Cooling-off periods expired
   * - Customer explicitly requested deletion (consent recorded)
   */
  async anonymizeCustomer(tenantId: string, customerId: string, requestedBy: string): Promise<AnonymizationResult>;

  /**
   * Check if a customer is eligible for anonymization.
   */
  async checkEligibility(tenantId: string, customerId: string): Promise<AnonymizationEligibility>;
}
```

**2. Anonymization Rules**

| Field | Anonymization Method |
|---|---|
| `fullName` | Replace with `ANON-{customerId-prefix}` (e.g., `ANON-a1b2c3`) |
| `email` | Replace with `anon-{customerId-prefix}@anonymized.local` |
| `phone` | Replace with `+000000000000` |
| `nationalId` | Replace with `ANON-NID-{customerId-prefix}` |
| `dateOfBirth` | Set to `1900-01-01` |
| `address` (if stored) | Replace with `{"anonymized": true}` |
| `kycDocuments` (JSON) | Replace with `{"anonymized": true, "anonymizedAt": "..."}` |
| `alternativeData` (JSON) | Replace with `{"anonymized": true}` |

Fields that are NOT anonymized (preserved for financial reporting):
- `id`, `tenantId` — record identity
- `createdAt`, `updatedAt` — record timestamps
- `kycTier` — aggregate reporting (how many Tier 1 vs Tier 2 customers)
- Contract records, ledger entries, repayment history — financial data preserved with anonymized customer reference
- `deletedAt` — set to anonymization timestamp

**3. Eligibility Checks**

Before anonymization:
- No active, performing, due, overdue, or delinquent contracts
- No outstanding overdraft balance (for future Sprint 10)
- No active BNPL transactions (for future Sprint 11)
- No funded invoices pending payment (for future Sprint 12)
- Customer has explicitly consented to deletion (consent record exists)
- No pending screening reviews

If any check fails, return specific reason(s) why anonymization cannot proceed.

**4. GraphQL Mutation**

```graphql
type Mutation {
  requestCustomerAnonymization(
    customerId: ID!
    reason: String!
    idempotencyKey: String!
  ): AnonymizationResult!
}

type AnonymizationResult {
  success: Boolean!
  customerId: ID!
  anonymizedAt: DateTime
  errors: [AnonymizationError!]
}

type AnonymizationError {
  code: String!
  message: String!
  blockingResource: String  # e.g., "Contract:abc-123 is still active"
}
```

Requires `SP_ADMIN` role (not operator — this is a sensitive action).

**5. Audit Trail**

Every anonymization action must create an immutable audit log entry with:
- Who requested it (operator user ID)
- Customer ID (preserved even after anonymization)
- Timestamp
- List of fields anonymized
- Reason for request

**6. Event Types**

Add to `packages/event-contracts/src/events.enum.ts`:

```typescript
CUSTOMER_ANONYMIZATION_REQUESTED = 'customer.anonymization.requested',
CUSTOMER_ANONYMIZATION_COMPLETED = 'customer.anonymization.completed',
CUSTOMER_ANONYMIZATION_BLOCKED = 'customer.anonymization.blocked',
```

**7. Admin Portal (apps/admin-portal)**

- **Customer Detail Page** (`/customers/[id]`):
  - Add "Request Anonymization" button (visible only to users with `SP_ADMIN` role)
  - On click: call eligibility check API first. Display results in a modal showing pass/fail for each prerequisite (no active contracts, no outstanding balance, consent recorded, etc.)
  - If eligible: show confirmation dialog listing all data that will be anonymized (name, email, phone, national ID, DOB, address, KYC docs)
  - After anonymization: customer detail page renders PII fields as "[Anonymized]" with a grey badge "Data anonymized on {date}"
  - Anonymized customers still appear in search (by ID) but show anonymized placeholder data
- **Customer List View** (`/customers`): Add an "Anonymized" filter option. Anonymized customers show with a distinct visual indicator (grey row or badge).

**8. Platform Portal (apps/platform-portal)**

- **Tenant Detail Page** (`/tenants/[id]`): Add an "Anonymization" metric card: total anonymization requests (completed/pending/blocked), anonymization rate.
- **Audit Log** (`/settings/audit-log`): Platform admins can see anonymization events across all tenants. Each entry shows: tenant, customer ID (preserved), who requested, timestamp, reason. This is critical for regulatory compliance — proving anonymization was performed correctly.
- **Anonymization Policy**: Platform admin can set minimum data retention period before anonymization is allowed (e.g., "no anonymization within 7 years of last financial transaction" for regulatory compliance). This overrides tenant-level settings.

### Tests

- Unit: Anonymization replaces all PII fields correctly
- Unit: Eligibility check — blocks when active contracts exist, passes when all settled
- Unit: Non-PII fields preserved (id, tenantId, financial records)
- Integration: Full flow — settle all contracts → request anonymization → verify PII replaced → verify financial records intact
- Integration: Blocked flow — active contract exists → anonymization rejected with specific error

---

<a id="task-5"></a>
## Task 5: CI — Prisma Migration Test Job

**Monday.com ID:** 11743472337
**Priority:** High

### Context

BA flagged that Prisma migrations are not tested in CI. A broken migration can pass code review and break all environments on deploy.

### What to Build

Add a CI job (GitHub Actions) that on any PR touching `packages/database/prisma/`:

1. Starts a PostgreSQL container (same version as production: 16)
2. Runs `prisma migrate reset --force` against a fresh database
3. Runs `prisma migrate deploy` to apply all migrations in sequence
4. Runs `prisma db seed` to verify seed data works with the schema
5. Fails the PR check if any step errors

Add to `.github/workflows/` — either as a new workflow or a new job in the existing CI workflow. Use the `paths` trigger filter to only run when migration files change.

### Tests

- Verify the job runs on PRs that modify `packages/database/prisma/migrations/`
- Verify the job does NOT run on PRs that don't touch migrations
- Verify the job correctly detects a broken migration (test with an intentionally bad migration locally)

---

<a id="task-6"></a>
## Task 6: CI — Post-Startup GraphQL Health Check

**Monday.com ID:** 11743495908
**Priority:** Medium

### Context

The dev server can start without errors but have broken GraphQL resolvers due to missing providers, circular dependencies, or misconfigured modules. A post-startup health check catches these.

### What to Build

Add a script (e.g., `scripts/health-check.sh` or a node script) that:

1. Starts the GraphQL server in the background
2. Waits for the server to be ready (poll `/health` or the GraphQL endpoint)
3. Sends a simple introspection query: `{ __schema { types { name } } }`
4. Verifies the response is valid JSON with no errors
5. Optionally: send a basic `{ _service { sdl } }` query if using federation
6. Exits with code 0 on success, non-zero on failure
7. Kills the background server process

Integrate this into the CI pipeline so it runs on every PR.

### Tests

- Verify the health check passes on the current codebase
- Verify it fails if a required provider is removed (intentionally break and verify detection)

---

<a id="task-7"></a>
## Task 7: Audit APP_GUARD Providers for GraphQL Context Compatibility

**Monday.com ID:** 11743434011
**Priority:** Medium

### Context

BA flagged that some NestJS guards may not correctly access the GraphQL execution context (they use `req` from HTTP context instead of extracting from GQL context). This causes silent auth failures in GraphQL resolvers.

### What to Build

1. Audit all files matching `*guard*` or `*Guard*` across the codebase
2. For each guard that implements `CanActivate`:
   - Check if it handles both HTTP and GraphQL contexts
   - The correct pattern is:
     ```typescript
     const ctx = GqlExecutionContext.create(context);
     const request = ctx.getContext().req;
     ```
   - NOT the HTTP-only pattern:
     ```typescript
     const request = context.switchToHttp().getRequest();
     ```
3. Fix any guards that don't handle both contexts
4. Ensure the `ThrottlerGuard` extension (if overridden) handles GraphQL context correctly — this was flagged as a specific issue in BA-OBS-001

### Tests

- Unit: Each guard correctly extracts context from both HTTP and GraphQL requests
- Integration: Protected GraphQL mutations work end-to-end with all guards active

---

<a id="task-8"></a>
## Task 8: Platform Portal — Cross-Tenant Query Support

**Monday.com ID:** 11744414381
**Priority:** High

### Context

The platform portal has three stub pages under `/tenants/[id]/` (products, customers, contracts) that cannot work because the backend GraphQL API has no mechanism for platform admins to query another tenant's data. Every query enforces the JWT's `tenantId` — there is no "impersonate tenant" or "platform admin override" capability. Without this, the platform portal's Sprint 9 regulatory features (screening dashboard, compliance oversight, anonymization audit) also cannot cross-reference tenant-specific data.

### Current State

- Platform portal tenant drill-down pages are 43-line stubs each, displaying: "Requires platform admin API extension (tenant override query parameter)."
- Backend GraphQL resolvers set tenant context from JWT via `SET app.current_tenant`
- No mechanism for PLATFORM_ADMIN role to query across tenants or impersonate a tenant context

### What to Build

**1. Platform Admin Tenant Context Override**

In `apps/graphql-server/src/auth/` (or the tenant context middleware):

- When the authenticated user has role `PLATFORM_ADMIN`:
  - Accept an optional `X-Tenant-Context` HTTP header (or `tenantContext` GraphQL directive/argument)
  - If provided, set the PostgreSQL session variable to that tenant's ID instead of the JWT's tenant
  - Validate the target tenant exists and is active
  - Log all cross-tenant access to the audit trail with `accessType: 'platform_override'`
- When the user does NOT have `PLATFORM_ADMIN` role:
  - Ignore the `X-Tenant-Context` header entirely (no escalation path)
  - Return 403 if explicitly attempted

**2. Apollo Client Configuration in Platform Portal**

In `apps/platform-portal/src/lib/` (Apollo client setup):

- Add a `tenantContext` variable to the Apollo link chain
- When navigating to `/tenants/[id]/*` pages, automatically include the `X-Tenant-Context: {tenantId}` header on all GraphQL requests
- Provide a React context (`TenantOverrideContext`) that drill-down pages can consume

**3. Complete the Three Stub Pages**

Update the platform portal tenant drill-down pages:

- **`/tenants/[id]/products`**: List the tenant's products with status, type, active contracts count, total disbursed. Reuse admin-portal's product list query with tenant override.
- **`/tenants/[id]/customers`**: List the tenant's customers with KYC status, active contracts, total exposure. Basic search by name/ID.
- **`/tenants/[id]/contracts`**: List the tenant's contracts with status, amount, customer name, product name, DPD. Status filtering.

These are read-only views — platform admins observe but do not modify tenant data (except for specific actions like screening escalation review, which are handled by dedicated mutations).

**4. Audit Trail**

Every query made with `X-Tenant-Context` override must create an audit entry:
```
{
  action: 'PLATFORM_TENANT_OVERRIDE',
  actorId: platformAdminUserId,
  targetTenantId: overriddenTenantId,
  resource: 'products' | 'customers' | 'contracts' | etc.,
  timestamp: now()
}
```

### Tests

- Unit: Tenant context override accepted only for PLATFORM_ADMIN role
- Unit: Non-PLATFORM_ADMIN users cannot use X-Tenant-Context header
- Unit: Invalid/inactive tenant ID rejected
- Integration: Platform admin queries tenant's products via override → correct data returned
- Integration: Audit entry created for every override query
- Security: Verify no data leakage — override only affects the specified query, not subsequent requests

---

<a id="task-9"></a>
## Task 9: Admin Portal — Report Date Range Filtering

**Monday.com ID:** 11744414685
**Priority:** Medium

### Context

All 8 report types in the admin portal display data but have no date range filtering. Reports are useless for compliance and operational reviews without the ability to filter by time period. This is a quick win that makes existing report infrastructure usable.

### Current State

- 8 report components exist under `apps/admin-portal/src/components/reports/`:
  - disbursement-report.tsx (65 lines)
  - repayment-report.tsx (66 lines)
  - portfolio-quality-report.tsx (128 lines)
  - revenue-report.tsx (521 lines)
  - reconciliation-report.tsx (93 lines)
  - customer-acquisition-report.tsx (79 lines)
  - product-performance-report.tsx (118 lines)
  - collections-report.tsx (127 lines)
- A `date-range-picker.tsx` UI component exists (28 lines) but is not used in any report
- Reports currently fetch all-time data with no time bounds

### What to Build

**1. Shared Report Filter Bar**

Create `apps/admin-portal/src/components/reports/report-filter-bar.tsx`:

- Date range picker (reuse existing `date-range-picker.tsx` component — extend if needed)
- Preset buttons: "Last 7 days", "Last 30 days", "This month", "Last month", "This quarter", "Last quarter", "Year to date", "Custom"
- Product type filter dropdown (optional, for reports that support it)
- "Apply" button that triggers refetch

**2. Update Each Report Component**

For each of the 8 report components:
- Add `ReportFilterBar` at the top
- Pass `startDate` and `endDate` as variables to the GraphQL query
- Default to "Last 30 days" on initial load
- Preserve filter state in URL query params (e.g., `?from=2026-03-15&to=2026-04-14`) so filters survive page refresh and are shareable

**3. Backend Query Updates**

Ensure the GraphQL queries for each report type accept `startDate` and `endDate` parameters. Check and update:
- Portfolio metrics queries
- Disbursement/repayment aggregation queries
- Settlement/reconciliation queries
- Customer acquisition queries

If the backend queries already support date parameters (check the resolver signatures), this is purely a frontend wiring task. If not, add the parameters to the resolvers with database-level date filtering.

**4. Platform Portal Reports**

If the platform portal's tenant detail page (`/tenants/[id]`) shows portfolio/disbursement charts, add the same date range filtering to those visualizations. The `TENANT_INSIGHTS_QUERY` should accept date range parameters.

### Tests

- Unit: ReportFilterBar emits correct date range on preset click and custom selection
- Unit: URL query params correctly serialize/deserialize date range
- Integration: Report data changes when different date ranges are applied
- Visual: Verify each of the 8 reports renders correctly with filter bar

---

## Environment Variable Additions

Add these to `.env.example`:

```bash
# AML Screening (Task 1)
SCREENING_PROVIDER=mock
COMPLYADVANTAGE_API_KEY=
SCREENING_CACHE_TTL_HOURS=24
SCREENING_FUZZINESS=0.6
```

---

## Migration Summary

This sprint adds:
1. `ScreeningResult` model + `ScreeningStatus` and `ScreeningRiskLevel` enums (Task 1)
2. `cooling_off` value to `ContractStatus` enum (Task 2)

Both migrations must be backward-compatible per project rules (Docs/13-deployment.md §3.3). Adding an enum value and a new table are both additive and safe.

---

## Execution Order

Tasks 1-4 are independent — they can be developed in any order or in parallel. Tasks 5-7 are also independent. Task 8 (cross-tenant query) is a prerequisite for the platform portal sections of Tasks 1-4, so it should be done early. Task 9 (report filtering) is fully independent.

Recommended order for a single developer:
1. Task 5 (CI migration test) — small, unblocks safer migration work
2. Task 7 (APP_GUARD audit) — small, quick fix
3. Task 6 (Health check) — small, CI improvement
4. Task 8 (Cross-tenant queries) — medium, unblocks platform portal work for Tasks 1-4
5. Task 9 (Report date filtering) — small-medium, quick win
6. Task 2 (Cooling-off) — medium, adds new contract state
7. Task 3 (Cross-product exposure) — medium, extends existing scoring service
8. Task 4 (Anonymization) — medium, new service
9. Task 1 (AML screening) — largest task, adapter + process engine integration

Total estimated effort: ~3 weeks for a single developer.

---

## Definition of Done

For each task:
- [ ] Implementation code committed and passing lint
- [ ] Unit tests with 80%+ coverage on new code
- [ ] Integration tests for critical paths
- [ ] Migration runs cleanly against fresh and existing databases
- [ ] Event types added to event-contracts package (where applicable)
- [ ] Environment variables documented in .env.example (where applicable)
- [ ] No PII in log output (verify masking)
- [ ] GraphQL schema updated where applicable
- [ ] Admin portal components updated where applicable
- [ ] Platform portal components updated where applicable
