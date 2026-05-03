# Sprint 9 — Remediation Prompt

**Priority: CRITICAL — Sprint cannot close until these gaps are resolved**
**Owner: Claude Code (DEV)**
**Date: 2026-04-14**
**Reference: `Docs/SPRINT-9-REVIEW.md` for full audit details**

PM review found 37 gaps across Tasks 1–4, 8–9. Tasks 5, 6, 7 are complete — do not touch them. This prompt covers ALL gaps organized by fix area. Each fix references the review gap ID (e.g., 1A, 2B) for traceability.

**Read `Docs/SPRINT-9-DEV-PROMPT.md` for original specs if you need full context on any task.**

---

## Table of Contents

1. [Fix 1: Wire AML Screening into Disbursement Flow (1B — CRITICAL)](#fix-1)
2. [Fix 2: Integrate Circuit Breaker into ComplyAdvantage Adapter (1A)](#fix-2)
3. [Fix 3: Build Screening Manual Review Queue UI (1D)](#fix-3)
4. [Fix 4: Wire Remaining 4 Reports to GraphQL with Date Range (9A)](#fix-4)
5. [Fix 5: Add Cooling-Off Notification Templates (2B)](#fix-5)
6. [Fix 6: Add Cooling-Off REST Endpoint (2A)](#fix-6)
7. [Fix 7: Platform Portal Compliance Warnings (2C)](#fix-7)
8. [Fix 8: Anonymization Service Hardening (4A, 4B, 4C, 4D)](#fix-8)
9. [Fix 9: Anonymization Portal Gaps (4E, 4F, 4G, 4H)](#fix-9)
10. [Fix 10: Loan Application Inline Checks (1E, 3A)](#fix-10)
11. [Fix 11: Platform Portal Screening Dashboard (1F, 1G)](#fix-11)
12. [Fix 12: Platform Portal Exposure & Anonymization Metrics (3B, 3C, 3D)](#fix-12)
13. [Fix 13: Cross-Tenant Customers Page Enhancements (8A, 8B)](#fix-13)
14. [Fix 14: Cross-Tenant Audit Decorator Verification (8C)](#fix-14)
15. [Fix 15: Platform Portal Date Range Filtering (9B)](#fix-15)
16. [Fix 16: Integration & Security Tests (1C, 2D, 3E, 4I, 8D, 9C)](#fix-16)

---

<a id="fix-1"></a>
## Fix 1: Wire AML Screening into Disbursement Flow (1B — CRITICAL)

**Gap:** `disbursement.service.ts` (133 lines) does not call ScreeningService before disbursement. Loans can be disbursed without AML screening.

**File:** `services/process-engine/src/disbursement/disbursement.service.ts`

**What to do:**

1. Import `ScreeningService` from `services/integration-service/src/screening/screening.service.ts` (or expose it via the integration service module and inject it).

2. Before the contract status is set to `performing` (currently at line ~83), add a screening gate:

```typescript
// BEFORE setting contract to performing, check AML screening
const screening = await this.screeningService.screenCustomer(tenantId, customerId);

switch (screening.status) {
  case 'MATCH':
    // Block disbursement entirely
    await this.updateLoanRequestStatus(loanRequestId, 'rejected', {
      reason: 'AML_SCREENING_MATCH',
      screeningId: screening.id,
    });
    this.eventBus.emit(EventType.SCREENING_MATCH_FOUND, { tenantId, customerId, loanRequestId, screeningId: screening.id });
    throw new AmlScreeningBlockedException(loanRequestId, screening.id);

  case 'POTENTIAL_MATCH':
    // Hold for manual review — do NOT disburse
    await this.updateLoanRequestStatus(loanRequestId, 'pending_review', {
      reason: 'AML_SCREENING_POTENTIAL_MATCH',
      screeningId: screening.id,
    });
    this.eventBus.emit(EventType.SCREENING_MANUAL_REVIEW_REQUIRED, { tenantId, customerId, loanRequestId, screeningId: screening.id });
    return { status: 'held_for_review', screeningId: screening.id };

  case 'ERROR':
    // Retry once
    const retryScreening = await this.screeningService.screenCustomer(tenantId, customerId);
    if (retryScreening.status === 'ERROR') {
      await this.updateLoanRequestStatus(loanRequestId, 'pending_review', {
        reason: 'AML_SCREENING_ERROR',
        screeningId: retryScreening.id,
      });
      this.eventBus.emit(EventType.SCREENING_MANUAL_REVIEW_REQUIRED, { tenantId, customerId, loanRequestId });
      return { status: 'held_for_review', screeningId: retryScreening.id };
    }
    // If retry succeeds and returns CLEAR, fall through
    if (retryScreening.status !== 'CLEAR') {
      // Handle MATCH/POTENTIAL_MATCH from retry (same logic as above)
      // ...
    }
    break;

  case 'CLEAR':
    // Proceed to disbursement — no action needed
    break;
}

// ... existing disbursement logic continues ...
```

3. The ScreeningService already caches results (24h Redis TTL), so repeated calls for the same customer won't hit the external API.

4. Add a `pending_review` status to the loan request state machine if it doesn't exist, or use an existing hold state.

**Tests required:** See Fix 16.

---

<a id="fix-2"></a>
## Fix 2: Integrate Circuit Breaker into ComplyAdvantage Adapter (1A)

**Gap:** `resilience/circuit-breaker.ts` (69 lines) exists with constructor `CircuitBreakerOptions = { failureThreshold: 5, resetTimeout: 30000, halfOpenMaxAttempts: 1 }` but is not used in `complyadvantage.adapter.ts`.

**Files:**
- `services/integration-service/src/screening/complyadvantage.adapter.ts` (279 lines)
- `services/integration-service/src/resilience/circuit-breaker.ts` (69 lines)

**What to do:**

1. In the ComplyAdvantage adapter constructor, instantiate a CircuitBreaker:

```typescript
private circuitBreaker: CircuitBreaker;

constructor(/* existing deps */) {
  this.circuitBreaker = new CircuitBreaker({
    failureThreshold: 3,    // Spec: 3 consecutive failures
    resetTimeout: 30000,    // Spec: 30 seconds open circuit
    halfOpenMaxAttempts: 1,
  });
}
```

2. Wrap the HTTP calls in `screenCustomer()` (around lines 105–112) and `getScreeningStatus()` (around lines 140–147) with the circuit breaker's `execute` method:

```typescript
const response = await this.circuitBreaker.execute(() =>
  fetch(url, { ...options, signal: AbortSignal.timeout(10000) })
);
```

3. When the circuit is open, the adapter should immediately return a `ScreeningStatus.ERROR` result rather than attempting the HTTP call. This prevents cascading timeouts.

4. Add a unit test verifying:
   - After 3 consecutive failures, subsequent calls return ERROR immediately (no HTTP attempt)
   - After 30s, circuit half-opens and allows one retry
   - On successful retry, circuit closes

---

<a id="fix-3"></a>
## Fix 3: Build Screening Manual Review Queue UI (1D)

**Gap:** Backend has `getScreeningsForReview(tenantId, take)` and `submitReview(tenantId, screeningId, decision, reviewedBy)` but no admin portal page exists.

**File to create:** `apps/admin-portal/src/app/(portal)/screening/page.tsx`

**Also update:** `apps/admin-portal/src/app/(portal)/layout.tsx` (add navigation link)

**What to build:**

1. New route at `/screening` in the admin portal (or `/screening/review` — match existing nav patterns).

2. Add navigation item in the sidebar layout — place it under "Loans" or as a top-level item labeled "Screening Review" with a badge showing pending count.

3. Page content:

   - **Header:** "AML Screening Review Queue"
   - **GraphQL query:** Fetch screenings with status `POTENTIAL_MATCH` that have no `reviewDecision` yet. Use the existing backend method `getScreeningsForReview`.
   
   ```graphql
   query ScreeningsForReview($take: Int) {
     screeningsForReview(take: $take) {
       id
       customerId
       customer { fullName }
       screenedAt
       riskLevel
       matchCount
       matchDetails
       provider
       status
     }
   }
   ```

   - **Data table columns:**
     - Customer name (link to `/customers/[id]`)
     - Screening date
     - Risk level (color-coded badge: MEDIUM=amber, HIGH=orange, CRITICAL=red)
     - Match count
     - Match summary (first match source and type, e.g., "PEP — OFAC SDN")
     - Provider
     - Actions column

   - **Actions (per row):**
     - "Approve" button (green) — calls `submitReview` mutation with `decision: 'approved'`, confirms via modal: "Approve this customer for disbursement? The held loan request will proceed."
     - "Block" button (red) — calls `submitReview` with `decision: 'blocked'`, confirms via modal: "Block this customer? The loan request will be rejected."
     - "Escalate" button (amber) — calls `submitReview` with `decision: 'escalated'`, confirms via modal: "Escalate to platform admin for further investigation?"
     - "View Details" button — expands row or opens modal showing full `matchDetails` JSON rendered as a readable list

   - **GraphQL mutations:**
   
   ```graphql
   mutation SubmitScreeningReview($screeningId: ID!, $decision: String!) {
     submitScreeningReview(screeningId: $screeningId, decision: $decision) {
       id
       reviewDecision
       reviewedAt
       reviewedBy
     }
   }
   ```

4. After a review action, the row should disappear from the queue (refetch query).

5. Add a tab or toggle to see "Recently Reviewed" screenings (last 7 days) with their decisions.

---

<a id="fix-4"></a>
## Fix 4: Wire Remaining 4 Reports to GraphQL with Date Range (9A)

**Gap:** 4 reports use mock/hardcoded data: `disbursement-report.tsx` (79 lines), `repayment-report.tsx` (80 lines), `customer-acquisition-report.tsx` (93 lines), `product-performance-report.tsx` (132 lines).

**Working pattern to replicate:** See `portfolio-quality-report.tsx` (145 lines) — uses `ReportLayout`, `useReportDateRange` hook, and `useQuery` with `startDate`/`endDate` variables.

**For each of the 4 reports:**

### 4a. Disbursement Report (`apps/admin-portal/src/components/reports/disbursement-report.tsx`)

Current mock structure: `{ id, date, product, count, amount, avgTicket }`

1. Define GraphQL query:
```graphql
query DisbursementReport($startDate: DateTime!, $endDate: DateTime!) {
  disbursementReport(startDate: $startDate, endDate: $endDate) {
    entries {
      date
      product
      count
      amount
      avgTicket
    }
    totals {
      totalCount
      totalAmount
      avgTicket
    }
  }
}
```

2. If this resolver doesn't exist yet on the backend (`apps/graphql-server/src/graphql/resolvers/`), create it. Query the contracts table for contracts with `disbursedAt` between `startDate` and `endDate`, grouped by date and product.

3. Replace mock data with `useQuery` + `useReportDateRange` hook. Follow the `portfolio-quality-report.tsx` pattern exactly:
   - Import `dynamic(() => import('...TrendChart'), { ssr: false })` if charts are needed
   - Wrap component in `ReportLayout` with `onDateRangeChange`
   - Pass `startDate`/`endDate` as query variables

### 4b. Repayment Report (`apps/admin-portal/src/components/reports/repayment-report.tsx`)

Current mock: `{ id, date, totalCollected, principal, interest, fees, count }`

Same pattern. Backend query: repayments table with `paidAt` between start/end, aggregate by date.

### 4c. Customer Acquisition Report (`apps/admin-portal/src/components/reports/customer-acquisition-report.tsx`)

Current mock: `{ id, period, newCustomers, kycCompleted, firstLoan, conversionRate }`

Backend query: customers table with `createdAt` between start/end. `kycCompleted` = customers with `kycVerifiedAt` in range. `firstLoan` = customers whose first contract `createdAt` falls in range. `conversionRate` = firstLoan / newCustomers.

### 4d. Product Performance Report (`apps/admin-portal/src/components/reports/product-performance-report.tsx`)

Current mock: `{ product, activeContracts, totalDisbursed, totalOutstanding, repaymentRate, parRate, avgTicket, avgTenor, revenue }`

Backend query: aggregate contracts by product, filtered by `createdAt` or `disbursedAt` in range.

**For all 4:** If the GraphQL resolvers for these reports already exist (check `apps/graphql-server/src/graphql/resolvers/` for report-related resolvers), ensure they accept `startDate` and `endDate` parameters. If they don't exist, create them following the pattern of whichever report resolvers already work (the ones backing portfolio-quality, revenue, reconciliation, collections reports).

---

<a id="fix-5"></a>
## Fix 5: Add Cooling-Off Notification Templates (2B)

**Gap:** Events are emitted but `template-renderer.ts` (42 lines) has no templates for cooling-off events.

**File:** `services/notification-service/src/templates/template-renderer.ts`

**What to do:**

Add 3 new entries to the `NOTIFICATION_TEMPLATES` object, matching the existing template structure (each has sms, email, push, in_app channels):

```typescript
cooling_off_started: {
  sms: 'Your loan of {{currency}} {{amount}} has been disbursed. You have {{coolingOffHours}} hours to cancel. Reply CANCEL to {{shortcode}} or contact your provider.',
  email: {
    subject: 'Loan Disbursed — Cooling-Off Period Active',
    body: 'Dear {{customerName}},\n\nYour loan of {{currency}} {{amount}} has been disbursed to your account. You have a {{coolingOffHours}}-hour cooling-off period during which you may cancel this loan and return the funds.\n\nCooling-off expires: {{expiresAt}}\n\nTo cancel, contact your service provider or use your provider\'s cancellation process.\n\nThank you.',
  },
  push: 'Loan {{currency}} {{amount}} disbursed. {{coolingOffHours}}h cooling-off period active.',
  in_app: 'Your loan of {{currency}} {{amount}} has been disbursed. You have {{coolingOffHours}} hours to cancel if you change your mind.',
},

cooling_off_cancelled: {
  sms: 'Your loan of {{currency}} {{amount}} has been cancelled during the cooling-off period. Funds will be collected from your account.',
  email: {
    subject: 'Loan Cancelled During Cooling-Off Period',
    body: 'Dear {{customerName}},\n\nYour loan of {{currency}} {{amount}} (Contract: {{contractNumber}}) has been cancelled during the cooling-off period.\n\nThe disbursed amount will be collected from your account. No interest or fees will be charged.\n\nThank you.',
  },
  push: 'Loan {{currency}} {{amount}} cancelled (cooling-off). Funds will be collected.',
  in_app: 'Your loan has been cancelled during the cooling-off period. The disbursed amount will be collected from your account. No interest or fees apply.',
},

cooling_off_expired: {
  sms: 'Your cooling-off period has ended. Your loan of {{currency}} {{amount}} is now active. First repayment due {{firstRepaymentDate}}.',
  email: {
    subject: 'Cooling-Off Period Ended — Loan Now Active',
    body: 'Dear {{customerName}},\n\nThe cooling-off period for your loan of {{currency}} {{amount}} (Contract: {{contractNumber}}) has ended. Your loan is now active.\n\nFirst repayment of {{repaymentAmount}} is due on {{firstRepaymentDate}}.\n\nThank you.',
  },
  push: 'Cooling-off ended. Loan active. First repayment {{repaymentAmount}} due {{firstRepaymentDate}}.',
  in_app: 'Your cooling-off period has ended. Your loan of {{currency}} {{amount}} is now active. First repayment due on {{firstRepaymentDate}}.',
},
```

Also ensure the notification service event handlers (`services/notification-service/src/`) listen for `CONTRACT_COOLING_OFF_STARTED`, `CONTRACT_COOLING_OFF_CANCELLED`, and `CONTRACT_COOLING_OFF_EXPIRED` events and dispatch notifications using these templates. Check if there's an event-to-template mapping config and add entries for the 3 new events.

---

<a id="fix-6"></a>
## Fix 6: Add Cooling-Off REST Endpoint (2A)

**Gap:** GraphQL mutation exists. REST endpoint missing.

**File:** `apps/rest-server/src/contract/contract.controller.ts` (73 lines, currently has 3 GET endpoints)

**What to do:**

Add a POST endpoint:

```typescript
@Post(':id/cancel-cooling-off')
@UseGuards(AuthGuard, RolesGuard)
@Roles('contract:write')
async cancelCoolingOff(
  @Param('id') contractId: string,
  @Body() body: { reason?: string; idempotencyKey: string },
  @Req() req: AuthenticatedRequest,
) {
  return this.contractService.cancelContractDuringCoolingOff(
    req.user.tenantId,
    contractId,
    body.reason,
    body.idempotencyKey,
  );
}
```

The underlying service logic already exists (used by the GraphQL mutation). This just exposes it via REST.

---

<a id="fix-7"></a>
## Fix 7: Platform Portal Compliance Warnings (2C)

**Gap:** No compliance check for tenants with products having `coolingOffHours=0`.

**Option A (recommended):** Add a compliance warning section to the platform portal's system/settings page.

**Option B:** Add it as a warning banner on the tenant detail page.

**What to build:**

1. Create a new page at `apps/platform-portal/src/app/(portal)/compliance/page.tsx` (or add a section to an existing system page).

2. GraphQL query to fetch tenants with products where `coolingOffHours = 0`:

```graphql
query ComplianceWarnings {
  tenantsWithZeroCoolingOff {
    tenantId
    tenantName
    products {
      id
      name
      coolingOffHours
    }
  }
}
```

3. If this resolver doesn't exist, create it in the platform admin resolvers. Query: all products where `coolingOffHours = 0` grouped by tenant.

4. Display as a warning card: "⚠ {count} tenant(s) have products with no cooling-off period configured. Cooling-off is mandatory in many jurisdictions."

5. Each row shows: Tenant name → Product name → "0 hours" with a link to the tenant detail page.

6. Add navigation item in platform portal sidebar under a "Compliance" section.

---

<a id="fix-8"></a>
## Fix 8: Anonymization Service Hardening (4A, 4B, 4C, 4D)

**File:** `services/entity-service/src/anonymization/anonymization.service.ts` (186 lines)
**File:** `apps/graphql-server/src/graphql/resolvers/customer.resolver.ts` (125 lines)

### 4A — Anonymize additional PII fields

The Customer model in `schema.prisma` (lines 445–491) does NOT have `address`, `kycDocuments`, or `alternativeData` as dedicated fields. However, it does have:
- `metadata Json?` — could contain arbitrary PII
- `region String?` and `city String?` — location data that combined with other fields could be identifying

In `anonymization.service.ts`, in the PII replacement section (around lines 156–171), add:

```typescript
// Existing replacements...
metadata: { anonymized: true, anonymizedAt: new Date().toISOString() },
region: null,
city: null,
```

This ensures location metadata and any JSON PII in metadata are cleared.

### 4B — Add consent and pending screening eligibility checks

In `anonymization.service.ts`, in the eligibility checks section (around lines 48–110), add two new checks:

```typescript
// Check: consent recorded
// Look for a consent record or flag — if your system tracks consent in metadata or a dedicated field
const hasConsent = customer.metadata?.anonymizationConsent === true
  || customer.metadata?.deletionRequested === true;
if (!hasConsent) {
  reasons.push({
    code: 'CONSENT_NOT_RECORDED',
    message: 'Customer has not explicitly consented to data deletion',
    blockingResource: `Customer:${customerId}`,
  });
}

// Check: no pending screening reviews
const pendingScreenings = await this.prisma.screeningResult.count({
  where: {
    tenantId,
    customerId,
    status: 'POTENTIAL_MATCH',
    reviewDecision: null,
  },
});
if (pendingScreenings > 0) {
  reasons.push({
    code: 'PENDING_SCREENING_REVIEW',
    message: `Customer has ${pendingScreenings} pending screening review(s)`,
    blockingResource: `ScreeningResult:pending`,
  });
}
```

### 4C — Change role authorization to SP_ADMIN

In `customer.resolver.ts` at line 115, change:

```typescript
// FROM:
@Roles('customer:delete')

// TO:
@Roles('SP_ADMIN')
```

If the RBAC system uses permission strings rather than role names, use the equivalent SP_ADMIN permission. Check how other SP_ADMIN-only mutations are decorated in the codebase and match that pattern.

### 4D — Enforce idempotency key

In `anonymization.service.ts`, at the start of `anonymizeCustomer()` (around line 116), add:

```typescript
// Check idempotency — prevent duplicate anonymization
if (idempotencyKey) {
  const existing = await this.prisma.auditLog.findFirst({
    where: {
      tenantId,
      action: 'CUSTOMER_ANONYMIZATION_COMPLETED',
      resourceId: customerId,
      metadata: { path: ['idempotencyKey'], equals: idempotencyKey },
    },
  });
  if (existing) {
    return { success: true, customerId, anonymizedAt: existing.createdAt, errors: [] };
  }
}
```

Pass `idempotencyKey` through from the resolver to the service method.

---

<a id="fix-9"></a>
## Fix 9: Anonymization Portal Gaps (4E, 4F, 4G, 4H)

### 4E — Role-gate the anonymization button in admin portal

**File:** `apps/admin-portal/src/app/(portal)/customers/[id]/page.tsx` (625 lines)

Find the "Request Anonymization" button (around lines 470–486). Wrap it in a role check:

```tsx
{user?.role === 'SP_ADMIN' && (
  <button onClick={handleAnonymizationRequest}>Request Anonymization</button>
)}
```

Use whatever auth context hook the admin portal uses (check how other role-gated UI elements work in the codebase — e.g., the product wizard or tenant settings).

### 4F — Add anonymized visual indicator to customer list

**File:** `apps/admin-portal/src/app/(portal)/customers/page.tsx` (65 lines)

In the data table row rendering, add a badge when the customer status is `anonymized`:

```tsx
// In the status/name column cell
{customer.status === 'anonymized' && (
  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500 ml-2">
    Anonymized
  </span>
)}
```

Ensure the GraphQL query for the customer list includes the `status` field if not already.

### 4G — Add anonymization metrics to platform portal tenant detail

**File:** `apps/platform-portal/src/app/(portal)/tenants/[id]/page.tsx` (523 lines)

In the metric cards grid (around lines 364–410), add a new card:

```tsx
<MetricCard
  icon={<ShieldOff className="h-5 w-5 text-gray-500" />}
  label="Anonymizations"
  value={insights.anonymizationCount ?? 0}
  subtext={`${insights.anonymizationBlockedCount ?? 0} blocked`}
/>
```

Update the `TENANT_INSIGHTS_QUERY` (around line 162) to include:
```graphql
anonymizationCount
anonymizationBlockedCount
```

If these fields don't exist on the TenantInsights GraphQL type, add them:

**File:** `apps/graphql-server/src/graphql/types/tenant-insights.type.ts` (89 lines)

Add fields:
```typescript
@Field(() => Int, { nullable: true })
anonymizationCount?: number;

@Field(() => Int, { nullable: true })
anonymizationBlockedCount?: number;
```

Update the resolver that computes tenant insights to count anonymization audit log entries.

### 4H — Anonymization retention policy for platform admins

Add to the platform portal settings page (or a new compliance config section) a field for minimum data retention period:

```typescript
// In platform settings or a new /compliance/settings page
minimumRetentionYears: number; // default: 7

// Stored as a platform-level config (not per-tenant)
// The anonymization service should check: if (customer.lastTransactionDate + retentionYears > now) → block
```

This is a lower-priority item. At minimum, add the field to the platform settings and pass it through to the anonymization eligibility check.

---

<a id="fix-10"></a>
## Fix 10: Loan Application Inline Checks (1E, 3A)

**Gap:** Loan applications page (`/loans/applications`, 49 lines) doesn't show screening or exposure check results inline.

**File:** `apps/admin-portal/src/app/(portal)/loans/applications/page.tsx` (49 lines)

This page is a list view with columns: id, amount, channel, status, createdAt. It needs to be extended:

1. **Add a detail drawer/modal** that opens when clicking a row. The drawer should show:
   - Basic loan request info (amount, product, customer, status)
   - **Screening check result (1E):** "AML Screening: CLEAR ✓" / "POTENTIAL_MATCH ⚠ — Pending Review" / "MATCH ✗ — Blocked" or "Not yet screened"
   - **Exposure check result (3A):** "Exposure Check: PASSED (Current: GHS 45,000 / Limit: GHS 500,000)" or "FAILED: would exceed limit by GHS 12,000"

2. **Update the GraphQL query** to include nested screening and exposure data:

```graphql
query LoanRequests($status: String, $take: Int, $cursor: String) {
  loanRequests(status: $status, first: $take, after: $cursor) {
    edges {
      node {
        id
        amount
        currency
        channel
        status
        createdAt
        customer {
          id
          fullName
        }
        product {
          id
          name
        }
        # Screening result (latest for this customer)
        latestScreening {
          status
          riskLevel
          matchCount
          reviewDecision
        }
        # Exposure check result (from pre-qualification)
        exposureCheck {
          allowed
          currentExposure
          maxAllowed
          reason
        }
      }
    }
  }
}
```

If `latestScreening` and `exposureCheck` fields don't exist on the LoanRequest GraphQL type, add them as resolved fields on the LoanRequest resolver — they can be computed from the existing ScreeningResult and ExposureService.

3. Add status-colored badges for both checks in the table row or detail drawer.

---

<a id="fix-11"></a>
## Fix 11: Platform Portal Screening Dashboard (1F, 1G)

**Gap:** No cross-tenant screening aggregate view for platform admins.

### 1F — Platform Screening Dashboard

**File to create:** `apps/platform-portal/src/app/(portal)/screening/page.tsx`

**What to build:**

1. New page at `/screening` in the platform portal.

2. Add navigation item in sidebar labeled "AML Screening".

3. Page content:
   - **Summary cards (top row):**
     - Total screenings today / this week / this month
     - Match rate % (MATCH + POTENTIAL_MATCH / total)
     - Pending reviews count (cross-tenant)
     - Escalated cases count
   
   - **Table: Recent screenings across all tenants** (last 50):
     - Tenant name, Customer name (masked for cross-tenant view), Screening date, Status (color badge), Risk level, Provider, Review decision
   
   - **Table: Screening stats by tenant:**
     - Tenant name, Total screenings, Match rate %, Pending reviews, Last screening date

4. GraphQL queries — these need `PLATFORM_ADMIN` role and should NOT use X-Tenant-Context (they query across all tenants):

```graphql
query PlatformScreeningDashboard {
  platformScreeningStats {
    totalToday
    totalWeek
    totalMonth
    matchRate
    pendingReviewCount
    escalatedCount
    byTenant {
      tenantId
      tenantName
      totalScreenings
      matchRate
      pendingReviews
      lastScreeningAt
    }
  }
}
```

If this resolver doesn't exist, create it in the platform admin resolvers. Query the `screening_results` table with no tenant filter.

### 1G — Escalated Screening Review

On the same `/screening` page, add a tab or section for "Escalated Cases":

- Shows screening results where `reviewDecision = 'escalated'`
- Platform admin actions:
  - "Confirm Block" — updates decision to `blocked` with platform admin override
  - "Override to Approve" — updates decision to `approved_override`, **requires mandatory reason input**
  - "Flag for External Investigation" — updates decision to `external_investigation`
- All actions create audit log entries with platform admin ID and reason.

---

<a id="fix-12"></a>
## Fix 12: Platform Portal Exposure & Anonymization Metrics (3B, 3C, 3D)

### 3B — Add maxCustomerExposureMultiplier to admin portal settings

**File:** `apps/admin-portal/src/app/(portal)/settings/tenant/page.tsx`

Add a numeric input field for `maxCustomerExposureMultiplier` in the exposure rules section. Label: "Max Exposure as Income Multiplier" with helper text: "Maximum total credit exposure as a multiple of customer's monthly income (if income data available). Set to 0 to disable."

### 3C — Platform portal default exposure rules

**File:** `apps/platform-portal/src/app/(portal)/settings/page.tsx` (or create a new defaults section)

Add a "Default Tenant Settings" section where platform admins can set:
- Default `maxCustomerExposure`
- Default `enableCrossProductCheck`
- Default `maxCustomerExposureMultiplier`

These values should be applied when creating new tenants. Store as platform-level config.

### 3D — Add aggregate stats to platform portal exposure card

**File:** `apps/platform-portal/src/app/(portal)/tenants/[id]/page.tsx` (around lines 453–489)

In the existing exposure configuration card, add:
- "Avg Customer Exposure: GHS {avg}" — average totalExposure across all active customers
- "Customers > 80% Limit: {count}" — count of customers whose exposure exceeds 80% of maxCustomerExposure

These require a new GraphQL field on tenant insights or a separate query.

---

<a id="fix-13"></a>
## Fix 13: Cross-Tenant Customers Page Enhancements (8A, 8B)

### 8A — Products page aggregate columns

**File:** `apps/platform-portal/src/app/(portal)/tenants/[id]/products/page.tsx` (82 lines)

Update the GraphQL query to include:
```graphql
activeContractsCount
totalDisbursed
```

Add these as columns in the data table. If these fields don't exist on the Product GraphQL type as resolved fields, add them as field resolvers that count contracts and sum disbursed amounts.

### 8B — Customers page aggregates and search

**File:** `apps/platform-portal/src/app/(portal)/tenants/[id]/customers/page.tsx` (106 lines)

1. Update GraphQL query to include:
```graphql
activeContractsCount
totalExposure
```

2. Add a search input above the table that filters by customer name or ID:
```tsx
<input
  type="text"
  placeholder="Search by name or ID..."
  value={search}
  onChange={(e) => setSearch(e.target.value)}
/>
```

Pass `search` as a variable to the GraphQL query. The backend customer list query should already support a `search` parameter (check the customers resolver).

3. Add `activeContractsCount` and `totalExposure` as table columns.

---

<a id="fix-14"></a>
## Fix 14: Cross-Tenant Audit Decorator Verification (8C)

**Gap:** Need to verify all resolvers that can be accessed via X-Tenant-Context override are decorated with `@AuditAction`.

**What to do:**

1. Search for all resolvers in `apps/graphql-server/src/graphql/resolvers/` that are used by the platform portal drill-down pages (products, customers, contracts queries).

2. Verify each has the `@AuditAction` decorator. If any are missing, add:
```typescript
@AuditAction(AuditActionType.READ, AuditResourceType.PRODUCT) // or CUSTOMER, CONTRACT
```

3. Verify the audit log captures `targetTenantId` when `X-Tenant-Context` is present. Check the auth guard where the header is parsed — it should inject the override tenant ID into the audit context.

---

<a id="fix-15"></a>
## Fix 15: Platform Portal Date Range Filtering (9B)

**Gap:** Platform portal tenant detail page has no date range filtering on metrics/charts.

**File:** `apps/platform-portal/src/app/(portal)/tenants/[id]/page.tsx` (523 lines)

**What to do:**

1. Add a simplified date range picker at the top of the tenant insights section (can reuse or adapt the admin portal's `ReportFilterBar` component — or create a simpler version with just preset buttons: "Last 7 days", "Last 30 days", "This quarter").

2. Pass `startDate` and `endDate` to the `TENANT_INSIGHTS_QUERY`.

3. Ensure the backend resolver for tenant insights accepts these parameters and filters accordingly.

---

<a id="fix-16"></a>
## Fix 16: Integration & Security Tests (1C, 2D, 3E, 4I, 8D, 9C)

**Gap:** Multiple tasks lack integration/security tests.

### 1C — Screening integration tests

**File to create:** `services/process-engine/src/__tests__/screening-disbursement.integration.spec.ts`

Tests:
- Create customer → submit loan request → process to disbursement stage → verify screening is called
- Customer name "SANCTIONS TEST" (mock adapter returns MATCH) → verify loan request is rejected with `AML_SCREENING_MATCH`
- Customer name "PEP TEST" (mock adapter returns POTENTIAL_MATCH) → verify loan request is held in `pending_review`
- Normal customer name → verify screening returns CLEAR → verify disbursement proceeds
- Screening returns ERROR → verify retry → if still ERROR → held for manual review
- Customer with cached CLEAR screening (within 24h) → verify no new screening call, disbursement proceeds

### 2D — Cooling-off integration tests

**File to create:** `services/process-engine/src/__tests__/cooling-off.integration.spec.ts`

Tests:
- Product with `coolingOffHours = 48` → disburse → verify contract enters `cooling_off` status → verify `coolingOffExpiresAt` is set
- While in cooling-off → call `cancelContractDuringCoolingOff` → verify contract is `cancelled`, repayment schedule cancelled, interest zeroed
- While in cooling-off → wait for expiry (simulate time) → run scheduler job → verify contract transitions to `active`
- Product with `coolingOffHours = 0` → disburse → verify contract goes directly to `active` (no cooling-off)
- Try cancellation after cooling-off expired → verify `COOLING_OFF_PERIOD_EXPIRED` error

### 3E — Exposure integration tests

**File to create:** `services/process-engine/src/__tests__/exposure.integration.spec.ts`

Tests:
- Set tenant `maxCustomerExposure = 100000` → customer has active contract of 80000 → submit new loan request for 30000 → verify declined with `EXPOSURE_LIMIT_EXCEEDED`
- Same scenario but request 15000 → verify approved (80000 + 15000 = 95000 < 100000)
- Customer with no active contracts → any amount under limit → verify approved

### 4I — Anonymization integration tests

**File to create:** `services/entity-service/src/anonymization/__tests__/anonymization.integration.spec.ts`

Tests:
- Customer with all contracts settled → request anonymization → verify all PII fields replaced → verify financial records (contracts, ledger entries) intact → verify audit log entry created
- Customer with active contract → request anonymization → verify rejected with `ACTIVE_CONTRACT` error
- Customer with pending screening review → request anonymization → verify rejected with `PENDING_SCREENING_REVIEW`
- Already anonymized customer → request again → verify idempotent (no error, returns existing result)

### 8D — Cross-tenant security tests

**File to create:** `apps/graphql-server/src/__tests__/cross-tenant-security.spec.ts`

Tests:
- Non-PLATFORM_ADMIN user sends `X-Tenant-Context` header → verify 403 Forbidden
- PLATFORM_ADMIN with valid tenant ID → verify data returned correctly
- PLATFORM_ADMIN with non-existent tenant ID → verify error (not 500, proper error message)
- PLATFORM_ADMIN with inactive tenant ID → verify error
- Verify audit log entry created for every cross-tenant query
- Verify no data from override tenant leaks into subsequent requests (session isolation)

### 9C — Report filter bar unit tests

**File to create:** `apps/admin-portal/src/components/reports/__tests__/report-filter-bar.spec.tsx`

Tests:
- Default preset is "Last 30 days" and emits correct date range
- Each preset button calculates correct start/end dates
- Custom date range selection works
- URL query params serialize correctly (`?from=2026-03-15&to=2026-04-14`)
- URL params are read on mount (page refresh preserves filters)
- "Apply" button triggers `onDateRangeChange` callback with correct dates

---

## Execution Order

Recommended order (dependencies noted):

1. **Fix 1** (1B — screening → disbursement) — CRITICAL, do first
2. **Fix 2** (1A — circuit breaker) — wire immediately after Fix 1
3. **Fix 8** (4A-D — anonymization hardening) — backend fixes, no dependencies
4. **Fix 5** (2B — notification templates) — small, quick
5. **Fix 6** (2A — REST endpoint) — small, quick
6. **Fix 4** (9A — 4 report wiring) — medium, may need backend resolvers
7. **Fix 3** (1D — review queue UI) — depends on Fix 1 being testable
8. **Fix 10** (1E, 3A — loan app inline checks) — depends on screening + exposure being queryable
9. **Fix 7** (2C — compliance warnings) — independent
10. **Fix 9** (4E-H — anonymization portal) — depends on Fix 8
11. **Fix 11** (1F, 1G — platform screening dashboard) — depends on Fix 1
12. **Fix 13** (8A, 8B — cross-tenant page enhancements) — independent
13. **Fix 12** (3B-D — exposure UI improvements) — independent
14. **Fix 14** (8C — audit decorator verification) — audit task
15. **Fix 15** (9B — platform portal date filtering) — independent
16. **Fix 16** (all integration tests) — do last, after all fixes are in place

---

## Definition of Done

For the remediation to be considered complete:
- [ ] ALL 16 fixes implemented and committed
- [ ] Fix 1 (screening → disbursement) has passing integration tests
- [ ] No mock data remaining in any of the 8 report components
- [ ] All new notification templates registered and handling events
- [ ] Anonymization uses SP_ADMIN role guard
- [ ] Cross-tenant security tests passing (403 for non-admin)
- [ ] All new/modified code passes lint
- [ ] No PII in log output
