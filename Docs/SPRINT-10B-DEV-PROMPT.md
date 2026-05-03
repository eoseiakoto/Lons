# Sprint 10B — Dev Prompt: Overdraft Product Implementation

**From:** PM
**To:** Dev (Claude Code)
**Date:** 2026-04-30
**Sprint:** 10B — Overdraft (Credit Line & Real-Time Drawdown)
**Estimated total:** ~61 story points across 13 items
**Reference docs:**
- `Docs/SPEC-overdraft.md` — Full implementation spec (1028 lines, sections 1-19)
- `Docs/ADR-overdraft-realtime.md` — Architecture decision record
- `Docs/01-loan-portfolio.md` — FR-OD requirements
- `Docs/02-qualification-scoring.md` — Scoring requirements
- `Docs/03-repayments-recovery.md` — Repayment/recovery requirements
- `CLAUDE.md` — Project rules

**IMPORTANT DEPENDENCY:** Sprint 10A (P0 blockers) is complete. The Overdraft implementation must use the corrected patterns from 10A — specifically:
- All money fields as `String` (not `Float`) in GraphQL — per the `MoneyString` type from P0-001
- Tenant context via `SET LOCAL app.current_tenant` — per P0-002
- AuthGuard/RolesGuard protection on all resolvers — per P0-003

**CRITICAL CARRYOVER FROM 10A — DO THIS FIRST (Task 0):**
All 8 existing scheduler jobs (`apps/scheduler/src/jobs/*.ts`) call `prisma.tenant.findMany()` and per-tenant service methods **without setting RLS context**. With RLS now enabled and forced on all tables, these jobs will silently return zero rows, breaking all batch processing (interest accrual, reconciliation, settlement, aging, cooling-off, monitoring, message retention). Fix this before starting Overdraft work — the daily interest accrual job for Overdraft (Task 7) depends on the same pattern working correctly.

---

## Task 0: CARRYOVER — Wrap All Scheduler Jobs in enterTenantContext (3 pts)

**Monday.com item:** 11898730322

**Problem:** Every scheduler job in `apps/scheduler/src/jobs/` follows this pattern:
```typescript
const tenants = await this.prisma.tenant.findMany({ where: { status: 'active' } });
for (const tenant of tenants) {
  await this.someService.doWork(tenant.id, ...);
}
```

With RLS enabled (Sprint 10A P0-002), the initial `tenant.findMany()` runs without `app.is_platform_admin` or `app.current_tenant` set, so the RLS policy returns zero rows. All batch processing silently does nothing.

**What to do:**

1. Wrap the initial tenant lookup in platform admin context:
```typescript
const tenants = await this.prisma.enterTenantContext(
  { isPlatformAdmin: true },
  () => this.prisma.tenant.findMany({ where: { status: 'active', deletedAt: null } }),
);
```

2. Wrap each per-tenant service call in tenant context:
```typescript
for (const tenant of tenants) {
  try {
    await this.prisma.enterTenantContext(
      { tenantId: tenant.id },
      () => this.someService.doWork(tenant.id, ...),
    );
  } catch (error) { ... }
}
```

3. Apply to ALL 8 jobs:
   - `interest-accrual.job.ts`
   - `reconciliation.job.ts`
   - `settlement.job.ts`
   - `aging.job.ts`
   - `cooling-off-expiry.job.ts`
   - `monitoring.job.ts`
   - `message-retention.job.ts`
   - `audit-partition-manager.ts` (uses platform admin context for cross-tenant DDL)

### Verification
- Each job can still find tenants and process their data
- RLS isolation is maintained — a job processing tenant A's data never sees tenant B's rows within the same loop iteration
- Seed data runs correctly with the scheduler active

---

## Context

Overdraft is the second loan product type for the Lōns platform (after Micro-Loan). Unlike micro-loans (customer-initiated, fixed-term, installment-based), overdraft is:
- **Transaction-triggered** — wallet provider pushes an insufficient-balance event
- **Revolving** — credit line with multiple drawdowns, not a single disbursement
- **Real-time** — < 3s end-to-end latency at point of sale
- **Auto-repaying** — collects from next wallet credit

Per the ADR, this is a **separate `overdraft-service`** (not forced through the existing process engine's `LoanRequestStatus` state machine).

Read `Docs/SPEC-overdraft.md` in full before starting. It contains complete Prisma models, status transitions, flow sequences, event contracts, GraphQL APIs, test scenarios, and requirement mappings.

---

## Task 1: Prisma Schema — CreditLine, Drawdown, CreditLimitChange Models (5 pts)

**Spec reference:** §3 (Entity Models)

Add three new models to `packages/database/prisma/schema.prisma`:

### CreditLine model
Copy the exact Prisma model from SPEC §3.1. Key fields:
- All monetary fields: `Decimal(19, 4)`
- Status enum: `CreditLineStatus` with 6 values (pending_activation, active, frozen, suspended, closed, expired)
- Unique constraint: `@@unique([tenantId, customerId, productId])` — one credit line per customer per product per tenant
- Indexes on: `tenantId`, `customerId`, `status`, `expiresAt`
- Relations: `Customer`, `Product`, `Lender`, `Drawdown[]`, `CreditLimitChange[]`

### Drawdown model
Copy from SPEC §3.3. Key fields:
- `DrawdownStatus` enum: initiated, completed, failed, reversed
- Indexes on: `tenantId`, `creditLineId`, `transactionRef`, `status`

### CreditLimitChange model
Copy from SPEC §3.4. Immutable audit record — no `updatedAt`, no soft delete.
- Reason codes and triggered-by values defined in spec §3.4

### Migration
Generate migration: `npx prisma migrate dev --name add_overdraft_models`

### RLS
Include RLS policies for all three new tables (consistent with P0-002 from Sprint 10A):
```sql
ALTER TABLE credit_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON credit_lines USING (tenant_id = current_setting('app.current_tenant')::uuid);
-- Same for drawdowns and credit_limit_changes
```

### Verification
- `prisma migrate status` clean
- `prisma generate` produces typed client with new models
- `pnpm build` succeeds across all packages

---

## Task 2: Event Contracts — Register All Overdraft Events (3 pts)

**Spec reference:** §16 (Event Types)

In `packages/event-contracts/`:

### Register 24 event types
Add all event constants from SPEC §16.1:
- 7 credit line lifecycle events (activated, frozen, unfrozen, suspended, reinstated, closed, expired)
- 4 drawdown events (initiated, completed, failed, reversed)
- 4 repayment events (auto_collected, manual, failed, fully_repaid)
- 2 limit management events (changed, review_scheduled)
- 3 interest/billing events (accrued, cycle_closed, statement_generated)
- 3 wallet events (insufficient, credited, declined)

### Add typed interfaces
Copy the 5 key event interfaces from SPEC §16.2:
- `ICreditLineActivatedEvent`
- `ICreditLineDrawdownCompletedEvent`
- `ICreditLineRepaymentAutoCollectedEvent`
- `ICreditLineLimitChangedEvent`
- `IWalletBalanceInsufficientEvent`

All monetary fields must be `string` (Decimal serialization, not number). All events use the standard envelope: `{ event, tenantId, timestamp, correlationId, data }`.

### Verification
- Types compile cleanly
- Events follow existing naming patterns in the event-contracts package
- Export all new types from the package index

---

## Task 3: Service Scaffolding — Overdraft Service (5 pts)

**Spec reference:** ADR-overdraft-realtime.md (separate service decision)

Create `services/overdraft-service/` following the existing NestJS service patterns:

### Structure
```
services/overdraft-service/
├── src/
│   ├── main.ts
│   ├── overdraft.module.ts
│   ├── credit-line/
│   │   ├── credit-line.module.ts
│   │   ├── credit-line.service.ts
│   │   └── credit-line.service.spec.ts
│   ├── drawdown/
│   │   ├── drawdown.module.ts
│   │   ├── drawdown.service.ts
│   │   └── drawdown.service.spec.ts
│   ├── repayment/
│   │   ├── repayment.module.ts
│   │   ├── repayment.service.ts
│   │   └── repayment.service.spec.ts
│   ├── interest/
│   │   ├── interest.module.ts
│   │   ├── interest.service.ts
│   │   └── interest.service.spec.ts
│   ├── limit/
│   │   ├── limit.module.ts
│   │   ├── limit.service.ts
│   │   └── limit.service.spec.ts
│   └── cache/
│       ├── credit-line-cache.module.ts
│       ├── credit-line-cache.service.ts
│       └── credit-line-cache.service.spec.ts
├── package.json
├── tsconfig.json
├── jest.config.ts
└── README.md
```

### Package setup
- Add to `pnpm-workspace.yaml`
- Add to `turbo.json` pipeline
- Add BullMQ consumer for wallet events
- Add Redis dependency for credit line caching
- Import shared packages: `@lons/shared-types`, `@lons/common`, `@lons/database`, `@lons/event-contracts`

### Verification
- `pnpm --filter overdraft-service build` succeeds
- `pnpm --filter overdraft-service test` runs (even if tests are placeholder)
- Service starts and connects to database and Redis

---

## Task 4: CreditLine Management — Subscription, Activation, Deactivation (5 pts)

**Spec reference:** §5 (Subscription & Activation Flow)

Implement `credit-line.service.ts`:

### activateCreditLine(customerId, productCode)
Follow the 7-step activation flow from SPEC §5.1 exactly:
1. Validate customer, KYC, product type, no duplicate subscription
2. Run pre-qualification rules engine
3. Invoke scoring engine for initial limit
4. Apply approval decision (auto/manual/reject)
5. Create Subscription + CreditLine + CreditLimitChange records
6. Populate Redis cache
7. Emit `CREDITLINE_ACTIVATED`, send notification

### deactivateCreditLine(creditLineId)
Follow SPEC §5.2:
1. Verify zero balance (all 4 money fields must be zero)
2. Transition status to `closed`
3. Deactivate subscription
4. Invalidate Redis cache
5. Emit `CREDITLINE_CLOSED`, send notification

### Status transition enforcement
Implement the state machine from SPEC §3.2. Reject invalid transitions with descriptive errors:
```
pending_activation → active
active → frozen | suspended | closed | expired
frozen → active | closed
suspended → active
expired → closed
```

`closed` requires all balances at zero.

### Verification
- Unit tests for each activation validation step
- Unit test for each valid/invalid status transition
- Integration test: full activation flow from customer → credit line → Redis cache populated

---

## Task 5: Drawdown Flow — Real-Time Transaction Processing (8 pts)

**Spec reference:** §6 (Drawdown Flow)

This is the highest-complexity task. Implement `drawdown.service.ts`:

### processDrawdown(event: IWalletBalanceInsufficientEvent)
Follow the 7-step sequence from SPEC §6.1:

1. **Balance check (Redis cache first):** Look up credit line from Redis (`creditline:{tenantId}:{customerId}:{productId}`). On cache miss, read from PostgreSQL and re-populate.
2. **Eligibility checks:** Credit line active? Sufficient available balance? Partial drawdown policy?
3. **Fee calculation:** Per product's `transactionFee` config
4. **Create Drawdown record** (status: initiated)
5. **Update credit line** (write-through to PostgreSQL AND Redis):
   - `availableBalance -= (shortfall + feeAmount)`
   - `outstandingAmount += shortfall`
   - `feesOutstanding += feeAmount`
   - `lastDrawdownAt = now`
6. **Call wallet adapter** for disbursement
7. **On success:** Drawdown → completed, emit events, create ledger entries
8. **On failure:** Drawdown → failed, reverse credit line updates, emit failure event

### Latency targets (SPEC §6.2)
- Webhook receipt → drawdown decision: < 200ms
- Total round-trip: < 3s
- Use Redis for the hot path. No unnecessary database round-trips during the decision.

### Concurrent drawdown handling (SPEC §6.4)
- Redis: `WATCH`/`MULTI`/`EXEC` or Lua script for atomic balance check + update
- PostgreSQL: `SELECT ... FOR UPDATE` on credit line row within transaction
- Two concurrent requests that together exceed the limit: second must be declined

### Partial drawdown policy (SPEC §6.3)
- Default (`partialDrawdownEnabled = false`): reject if shortfall > available
- Optional (`partialDrawdownEnabled = true`): disburse available amount, adjust shortfall

### Ledger entries (SPEC §6.1 step 5e)
On completed drawdown, create double-entry ledger entries:
- Debit: overdraft receivable (principal)
- Credit: disbursement payable (principal)
- Debit: fee receivable (fee amount)
- Credit: fee income (fee amount)

### Verification
- Unit tests for all decision paths (approved, declined various reasons, partial)
- Unit tests for concurrent drawdown scenario
- Unit tests for fee calculation
- Integration test: webhook → drawdown → ledger entry → event emission
- Performance test: p99 < 200ms for decision at 100 concurrent requests (if feasible in test env)

---

## Task 6: Auto-Repayment — Wallet Credit Collection (5 pts)

**Spec reference:** §7 (Auto-Repayment Flow)

Implement `repayment.service.ts`:

### processAutoRepayment(event: IWalletBalanceCreditedEvent)
Follow SPEC §7.1:

1. Look up active credit lines with `outstandingAmount > 0`
2. Calculate `totalOwed = outstandingAmount + interestAccrued + feesOutstanding + penaltiesAccrued`
3. Calculate `collectionAmount = min(totalOwed, creditAmount)`
4. Apply waterfall allocation (configurable order from product config, default: penalties → interest → fees → principal)
5. Call wallet adapter to collect
6. On success: update all balances (write-through), create ledger entries, emit events
7. If fully repaid: emit `CREDITLINE_FULLY_REPAID`, restore full limit
8. On failure: log, schedule retry on next credit event, do NOT freeze

### processManualRepayment(creditLineId, amount)
Follow SPEC §7.2:
1. Validate credit line ownership, amount > 0, amount <= totalOwed
2. Apply same waterfall
3. Call wallet adapter, update balances, emit `CREDITLINE_REPAYMENT_MANUAL`

### Waterfall allocation
The waterfall must use `Decimal` arithmetic throughout. Sum of all allocated portions must exactly equal the total collected (no rounding loss). Use `packages/common/src/financial/decimal.util.ts`.

### Verification
- Unit tests for waterfall allocation with various scenarios: full repayment, partial (covers penalties + interest only), partial (covers nothing fully)
- Property-based test: sum of allocations == total collected for any input values
- Integration test: wallet credit → auto-repayment → limit restoration

---

## Task 7: Interest Accrual — Daily Scheduled Job (5 pts)

**Spec reference:** §8 (Interest Accrual & Billing Cycles)

Implement `interest.service.ts`:

### Daily interest accrual (SPEC §8.1)
Scheduled job at 23:59 tenant timezone:

```
dailyRate = annualInterestRate / 365
dailyInterest = outstandingAmount × dailyRate
```

For each active credit line with `outstandingAmount > 0`:
1. Calculate dailyInterest using `Decimal` arithmetic
2. Update: `interestAccrued += dailyInterest`
3. Create ledger entries (debit: interest receivable, credit: interest income)
4. Emit `CREDITLINE_INTEREST_ACCRUED`

### Penalty accrual (SPEC §9.2)
Run in the same daily job. For overdue credit lines:

```
dailyPenalty = min(
  outstandingAmount × penaltyConfig.rate,
  outstandingAmount × penaltyConfig.maxCapPercent - penaltiesAccrued
)
```

Respect regulatory caps — `penaltiesAccrued` never exceeds `outstandingAmount × maxCapPercent`.

### Billing cycle consolidation (SPEC §8.2)
At billing cycle end:
1. Crystallize accrued interest
2. Generate cycle statement (opening balance, drawdowns, repayments, interest, fees, penalties, closing balance)
3. Set due date (cycle end + gracePeriodDays)
4. Emit `CREDITLINE_CYCLE_CLOSED` and `CREDITLINE_STATEMENT_GENERATED`
5. Start new billing cycle

### Overdue classification (SPEC §9.1)
When due date passes without full repayment:
- 1-7 DPD: Watch bucket → reminders
- 8-30 DPD: Substandard → freeze credit line
- 31-90 DPD: Doubtful → refer to recovery engine, limit reduction
- 90+ DPD: Loss → NPL classification

### Interest models (SPEC §8.3)
Support all three models: `percentage` (daily on outstanding), `flat` (fixed per cycle), `tiered` (banded rates).

### Verification
- Unit tests for daily interest calculation: single day, multiple days, zero outstanding
- Unit tests for penalty accrual: within cap, at cap
- Property-based test: interest uses Decimal throughout, no float contamination
- Integration test: billing cycle closure → statement generation

---

## Task 8: Wallet Webhook Handler — Insufficient Balance + Transaction Notification (5 pts)

**Spec reference:** §15 (Integration Patterns), §6 (Drawdown), §7 (Repayment)

Create REST endpoints in `apps/rest-server/` (or in the overdraft service directly):

### POST /webhooks/{provider}/insufficient-balance
1. Validate webhook signature (HMAC)
2. Map `walletId` → `{ tenantId, customerId }` via integration service lookup table
3. Emit internal event: `wallet.balance.insufficient`
4. Overdraft service consumes event and runs drawdown flow (Task 5)

### POST /webhooks/{provider}/transaction-notification
1. Validate webhook signature
2. Filter for `type: "credit"` (ignore debit notifications)
3. Map walletId
4. Emit: `wallet.balance.credited`
5. Overdraft service consumes event and runs auto-repayment flow (Task 6)

### SP-Mediated Fallback (SPEC §15.2)
```
POST /api/v1/overdraft/drawdown
```
For wallet providers without pre-transaction hooks — SP calls Lōns directly. Same drawdown logic, synchronous response.

### REST read endpoints
```
GET /api/v1/overdraft/credit-lines/{id}
GET /api/v1/overdraft/credit-lines/{id}/balance
```

### Verification
- Unit tests for webhook signature validation
- Unit tests for walletId → customer mapping
- Integration test: webhook POST → event emission → drawdown/repayment processing
- Invalid signature returns 401

---

## Task 9: Comprehensive Test Suite (5 pts)

**Spec reference:** §18 (Test Scenarios)

Write the full test suite defined in SPEC §18. This is in addition to the per-module tests in Tasks 4-8.

### Unit tests (SPEC §18.1)
All scenarios in the table: credit line creation (5 cases), drawdown approval (5 cases), fee calculation (3 cases), auto-repayment waterfall (4 cases), interest accrual (4 cases), penalty accrual (3 cases), status transitions (valid + invalid), credit limit changes (3 cases), concurrent drawdowns.

### Integration tests (SPEC §18.2)
All 7 end-to-end flows:
1. Webhook → drawdown → ledger → notification
2. Wallet credit → auto-repayment → limit restoration → notification
3. Drawdown wallet failure → rollback
4. Billing cycle closure → statement → interest crystallization
5. Freeze during active drawdown processing
6. Limit review → suspend → score → update → reinstate
7. Overdue escalation → freeze → penalty → repayment → unfreeze

### Financial calculation tests (SPEC §18.4)
Property-based tests verifying:
- Decimal arithmetic throughout (no float at any step)
- Waterfall sum invariant: allocations == total collected
- Available balance invariant: `availableBalance == approvedLimit - outstandingAmount`
- Penalty cap invariant: `penaltiesAccrued <= outstandingAmount × maxCapPercent`
- Billing cycle statement balance: opening + drawdowns - repayments + interest + fees + penalties == closing

### Coverage threshold
Add to the overdraft service jest config:
```json
"coverageThreshold": {
  "global": {
    "branches": 80,
    "functions": 80,
    "lines": 80,
    "statements": 80
  }
}
```

### Verification
- `pnpm --filter overdraft-service test --coverage` meets 80% threshold
- All property-based tests pass with > 100 random inputs

---

## Task 10: Admin Portal Screens — Credit Line Management + Overdraft Dashboard (5 pts)

**Spec reference:** §14 (Admin Portal Screens)

Add new pages to `apps/admin-portal/`:

### Credit Line Management (per customer)
On the customer detail page, add a "Credit Lines" tab:
- List view: status badge, approved limit, available balance, outstanding amount, utilization bar
- Detail view: full credit line record, drawdowns (paginated), limit changes, repayments, billing cycle history
- Actions: Freeze/Unfreeze, Adjust Limit (modal with reason code dropdown), Close (only if zero balance), Waive Penalties (with reason field)

### Drawdown History (per credit line)
- Table: date/time, amount, wallet balance, transaction ref, fee, status
- CSV export

### Overdraft Dashboard (aggregate)
Use the existing UI primitives (Gauge, AreaChart, Sparkline, ProgressBar from the portal rebuild):
- Total active credit lines (count + total limits)
- Utilization rate (Gauge)
- Drawdown volume: today/week/month (AreaChart with period comparison)
- Auto-repayment success rate (percentage with trend Sparkline)
- Overdue by aging bucket (stacked bar)
- Top 10 credit lines by outstanding (table)

### Product Wizard Update
When product type == OVERDRAFT, show additional configuration step:
- Billing cycle days + start day
- Contract lifecycle duration
- Partial drawdown toggle
- Auto-repayment waterfall order (drag-and-drop reorder)
- Limit review frequency
- Interest model selector
- Transaction fee config
- Penalty config
- Reminder schedule

### Existing screen updates
- Customer Detail: Credit Lines tab
- Product Detail: overdraft-specific metrics when type == OVERDRAFT
- Collections Dashboard: overdraft delinquencies show credit line context

### Visual consistency
Use the approved mission-control aesthetic (PageBackdrop, card-glow variants, emerald accent). Follow the patterns established in the portal rebuild delivery.

### Verification
- All new pages lint-clean and build-clean
- Pages render with mock data
- Actions call the correct GraphQL mutations
- Mobile responsive (375px breakpoint)
- `pnpm verify:synced` still passes

---

## Task 11: GraphQL Resolvers — All Queries + Mutations (5 pts)

**Spec reference:** §17 (GraphQL API)

Add to `apps/graphql-server/`:

### Queries
```graphql
query creditLine(customerId: ID!, productCode: String!): CreditLine
query creditLineBalance(creditLineId: ID!): CreditLineBalance
query drawdownHistory(creditLineId: ID!, first: Int, after: String): DrawdownConnection
query creditLines(filters: CreditLineFilterInput, first: Int, after: String): CreditLineConnection
query creditLineDetail(id: ID!): CreditLineDetail
query overdraftDashboard(tenantId: ID!, dateRange: DateRangeInput): OverdraftDashboardData
```

### Mutations
```graphql
mutation activateOverdraftSubscription(customerId: ID!, productCode: String!, idempotencyKey: String!): ActivationResult
mutation deactivateOverdraftSubscription(creditLineId: ID!, idempotencyKey: String!): DeactivationResult
mutation makeOverdraftRepayment(creditLineId: ID!, amount: String!, idempotencyKey: String!): RepaymentResult
mutation freezeCreditLine(creditLineId: ID!, reason: String!, idempotencyKey: String!): CreditLine
mutation unfreezeCreditLine(creditLineId: ID!, idempotencyKey: String!): CreditLine
mutation adjustCreditLimit(creditLineId: ID!, newLimit: String!, reasonCode: String!, reasonDetail: String, idempotencyKey: String!): CreditLine
mutation waiveOverdraftPenalties(creditLineId: ID!, amount: String!, reason: String!, idempotencyKey: String!): CreditLine
```

### Critical rules
- All money fields as `String` (not `Float`) — use the `MoneyString` type from Sprint 10A
- All mutations accept `idempotencyKey`
- All list queries use cursor-based pagination (Relay connections)
- Apply `@Roles()` decorators on admin mutations
- Customer-facing queries require authenticated user with tenant context

### Verification
- All resolvers protected by AuthGuard (from Sprint 10A P0-003)
- GraphQL playground: queries return data, mutations create/update records
- Unauthorized access returns 401/403

---

## Task 12: Real-Time Transaction Triggering — Redis Cache Strategy (no pts assigned)

**Spec reference:** §15.4 (Redis Caching Strategy), §6.4 (Concurrent Handling)

Implement `credit-line-cache.service.ts`:

### Cache structure
```
Key:    creditline:{tenantId}:{customerId}:{productId}
Value:  { id, status, approvedLimit, availableBalance, outstandingAmount, interestRate }
TTL:    300s (5 minutes), refreshed on every drawdown/repayment
Write:  Write-through (update PostgreSQL and Redis atomically)
Read:   Cache-first. On miss, read from PostgreSQL and re-populate.
```

### Atomic operations for concurrent drawdowns
Use Redis `WATCH`/`MULTI`/`EXEC` or Lua script:
```
1. WATCH creditline:{key}
2. GET creditline:{key}
3. Check availableBalance >= shortfall
4. MULTI
5. SET creditline:{key} with updated balances
6. EXEC
7. If EXEC returns null (key was modified between WATCH and EXEC), retry or decline
```

### Cache invalidation
- On credit line status change (freeze, close, expire): delete cache entry
- On deactivation: delete cache entry
- On limit change: update cache entry

### Verification
- Unit test: cache hit returns correct data
- Unit test: cache miss falls back to PostgreSQL
- Unit test: concurrent WATCH/MULTI/EXEC — second writer gets null response
- Integration test: write-through consistency between PostgreSQL and Redis

---

## Task 13: Gate Task — Review Sprint 8 Carryover (existing item)

The existing Sprint 10 gate task (review Sprint 8 carryover items) remains in Sprint 10B. The 9 Sprint 8 "In Review" items are functional work (business logic, data integration, GraphQL mutations) that was NOT addressed by the portal rebuild. Visual infrastructure is in place — the gap is business logic.

These items do NOT need implementation in Sprint 10B. They need review against their specs to determine which can be deferred vs. which are dependencies for Overdraft. Dev should flag any Sprint 8 items that block Overdraft functionality.

---

## Delivery Checklist

Before submitting delivery notes:

1. [ ] `pnpm lint` — clean
2. [ ] `pnpm typecheck` — clean
3. [ ] `pnpm build` — clean
4. [ ] `pnpm test` — all pass (including new overdraft tests)
5. [ ] `pnpm verify:synced` — portal parity maintained
6. [ ] All money fields use `String` type (GraphQL) and `Decimal` (Prisma) — no `Float`, no `Number()`, no `parseFloat()`
7. [ ] All new tables have RLS policies
8. [ ] All new resolvers protected by AuthGuard + RolesGuard
9. [ ] All events follow standard envelope format with `correlationId`
10. [ ] Redis cache write-through consistency verified
11. [ ] Coverage ≥ 80% on overdraft-service
12. [ ] No cleartext PII in logs
13. [ ] Delivery notes document every file changed

---

## Monday.com Items (Sprint 10B group)

The 13 existing items in the Sprint 10B group cover this work. Update each to "In Progress" when starting, "Done" when complete. Refer to the existing item IDs in the Sprint 10B group on Monday.com.

---

## Architecture Notes

### What Overdraft shares with existing services
- Prisma schema and database (shared `packages/database/`)
- Event contracts (shared `packages/event-contracts/`)
- Financial utilities (shared `packages/common/src/financial/`)
- Notification service (existing, just needs new templates)
- Settlement engine (existing, overdraft revenue feeds in via standard ledger entries)
- Scoring engine (existing, called during activation and limit review)
- Integration service (existing, wallet adapter patterns)

### What is NEW for Overdraft
- `services/overdraft-service/` — new NestJS service
- Redis caching layer for real-time credit line state
- BullMQ consumers for wallet events
- Webhook endpoints for wallet providers
- Admin portal screens (credit line management, overdraft dashboard)
- Product wizard overdraft configuration step
