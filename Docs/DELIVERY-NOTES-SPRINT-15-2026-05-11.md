# Sprint 15 Delivery Notes — P0 Launch Blockers + Sprint 14 Follow-Up

**Date:** 2026-05-11
**Scope:** ~64 SP across 15 items in 5 tracks. After this sprint no P0
launch blocker remains. Track E closes Sprint 14 BA/PM review findings.

---

## Items delivered

### Track A — BNPL Credit Limits

#### S15-1: BNPL Per-Customer Credit Line Entity (8 SP, P0)

**Files Changed**

- `packages/database/prisma/schema.prisma` — new `BnplCreditLine` and
  `BnplCreditLineAdjustment` models + `BnplCreditLineStatus` enum.
  Relations added to `Customer`, `Subscription`, `Product`.
- `packages/database/prisma/migrations/20260511100000_sprint15_credit_lines_mfa_retry_rls/migration.sql`
  — bundled migration (also covers S15-5, S15-6, S15-7, S15-BILL-2).
  RLS policies on both new tables.
- `services/entity-service/src/bnpl-credit-line/bnpl-credit-line.service.ts`
  — CRUD + status transitions + event emission.
- `services/entity-service/src/bnpl-credit-line/bnpl-credit-line.module.ts`
  — module registration; wired into `EntityServiceModule`.
- `apps/graphql-server/src/graphql/types/bnpl-credit-line.type.ts`
  — `BnplCreditLineType`, `BnplCreditLineAdjustmentType`, status enum.
- `apps/graphql-server/src/graphql/inputs/bnpl-credit-line.input.ts`
  — `CreateBnplCreditLineInput`, `UpdateBnplCreditLineStatusInput`,
  `AdjustBnplCreditLimitInput`.
- `apps/graphql-server/src/graphql/resolvers/bnpl-credit-line.resolver.ts`
  — 3 queries (`bnplCreditLine`, `bnplCreditLinesByCustomer`,
  `bnplCreditLineBySubscription`) + 3 mutations + field resolver for
  `adjustments`.
- `apps/graphql-server/src/app.module.ts` — `BnplCreditLineResolver`
  registered.
- `packages/database/prisma/seed.ts` — bootstraps one `BnplCreditLine`
  per BNPL subscription with `approvedLimit = creditLimit` and 90-day
  `nextReviewAt`. Idempotent.

**Schema changes**

- New tables: `bnpl_credit_lines`, `bnpl_credit_line_adjustments`.
- New enum: `bnpl_credit_line_status` (`active`, `suspended`, `closed`).
- Unique constraints: `(tenantId, customerId, subscriptionId)` and
  `subscriptionId` (one-to-one). FKs to `customers`, `subscriptions`,
  `products`. RLS confirmed.

**Events added**

- `EventType.BNPL_CREDIT_LINE_CREATED` — emitted on `create()`.
- `EventType.BNPL_CREDIT_LINE_STATUS_CHANGED` — emitted on `updateStatus()`.

#### S15-2: BNPL Credit Limit Dynamic Adjustment (8 SP, P0)

**Files Changed**

- `services/entity-service/src/bnpl-credit-line/bnpl-credit-line-adjustment.service.ts`
  — 4 trigger evaluators (purchase history, repayment behaviour, credit
  score change, scheduled review) + `adjustCreditLimit` direct path +
  proportional availableLimit rescaling on decrease.
- `apps/graphql-server/src/graphql/resolvers/bnpl-credit-line.resolver.ts`
  — `adjustBnplCreditLimit` mutation for manual operator adjustments.

**Configurability**

Rules live in `product.bnplConfig.creditLimitRules` JSON. Defaults
fall back to `DEFAULT_LIMIT_RULES`:

| Rule | Default |
|---|---|
| `maxIncreasePercent` | 0.20 |
| `maxDecreasePercent` | 0.30 |
| `reviewFrequencyDays` | 90 |
| `minCompletedTransactionsForIncrease` | 3 |
| `onTimeRepaymentRatioThreshold` | 0.90 |
| `latePaymentsForDecrease` | 2 |

**Money precision.** All percentage math uses `@lons/common` Decimal
helpers via the precision-preserving `divide(multiply(amount, pct), 1)`
order (same pattern as Sprint 14 billing) — never floats.

**Events added**

- `EventType.BNPL_CREDIT_LIMIT_ADJUSTED` — emitted on every successful
  adjustment with `previousLimit`, `newLimit`, `adjustmentType`,
  `reasonCode`, `triggeredBy`.

#### S15-3: Credit Limit Restoration on Repayment (5 SP, P0)

**Files Changed**

- `services/process-engine/src/bnpl/bnpl-installment.service.ts` —
  `processInstallmentPayment` now calls a new private
  `restoreCreditLimit()` helper after the installment transitions to
  `paid`. The helper:
  1. Looks up the active `Subscription` for `(customerId, productId)`.
  2. Looks up the active `BnplCreditLine` for that subscription.
  3. In a `$transaction`, adds `principalPortion` to `availableLimit`
     capped at `approvedLimit`.
  4. Emits `BNPL_CREDIT_LIMIT_RESTORED` with the actual delta credited.

Best-effort design: failure in the restoration path is logged but does
NOT roll back the underlying payment. Suspended and closed credit lines
are skipped.

**Events added**

- `EventType.BNPL_CREDIT_LIMIT_RESTORED` — emitted whenever
  availableLimit changes on a payment.

---

### Track B — Auto Wallet Deduction

#### S15-4: Generic Auto-Deduction Scheduler (5 SP, P0)

**Files Changed**

- `apps/scheduler/src/jobs/auto-deduction.job.ts` — new daily cron
  (`EVERY_DAY_AT_6AM`). Per-tenant fan-out; per-installment idempotency
  via `lastDeductionAttemptAt`.
- `apps/scheduler/src/scheduler.module.ts` — registers
  `AutoDeductionJob` + imports `WalletAdaptersModule.register()` from
  `@lons/common` (S15-8).

**Targets** `RepaymentScheduleEntry` rows where:
- `dueDate <= today`, status in `pending|partial|overdue`
- `contract.product.repaymentMethod = 'auto_deduction'`
- `lastDeductionAttemptAt < today` OR null

BNPL continues to use its own `BnplAutoCollectJob` because its
post-collection side effects (merchant settlement, acceleration)
differ.

**Wallet resolution** via `WalletAccountMapping` (primary mapping
only). Adapter call via the shared `WALLET_COLLECTION_ADAPTER` token.

#### S15-5: Auto-Deduction Retry Mechanism (5 SP, P0)

**Schema additions** (on `RepaymentScheduleEntry`)

- `lastDeductionAttemptAt TIMESTAMPTZ`
- `deductionAttemptCount INT DEFAULT 0`
- `nextDeductionRetryAt TIMESTAMPTZ` (indexed for the retry job lookup)

**Files Changed**

- `apps/scheduler/src/jobs/auto-deduction-retry.job.ts` — every 30
  minutes. Picks up entries where `nextDeductionRetryAt <= now` and
  re-invokes `AutoDeductionJob.attemptDeduction`.
- `apps/scheduler/src/jobs/auto-deduction.job.ts` — failure path
  schedules next retry from `product.bnplConfig.autoDeductionRetry`
  (defaults: 3 retries at 2h / 6h / 24h). On exhaustion emits
  `DEDUCTION_FAILED_PERMANENTLY`.

**Events added**

- `EventType.DEDUCTION_FAILED_PERMANENTLY` — emitted when retries
  exhaust. Consumed by the aging flow to transition the schedule entry
  and contract status.

---

### Track C — Security P0s

#### S15-6: MFA TOTP Enrollment + Verification (5 SP, P0)

**Schema additions**

- `users.mfa_backup_codes TEXT NULL` — JSON-encoded array of unused
  backup codes, AES-256-GCM encrypted at rest via the field-encryption
  middleware.
- `platform_users.mfa_backup_codes TEXT NULL` — same.

**Files Changed**

- `services/entity-service/src/auth/mfa.service.ts` — TOTP enrollment
  flow (initiate / confirm), code verification (TOTP primary, backup
  code fallback with single-use consumption), disable, regenerate
  backup codes.
- `services/entity-service/src/auth/auth.service.ts` — login methods
  now return a `LoginResult` union. When the user has `mfaEnabled`,
  returns a short-lived MFA token instead of full credentials. New
  `verifyMfaAndLogin()` exchanges the MFA token + code for the full
  token pair.
- `services/entity-service/src/auth/jwt.service.ts` — `signMfaToken()`
  issues a 5-minute token with `type: 'mfa'` and
  `purpose: 'mfa_verification'`.
- `services/entity-service/src/auth/interfaces/jwt-payload.interface.ts`
  — `type` union extended to include `'mfa'`; `purpose` and `userType`
  optional fields added.
- `services/entity-service/src/auth/auth.module.ts` — registers
  `MfaService`.
- `packages/common/src/encryption/encrypted-fields.config.ts` —
  `mfaSecret` and `mfaBackupCodes` added to encrypted fields list for
  both `User` and `PlatformUser` models.
- `apps/graphql-server/src/graphql/types/auth.type.ts` —
  `LoginResponse` (the union flatening returned by login mutations) and
  `MfaEnrollmentPayload`.
- `apps/graphql-server/src/graphql/resolvers/auth.resolver.ts` —
  5 new mutations: `verifyMfa`, `initiateMfaEnrollment`,
  `confirmMfaEnrollment`, `disableMfa`, `regenerateMfaBackupCodes`.
- `services/entity-service/src/auth/auth.service.spec.ts` — fixtures
  updated for new `mfaBackupCodes: null` field; result-narrowing for
  the new union return type.

**Dependencies added**

- `otplib ^12.0.1` (entity-service) — TOTP authenticator with the
  standard RFC 6238 secret generation + verification.

#### S15-7: RLS Comprehensive Verification Sweep (5 SP, P0)

**Files Changed**

- `packages/database/prisma/migrations/20260511100000_sprint15_credit_lines_mfa_retry_rls/migration.sql`
  — adds `tenant_isolation` policies to the three Sprint-14 billing
  tables that landed without one (`tenant_billing_configs`,
  `billing_invoices`, `disbursement_fees`). All 3 are tenant-scoped
  (`tenant_id` FK on each); leaving them without RLS would be a
  cross-tenant data-leak vector.
- `tests/regression/rls-coverage.spec.ts` — comprehensive verification
  spec. Parameterised over the full list of tenant-scoped tables (51
  entries); each asserts `tenant_isolation` exists in `pg_policies`
  AND `relrowsecurity` + `relforcerowsecurity` are both true. Also
  verifies platform-scoped tables truly have no `tenant_id`.

Exempt tables documented in the spec file:
`platform_users`, `refresh_tokens`, `tenants` (special-case),
`billing_line_items` (cascade via FK), `plan_tier_configs`
(platform configuration).

---

### Track D — BNPL P1 Fixes

#### S15-8: Shared Wallet Adapter DI (5 SP, High)

**Files Changed**

- `packages/common/src/wallet/wallet-adapter.interface.ts` — canonical
  `IWalletDisbursementAdapter`, `IWalletCollectionAdapter`,
  `WalletAdapterResult` types + `WALLET_DISBURSEMENT_ADAPTER` /
  `WALLET_COLLECTION_ADAPTER` Symbol tokens (using `Symbol.for(...)`
  for DI-token equality across module boundaries).
- `packages/common/src/wallet/mock-wallet.adapter.ts` —
  `SharedMockWalletDisbursementAdapter` and
  `SharedMockWalletCollectionAdapter` (deterministic by walletId hash).
- `packages/common/src/wallet/wallet-adapters.module.ts` — env-driven
  `register()` factory that matches the overdraft-side pattern (mock
  default; live mode requires `liveAdapters`).
- `packages/common/src/wallet/index.ts` + `packages/common/src/index.ts`
  — exports.

The existing service-local copies in `services/overdraft-service` and
`services/process-engine/src/bnpl/wallet-collection-adapter.ts` stay
in place during the migration window; new services (S15-4
AutoDeductionJob) consume the shared module.

#### S15-9: BNPL Origination Subscription + Credit Limit Check (4 SP)

**Files Changed**

- `services/process-engine/src/bnpl/bnpl-origination.service.ts` —
  pre-create checks for:
  1. `BNPL_NO_ACTIVE_SUBSCRIPTION` — active `Subscription` for
     (customer, product) must exist.
  2. `BNPL_NO_CREDIT_LINE` — active `BnplCreditLine` on that
     subscription must exist.
  3. `BNPL_INSUFFICIENT_CREDIT_LIMIT` — `purchaseAmount` must not
     exceed `availableLimit`.

  Credit limit deduction folded into the same `$transaction` as the
  `BnplTransaction.create` + `InstallmentSchedule.createMany`. A
  TOCTOU re-check (`findUniqueOrThrow` then re-compare) inside the
  transaction handles concurrent purchases that race past the
  pre-check.

All three error codes returned as `ValidationError` with `{ code: ... }`
in the details so the GraphQL exception filter can surface them as
`extensions.code`.

#### S15-10: BNPL Late Fee Calculation (3 SP)

**Files Changed**

- `services/process-engine/src/bnpl/bnpl-installment.service.ts` —
  `markOverdueInstallments` now resolves `product.bnplConfig.lateFee`
  via `resolveLateFeeConfig` and computes the fee via `computeLateFee`.
  Late fee is folded into `feePortion` and the installment `amount`;
  the `BNPL_INSTALLMENT_OVERDUE` event's `lateFeeAmount` carries the
  actual fee applied (was hardcoded `'0'`).

**Config shape** (on `product.bnplConfig.lateFee`):

```json
{
  "flatFee": "5.0000",
  "percentageFee": 0.05,
  "applicationMode": "once",
  "maxFeePercent": 0.25
}
```

`applicationMode='once'` (default) charges only at first overdue
transition; `'per_bucket'` charges at every aging pass. Cap is
enforced against the *original* installment amount (not the inflated
one), so per-bucket cycles cannot bypass the cap.

---

### Track E — Sprint 14 Follow-Up

#### S15-BILL-1: BillingResolver + Types (2 SP)

**Files Changed**

- `apps/graphql-server/src/graphql/types/billing-invoice.type.ts` —
  `BillingInvoiceType`, `BillingLineItemType`, Relay
  `BillingInvoiceConnection`, status/type/lineItemType enums.
- `apps/graphql-server/src/graphql/resolvers/billing.resolver.ts` —
  `billingInvoices` (cursor-paginated list with filters),
  `billingInvoice` (single), `markInvoicePaid` mutation (delegates to
  `SubscriptionBillingService`), `lineItems` field resolver.
- `apps/graphql-server/src/app.module.ts` — `BillingResolver`
  registered.

Closes BA findings F-S14-B2 and F-S14-B3 (Sprint 14 had the services
and Prisma models but no GraphQL read API for tenant invoices).

#### S15-BILL-2: TenantBillingConfig Seed + Missing-Config Alert (2 SP)

**Files Changed**

- `packages/database/prisma/migrations/20260511100000_sprint15_credit_lines_mfa_retry_rls/migration.sql`
  — backfill INSERT for every active tenant lacking a
  `TenantBillingConfig`. Idempotent via `NOT EXISTS` guard. Amounts
  derived from `tenants.plan_tier` (starter=$99, growth=$499,
  enterprise=$1999) — 25 bps per-disbursement fee, USD billing,
  30-day terms.
- `services/settlement-service/src/billing/subscription-billing.service.ts`
  — after the per-tenant loop, emits `BILLING_CONFIG_MISSING` to
  `'platform'` tenant when `skippedNoConfig > 0`. Operators can
  dashboard this event for tenants onboarded post-migration that lack
  configs.

**Events added**

- `EventType.BILLING_CONFIG_MISSING` — `{ skippedCount, month }`.

#### S15-FIX-1: Atomic Redis Quota Increment — Lua Script (3 SP)

**Files Changed**

- `services/entity-service/src/plan-tier/quota-lua-scripts.ts` — new
  `QUOTA_INCREMENT_SCRIPT`. Returns a 6-tuple:
  `[newCount, newVolume, countExceeded, volumeExceeded, countWarning, volumeWarning]`.
  Sets TTL on first increment only.
- `services/entity-service/src/plan-tier/quota-tracking.service.ts` —
  `incrementDisbursement` refactored to a single `redis.eval(...)`
  call. Closes the race window where two concurrent disbursements
  could both pass the cap at the single-counter step.

The fail-open posture is preserved (Redis error → admit with
`currentCount: 0` + warning log).

#### S15-FIX-2: Webhook + Scheduler Audit Coverage (2 SP)

**Files Changed**

- `apps/rest-server/src/wallet-webhook/wallet-webhook.controller.ts`
  — `@AuditAction('wallet_webhook.insufficient_balance', 'wallet_webhook')`
  and `@AuditAction('wallet_webhook.transaction_notification', 'wallet_webhook')`
  on both POST handlers.
- `apps/rest-server/src/debtor-payment-webhook/debtor-payment-webhook.controller.ts`
  — `@AuditAction('debtor_payment_webhook.received', 'invoice')` on
  the `debtorPayment` handler.
- `apps/scheduler/src/jobs/reconciliation.job.ts` — `AuditService.log()`
  per-tenant per-run with `action: 'execute.reconciliation'`.
- `apps/scheduler/src/jobs/cooling-off-expiry.job.ts` —
  `AuditService.log()` only when contracts actually transitioned
  (avoids 96-per-day audit-log noise).
- `apps/scheduler/src/jobs/settlement.job.ts` — `AuditService.log()`
  per-tenant per-run with period start/end metadata.

#### S15-FIX-3: Volume 80% Warning + Customer Hash Verification (2 SP)

**Files Changed (volume warning)**

- `services/entity-service/src/plan-tier/quota-tracking.service.ts` —
  emits `USAGE_THRESHOLD_WARNING` for BOTH `monthly_transactions` AND
  `monthly_volume_usd` at the 80% threshold. Volume warning was
  missing in Sprint 14 — closes F-S14-B7. The warning flag is folded
  into the Lua script return so both checks happen atomically.

**Files Changed (customer hash verification)**

- `tests/regression/customer-hash-update.spec.ts` — new regression test
  proving the field-encryption middleware recomputes `phonePrimaryHash`
  and `emailHash` on every `update()` call. Pins the contract so a
  future refactor that drops `update` from `WRITE_ACTIONS` would be
  caught at CI time. Uses `computeSearchableHash` from `@lons/common`
  as the source of truth so the test stays aligned with the production
  algorithm (HMAC-SHA-256 via `HASH_PEPPER`).

The middleware verification (F-S14-A3) confirmed no service-layer
changes are needed: `WRITE_ACTIONS = ['create', 'update', 'upsert',
'createMany', 'updateMany']` already covers the update path. The
existing pattern (transparent encryption + hash recomputation on every
write) is correct.

---

## Migrations to run (order matters)

1. `20260511100000_sprint15_credit_lines_mfa_retry_rls` — bundles:
   - `bnpl_credit_lines` + `bnpl_credit_line_adjustments` tables + RLS
   - `repayment_schedule` retry tracking columns
   - `users.mfa_backup_codes` + `platform_users.mfa_backup_codes`
   - RLS policies for `tenant_billing_configs`, `billing_invoices`,
     `disbursement_fees` (the Sprint-14 gap)
   - `TenantBillingConfig` backfill INSERT for active tenants

## Operational notes

- **HASH_PEPPER** must remain set in production (loss invalidates every
  hash column — SEC-5 status quo, unchanged).
- **otplib** is a new entity-service dependency. Lock file updated;
  re-run `pnpm install` after pull.
- **MFA rollout**: `mfaEnabled` defaults to `false` on every user, so
  this release is non-breaking. Users opt-in via
  `initiateMfaEnrollment` → `confirmMfaEnrollment`. Once enabled, the
  next login returns `requiresMfa: true` and the user is funnelled
  through `verifyMfa`.
- **Wallet adapter**: `WALLET_ADAPTER_MODE=mock` (default) keeps the
  AutoDeductionJob running against deterministic mocks. Live mode
  refuses to start without real `liveAdapters` (financial-safety
  guard).
- **AutoDeductionJob targets** any `Product` where
  `repaymentMethod = 'auto_deduction'`. Tenants that don't want
  auto-deduction should leave their products on `manual` or
  `auto_collect_due` (BNPL).
- **Seed**: re-run `pnpm --filter database db:seed` after migrating
  to populate `BnplCreditLine` rows for the seeded BNPL subscriptions.

## Verification

- **tsc clean** across packages/common, packages/database,
  packages/event-contracts, services/entity-service,
  services/process-engine, services/settlement-service,
  apps/scheduler, apps/graphql-server, apps/rest-server,
  apps/admin-portal.
- **Lint** unchanged from Sprint 14 (pre-existing failures in
  process-engine + graphql-server carry over; nothing new).
- **Regression tests added**:
  - `tests/regression/rls-coverage.spec.ts` — 51 tables × 2 assertions.
  - `tests/regression/customer-hash-update.spec.ts` — 4 scenarios.

## Sprint 15 follow-ups identified during implementation

- `BnplAutoCollectJob` and the new `AutoDeductionJob` share enough
  structure that a future refactor could unify them; deferred because
  their post-collection side effects diverge.
- The existing `services/overdraft-service/.../wallet-adapters.module.ts`
  duplicates the shared module in `@lons/common`. Cutover is
  straightforward but was kept out of scope to avoid blast radius.
- `SettlementJob` is defined in `apps/scheduler/src/jobs/` but is not
  registered in `scheduler.module.ts` (pre-existing gap, not caused by
  this sprint — the audit decorator I added is dormant until the job
  is wired in).
- MFA backup code regeneration is exposed via GraphQL but the admin
  portal UI for it is deferred (separate UX track).
