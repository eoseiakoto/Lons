# Dev Prompt: Sprint 11

**Date:** 2026-05-01
**Prerequisite:** Sprint 10B BA fixes (F1, F2, F3) completed and verified
**Sprint 11 scope:** 26 items across two tracks — Overdraft Integration (13 items) and BNPL Product Type (13 items)

---

## Sprint Structure

Sprint 11 has two parallel tracks. Complete **Track A** (Overdraft Integration) first — it closes out remaining overdraft gaps before BNPL adds a second product type to the codebase.

**Track A — Overdraft Integration (13 items)**
Items carry forward from Sprint 10B review (PM + BA findings). These complete the overdraft product's end-to-end flow so it can be integration-tested against a live database in Sprint 12+.

**Track B — BNPL Product Type (13 items)**
New product type implementation per `Docs/01-loan-portfolio.md` FR-BN-001 through FR-BN-005. This is the second of four core product types in the Lons portfolio.

---

## Track A: Overdraft Integration

### A0. Fix ts-jest Preset Resolution Across Workspace

**Monday.com:** 11898718899 | **Priority:** Medium | **SP:** 2
**File:** Root `jest.config.ts` or per-service Jest configs

**Problem:** `ts-jest` preset not found prevents running any test suite. Coverage thresholds are set but unverifiable.

**Fix options:**
1. Fix pnpm node_modules topology so `ts-jest` resolves from each service's Jest config (preferred — check if a `.pnpmfile.cjs` hook or `shamefully-hoist` setting is needed).
2. Migrate to Vitest (larger effort but better ESM support — defer to Sprint 12 if chosen).

**Acceptance:** `pnpm --filter overdraft-service test` runs and reports coverage. All existing + Sprint 10B tests pass.

---

### A1. Fix RepaymentService `availableBalance` Recomputation — Use `subtract()`

**Monday.com:** 11899074873 | **Priority:** Medium | **SP:** 1
**File:** `services/overdraft-service/src/repayment/repayment.service.ts`

**Problem:** Line 280 uses fragile string manipulation:
```typescript
add(String(cl.approvedLimit), `-${newOutstanding}`).replace(/^--/, '')
```

**Fix:** Replace with:
```typescript
subtract(String(cl.approvedLimit), newOutstanding)
```

`subtract` is already imported from `@lons/common`. No behavior change — this is a clarity fix only.

**Test:** Existing repayment tests should continue to pass. No new test needed.

---

### A2. Implement `waiveOverdraftPenalties` GraphQL Mutation

**Monday.com:** 11899092932 | **Priority:** High | **SP:** 3
**SPEC ref:** §17.2 (mutation signature), §9.2 (FR-DM-002.3: operator waiver with documented reason)
**Files:**
- `services/overdraft-service/src/credit-line/credit-line.service.ts` — new method
- `apps/graphql-server/src/graphql/resolvers/overdraft.resolver.ts` — new mutation

**What to build:**

1. **Service method** `waivePenalties(tenantId, creditLineId, input: { amount: string; reason: string; operatorId: string })`:
   - `requireCreditLine(tenantId, creditLineId)` — 404 if not found
   - Validate `amount` is positive and `<= penaltiesAccrued` (partial waiver allowed)
   - Subtract `amount` from `penaltiesAccrued` on the credit line
   - Create a `CreditLimitChange`-style audit record (or a new `PenaltyWaiver` model if you prefer — a `CreditLimitChange` with `reasonCode: 'penalty_waiver'` works for now)
   - Update Redis cache
   - Emit event (use `EventType.CREDITLINE_LIMIT_CHANGED` with `reasonCode: 'penalty_waiver'` or add a new `CREDITLINE_PENALTIES_WAIVED` event type)
   - Return updated credit line

2. **Resolver mutation:**
   ```graphql
   mutation waiveOverdraftPenalties(
     creditLineId: ID!
     amount: String!
     reason: String!
     idempotencyKey: String!
   ): CreditLine
   ```
   - Guard: `@Roles('admin', 'operator')` + `@AuditAction('waive_penalties')`
   - The resolver doc comment at line 53 already lists this mutation — implement the actual resolver method

**Test:** Unit test: call `waivePenalties` with `penaltiesAccrued = '50'`, waive `'30'`, verify `penaltiesAccrued` is now `'20'`. Test rejection when `amount > penaltiesAccrued`.

---

### A3. Emit 4 Missing Overdraft Event Types

**Monday.com:** 11899157710 | **Priority:** Medium | **SP:** 3
**SPEC ref:** §16.1
**Files:** Multiple — emit from the appropriate service methods

The `EventType` enum in `packages/event-contracts/src/events.enum.ts` already has all four registered. The issue is that no code ever emits them:

1. **`CREDITLINE_SUSPENDED`** — Emit when a credit line transitions to `suspended` status (periodic limit review, SPEC §10.2 step 1). Currently the state machine allows `active → suspended` but nothing triggers it. Add a `suspend()` method to `CreditLineService` (mirrors `freeze()` pattern):
   ```typescript
   async suspend(tenantId: string, creditLineId: string, reason: string) {
     const cl = await this.requireCreditLine(tenantId, creditLineId);
     this.assertTransitionAllowed(cl.status, CreditLineStatus.suspended);
     const updated = await this.prisma.creditLine.update({
       where: { id: creditLineId },
       data: { status: CreditLineStatus.suspended },
     });
     await this.cache.invalidate(tenantId, cl.customerId, cl.productId);
     this.eventBus.emitAndBuild(EventType.CREDITLINE_SUSPENDED, tenantId, {
       creditLineId, customerId: cl.customerId, reason,
     });
     return updated;
   }
   ```

2. **`CREDITLINE_REINSTATED`** — Emit when a suspended credit line returns to active (SPEC §10.2 step 6). Add a `reinstate()` method:
   ```typescript
   async reinstate(tenantId: string, creditLineId: string) {
     const cl = await this.requireCreditLine(tenantId, creditLineId);
     if (cl.status !== CreditLineStatus.suspended) {
       throw new ValidationError(`Credit line is ${cl.status}, not suspended`);
     }
     const updated = await this.prisma.creditLine.update({
       where: { id: creditLineId },
       data: { status: CreditLineStatus.active },
     });
     await this.cache.invalidate(tenantId, cl.customerId, cl.productId);
     this.eventBus.emitAndBuild(EventType.CREDITLINE_REINSTATED, tenantId, {
       creditLineId, customerId: cl.customerId,
     });
     return updated;
   }
   ```

3. **`CREDITLINE_DRAWDOWN_REVERSED`** — Emit when a completed drawdown is reversed (e.g., the original wallet transaction was reversed by the provider). This requires a new `reverseDrawdown()` method on `DrawdownService`:
   - Find the drawdown by ID, verify status is `completed`
   - Transition drawdown status to `reversed`
   - Restore credit line balances: `availableBalance += amount`, `outstandingAmount -= amount`, `feesOutstanding -= feeAmount`
   - Update Redis cache
   - Emit `CREDITLINE_DRAWDOWN_REVERSED`
   - Create reversal ledger entries

4. **`CREDITLINE_LIMIT_REVIEW_SCHEDULED`** — Emit when a periodic limit review is scheduled (SPEC §10.2). This ties into the limit review scheduler job. For now, add the emission in the interest/scheduler service where `expireDueLines` runs — or create a placeholder `scheduleLimitReview()` method that emits the event. The full periodic review flow (suspend → score → adjust → reinstate) is a Sprint 12 item, but the event contract should be exercised now.

**Test:** Unit tests for `suspend()` and `reinstate()` (mirror `freeze()`/`unfreeze()` tests). For `reverseDrawdown`, test that balances are correctly restored and status transitions to `reversed`.

---

### A4. Implement Due Dates, Grace Periods, and Interest Crystallization

**Monday.com:** 11899150181 | **Priority:** Critical | **SP:** 8
**SPEC ref:** §8.2 (billing cycle close), §9.1 (overdue clock starts from due date)
**Files:**
- `services/overdraft-service/src/interest/interest.service.ts` — update `closeCyclesDue`
- Prisma schema — may need a `dueDate` field on `CreditLine` or a new `BillingCycleHistory` model

**Problem:** `closeCyclesDue()` (lines 156-218) rolls cycle dates forward and emits `CREDITLINE_CYCLE_CLOSED`, but:
- Does NOT crystallize interest (add `interestAccrued` to a due amount or mark it as payable)
- Does NOT compute a due date (`currentCycleEnd + gracePeriodDays`)
- No `dueDate` field exists on `CreditLine`

Without a due date, the overdue classification system (F5) has no starting point for the DPD clock.

**What to build:**

1. **Add `dueDate` field to `CreditLine`** in the Prisma schema:
   ```prisma
   dueDate DateTime? @map("due_date") @db.Date
   ```
   Run `pnpm --filter database db:migrate` after schema change.

2. **Update `closeCyclesDue()`:**
   - Read `gracePeriodDays` from `product.overdraftConfig` (default 0)
   - Compute `dueDate = currentCycleEnd + gracePeriodDays`
   - Crystallize interest: snapshot `interestAccrued` into the statement event payload (already done partially) and set the due amount. The simplest approach: keep `interestAccrued` on the credit line as the amount due for that cycle. More sophisticated: create a `BillingCycleHistory` row that freezes the cycle's financials.
   - Update `cl.dueDate` in the database
   - Include `dueDate` in the `CREDITLINE_CYCLE_CLOSED` event payload

3. **Recommended: Create `BillingCycleHistory` model** for statement generation (this also fixes F7):
   ```prisma
   model BillingCycleHistory {
     id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
     tenantId        String   @map("tenant_id") @db.Uuid
     creditLineId    String   @map("credit_line_id") @db.Uuid
     cycleNumber     Int      @map("cycle_number")
     cycleStart      DateTime @map("cycle_start") @db.Date
     cycleEnd        DateTime @map("cycle_end") @db.Date
     dueDate         DateTime @map("due_date") @db.Date
     openingBalance  Decimal  @map("opening_balance") @db.Decimal(19, 4)
     closingBalance  Decimal  @map("closing_balance") @db.Decimal(19, 4)
     interestCharged Decimal  @map("interest_charged") @db.Decimal(19, 4)
     feesCharged     Decimal  @map("fees_charged") @db.Decimal(19, 4)
     penaltiesCharged Decimal @map("penalties_charged") @db.Decimal(19, 4)
     totalRepayments Decimal  @map("total_repayments") @db.Decimal(19, 4)
     paidInFull      Boolean  @default(false) @map("paid_in_full")
     createdAt       DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

     creditLine      CreditLine @relation(fields: [creditLineId], references: [id])

     @@unique([creditLineId, cycleNumber])
     @@index([tenantId])
     @@index([creditLineId])
     @@index([dueDate])
     @@map("billing_cycle_histories")
   }
   ```

4. **Compute opening balance:** The opening balance for cycle N is the closing balance of cycle N-1. For the first cycle, opening balance is 0. Query the most recent `BillingCycleHistory` for this credit line to get the previous closing balance. This fixes the `openingBalance: '0'` hardcoding on line 202.

**Test:**
- Unit test: `closeCyclesDue` with `gracePeriodDays = 7` and `currentCycleEnd = 2026-05-01` produces `dueDate = 2026-05-08`
- Unit test: crystallized interest appears in `BillingCycleHistory` row
- Unit test: opening balance of cycle 2 equals closing balance of cycle 1

**This item blocks A5 (overdue classification).**

---

### A5. Implement Overdraft Overdue Classification (DPD Tracking, Aging Buckets)

**Monday.com:** 11899163473 | **Priority:** High | **SP:** 8
**SPEC ref:** §9.1 (aging buckets), §9.2 (penalty application already done)
**Blocked by:** A4 (due dates)
**Files:**
- New file: `services/overdraft-service/src/aging/overdraft-aging.service.ts`
- `apps/scheduler/src/jobs/aging.job.ts` — wire overdraft aging alongside existing contract aging

**What to build:**

1. **Add DPD tracking fields to `CreditLine`** (or compute on the fly from `dueDate`):
   ```prisma
   daysPastDue    Int     @default(0) @map("days_past_due")
   agingBucket    String? @map("aging_bucket") @db.VarChar(20)
   agingUpdatedAt DateTime? @map("aging_updated_at") @db.Timestamptz(6)
   ```
   Alternatively, compute DPD dynamically: `DPD = max(0, today - dueDate)` when `dueDate` is set and balance is not fully paid. This avoids a stored field that needs daily updates — but the aging bucket classification still needs to run daily for automated actions.

2. **Aging bucket classification** (SPEC §9.1 table, configurable per product):
   ```typescript
   const DEFAULT_AGING_THRESHOLDS = {
     current: 0,
     watch: 1,        // 1-7 DPD
     substandard: 8,  // 8-30 DPD
     doubtful: 31,    // 31-90 DPD
     loss: 91,        // 90+ DPD
   };
   ```

3. **Automated actions per bucket:**
   - **Watch (1-7 DPD):** Send reminder notifications per `product.overdraftConfig.reminderSchedule.afterOverdueDays`. Emit a notification event for each configured interval.
   - **Substandard (8-30 DPD):** Freeze the credit line (call `creditLineService.freeze(tenantId, creditLineId, 'overdue_substandard')`). Create an operator work item / notification.
   - **Doubtful (31-90 DPD):** Refer to recovery engine (emit `CREDITLINE_RECOVERY_REFERRED` or similar). Trigger a limit reduction via `creditLineService.adjustLimit()` with `reasonCode: 'overdue_reduction'`.
   - **Loss (90+ DPD):** NPL classification. Suspend customer across all products (cross-service call or event). Flag for credit bureau reporting.

4. **Scheduler integration:** The existing `aging.job.ts` runs daily. Add an overdraft-specific aging pass:
   - Query all credit lines where `dueDate IS NOT NULL AND dueDate < today` and balance is not fully paid
   - Compute DPD for each
   - Classify into bucket
   - Execute automated actions for bucket transitions (only when bucket changes, not every run)

**Test:**
- Unit test: DPD computation from `dueDate` and `today`
- Unit test: bucket classification for each threshold boundary (0, 1, 7, 8, 30, 31, 90, 91 DPD)
- Unit test: verify `freeze()` is called when transitioning into `substandard`
- Unit test: verify limit reduction when transitioning into `doubtful`

---

### A6. Track Statement Opening Balance

**Monday.com:** 11899150245 | **Priority:** Medium | **SP:** 3
**SPEC ref:** §8.2 step 2 (cycle statement with opening balance)

**Problem:** `closeCyclesDue` emits `CREDITLINE_STATEMENT_GENERATED` with `openingBalance: '0'` (line 202). The comment says "historical opening would require a separate snapshot table."

**Fix:** If you implemented `BillingCycleHistory` in A4, this is already solved — the opening balance is the previous cycle's closing balance. Update the `CREDITLINE_STATEMENT_GENERATED` event payload to read from the newly created `BillingCycleHistory` row instead of hardcoding `'0'`.

If `BillingCycleHistory` was not created in A4, compute opening balance from the sum of drawdowns minus repayments during the previous cycle, or create a simpler snapshot mechanism.

**Test:** Verify that the statement event for cycle 2 carries the correct opening balance (= cycle 1 closing balance).

---

### A7. Integrate Redis `tryReserve` into Drawdown Hot Path + Fix `outstandingAmount` Bug

**Monday.com:** 11899163510 | **Priority:** High | **SP:** 5
**SPEC ref:** §6.2 (< 200ms drawdown decision), §6.4 (concurrent drawdown handling)
**Files:**
- `services/overdraft-service/src/cache/credit-line-cache.service.ts` — fix bug
- `services/overdraft-service/src/drawdown/drawdown.service.ts` — integrate fast path

**Bug fix (line 145):**
```typescript
// CURRENT (WRONG):
outstandingAmount: add(entry.outstandingAmount, requiredAmount),
// `requiredAmount` = shortfall + feeAmount. But outstandingAmount should
// only include principal (shortfall), not fees.

// FIX:
// Option 1: Change tryReserve signature to accept `shortfall` and `feeAmount` separately
// Option 2: Add a `principalAmount` parameter
```

The cleanest fix is to change the `tryReserve` signature:
```typescript
async tryReserve(
  tenantId: string,
  customerId: string,
  productId: string,
  shortfall: string,     // principal only
  feeAmount: string,     // fee only
): Promise<...>
```

Then in the body:
```typescript
const requiredAmount = add(shortfall, feeAmount); // for availableBalance check
// ...
const updated: CreditLineCacheEntry = {
  ...entry,
  availableBalance: subtract(entry.availableBalance, requiredAmount),
  outstandingAmount: add(entry.outstandingAmount, shortfall), // principal only
};
```

**Integration into drawdown flow:**

In `drawdown.service.ts`, before the `reserveAndPersist` call (line 130), attempt the Redis fast path:

```typescript
// Fast path: try Redis reservation first (< 200ms target)
const reservation = await this.cache.tryReserve(
  tenantId, event.customerId, productId, disburseAmount, feeAmount,
);
if (reservation.ok) {
  // Redis reservation succeeded — proceed with Drawdown record creation
  // and wallet disbursement. The Postgres write can happen async or
  // in a follow-up transaction.
} else if (reservation.reason === 'cache_miss') {
  // Fallback to Postgres SELECT FOR UPDATE (current path)
} else {
  // insufficient_limit or inactive — decline
  this.declineEvent(tenantId, event, reservation.reason);
  return { status: 'declined', reason: reservation.reason };
}
```

**Important:** Even with the Redis fast path, the Postgres write must still happen for durability. The Redis reservation is an optimistic lock — the Postgres `SELECT FOR UPDATE` is the authoritative write. The fast path avoids the Postgres round-trip for the common case (sufficient balance, no contention).

**Test:**
- Unit test: `tryReserve` with separate `shortfall` and `feeAmount` — verify `outstandingAmount` only includes `shortfall`
- Unit test: `tryReserve` returns `cache_miss` when no entry exists
- Unit test: `tryReserve` returns `insufficient_limit` when balance is too low
- Integration test: two concurrent `tryReserve` calls where only one can succeed

---

### A8. Wire BullMQ Consumers for Wallet Events

**Monday.com:** 11899089007 | **Priority:** Critical | **SP:** 5
**SPEC ref:** §6.1 step 3 (webhook → internal event → overdraft service), §7.1 step 2
**Files:**
- New file: `services/overdraft-service/src/consumers/wallet-event.consumer.ts`
- `services/overdraft-service/src/overdraft-service.module.ts` — register consumers

**Problem:** The webhook controller (`wallet-webhook.controller.ts`) emits events via `eventBus.emitAndBuild()`, but no BullMQ consumer is registered to process `WALLET_BALANCE_INSUFFICIENT` or `WALLET_BALANCE_CREDITED` events. Without consumers, the end-to-end webhook-to-drawdown and webhook-to-auto-repayment flows are broken.

**What to build:**

1. **`WalletEventConsumer`** (NestJS BullMQ processor):
   ```typescript
   @Processor('overdraft-wallet-events')
   export class WalletEventConsumer {
     constructor(
       private readonly drawdownService: DrawdownService,
       private readonly repaymentService: RepaymentService,
       private readonly prisma: PrismaService,
     ) {}

     @Process(EventType.WALLET_BALANCE_INSUFFICIENT)
     async handleInsufficientBalance(job: Job<IWalletBalanceInsufficientEvent>) {
       // Enter tenant context
       await this.prisma.enterTenantContext(job.data.tenantId);
       // Look up the customer's overdraft product
       // Call drawdownService.processDrawdown(...)
       // The adapter should be resolved from DI (see A9)
     }

     @Process(EventType.WALLET_BALANCE_CREDITED)
     async handleBalanceCredited(job: Job<IWalletBalanceCreditedEvent>) {
       await this.prisma.enterTenantContext(job.data.tenantId);
       // Call repaymentService.processAutoRepayment(...)
     }
   }
   ```

2. **Queue configuration:**
   - Queue name: `overdraft-wallet-events`
   - Retry policy: 3 attempts, exponential backoff (1s, 5s, 30s)
   - Dead-letter queue: `overdraft-wallet-events-dlq` for failed jobs
   - Concurrency: configurable, default 10

3. **Tenant context:** Every consumer handler must call `prisma.enterTenantContext(tenantId)` before any service call. This matches the pattern used in all 8 scheduler jobs.

4. **Module registration:** Register the consumer in `OverdraftServiceModule` providers and import `BullModule.registerQueue({ name: 'overdraft-wallet-events' })`.

**Test:** Integration test: publish a `WALLET_BALANCE_INSUFFICIENT` event to the queue, verify the consumer calls `processDrawdown`. Verify retry on failure. Verify DLQ routing after 3 failures.

---

### A9. Register Real Wallet Adapters via DI

**Monday.com:** 11899091254 | **Priority:** Critical | **SP:** 5
**SPEC ref:** §6.1 step 5c (wallet disbursement), §7.1 step 5a (wallet collection)
**Files:**
- `services/overdraft-service/src/overdraft-service.module.ts` — adapter registration
- New file (or in integration-service): concrete adapter implementations

**Problem:** Both `WALLET_DISBURSEMENT_ADAPTER` and `WALLET_COLLECTION_ADAPTER` are NULL stubs that always return failure. The `OverdraftResolver` injects a `NULL_COLLECTION_ADAPTER` sentinel. Manual repayments via GraphQL always fail because the collection adapter never succeeds.

**What to build:**

For Sprint 11, we don't need real MTN MoMo / M-Pesa integration (that's Phase 5). But we need **mock adapters that succeed** so the end-to-end flow can be tested:

1. **`MockWalletDisbursementAdapter`** implementing `WalletDisbursementAdapter`:
   ```typescript
   async disburse(walletId: string, amount: string, transactionRef: string) {
     return {
       success: true,
       walletRef: `MOCK-DISBURSE-${Date.now()}`,
       timestamp: new Date().toISOString(),
     };
   }
   ```

2. **`MockWalletCollectionAdapter`** implementing `WalletCollectionAdapter`:
   ```typescript
   async collect(walletId: string, amount: string, reference: string) {
     return {
       success: true,
       walletRef: `MOCK-COLLECT-${Date.now()}`,
       timestamp: new Date().toISOString(),
     };
   }
   ```

3. **Register via DI** in `OverdraftServiceModule`:
   ```typescript
   {
     provide: WALLET_DISBURSEMENT_ADAPTER,
     useClass: MockWalletDisbursementAdapter,
   },
   {
     provide: WALLET_COLLECTION_ADAPTER,
     useClass: MockWalletCollectionAdapter,
   },
   ```

4. **Environment toggle:** Add `WALLET_ADAPTER_MODE=mock|live` env var. When `live`, register concrete adapters from `integration-service` (Sprint 13+).

5. **CRITICAL — `live` mode guard:** When `WALLET_ADAPTER_MODE=live` and no real adapter implementation is registered yet, the module MUST throw on startup or log a loud `Logger.error()` / `Logger.warn()` — do NOT silently fall back to mock adapters. A misconfigured `live` mode in staging or production would quietly route real money operations through mocks that always succeed, which is a financial safety hazard. Example:
   ```typescript
   if (mode === 'live') {
     this.logger.error(
       'WALLET_ADAPTER_MODE is "live" but no real adapter is registered. ' +
       'Refusing to start — set mode to "mock" or register a real adapter.',
     );
     throw new Error('No live wallet adapter registered');
   }
   ```
   Once real adapters ship in Phase 5, this guard becomes the registration point for `MtnMomoAdapter`, `MPesaAdapter`, etc.

**Test:** Verify that `makeOverdraftRepayment` GraphQL mutation succeeds end-to-end with mock adapter. Verify that drawdown flow completes (drawdown status → `completed`). Verify that `WALLET_ADAPTER_MODE=live` throws or warns when no real adapter is present.

---

### A10. Migrate `walletId` Mapping to Dedicated Table

**Monday.com:** 11899091049 | **Priority:** High | **SP:** 5
**Files:**
- Prisma schema — new model
- `apps/rest-server/src/wallet-webhook/wallet-webhook.controller.ts` — update `resolveWallet`
- New migration

**Problem:** `resolveWallet()` in the webhook controller queries `customer.metadata.walletId` across ALL tenants with a platform-admin context bypass — an O(n) full scan. At scale this is a performance blocker.

**What to build:**

1. **New Prisma model:**
   ```prisma
   model WalletAccountMapping {
     id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
     tenantId    String   @map("tenant_id") @db.Uuid
     customerId  String   @map("customer_id") @db.Uuid
     walletId    String   @map("wallet_id") @db.VarChar(255)
     provider    String   @db.VarChar(50)
     isPrimary   Boolean  @default(true) @map("is_primary")
     createdAt   DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
     updatedAt   DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

     customer    Customer @relation(fields: [customerId], references: [id])

     @@unique([walletId, provider])
     @@index([tenantId])
     @@index([customerId])
     @@map("wallet_account_mappings")
   }
   ```

2. **Update `resolveWallet()`:**
   ```typescript
   private async resolveWallet(walletId: string, provider: string) {
     const mapping = await this.prisma.walletAccountMapping.findUnique({
       where: { walletId_provider: { walletId, provider } },
     });
     if (!mapping) throw new NotFoundException(`No customer mapped to wallet ${walletId}`);
     return { tenantId: mapping.tenantId, customerId: mapping.customerId };
   }
   ```

3. **Data migration:** Write a migration script that extracts existing `customer.metadata.walletId` values into the new table. Run as a one-time migration.

4. **Populate on subscription activation:** When `activateOverdraftSubscription` is called, create a `WalletAccountMapping` row linking the customer's wallet to their tenant. The wallet ID should come from the customer record or be passed as an activation parameter.

**Test:** Verify `resolveWallet` returns correct tenant+customer for a known wallet ID. Verify uniqueness constraint prevents duplicate mappings.

---

### A11. Wire Scoring Engine into `activateOverdraftSubscription`

**Monday.com:** 11899089284 | **Priority:** High | **SP:** 3
**SPEC ref:** §5.1 steps 3-5 (pre-qualification, scoring, approval)

**Problem:** `activateOverdraftSubscription` currently accepts an operator-supplied `recommendedLimit`. SPEC §5.1 requires the scoring engine to derive the limit automatically so activation is single-step from the SP's perspective.

**What to build:**

1. **Add scoring service call** in the resolver (or a new orchestration method):
   - Before calling `creditLineService.activateCreditLine()`, call the scoring service:
     ```typescript
     const score = await this.scoringService.score({
       customerId, productCode, context: 'new_subscription',
     });
     ```
   - Use `score.recommendedLimit` as the `recommendedLimit` input
   - If scoring service is unavailable, fall back to `product.maxAmount` (degraded mode)

2. **Keep the `recommendedLimit` parameter** on `activateCreditLine` input for internal/testing use, but the resolver should derive it from the scoring engine rather than requiring the operator to supply it.

3. **Scoring service integration:** If the scoring service (`services/scoring-service`) is not yet running locally, create a mock client that returns a configurable default limit. Use the existing `SCORING_SERVICE_URL` env var.

**Test:** Verify that when no `recommendedLimit` is supplied to the resolver, the scoring engine is called and its output is used. Verify fallback to `product.maxAmount` when scoring service is unavailable.

---

### A12. Raise Overdraft Service Test Coverage to 80%

**Monday.com:** 11899074631 | **Priority:** High | **SP:** 5
**Blocked by:** A0 (ts-jest must work first)

**Problem:** CLAUDE.md requires 80% coverage. Current pure-function coverage is high (waterfall, penalty cap, fee calculation), but DB-bound paths (activation, drawdown reservation, accrual loop) lack integration tests.

**What to build:**

Add integration-style tests (with mocked Prisma, following the pattern from `credit-line.service.spec.ts`) for:

1. **Drawdown flow:** `processDrawdown` with mocked credit line, product, and wallet adapter — test approved, declined (insufficient limit), and failed (wallet error + rollback) paths
2. **Auto-repayment flow:** `processAutoRepayment` with mocked credit line — test full repayment, partial repayment, and waterfall allocation
3. **Interest accrual:** `accrueDaily` with mocked credit lines at various states
4. **Cycle close:** `closeCyclesDue` with mocked credit lines due for cycle rollover
5. **Expiry:** `expireDueLines` — test expired-with-balance and expired-zero-balance paths

Target: 80% line coverage across `services/overdraft-service/src/`.

**Note:** Full live-DB integration tests depend on staging DB (Sprint 13B). For now, mock-based integration tests are acceptable.

---

## Track B: BNPL Product Type

BNPL (Buy Now Pay Later) is the second core product type. It differs fundamentally from overdraft: merchant-triggered, fixed-term installments, merchant settlement. Reference: `Docs/01-loan-portfolio.md` §4 (FR-BN-001 through FR-BN-005).

### B1. Prisma Schema: Merchant, BnplTransaction, InstallmentSchedule, MerchantSettlement

**Monday.com:** 11750791653 | **Priority:** Critical | **SP:** 5
**File:** `packages/database/prisma/schema.prisma`

Add the following models (adapt field names to match existing conventions in the schema):

```prisma
model Merchant {
  id              String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String          @map("tenant_id") @db.Uuid
  name            String          @db.VarChar(255)
  code            String          @db.VarChar(50)
  status          MerchantStatus  @default(pending)
  contactEmail    String?         @map("contact_email") @db.VarChar(255)
  contactPhone    String?         @map("contact_phone") @db.VarChar(50)
  settlementType  SettlementType  @default(T_PLUS_1) @map("settlement_type")
  discountRate    Decimal         @map("discount_rate") @db.Decimal(7, 4)
  metadata        Json?
  onboardedAt     DateTime?       @map("onboarded_at") @db.Timestamptz(6)
  deletedAt       DateTime?       @map("deleted_at") @db.Timestamptz(6)
  createdAt       DateTime        @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime        @updatedAt @map("updated_at") @db.Timestamptz(6)

  transactions    BnplTransaction[]
  settlements     MerchantSettlement[]

  @@unique([tenantId, code])
  @@index([tenantId])
  @@index([status])
  @@map("merchants")
}

enum MerchantStatus {
  pending
  active
  suspended
  deactivated
  @@map("merchant_status")
}

enum SettlementType {
  IMMEDIATE
  T_PLUS_1
  @@map("settlement_type")
}

model BnplTransaction {
  id                String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String              @map("tenant_id") @db.Uuid
  customerId        String              @map("customer_id") @db.Uuid
  merchantId        String              @map("merchant_id") @db.Uuid
  productId         String              @map("product_id") @db.Uuid
  lenderId          String              @map("lender_id") @db.Uuid
  currency          String              @db.VarChar(3)
  purchaseAmount    Decimal             @map("purchase_amount") @db.Decimal(19, 4)
  totalRepayable    Decimal             @map("total_repayable") @db.Decimal(19, 4)
  numberOfInstallments Int              @map("number_of_installments")
  status            BnplTransactionStatus @default(initiated)
  purchaseRef       String              @map("purchase_ref") @db.VarChar(255)
  merchantRef       String?             @map("merchant_ref") @db.VarChar(255)
  interestRate      Decimal             @default(0) @map("interest_rate") @db.Decimal(7, 4)
  completedAt       DateTime?           @map("completed_at") @db.Timestamptz(6)
  cancelledAt       DateTime?           @map("cancelled_at") @db.Timestamptz(6)
  acceleratedAt     DateTime?           @map("accelerated_at") @db.Timestamptz(6)
  metadata          Json?
  deletedAt         DateTime?           @map("deleted_at") @db.Timestamptz(6)
  createdAt         DateTime            @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime            @updatedAt @map("updated_at") @db.Timestamptz(6)

  customer          Customer            @relation(fields: [customerId], references: [id])
  merchant          Merchant            @relation(fields: [merchantId], references: [id])
  product           Product             @relation(fields: [productId], references: [id])
  installments      InstallmentSchedule[]

  @@index([tenantId])
  @@index([customerId])
  @@index([merchantId])
  @@index([status])
  @@index([purchaseRef])
  @@map("bnpl_transactions")
}

enum BnplTransactionStatus {
  initiated
  approved
  active
  completed
  cancelled
  accelerated
  defaulted
  @@map("bnpl_transaction_status")
}

model InstallmentSchedule {
  id                String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String              @map("tenant_id") @db.Uuid
  transactionId     String              @map("transaction_id") @db.Uuid
  installmentNumber Int                 @map("installment_number")
  amount            Decimal             @db.Decimal(19, 4)
  principalPortion  Decimal             @map("principal_portion") @db.Decimal(19, 4)
  interestPortion   Decimal             @default(0) @map("interest_portion") @db.Decimal(19, 4)
  feePortion        Decimal             @default(0) @map("fee_portion") @db.Decimal(19, 4)
  dueDate           DateTime            @map("due_date") @db.Date
  status            InstallmentStatus   @default(pending)
  paidAmount        Decimal             @default(0) @map("paid_amount") @db.Decimal(19, 4)
  paidAt            DateTime?           @map("paid_at") @db.Timestamptz(6)
  createdAt         DateTime            @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime            @updatedAt @map("updated_at") @db.Timestamptz(6)

  transaction       BnplTransaction     @relation(fields: [transactionId], references: [id])

  @@unique([transactionId, installmentNumber])
  @@index([tenantId])
  @@index([transactionId])
  @@index([dueDate])
  @@index([status])
  @@map("installment_schedules")
}

enum InstallmentStatus {
  pending
  due
  paid
  overdue
  waived
  @@map("installment_status")
}

model MerchantSettlement {
  id                String              @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String              @map("tenant_id") @db.Uuid
  merchantId        String              @map("merchant_id") @db.Uuid
  currency          String              @db.VarChar(3)
  grossAmount       Decimal             @map("gross_amount") @db.Decimal(19, 4)
  discountFee       Decimal             @map("discount_fee") @db.Decimal(19, 4)
  netAmount         Decimal             @map("net_amount") @db.Decimal(19, 4)
  transactionCount  Int                 @map("transaction_count")
  periodStart       DateTime            @map("period_start") @db.Date
  periodEnd         DateTime            @map("period_end") @db.Date
  status            SettlementStatus    @default(pending)
  settledAt         DateTime?           @map("settled_at") @db.Timestamptz(6)
  walletRef         String?             @map("wallet_ref") @db.VarChar(255)
  createdAt         DateTime            @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt         DateTime            @updatedAt @map("updated_at") @db.Timestamptz(6)

  merchant          Merchant            @relation(fields: [merchantId], references: [id])

  @@index([tenantId])
  @@index([merchantId])
  @@index([status])
  @@map("merchant_settlements")
}

enum SettlementStatus {
  pending
  processing
  settled
  failed
  @@map("settlement_status")
}
```

Run migration after schema changes. Add relations to existing `Customer` and `Product` models.

---

### B2. Event Contracts: BNPL-Specific Events

**Monday.com:** 11750895270 | **Priority:** High | **SP:** 3
**File:** `packages/event-contracts/src/events.enum.ts` and new `bnpl-events.ts`

Add to `EventType` enum:
```typescript
// BNPL lifecycle
BNPL_PURCHASE_INITIATED = 'bnpl.purchase.initiated',
BNPL_PURCHASE_APPROVED = 'bnpl.purchase.approved',
BNPL_PURCHASE_DECLINED = 'bnpl.purchase.declined',
BNPL_PURCHASE_COMPLETED = 'bnpl.purchase.completed',
BNPL_PURCHASE_CANCELLED = 'bnpl.purchase.cancelled',

// Installment events
BNPL_INSTALLMENT_DUE = 'bnpl.installment.due',
BNPL_INSTALLMENT_PAID = 'bnpl.installment.paid',
BNPL_INSTALLMENT_OVERDUE = 'bnpl.installment.overdue',
BNPL_INSTALLMENT_WAIVED = 'bnpl.installment.waived',

// Acceleration
BNPL_ACCELERATED = 'bnpl.accelerated',

// Settlement
BNPL_MERCHANT_SETTLEMENT_GENERATED = 'bnpl.merchant_settlement.generated',
BNPL_MERCHANT_SETTLEMENT_COMPLETED = 'bnpl.merchant_settlement.completed',

// Refund
BNPL_REFUND_INITIATED = 'bnpl.refund.initiated',
BNPL_REFUND_COMPLETED = 'bnpl.refund.completed',
```

Create corresponding TypeScript interfaces in `packages/event-contracts/src/bnpl-events.ts`. Follow the same pattern as `loan-lifecycle-events.ts`. All monetary fields as strings.

---

### B3. Merchant CRUD Service + SP-Only Onboarding

**Monday.com:** 11750791551 | **Priority:** Critical | **SP:** 5
**File:** New service — `services/entity-service/src/merchant/merchant.service.ts` (merchant is an entity, belongs in entity-service)

**What to build:**

Standard CRUD following existing entity patterns (`customer.service.ts`, `product.service.ts`):
- `createMerchant(tenantId, input)` — validate uniqueness on `code`, set status to `pending`
- `updateMerchant(tenantId, merchantId, input)` — standard update with tenant guard
- `activateMerchant(tenantId, merchantId)` — transition `pending → active`, set `onboardedAt`
- `suspendMerchant(tenantId, merchantId, reason)` — `active → suspended`
- `deactivateMerchant(tenantId, merchantId)` — soft delete
- `getMerchant(tenantId, merchantId)` — by ID
- `listMerchants(tenantId, filters, pagination)` — cursor-based

**Onboarding is SP-only:** Only users with SP admin roles can onboard merchants. The merchant's `tenantId` is the SP's tenant. A merchant belongs to exactly one SP (tenant).

---

### B4. Purchase-Triggered Origination Flow (REST API)

**Monday.com:** 11750799432 | **Priority:** Critical | **SP:** 8
**SPEC ref:** FR-BN-001 (purchase-triggered), FR-BN-002 (installment split)
**Files:**
- New service: `services/process-engine/src/bnpl/bnpl-origination.service.ts`
- New REST controller: `apps/rest-server/src/bnpl/bnpl.controller.ts`

**What to build:**

REST endpoint for merchant-initiated BNPL purchase:
```
POST /api/v1/bnpl/purchase
{
  merchantCode: string,
  customerId: string,       // or customerPhone for lookup
  purchaseAmount: string,   // Decimal
  currency: string,
  numberOfInstallments: number,  // typically 3 or 4
  purchaseRef: string,      // merchant's order ID
  items?: Array<{ name: string, amount: string }>,
  idempotencyKey: string,
}
```

**Flow:**
1. Validate merchant exists and is active
2. Validate customer exists and is active
3. Pre-qualify customer for BNPL product (KYC check, existing defaults check)
4. Score customer (call scoring service or use pre-approved limit)
5. Calculate installment schedule (equal split, first installment deferred per product config)
6. Create `BnplTransaction` (status: `approved`)
7. Create `InstallmentSchedule` rows
8. Settle with merchant (immediate or T+1 based on merchant config)
9. Emit `BNPL_PURCHASE_APPROVED`
10. Return approval with schedule to merchant

**Installment calculation:**
```typescript
function generateInstallments(
  purchaseAmount: string,
  numberOfInstallments: number,
  interestRate: string,
  firstInstallmentDeferralDays: number,
): InstallmentInput[] {
  const totalRepayable = applyInterest(purchaseAmount, interestRate, numberOfInstallments);
  const installmentAmount = divide(totalRepayable, String(numberOfInstallments));
  // Last installment absorbs rounding remainder
  // Due dates: first = today + deferralDays, subsequent = +30 days each
}
```

---

### B5. Pre-Qualification at Checkout

**Monday.com:** 11750789219 | **Priority:** High | **SP:** 5
**SPEC ref:** FR-BN-001.3 (sub-2-second SLA)

**What to build:**

REST endpoint for real-time eligibility check at merchant checkout:
```
GET /api/v1/bnpl/eligible?merchantCode=X&customerId=Y&amount=Z
```

Returns within 2 seconds:
```json
{
  "eligible": true,
  "maxAmount": "5000.0000",
  "availableInstallmentPlans": [3, 4, 6],
  "interestRate": "0.0000",
  "monthlyAmount": "1666.6700"
}
```

Cache eligibility in Redis (key: `bnpl:eligible:{tenantId}:{customerId}`, TTL: 60s) to hit the 2-second SLA. Pre-compute during customer onboarding or on first merchant check.

---

### B6. Installment Schedule Generation + Management

**Monday.com:** 11750803364 | **Priority:** Critical | **SP:** 5

Build the installment lifecycle:
- **Generation:** Equal-split with configurable first-installment deferral (FR-BN-002.2)
- **Due notification:** Scheduler emits `BNPL_INSTALLMENT_DUE` N days before due date
- **Payment processing:** When customer pays, allocate to the next unpaid installment. Update `paidAmount`, `paidAt`, status → `paid`
- **Mark overdue:** Scheduler marks unpaid installments past due date as `overdue`
- **Zero-interest periods:** If product config has `zeroInterestDays`, interest portions are zero for installments within that window

---

### B7. Merchant Settlement Engine

**Monday.com:** 11750792950 | **Priority:** High | **SP:** 5

Two settlement modes per merchant config:
- **IMMEDIATE:** Settle with merchant as soon as purchase is approved (before customer pays any installment). Platform takes credit risk.
- **T_PLUS_1:** Settle with merchant next business day after purchase. Batch settlement job runs daily.

Settlement amount = `purchaseAmount - (purchaseAmount * merchant.discountRate)`.

Create `MerchantSettlement` row, call wallet adapter to disburse to merchant, update status.

---

### B8. Refund Handling (Full + Partial)

**Monday.com:** 11750762492 | **Priority:** High | **SP:** 5

**Full refund:** Cancel all remaining unpaid installments, refund any paid installments to customer.

**Partial refund:** Reduce remaining installment amounts proportionally. If refund amount exceeds remaining unpaid total, refund the difference from paid installments.

Both require merchant settlement adjustment (clawback or offset against future settlements).

---

### B9. BNPL Acceleration

**Monday.com:** 11750803156 | **Priority:** Medium | **SP:** 3
**SPEC ref:** FR-BN-003 (configurable missed payment threshold)

When a customer misses N consecutive installments (default 2, configurable per product):
- Accelerate the loan: all remaining installments become immediately due
- Status → `accelerated`
- Apply late fees per product config
- Refer to collections

---

### B10. GraphQL Resolvers + Mutations for BNPL

**Monday.com:** 11750768491 | **Priority:** Critical | **SP:** 5

Create `bnpl.resolver.ts` in `apps/graphql-server/src/graphql/resolvers/`:

**Queries:**
- `bnplTransaction(id: ID!)` — single transaction with installments
- `bnplTransactions(filters, first, after)` — admin list
- `merchantTransactions(merchantId, first, after)` — per-merchant view
- `installmentSchedule(transactionId: ID!)` — full schedule

**Mutations:**
- `initiateBnplPurchase(input: BnplPurchaseInput!)` — orchestrates the origination flow
- `cancelBnplTransaction(transactionId: ID!, reason: String!)` — full cancellation
- `processInstallmentPayment(installmentId: ID!, amount: String!)` — manual payment
- `initiateRefund(transactionId: ID!, amount: String!, type: RefundType!)` — full or partial

All mutations require `idempotencyKey`. Protect with `@Roles()` and `@AuditAction()`.

---

### B11. BNPL Unit + Integration Tests

**Monday.com:** 11750762287 | **Priority:** High | **SP:** 5

Cover all critical paths:
- Installment generation (equal split, rounding, deferred first)
- Payment processing (allocate to correct installment, partial payment)
- Acceleration trigger (missed payment count)
- Refund (full and partial, installment adjustment)
- Settlement (immediate and T+1)
- Pre-qualification (eligible, ineligible, amount limits)

---

### B12. Admin Portal: Merchant Management Screens

**Monday.com:** 11750820888 | **Priority:** High | **SP:** 5
**File:** `apps/admin-portal/src/app/(portal)/merchants/`

Screens:
- **Merchant list:** Searchable table with status filter, settlement type badge
- **Merchant detail:** Profile, transaction history, settlement history, performance metrics
- **Merchant onboarding:** Form wizard for SP admins to onboard new merchants (name, code, discount rate, settlement type)

Follow the same patterns as the existing overdraft dashboard (`apps/admin-portal/src/app/(portal)/loans/overdraft/page.tsx`).

---

## Verification Checklist

After completing all items:

1. `tsc --noEmit` across all affected packages — 0 errors
2. `pnpm --filter overdraft-service test` — all tests pass, coverage >= 80%
3. `pnpm --filter database db:migrate` — migration runs cleanly
4. `pnpm verify:synced` — still in lockstep
5. New Prisma models generate correctly (`pnpm --filter database generate`)
6. BullMQ consumer processes test events end-to-end
7. `waiveOverdraftPenalties` mutation works via GraphQL playground
8. BNPL purchase → installments → payment → settlement flow completes with mock adapters

---

## Delivery

Provide delivery notes covering:
- Which items are complete vs. partially complete
- Any deviations from this prompt (with rationale)
- Test coverage numbers
- Known issues or technical debt introduced

PM will review delivery notes and update Monday.com accordingly.
