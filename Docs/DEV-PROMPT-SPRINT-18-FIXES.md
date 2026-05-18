# DEV-PROMPT — Sprint 18 Fix Cycle

**Date:** 2026-05-18
**Sprint:** 18 — Fix Cycle
**Review doc:** `Docs/PM-SPRINT-18-REVIEW-2026-05-18.md`
**Branch:** Continue on `claude/hopeful-haibt-32d778`
**Scope:** 1 P1 + 10 P2 findings (~9 SP)

---

## Prerequisites

Read these before starting:

| Document | Why |
|---|---|
| `CLAUDE.md` | All conventions, money rules, naming, multi-tenancy |
| `Docs/PM-SPRINT-18-REVIEW-2026-05-18.md` | Full review context for each finding |
| `Docs/DEV-PROMPT-SPRINT-18.md` | Original spec for cross-reference |

---

## CRITICAL RULES — Same as Sprint 18

1. **Money is NEVER a float.** Use `Decimal` / `DECIMAL(19,4)` / string in API responses.
2. **All tests must pass** — zero regressions.
3. **Audit logging** — use `@AuditAction` on new/modified mutations.
4. **Idempotency** — all mutations accept `idempotencyKey`.
5. **Existing patterns** — follow the same patterns established in Sprint 18.

---

## FIX-1 (P1): Manual Payment Idempotency Key — Generate UUID Per Form Mount

**Finding:** F-S18-2-A
**File:** `apps/admin-portal/src/app/(portal)/loans/contracts/[id]/page.tsx` (lines 582–588)
**Problem:** The `recordManualPayment` mutation builds the idempotency key as `mp:${c.id}:${input.paymentRef}`. This is deterministic — if an operator retries with the same paymentRef (correcting a mistake), the second attempt is silently deduplicated. Two operators using the same paymentRef on the same contract also collide.

**Current code (lines 582–588):**
```typescript
await recordManualPayment({
  variables: {
    contractId: c.id,
    input,
    idempotencyKey: `mp:${c.id}:${input.paymentRef}`,
  },
});
```

**Required change:**

1. At the top of the manual payment modal component (or inside a `useEffect` on modal open), generate a fresh UUID:
```typescript
const [idempotencyKey] = useState(() => crypto.randomUUID());
```

2. Pass that key in the mutation call:
```typescript
await recordManualPayment({
  variables: {
    contractId: c.id,
    input,
    idempotencyKey,
  },
});
```

3. On successful submission, if the modal stays open for another payment, regenerate:
```typescript
setIdempotencyKey(crypto.randomUUID());
```

**Tests:** Add a unit test confirming two successive form submissions produce different idempotency keys.

---

## FIX-2 (P2): Approval Limit DB Fallback — Verify Status Coverage

**Finding:** F-S18-6-1
**File:** `services/process-engine/src/approval/approval-limit.service.ts` (lines 231–247)
**Problem:** The DB fallback query counts approvals by looking for requests in `['approved', 'offer_sent', 'accepted', 'disbursing', 'disbursed']`. If the state machine uses different status names after the operator approval action (e.g., `offer_accepted` as the status after the borrower accepts the offer), this count may not correctly represent the operator's daily approval tally.

**Current code (lines 231–247):**
```typescript
const dbCount = await this.prisma.loanRequest.count({
  where: {
    tenantId,
    status: {
      in: [
        'approved',
        'offer_sent',
        'accepted',
        'disbursing',
        'disbursed',
      ],
    },
    metadata: { path: ['reviewedBy'], equals: operatorId } as never,
    updatedAt: { gte: startOfDay, lte: endOfDay },
  },
```

**Required change:**

1. Cross-reference with the state machine at `services/process-engine/src/loan-request/loan-request-state-machine.ts`. The approval action transitions the request from `manual_review` → `approved`. From there the pipeline moves it through offer → acceptance → disbursement. Confirm the status list includes ALL states that result from an operator approval in the same day.

2. The key question: does `'accepted'` mean borrower-accepted (i.e., `offer_accepted`)? If the state machine uses `offer_accepted` as the actual enum value, add it to the list. If `'accepted'` is correct in the enum, no change needed — but verify.

3. Add a unit test specifically for the DB fallback path:
```typescript
describe('getDailyApprovalCount (DB fallback)', () => {
  it('counts requests approved by operator today', async () => {
    // Simulate Redis unavailable → falls back to DB
    // Create 3 loan requests approved today by operator A
    // Verify count === 3
  });
});
```

4. Regardless of which statuses are correct, add an inline comment explaining why these statuses represent "operator approved today" so future developers don't have to reverse-engineer the logic.

---

## FIX-3 (P2): Quota Counter Decrement on Permanent Failure Rollback

**Finding:** F-S18-8-1
**File:** `services/process-engine/src/disbursement/disbursement.service.ts` (lines 347–384)
**Problem:** When a disbursement permanently fails, the subscription `availableLimit` is atomically restored (line 362–372), but the plan-tier `monthlyDisbursementVolume` Redis counter (incremented at line 157) is never decremented. This inflates the tenant's usage on the billing dashboard.

**Required change:**

In the permanent-failure rollback path (after the `prisma.subscription.updateMany` at line 362), add:

```typescript
// Restore plan-tier quota counter — disbursement did not actually succeed
await this.quotaTrackingService.decrementDisbursement(
  tenantId,
  String(contract.principalAmount),
);
```

If `quotaTrackingService.decrementDisbursement` does not exist yet, add it as the inverse of `incrementDisbursement`:

```typescript
async decrementDisbursement(tenantId: string, amount: string): Promise<void> {
  const key = `quota:${tenantId}:monthlyDisbursementVolume:${this.getCurrentMonth()}`;
  await this.redis.decrby(key, 1);
  
  const amountKey = `quota:${tenantId}:monthlyDisbursementAmount:${this.getCurrentMonth()}`;
  const current = await this.redis.get(amountKey);
  if (current) {
    const newVal = subtract(current, amount);
    await this.redis.set(amountKey, newVal);
  }
}
```

**Tests:**
```typescript
it('decrements quota counter when disbursement permanently fails', async () => {
  // Arrange: increment quota via initial disbursement attempt
  // Act: trigger permanent failure rollback
  // Assert: quota counter is back to pre-attempt value
});
```

---

## FIX-4 (P2): Remove @RequiresPlan('growth') from usageHistory

**Finding:** F-D-6
**File:** `apps/graphql-server/src/graphql/resolvers/billing.resolver.ts` (lines 168–178)
**Problem:** `usageHistory` is gated with `@RequiresPlan('growth')`, preventing Starter-tier tenants from viewing their billing history. All tenants should see their own billing data.

**Current code:**
```typescript
@Query(() => UsageHistoryType)
@Roles('billing:read')
@RequiresPlan('growth')
async usageHistory(
```

**Required change:**

Remove the `@RequiresPlan('growth')` decorator:

```typescript
@Query(() => UsageHistoryType)
@Roles('billing:read')
async usageHistory(
```

**Tests:**
```typescript
it('allows Starter-tier tenants to query usageHistory', async () => {
  // Create a Starter-tier tenant context
  // Call usageHistory query
  // Assert: no ForbiddenException, returns valid data
});
```

---

## FIX-5 (P2): Add API Keys and Billing to Sidebar Navigation

**Finding:** F-S18-5-A, F-S18-11-A
**File:** `apps/admin-portal/src/components/layout/sidebar.tsx`
**Problem:** The API Keys page (`/settings/api-keys`) and Billing & Plan page (`/settings/billing`) exist but are not reachable from the sidebar. Currently the Settings link only appears in the user popup menu (lines 316–322).

**Required change:**

Add a "Settings" section to the main sidebar navigation with sub-items for the settings pages. In the `navigationKeys` array (or as a separate section below the main nav), add:

```typescript
// Settings section — rendered as a collapsible group at bottom of sidebar
const settingsNavigation = [
  { key: 'settings', icon: Settings, href: '/settings', label: t('sidebar.settings') },
  { key: 'settings.apiKeys', icon: Key, href: '/settings/api-keys', label: t('sidebar.apiKeys') },
  { key: 'settings.billing', icon: CreditCard, href: '/settings/billing', label: t('sidebar.billing') },
];
```

Render this group in the sidebar below the main navigation, separated by a divider. Keep the user popup menu link to `/settings` as-is (it serves as a quick-access shortcut).

**i18n keys to add (part of FIX-6):** `sidebar.apiKeys`, `sidebar.billing`

---

## FIX-6 (P2): Populate All Missing i18n Keys

**Finding:** F-S18-X-1
**Files:** All locale JSON files under `apps/admin-portal/public/locales/` (or wherever the i18n config points)
**Problem:** ~80–100 `t('...')` calls across Sprint 18's new pages render as raw key names because the locale entries don't exist.

**Required change:**

1. Grep for all `t('` calls in the Sprint 18 admin portal files:
```bash
grep -roh "t('[^']*')" apps/admin-portal/src/app/\(portal\)/loans/applications/ \
  apps/admin-portal/src/app/\(portal\)/loans/contracts/ \
  apps/admin-portal/src/app/\(portal\)/settlements/ \
  apps/admin-portal/src/app/\(portal\)/settings/api-keys/ \
  apps/admin-portal/src/app/\(portal\)/settings/billing/ \
  apps/admin-portal/src/app/\(portal\)/loans/factoring/queue/ \
  apps/admin-portal/src/components/reports/ \
  | sort -u
```

2. For each key found that is NOT in the locale JSON, add an English entry. Use clear, concise labels:
   - `loans.review.approve` → `"Approve"`
   - `loans.review.reject` → `"Reject"`
   - `loans.review.escalate` → `"Escalate"`
   - `settings.billing.title` → `"Billing & Plan"`
   - etc.

3. Also add the sidebar keys from FIX-5: `sidebar.apiKeys` → `"API Keys"`, `sidebar.billing` → `"Billing & Plan"`

**Verification:** After adding all keys, visually confirm (or test) that no raw dotted key names appear in the rendered pages.

---

## FIX-7 (P2): Add Pipeline Audit Trail Integration Spec

**Finding:** F-S18-7-1
**File:** Create `services/process-engine/src/pipeline/__tests__/pipeline-audit.integration.spec.ts`
**Problem:** The spec at S18-7 §7 requires an integration test that runs a full pipeline and verifies `pipeline_step_logs` rows. Only unit tests for the logger service exist.

**Required change:**

Create the integration test:

```typescript
describe('Pipeline Audit Trail (integration)', () => {
  // Use the existing test database + Prisma test helpers
  
  it('full pipeline run creates step_log rows for each step', async () => {
    // Arrange: create a loan request in 'pending' status with valid tenant context
    // Act: run the pipeline (or simulate it via the process-engine's orchestrator)
    // Assert: query pipeline_step_logs for this loanRequestId
    //   - Expect rows for each step in the pipeline (qualification, scoring, approval, etc.)
    //   - Each row has: stepName, outcome ('success'|'failure'), durationMs > 0, inputs != null
  });

  it('failed step records error details in pipeline_step_logs', async () => {
    // Arrange: set up a scenario that causes a specific step to fail
    // Act: run pipeline
    // Assert: step_log row has outcome='failure', outputs contains error info
  });

  it('pipeline_step_logs respects RLS — tenant A cannot see tenant B logs', async () => {
    // Arrange: create logs for tenant A and tenant B
    // Act: query with tenant A context
    // Assert: only tenant A's logs returned
  });
});
```

---

## FIX-8 (P2): Resolve Pipeline Log Duplication

**Finding:** F-S18-12-1
**Files:**
- `services/process-engine/src/pipeline/pipeline-retry.worker.ts` (lines 95–105)
- The underlying step execution methods that call `executeAndLog`

**Problem:** When a pipeline step is retried via BullMQ, two `pipeline_step_logs` rows are written per attempt: one by the retry worker (as `${step}_retry`) and one by the step's own `executeAndLog` wrapper (as the normal step name). The audit trail is append-only — duplicates cannot be cleaned retroactively.

**Current worker code (lines 95–105):**
```typescript
await this.executeStep(tenantId, loanRequestId, step);
const completedAt = new Date();
await this.pipelineStepLogger.logStep(tenantId, loanRequestId, {
  stepName: `${step}_retry`,
  stepOrder: config?.order ?? 0,
  outcome: 'success',
  inputs: { attempt, retriedFrom: job.data.errorCode },
  durationMs: completedAt.getTime() - startedAt.getTime(),
  startedAt,
  completedAt,
});
```

**Required change:**

**Option A (recommended):** The retry worker owns logging for retry attempts. Pass a `skipLogging: true` flag (or `isRetry: true` context) to the step execution so the step's `executeAndLog` wrapper skips its own logging when invoked from a retry context.

1. Modify `executeStep` to accept an options object:
```typescript
await this.executeStep(tenantId, loanRequestId, step, { isRetry: true, attempt });
```

2. Inside the step's `executeAndLog` wrapper, check for `isRetry` and skip logging if true:
```typescript
if (!options?.isRetry) {
  await this.pipelineStepLogger.logStep(...);
}
```

3. The retry worker's existing log call (lines 97–105) becomes the single source of truth for retry attempts. Keep `stepName: `${step}_retry`` to distinguish retry logs from initial-attempt logs.

**Tests:**
```typescript
it('retry attempt produces exactly one pipeline_step_logs row', async () => {
  // Arrange: set up a step that will be retried
  // Act: execute via retry worker
  // Assert: only 1 row in pipeline_step_logs for this attempt (not 2)
});
```

---

## FIX-9 (P2): Wire Portfolio Metrics Filter Arguments

**Finding:** F-C-1
**File:** `apps/graphql-server/src/graphql/resolvers/collections.resolver.ts` (lines 259–265)
**Problem:** The `portfolioMetrics` resolver only passes `tenantId` to the service. The underlying `PortfolioMetricsService.getPortfolioMetrics()` supports filter parameters (product, segment, region, lender), but the resolver doesn't accept or forward them.

**Current code:**
```typescript
@Query(() => PortfolioMetricsType)
@Roles('analytics:read')
async portfolioMetrics(
  @CurrentTenant() tenantId: string,
): Promise<any> {
  return this.analyticsService.getPortfolioMetrics(tenantId);
}
```

**Required change:**

1. Create the filter input type (if not already existing):
```typescript
@InputType()
export class PortfolioMetricsFilterInput {
  @Field(() => String, { nullable: true })
  productId?: string;

  @Field(() => String, { nullable: true })
  segment?: string;

  @Field(() => String, { nullable: true })
  region?: string;

  @Field(() => String, { nullable: true })
  lenderId?: string;

  @Field(() => String, { nullable: true })
  dateFrom?: string;

  @Field(() => String, { nullable: true })
  dateTo?: string;
}
```

2. Update the resolver:
```typescript
@Query(() => PortfolioMetricsType)
@Roles('analytics:read')
async portfolioMetrics(
  @CurrentTenant() tenantId: string,
  @Args('filter', { type: () => PortfolioMetricsFilterInput, nullable: true })
  filter?: PortfolioMetricsFilterInput,
): Promise<any> {
  return this.analyticsService.getPortfolioMetrics(tenantId, filter);
}
```

3. Verify the service method signature accepts the filter — if it doesn't pass through yet, wire it to the underlying Prisma query's `where` clause.

**Tests:**
```typescript
it('portfolioMetrics accepts filter and returns filtered results', async () => {
  // Create metrics for product A and product B
  // Query with filter { productId: 'A' }
  // Assert: only product A metrics returned
});
```

---

## FIX-10 (P2): Add WALLET_ADAPTER Production Override

**Finding:** F-D-4
**File:** `apps/graphql-server/src/app.module.ts`
**Problem:** The `WALLET_ADAPTER` token is provided by `DisbursementModule` with a mock default. There is no composition-root override for production — the app would use the mock wallet adapter in all environments.

**Current state:** `app.module.ts` has overrides for `SCREENING_GATE`, `CREDIT_BUREAU_GATEWAY`, and `PAYMENT_SERVICE_FOR_MANUAL_PAYMENT` but NOT for `WALLET_ADAPTER`.

**Required change:**

Add the `WALLET_ADAPTER` provider override in `app.module.ts`, following the same pattern as the other overrides:

```typescript
// After the PAYMENT_SERVICE_FOR_MANUAL_PAYMENT binding (~line 234)
{
  provide: 'WALLET_ADAPTER',
  useFactory: (integrationService: IntegrationService) => {
    return integrationService.getWalletAdapter();
  },
  inject: [IntegrationService],
},
```

If the `IntegrationService` is not yet imported in this module, add it. If `getWalletAdapter()` doesn't exist, use whatever method the integration service exposes to provide the real wallet adapter (check `services/integration-service/src/wallet/` for the export pattern).

**Important:** Ensure tests still use the mock. The override should be conditional or the test configuration should re-override with the mock:
```typescript
// In test setup / test module
{ provide: 'WALLET_ADAPTER', useValue: mockWalletAdapter }
```

**Tests:** Verify existing disbursement tests still pass (they should use the mock via test module override).

---

## FIX-11 (P2): Add PlanTierConfig Seed Data

**Finding:** F-S18-11-C (upgraded from P3 — needed for FIX-3 and FIX-4 test contexts)
**File:** `packages/database/prisma/seed.ts`
**Problem:** The billing dashboard and quota tracking depend on `PlanTierConfig` rows existing. Without seed data, dev environments show empty meters and tests for FIX-3/FIX-4 may not have valid plan-tier context.

**Required change:**

Add seed entries for all three tiers after the existing seed steps:

```typescript
// Step: Seed PlanTierConfig for all 3 tiers
await prisma.planTierConfig.createMany({
  data: [
    {
      tier: 'starter',
      displayName: 'Starter',
      monthlyDisbursementLimit: 100,
      monthlyDisbursementVolumeLimit: '500000.0000', // 500K
      features: { apiKeys: true, webhooks: false, customBranding: false, prioritySupport: false },
    },
    {
      tier: 'growth', // aka 'professional'
      displayName: 'Growth',
      monthlyDisbursementLimit: 1000,
      monthlyDisbursementVolumeLimit: '5000000.0000', // 5M
      features: { apiKeys: true, webhooks: true, customBranding: true, prioritySupport: false },
    },
    {
      tier: 'enterprise',
      displayName: 'Enterprise',
      monthlyDisbursementLimit: -1, // unlimited
      monthlyDisbursementVolumeLimit: '-1', // unlimited
      features: { apiKeys: true, webhooks: true, customBranding: true, prioritySupport: true },
    },
  ],
  skipDuplicates: true,
});
```

Adjust field names and values to match the actual `PlanTierConfig` model in `schema.prisma`.

---

## Execution Order

No hard dependencies between fixes. Recommended order for efficiency:

1. **FIX-11** first (seed data — other tests may rely on it)
2. **FIX-1** (P1 — highest priority)
3. **FIX-2, FIX-3, FIX-4** (financial correctness cluster)
4. **FIX-5, FIX-6** (sidebar + i18n — related)
5. **FIX-7, FIX-8** (pipeline test + dedup — related)
6. **FIX-9, FIX-10** (wiring)

---

## Exit Criteria

All of the following must be true before delivery:

1. ✅ Manual payment modal generates a fresh UUID per mount — no deterministic key construction
2. ✅ Approval limit DB fallback counts the correct statuses (verified against state machine)
3. ✅ DB fallback path has a dedicated unit test
4. ✅ Permanent-failure rollback decrements the plan-tier quota counter
5. ✅ Quota decrement has a unit test
6. ✅ `usageHistory` resolver has no plan-tier gate — Starter tenants can query
7. ✅ Starter-tier usageHistory access has a test
8. ✅ "API Keys" and "Billing & Plan" appear in sidebar navigation
9. ✅ All `t('...')` keys in Sprint 18 pages have corresponding locale entries (zero raw key renders)
10. ✅ `pipeline-audit.integration.spec.ts` exists and passes
11. ✅ Retry attempts produce exactly 1 `pipeline_step_logs` row (not 2)
12. ✅ Log dedup has a test
13. ✅ `portfolioMetrics` resolver accepts filter input and passes to service
14. ✅ Filter wiring has a test
15. ✅ `WALLET_ADAPTER` production override exists in `app.module.ts`
16. ✅ All existing tests still pass (zero regressions)
17. ✅ `tsc --noEmit` clean
18. ✅ `eslint` — no new errors

---

*Sprint 18 fix cycle. Expected effort: ~9 SP. Branch: continue on `claude/hopeful-haibt-32d778`.*
