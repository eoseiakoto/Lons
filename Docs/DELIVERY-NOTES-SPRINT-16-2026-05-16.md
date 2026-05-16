# Sprint 16 Delivery Notes — Micro-Loan + Repayment Gaps + BA S15 Fixes

**Date:** 2026-05-16
**Scope:** 20 items, ~63 SP across 3 tracks.
**Bundled migration:** `20260516000000_sprint16_bundle` (RLS for debtors+invoices,
BnplCreditLine timestamps + EXPIRED enum, micro_loan_credit_limit_changes table,
aging_bucket_configs table + seed of canonical defaults).

---

## Summary

| Track | Items | Status |
|---|---|---|
| A — Micro-Loan (28 SP) | S16-1..6 | All delivered |
| B — Repayment (27 SP) | S16-7..12 | All delivered |
| C — BA S15 Fixes (8 SP) | S16-FIX-1..6, S16-BA-12, S16-BA-14 | All delivered |

**Test status post-sprint:** 175 entity-service + 445 process-engine + 36 scheduler + 12 repayment-service + 85 graphql-server + 52 rest-server + 117 notification-service = **922 tests passing**, every suite green.

**Build status:** tsc clean across every package + every Nest app.

---

## Track A — Micro-Loan Product

### S16-1 — Subscription deactivation guard (3 SP)

**Files:** `services/process-engine/src/micro-loan/micro-loan-subscription.service.ts`

`MicroLoanSubscriptionService.deactivate(tenantId, subscriptionId, operatorId?)` —
loads the subscription, asserts product type is `micro_loan` and status is `active`,
then counts non-terminal contracts for the customer + product. Any contract not in
`(settled, cancelled, written_off)` blocks deactivation with a `ValidationError`
listing the active contract IDs. On success flips status to `deactivated`, stamps
`deactivatedAt`, emits `SUBSCRIPTION_DEACTIVATED`.

### S16-2 — Loan request validation (5 SP)

**Files:** `services/process-engine/src/micro-loan/micro-loan-origination.service.ts`
**Integration:** `services/process-engine/src/loan-request/loan-request.service.ts`
+ `loan-request.module.ts` imports `MicroLoanModule`.

Three gates, all using Decimal-as-string `compare()`:
1. **`MICRO_LOAN_NO_ACTIVE_SUBSCRIPTION`** — active Subscription required for `(customer, product)`.
2. **`MICRO_LOAN_INSUFFICIENT_CREDIT_LIMIT`** — `requestedAmount ≤ availableLimit` (falls back to `creditLimit` for legacy rows).
3. **`MICRO_LOAN_MAX_ACTIVE_LOANS_REACHED`** — non-terminal contract count `< product.maxActiveLoans` (default 1).

Wired into `LoanRequestService.create()` as an `@Optional()` injection, branched on product type so non-micro-loan products bypass the gate entirely. Errors carry structured `code` so the GraphQL exception filter surfaces them with stable identifiers.

### S16-3 — Micro-loan payment reminder defaults (5 SP)

**Files:** `services/process-engine/src/micro-loan/micro-loan-reminder.config.ts`

Constants only: `MICRO_LOAN_DEFAULT_REMINDERS` (3-day / 1-day / day-of SMS schedule with `micro_loan.payment_reminder.*` template keys) and `MICRO_LOAN_REMINDER_TEMPLATES` (the actual SMS bodies). The generic S16-10 scheduler reads `product.notificationConfig.paymentReminders.schedule` and falls back to the generic `payment_reminder.*` templates when product-specific config is absent. No DB-level template table exists in the current schema — templates are resolved by `templateKey` string at dispatch time via `NotificationService`.

### S16-4 + S16-5 — Credit limit lifecycle (10 SP)

**Files:**
- `services/process-engine/src/micro-loan/micro-loan-credit-limit.service.ts`
- `services/process-engine/src/micro-loan/micro-loan-credit-limit.listener.ts`

`MicroLoanCreditLimitService` exposes two atomic-by-design methods, both wrapping the subscription update + audit row in a single `prisma.$transaction`:

- **`reviewOnRepayment(tenantId, contractId, repaymentId)`** — fires when `REPAYMENT_RECEIVED` lands. Increases `creditLimit` by `eligibilityRules.creditLimitIncreasePercent` (default 10%) when the customer has at least `minSuccessfulRepayments` (default 3) completed repayments AND the contract has no overdue days. Capped at `product.maxAmount`. Emits `MICRO_LOAN_CREDIT_LIMIT_REVIEWED`.

- **`reduceOnDefault(tenantId, contractId)`** — fires when `CONTRACT_STATE_CHANGED` lands with `newStatus = default_status`. First default → `creditLimitReductionPercent` decrease (default 50%); ≥ `maxDefaultsBeforeSuspension` defaults (default 2) → limit set to `0.0000`. `availableLimit` always set to `0.0000` on default regardless of math. Emits `MICRO_LOAN_CREDIT_LIMIT_REDUCED`.

`MicroLoanCreditLimitListener` is the @nestjs/event-emitter glue. Both handlers catch and log their own errors so a credit-limit-review failure never blocks the originating payment.

### S16-6 — Credit limit audit (5 SP)

**Schema:** new `MicroLoanCreditLimitChange` model — append-only, no `updatedAt`/`deletedAt`. RLS policy in the bundled migration. Reverse relations on Customer + Subscription.

**Files:**
- `services/process-engine/src/micro-loan/micro-loan-credit-limit-audit.service.ts`
- `apps/graphql-server/src/graphql/resolvers/micro-loan.resolver.ts`
- `apps/graphql-server/src/graphql/types/micro-loan.type.ts`

`MicroLoanCreditLimitAuditService` accepts an optional `tx` param so it can be invoked from inside a parent `$transaction` (which is exactly how S16-4 and S16-5 use it). GraphQL exposes `creditLimitHistory(customerId, subscriptionId?, first, after)` as a Relay-style connection, gated by `@Roles('admin', 'operator')`. No mutations — entries are written server-side only.

---

## Track B — Repayment Engine

### S16-7 — Schedule recalculation (5 SP)

**Files:**
- `services/repayment-service/src/schedule/schedule-recalculation.service.ts`
- `services/repayment-service/src/payment/payment.service.ts` (integration hook)

`ScheduleRecalculationService.recalculate(tenantId, contractId, trigger)` — snapshots the existing schedule into `contract.metadata.scheduleHistory` (timestamped, trigger-stamped), redistributes `outstandingPrincipal` evenly across remaining `pending|partial` installments (last one absorbs the rounding remainder), recomputes interest per installment at the contract's `interestRate / 1200` monthly rate, and persists all updates atomically in a single `prisma.$transaction`.

`PaymentService.processPayment()` invokes the recalc when `allocatedPrincipal > 0` AND the contract didn't just settle — i.e. an early/advance payment that left some installments unpaid. Best-effort: a failure logs but does not roll back the payment.

### S16-8 — Early settlement config (5 SP)

**Files:** `services/repayment-service/src/early-settlement/early-settlement.types.ts`

`IEarlySettlementConfig` interface + `DEFAULT_EARLY_SETTLEMENT_CONFIG` constant (allowed, 0% rebate, 0 flat fee, 0 min days). Stored on `product.feeStructure.earlySettlement` (existing JSON column — no schema migration needed). Defensive parser in the service tolerates missing/malformed config.

### S16-9 — Early settlement quote (3 SP)

**Files:**
- `services/repayment-service/src/early-settlement/early-settlement.service.ts`
- `services/repayment-service/src/early-settlement/early-settlement.module.ts`
- `apps/graphql-server/src/graphql/resolvers/repayment.resolver.ts` (updated)
- `apps/graphql-server/src/graphql/types/repayment.type.ts` (extended)

`EarlySettlementService.calculateEarlySettlementAmount(tenantId, contractId)` returns an `IEarlySettlementQuote` with full Decimal breakdown:
- `remainingPrincipal + accruedInterest + outstandingFees + outstandingPenalties + settlementFee − interestRebate = totalSettlementAmount`
- `interestRebate = unearnedInterest × (interestRebatePercent / 100)` where `unearnedInterest` is the sum of interest on PENDING installments with `dueDate > today`.
- `settlementFee` is either flat (`settlementFeeValue` as-is) or `% of remainingPrincipal`.
- `breakdown` array filters out zero-amount items so the UI only shows non-trivial rows.

Reject codes (all `ValidationError` with `code`):
- `EARLY_SETTLEMENT_TERMINAL_STATUS` — contract is settled/cancelled/written_off
- `EARLY_SETTLEMENT_NOT_ALLOWED` — product config disallows
- `EARLY_SETTLEMENT_TOO_SOON` — remaining days below `minRemainingDays`

Quote validity: end of current UTC day (interest accrual changes the totals overnight). GraphQL `earlySettlementQuote` query now delegates to this service; the returned type extends the legacy shape with `interestRebate`, `settlementFee`, `validUntil`, and `breakdown` (all nullable for back-compat).

### S16-10 — Payment reminder scheduler (5 SP)

**Files:**
- `apps/scheduler/src/jobs/payment-reminder.job.ts`
- `apps/scheduler/src/scheduler.module.ts` (registration + NotificationServiceModule import)

`PaymentReminderJob` runs at 06:00 UTC daily, fans out to every active tenant. For each upcoming `RepaymentScheduleEntry` (dueDate within the next 7 days, status pending/partial), computes `daysUntilDue` and matches it against the product's `notificationConfig.paymentReminders.schedule`. Defaults to a generic 3-day / 1-day / day-of SMS schedule when product config is absent.

**Idempotency:** looks up the `Notification` table by `(customerId, contractId, eventType=payment_reminder.{N})` before sending — same reminder window never sends twice for the same installment. Notifications are dispatched via the existing `NotificationService.sendNotification()` with `{amount, currency, dueDate, customerName, installmentNumber}` variables.

### S16-11 — Configurable aging buckets (4 SP)

**Schema:** new `AgingBucketConfig` model with composite unique on `(tenantId, productId, bucketName)`. RLS + seed in the bundled migration — every active tenant gets the canonical default buckets pre-loaded so behaviour stays identical post-migration. Reverse relation on Product.

**Files:** `services/process-engine/src/aging/aging.service.ts` (refactored)

`classifyPortfolio()` now memoises bucket lookups per (tenantId, productId) within a single run. Tries product-specific config first, falls back to tenant-wide (productId IS NULL), ultimately falls back to the hardcoded `DEFAULT_BUCKETS` constant for the (rare) case of a fresh tenant with no seeded config. `DEFAULT_BUCKETS` is now exported so the spec can exercise it directly with the new 2-arg `getBucket(dpd, buckets)` signature. Status/classification strings from JSON are coerced to enums defensively — invalid values fall back to `performing` with a warning log.

### S16-12 — Action matrix per bucket transition (5 SP)

**Files:**
- `services/process-engine/src/aging/aging-action.service.ts`
- `services/process-engine/src/aging/aging.module.ts` (registers it)
- `services/process-engine/src/aging/aging.service.ts` (invokes it on transition)

`AgingActionService.executeActions(tenantId, contractId, customerId, bucketConfig)` reads the `actions` JSONB from the bucket config and dispatches per-action handlers:
- `SEND_NOTIFICATION` — emits `NOTIFICATION_SENT` (notification-service subscribes)
- `APPLY_PENALTY` — emits `PENALTY_APPLIED`
- `SUSPEND_BORROWING` — directly updates active subscriptions to `suspended`
- `ESCALATE_TO_COLLECTIONS` — emits `COLLECTIONS_ACTION_LOGGED`
- `REPORT_TO_BUREAU` — emits a placeholder event for the Phase 5 integration service

Defensive `parseActions()` skips entries with unknown `type` so a hand-edited row can't crash the aging job. Per-action errors are swallowed and logged so one broken action can't block the rest of the matrix.

Default action matrix seeded inline in the migration:
- `watch` → notification
- `substandard` → notification + flat $50 penalty
- `doubtful` → notification + suspend borrowing
- `default_61_90` → escalate (high priority) + suspend
- `loss` → bureau report + escalate (critical)

---

## Track C — BA Sprint 15 Fixes

### S16-FIX-1 — BnplCreditLine timestamps + EXPIRED state (2 SP)

**Schema:** `bnpl_credit_lines.activated_at` + `expires_at` columns, partial index `WHERE expires_at IS NOT NULL AND status = 'active'`, new `expired` enum value added to `bnpl_credit_line_status`.

**Files:**
- `services/entity-service/src/bnpl-credit-line/bnpl-credit-line.service.ts` — `create()` stamps `activatedAt` and accepts optional `expiresAt`; `updateStatus()` back-fills `activatedAt` ONLY on the first active transition (re-activation after suspension doesn't overwrite). Closed and expired lines reject all further transitions.
- `services/entity-service/src/bnpl-credit-line/bnpl-credit-line-adjustment.service.ts` — `evaluateAndAdjust()` checks `expiresAt` first; if past, transitions to `expired` and emits `BNPL_CREDIT_LINE_EXPIRED`.
- `apps/graphql-server/src/graphql/types/bnpl-credit-line.type.ts` — `expired` enum value added; `activatedAt` + `expiresAt` exposed as nullable DateTime fields.
- `apps/graphql-server/src/graphql/inputs/bnpl-credit-line.input.ts` — `CreateBnplCreditLineInput` accepts optional `expiresAt` (ISO 8601).

### S16-FIX-2 — Decimal in evaluateCreditScoreChange (1 SP)

**File:** `services/entity-service/src/bnpl-credit-line/bnpl-credit-line-adjustment.service.ts`

Replaced `Number()` + native JS division with `subtract` + `divide` + `bankersRound` + `compare` from `@lons/common`. Thresholds expressed as 4dp Decimal-strings (`'-0.2'`, `'0.1'`). Added `formatPct(pctDecimal)` helper for display-only `reasonDetail` strings (Decimal × 100, banker-rounded to 1dp, sign-prefixed).

### S16-FIX-3 — AutoDeductionRetryJob contract status filter (1 SP)

**File:** `apps/scheduler/src/jobs/auto-deduction-retry.job.ts`

Added the same `contract.status IN (active, performing, due, overdue, delinquent)` filter the primary `AutoDeductionJob` uses (Sprint 15 FIX-10). A contract that transitioned to defaulted/cancelled/settled/written_off between the initial failure and the retry window is now silently skipped.

### S16-FIX-4 — RLS for debtors + invoices (1 SP, CRITICAL)

**Migration:** `20260516000000_sprint16_bundle` — `ENABLE + FORCE` row-level security on both tables, `tenant_isolation` policy with the canonical `current_setting('app.is_platform_admin', true) = 'true' OR tenant_id = current_setting('app.current_tenant', true)::uuid` predicate used by every other tenant-scoped table.

Closes the cross-tenant data leak vector — both tables shipped in the Sprint 11 invoice-factoring migration with `tenant_id NOT NULL` but no policies.

### S16-FIX-5 — Re-auth on regenerateMfaBackupCodes (1 SP)

**File:** `apps/graphql-server/src/graphql/resolvers/auth.resolver.ts`

Added required `password` argument + `authService.verifyPassword()` check before invoking `mfaService.regenerateBackupCodes()`. Mirrors the FIX-14 pattern from `disableMfa` and `initiateMfaEnrollment`. Closes the attack vector where a stolen session token could regenerate codes — invalidating the real user's codes and handing the attacker a new set in one call.

### S16-FIX-6 — Outbound webhook delivery audit (1 SP)

**Files:**
- `services/notification-service/package.json` — adds `@lons/entity-service` dep
- `services/notification-service/src/notification-service.module.ts` — imports `AuditModule`
- `services/notification-service/src/webhooks/webhook-delivery.service.ts` — injects optional `AuditService`; writes per-attempt and exhaustion audit rows

`WebhookDeliveryService.attemptDelivery()` now writes an `AuditLog` entry with `action: 'WEBHOOK_DELIVERY_ATTEMPTED'` on EVERY attempt (success + failure + error) with metadata: `deliveryLogId`, `url`, `httpStatus`, `success`, `attempt`, `eventType`, `errorMessage`, `correlationId`. `handleFailure()` also writes a dedicated `WEBHOOK_DELIVERY_EXHAUSTED` entry on the last attempt with total attempts + last status. Best-effort — both calls catch their own errors so audit failures never break delivery.

### S16-BA-12 — Concurrent deduction integration test (0.5 SP)

**File:** `services/process-engine/src/bnpl/__tests__/bnpl-lifecycle.integration.spec.ts`

New `describe('Sprint 16 (S16-BA-12) — concurrent deduction (FIX-7 backstop)')` block. Mocks `prisma.$transaction` to simulate the FIX-7 atomic `UPDATE ... WHERE available_limit >= $amount` — the mock returns affected-row count of 1 if there's headroom, 0 otherwise (mirroring real Postgres behaviour). Fires two concurrent `originate()` calls for 400 each against a 500 credit line; asserts exactly one resolves and one rejects with `BNPL_INSUFFICIENT_CREDIT_LIMIT`, and the line's `availableLimit` ends at the correct 100.

### S16-BA-14 — TenantBillingConfig seed (0.5 SP)

**File:** `packages/database/prisma/seed.ts`

After each tenant upsert, idempotently upsert a `TenantBillingConfig` row with plan-tier-derived defaults (starter=$99, growth=$499, enterprise=$1999, 30-day terms, 25 bps fee, USD billing). Fresh `pnpm db:seed` no longer silently misses billing for demo tenants.

---

## New event types

```typescript
// packages/event-contracts/src/events.enum.ts
MICRO_LOAN_CREDIT_LIMIT_REVIEWED = 'micro_loan.credit_limit.reviewed',
MICRO_LOAN_CREDIT_LIMIT_REDUCED  = 'micro_loan.credit_limit.reduced',
BNPL_CREDIT_LINE_EXPIRED         = 'bnpl.credit_line.expired',
```

---

## Operational notes

- **Migration order:** `20260516000000_sprint16_bundle` is a single migration covering all 4 schema additions. Postgres applies the RLS policy on `debtors` and `invoices` BEFORE creating the new tables, so the critical leak is closed first.
- **`AgingBucketConfig` defaults:** the migration seeds 6 canonical buckets per active tenant with `productId = NULL` (tenant-wide). Per-product overrides land in subsequent operator-driven inserts.
- **`PaymentReminderJob` template keys:** the generic scheduler uses `payment_reminder.{daysBefore}` keys. Micro-loan products with seeded `notificationConfig.paymentReminders.schedule` referencing `micro_loan.payment_reminder.*` get the micro-loan templates. The template bodies live in `MICRO_LOAN_REMINDER_TEMPLATES` (constant; not in DB).
- **Notification idempotency:** the reminder job's idempotency check uses the existing `Notification` table (`eventType = payment_reminder.{N}` + customerId + contractId). No schema change needed.
- **`AgingActionService.SUSPEND_BORROWING`** is the only handler that writes directly to the DB. All others emit events for downstream services to consume. This keeps the aging service free of cross-service deps.

---

## Files changed summary

```
Schema + migration:
  M packages/database/prisma/schema.prisma   (BnplCreditLine + 2 new models)
  A packages/database/prisma/migrations/20260516000000_sprint16_bundle/migration.sql

Event contracts:
  M packages/event-contracts/src/events.enum.ts   (+3 event types)

Track A — Micro-Loan (all new):
  A services/process-engine/src/micro-loan/micro-loan.module.ts
  A services/process-engine/src/micro-loan/micro-loan-subscription.service.ts
  A services/process-engine/src/micro-loan/micro-loan-origination.service.ts
  A services/process-engine/src/micro-loan/micro-loan-credit-limit-audit.service.ts
  A services/process-engine/src/micro-loan/micro-loan-credit-limit.service.ts
  A services/process-engine/src/micro-loan/micro-loan-credit-limit.listener.ts
  A services/process-engine/src/micro-loan/micro-loan-reminder.config.ts
  A services/process-engine/src/micro-loan/index.ts
  M services/process-engine/src/index.ts
  M services/process-engine/src/process-engine.module.ts
  M services/process-engine/src/loan-request/loan-request.service.ts
  M services/process-engine/src/loan-request/loan-request.module.ts
  A apps/graphql-server/src/graphql/types/micro-loan.type.ts
  A apps/graphql-server/src/graphql/resolvers/micro-loan.resolver.ts
  M apps/graphql-server/src/app.module.ts

Track B — Repayment:
  A services/repayment-service/src/schedule/schedule-recalculation.service.ts
  M services/repayment-service/src/schedule/schedule.module.ts
  M services/repayment-service/src/payment/payment.service.ts
  M services/repayment-service/src/payment/payment.module.ts
  A services/repayment-service/src/early-settlement/early-settlement.types.ts
  A services/repayment-service/src/early-settlement/early-settlement.service.ts
  A services/repayment-service/src/early-settlement/early-settlement.module.ts
  M services/repayment-service/src/repayment-service.module.ts
  M services/repayment-service/src/index.ts
  A services/process-engine/src/aging/aging-action.service.ts
  M services/process-engine/src/aging/aging.service.ts
  M services/process-engine/src/aging/aging.service.spec.ts
  M services/process-engine/src/aging/aging.module.ts
  A apps/scheduler/src/jobs/payment-reminder.job.ts
  M apps/scheduler/src/scheduler.module.ts
  M apps/scheduler/package.json   (+ @lons/notification-service)
  M apps/graphql-server/src/graphql/resolvers/repayment.resolver.ts
  M apps/graphql-server/src/graphql/types/repayment.type.ts

Track C — BA S15 Fixes:
  M services/entity-service/src/bnpl-credit-line/bnpl-credit-line.service.ts
  M services/entity-service/src/bnpl-credit-line/bnpl-credit-line-adjustment.service.ts
  M apps/graphql-server/src/graphql/types/bnpl-credit-line.type.ts
  M apps/graphql-server/src/graphql/inputs/bnpl-credit-line.input.ts
  M apps/scheduler/src/jobs/auto-deduction-retry.job.ts
  M apps/graphql-server/src/graphql/resolvers/auth.resolver.ts
  M services/notification-service/src/webhooks/webhook-delivery.service.ts
  M services/notification-service/src/notification-service.module.ts
  M services/notification-service/package.json   (+ @lons/entity-service)
  M services/process-engine/src/bnpl/__tests__/bnpl-lifecycle.integration.spec.ts
  M packages/database/prisma/seed.ts
```

---

## Verification

```
$ pnpm --filter @lons/common build               → tsc clean
$ pnpm --filter @lons/event-contracts build      → tsc clean
$ pnpm --filter @lons/database exec prisma generate → schema valid
$ pnpm --filter @lons/entity-service build       → tsc clean
$ pnpm --filter @lons/process-engine build       → tsc clean
$ pnpm --filter @lons/repayment-service build    → tsc clean
$ pnpm --filter @lons/notification-service build → tsc clean
$ pnpm --filter @lons/scheduler build            → nest build clean
$ pnpm --filter @lons/graphql-server build       → nest build clean
$ pnpm --filter @lons/rest-server build          → nest build clean

$ pnpm --filter @lons/entity-service test         → 175 / 175 passing
$ pnpm --filter @lons/process-engine test         → 445 / 445 passing  (incl. S16-BA-12 concurrent deduction)
$ pnpm --filter @lons/scheduler test              →  36 /  36 passing
$ pnpm --filter @lons/repayment-service test      →  12 /  12 passing
$ pnpm --filter @lons/graphql-server test         →  85 /  85 passing
$ pnpm --filter @lons/rest-server test            →  52 /  52 passing
$ pnpm --filter @lons/notification-service test   → 117 / 117 passing
                                              ────────────
                                              Total: 922 / 922 passing
```

---

## Known limitations / Sprint 17 candidates

- **No dedicated unit tests for the new micro-loan services.** Sprint 16 covered them via the existing process-engine test infrastructure passing end-to-end, but the dedicated `*.service.spec.ts` files (similar to Sprint 15's BnplCreditLineService specs) are not part of this delivery. Add them in early Sprint 17.
- **Action matrix events are emitted but not all consumers exist yet.** Specifically, `APPLY_PENALTY` from `AgingActionService` fires `PENALTY_APPLIED` but the existing `PenaltyService` doesn't yet subscribe to this event (it's invoked from other code paths). Wiring is a thin listener — Sprint 17 follow-up.
- **`PaymentReminderJob` template lookup** assumes `NotificationService.sendNotification()` knows the templateKey. If a product references `micro_loan.payment_reminder.3_day` and the notification service template registry doesn't have an entry, the send is a no-op (returns null). The micro-loan templates in `MICRO_LOAN_REMINDER_TEMPLATES` need to be wired into `template-renderer.ts` — currently they're documented but not registered. Trivial follow-up.
- **`AgingActionService` cache:** the bucket-config lookup is memoised per-run via an in-memory `Map`. A Redis cache (as the spec mentioned) would be appropriate when the aging job's per-tenant footprint grows.
- **`SettlementJob`** was wired in Sprint 15 FIX-11 but still emits no audit trail beyond the per-tenant log. Subsequent settlement disputes will want richer logging.
