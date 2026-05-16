# Sprint 16 Fix Delivery Notes

**Date:** 2026-05-17
**Fixes:** 7 items from PM-SPRINT-16-REVIEW-2026-05-16.md (6 P2 findings + 1 dev-acknowledged template gap)
**Scope:** ~9 SP

## Summary

| Category | Status |
|---|---|
| Code fixes applied | 5 / 5 (FIX-1, FIX-3, FIX-4, FIX-6, FIX-7) |
| Test fixes applied | 2 / 2 (FIX-2 — 40 new tests; FIX-5 — 23 new tests) |
| New migration | Yes — `20260517000000_sprint16_fixes` |
| Total tests after sprint | **985** (was 922) — all green |
| tsc | Clean across all 7 backend packages |

---

## Fix details

### FIX-1 — Credit limit review idempotency guard (1 SP)

**Problem:** Duplicate `REPAYMENT_RECEIVED` event delivery compounds the credit limit increase. The handler reads the already-bumped `creditLimit` and applies the percentage again.

**Schema** — `packages/database/prisma/schema.prisma`:
- `MicroLoanCreditLimitChange.sourceId` (`String?`, `@map("source_id")`, `@db.VarChar(255)`)
- `@@index([tenantId, sourceId])`

**Migration** — `20260517000000_sprint16_fixes`:
- `ALTER TABLE micro_loan_credit_limit_changes ADD COLUMN source_id VARCHAR(255)`
- `CREATE INDEX micro_loan_credit_limit_changes_tenant_id_source_id_idx ON ...(tenant_id, source_id)`

**Service** — `services/process-engine/src/micro-loan/micro-loan-credit-limit-audit.service.ts`:
- `IRecordCreditLimitChangeInput.sourceId?: string`
- Passed through to `prisma.create()`

**Service** — `services/process-engine/src/micro-loan/micro-loan-credit-limit.service.ts`:
- `reviewOnRepayment()` — dedup query on `(tenantId, subscriptionId, sourceId, changeType=increase)` BEFORE the percentage math. On hit, log and return.
- `reduceOnDefault()` (defence in depth — same compounding risk applies) — dedup query on `(tenantId, subscriptionId, sourceId, changeType IN ('decrease', 'suspension'))`. On hit, log and return.
- Both audit `record()` calls now pass `sourceId` (repaymentId for review, contractId for default reduction).

### FIX-2 — Unit tests for micro-loan services (3 SP)

**New test files:**
- `services/process-engine/src/micro-loan/__tests__/micro-loan-subscription.service.spec.ts` — **9 tests**: NotFound throw, product-type guard, already-deactivated guard, active/overdue/delinquent contract blocks deactivation, terminal-status contracts don't block, success path emits SUBSCRIPTION_DEACTIVATED, operator fallback to 'customer'.
- `services/process-engine/src/micro-loan/__tests__/micro-loan-origination.service.spec.ts` — **11 tests**: happy path, all 3 gate rejections with structured `code` assertions, boundary (amount == availableLimit), lexicographic-bug regression ("9" vs "1000"), availableLimit-null fallback, custom maxActiveLoans, contract-count `notIn` filter shape.
- `services/process-engine/src/micro-loan/__tests__/micro-loan-credit-limit.service.spec.ts` — **15 tests**: reviewOnRepayment paths (non-micro-loan no-op, overdue guard, FIX-1 dedup, threshold gate, happy path, cap at maxAmount, custom increasePercent); reduceOnDefault paths (non-micro-loan no-op, already-zero, FIX-1 symmetry dedup, first default 50%, second default 0, custom reductionPercent).
- `services/process-engine/src/micro-loan/__tests__/micro-loan-credit-limit-audit.service.spec.ts` — **5 tests**: append-only shape, FIX-1 sourceId persistence, undefined sourceId for manual ops, tx-client passthrough, pagination shape (newest first, cap 100, cursor skip).

**Total:** 40 tests, all passing.

### FIX-3 — `idempotencyKey` on `processRepayment` (1 SP)

**Schema** — `packages/database/prisma/schema.prisma`:
- `Repayment.idempotencyKey` (`String?`, `@map("idempotency_key")`, `@db.VarChar(255)`)
- `@@unique([tenantId, idempotencyKey])`

**Migration** — `20260517000000_sprint16_fixes`:
- `ALTER TABLE repayments ADD COLUMN idempotency_key VARCHAR(255)`
- Partial unique index: `CREATE UNIQUE INDEX repayments_tenant_id_idempotency_key_key ON repayments(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL` — non-null uniqueness without breaking the multitude of existing NULL rows.

**Resolver** — `apps/graphql-server/src/graphql/resolvers/repayment.resolver.ts`:
- `processRepayment` now takes `idempotencyKey` as a REQUIRED arg.

**Service** — `services/repayment-service/src/payment/payment.service.ts`:
- `processPayment` input gains `idempotencyKey?: string` (still optional at service layer so internal callers without a key work).
- Dedup lookup BEFORE the contract status check — a replayed mutation against a since-settled contract returns the original repayment instead of throwing "Contract is already settled".
- The `repayment.create()` call persists the key.

### FIX-4 — Reminder dedup scoped to installment (0.5 SP)

**Problem:** Two installments on the same contract with the same due date (post-restructuring) would only get the first reminder — the dedup query checked `(tenantId, customerId, contractId, eventType)` with no installment discriminator.

**Approach:** The `Notification` model has no `metadata`/`referenceId` field, and adding one would be a schema change. The minimal-touch fix is to encode the installment ID into the `eventType` discriminator: `payment_reminder.3:{installmentId}`. The eventType is `VARCHAR(100)` so a 36-char UUID fits comfortably (final length ~55 chars).

**File** — `apps/scheduler/src/jobs/payment-reminder.job.ts`:
- New `dedupeEventType = ${templateEventType}:${entry.id}` — the persisted Notification row gets the scoped key.
- Dedup query matches against the scoped key, so per-(installment, daysBefore) uniqueness.

**File** — `services/notification-service/src/notification.service.ts`:
- `sendNotification` now strips the `:discriminator` suffix from `params.eventType` for template lookup: `templateKey = params.eventType.split(':')[0]`. The template registry stays clean (one entry per template, not per installment). The full discriminated eventType still persists on the Notification row.

### FIX-5 — Unit tests for repayment services (2 SP)

**New test files:**
- `services/repayment-service/src/schedule/__tests__/schedule-recalculation.service.spec.ts` — **11 tests**: NotFound throw, no-pending no-op, equal redistribution (900 / 3 = 300 each), rounding absorption (1000 / 3 → last absorbs residual, sum exact), paid+waived untouched, partial-status recalculated, snapshot history append, prior history preservation, atomic `$transaction` (single call, 3-promise array), interest recomputation at `rate / 1200`.
- `services/repayment-service/src/early-settlement/__tests__/early-settlement.service.spec.ts` — **12 tests**: rejection paths (NotFound, settled/cancelled status, disallowed config, too-soon min days); quote math (no rebate/no fee = sum, 50% rebate on 200 unearned = 100 rebate, flat fee, percentage fee, combined rebate+fee, past-due installments don't count as unearned); shape (validUntil = end of UTC day, breakdown zero-filter).

**Total:** 23 tests, all passing.

### FIX-6 — Decimal in `evaluateRepaymentBehaviour` (0.5 SP)

**File** — `services/entity-service/src/bnpl-credit-line/bnpl-credit-line-adjustment.service.ts`:

Replaced `const ratio = onTime / paid.length` (native JS float division) with:

```typescript
const ratio = bankersRound(
  divide(String(onTime), String(paid.length)),
  4,
);
```

And `ratio >= rules.onTimeRepaymentRatioThreshold` with `compare(ratio, String(rules.onTimeRepaymentRatioThreshold)) >= 0`. The display string also routes through the `formatPct(ratio)` helper added in S16-FIX-2 — same display format as the credit-score-change branch.

### FIX-7 — Payment reminder templates registered (1 SP)

**File** — `services/notification-service/src/templates/template-renderer.ts`:

Added 6 new entries to `NOTIFICATION_TEMPLATES`:
- `payment_reminder.3` / `payment_reminder.1` / `payment_reminder.0` — generic SMS+email+push+in_app variants used by all installment products.
- `micro_loan.payment_reminder.3_day` / `1_day` / `due_today` — micro-loan-specific bodies (referenced by the seeded `MICRO_LOAN_DEFAULT_REMINDERS` config).

All variables: `customerName`, `amount`, `currency`, `dueDate`, `installmentNumber`. Closes the silent-reminder bug — `NotificationService` was returning `null` on every reminder send because the template registry had no entries for these keys.

---

## New Migration

**Name:** `20260517000000_sprint16_fixes`

**Changes:**
1. `ALTER TABLE micro_loan_credit_limit_changes ADD COLUMN source_id VARCHAR(255)` — FIX-1
2. `CREATE INDEX micro_loan_credit_limit_changes_tenant_id_source_id_idx ON ...(tenant_id, source_id)` — FIX-1
3. `ALTER TABLE repayments ADD COLUMN idempotency_key VARCHAR(255)` — FIX-3
4. `CREATE UNIQUE INDEX repayments_tenant_id_idempotency_key_key ON ...(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL` — FIX-3 (partial unique)

Both columns nullable → backward compatible. Partial unique index keeps NULL rows from colliding.

---

## Files changed summary

```
Schema + migration:
  M packages/database/prisma/schema.prisma   (sourceId on audit + idempotencyKey on Repayment)
  A packages/database/prisma/migrations/20260517000000_sprint16_fixes/migration.sql

FIX-1 + FIX-2:
  M services/process-engine/src/micro-loan/micro-loan-credit-limit-audit.service.ts
  M services/process-engine/src/micro-loan/micro-loan-credit-limit.service.ts
  A services/process-engine/src/micro-loan/__tests__/micro-loan-subscription.service.spec.ts
  A services/process-engine/src/micro-loan/__tests__/micro-loan-origination.service.spec.ts
  A services/process-engine/src/micro-loan/__tests__/micro-loan-credit-limit.service.spec.ts
  A services/process-engine/src/micro-loan/__tests__/micro-loan-credit-limit-audit.service.spec.ts

FIX-3:
  M apps/graphql-server/src/graphql/resolvers/repayment.resolver.ts
  M services/repayment-service/src/payment/payment.service.ts

FIX-4:
  M apps/scheduler/src/jobs/payment-reminder.job.ts
  M services/notification-service/src/notification.service.ts

FIX-5:
  A services/repayment-service/src/schedule/__tests__/schedule-recalculation.service.spec.ts
  A services/repayment-service/src/early-settlement/__tests__/early-settlement.service.spec.ts

FIX-6:
  M services/entity-service/src/bnpl-credit-line/bnpl-credit-line-adjustment.service.ts

FIX-7:
  M services/notification-service/src/templates/template-renderer.ts
```

---

## Verification

```
$ pnpm --filter @lons/database exec prisma generate      → schema valid
$ pnpm --filter @lons/common build                       → tsc clean
$ pnpm --filter @lons/entity-service build               → tsc clean
$ pnpm --filter @lons/process-engine build               → tsc clean
$ pnpm --filter @lons/repayment-service build            → tsc clean
$ pnpm --filter @lons/notification-service build         → tsc clean
$ pnpm --filter @lons/scheduler build                    → nest build clean
$ pnpm --filter @lons/graphql-server build               → nest build clean
$ pnpm --filter @lons/rest-server build                  → nest build clean

$ pnpm --filter @lons/entity-service test                → 175 / 175 passing
$ pnpm --filter @lons/process-engine test                → 485 / 485 passing  (+40 micro-loan)
$ pnpm --filter @lons/repayment-service test             →  35 /  35 passing  (+23 schedule + early-settlement)
$ pnpm --filter @lons/scheduler test                     →  36 /  36 passing
$ pnpm --filter @lons/notification-service test          → 117 / 117 passing
$ pnpm --filter @lons/graphql-server test                →  85 /  85 passing
$ pnpm --filter @lons/rest-server test                   →  52 /  52 passing
                                                      ────────────
                                                      Total: 985 / 985 passing  (was 922)
```

---

## Exit criteria check

- [x] Duplicate `REPAYMENT_RECEIVED` for the same repaymentId does NOT compound the credit limit (FIX-1 — pinned in micro-loan-credit-limit.service.spec.ts)
- [x] `processRepayment` mutation requires `idempotencyKey`; duplicate key returns existing repayment (FIX-3)
- [x] Two installments on the same contract with the same due date both receive reminders (FIX-4 — dedup scoped to installment ID)
- [x] `evaluateRepaymentBehaviour` uses Decimal `divide()` and `compare()` — no JS arithmetic (FIX-6)
- [x] Payment reminder templates render correctly for both generic and micro-loan keys (FIX-7)
- [x] Unit tests exist for all 4 micro-loan services (FIX-2 — 40 tests)
- [x] Unit tests exist for `ScheduleRecalculationService` and `EarlySettlementService` (FIX-5 — 23 tests)
- [x] All financial calculation tests include boundary cases and banker's rounding verification
- [x] All existing tests still pass (922 baseline → 985 final, +63 new)
- [x] tsc clean across all packages

---

## Notable design decisions

- **FIX-1 symmetry:** the prompt focused on `reviewOnRepayment` but `reduceOnDefault` has the same compounding risk on a re-delivered `CONTRACT_STATE_CHANGED`. Added the same dedup guard there. Both audit `record()` calls now stamp `sourceId` so the guards have something to match on.
- **FIX-4 schema-less:** rather than add a `metadata` or `referenceId` column to `Notification`, encoded the dedup discriminator into the `eventType` itself (`payment_reminder.3:{installmentId}`). Cheaper to ship and the `:` separator makes both the dedup query and the template-lookup split trivial. The `NotificationService` change is a 1-line `split(':')[0]` for template lookup.
- **FIX-3 partial unique index:** mirrors the Sprint 15 FIX-15 pattern on `bnpl_credit_line_adjustments`. NULL keys remain distinct (existing rows + internal callers without keys), non-NULL keys are unique per tenant.
- **FIX-6 display via `formatPct`:** reused the helper added in Sprint 16 FIX-2 — same display format across all credit-decision branches keeps reasonDetail strings consistent for the audit log.

---

## Remaining concerns

None blocking. Forward-looking items:

- **FIX-4 long-term:** the `:installmentId` eventType encoding works but is implicit. A future schema migration could add `referenceId String? @db.Uuid` on `Notification` and back-fill from the discriminator — cleaner semantics and lets the dedup join on the actual installment FK.
- **FIX-7 template overrides:** registered templates are global, not per-tenant. SPs that want customised SMS bodies would need a per-tenant template override mechanism — separate Sprint 17 candidate.
