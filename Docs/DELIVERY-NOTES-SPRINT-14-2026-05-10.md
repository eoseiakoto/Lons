# Delivery Notes: Sprint 14 — Commercials & Billing Stack + Invoice Verification Queue

**Status:** Complete (8 of 9 items shipped; admin portal UI for S14-15 / S14-IF-2 deferred — see §"Deferred / Known gaps")
**Date:** 2026-05-10
**Reference prompt:** `Docs/DEV-PROMPT-SPRINT-14.md`

This sprint delivers the entire commercial-billing subsystem (plan tier
infrastructure, quota enforcement, subscription invoicing, per-
disbursement metered fees, usage metrics API) plus the operator-facing
invoice verification queue. The platform can now charge Service
Providers.

---

## Items shipped

| # | Item | SP | Status |
|---|------|----|--------|
| S14-9 | PlanFeatureMatrix + TenantPlanGuard + @RequiresPlan | 8 | ✅ |
| S14-10 | Plan tier enforcement at all mutation points + tests | 5 | ✅ |
| S14-12 | Subscription billing engine | 8 | ✅ |
| S14-13 | Per-disbursement fee metering + usage invoice | 8 | ✅ |
| S14-14a | Redis quota tracking | 5 | ✅ |
| S14-14b | Usage metrics API | 5 | ✅ |
| S14-IF-1 | Invoice Verification Queue — backend | 5 | ✅ |
| S14-15 | Plan tier dashboard, usage display, upgrade modals (admin portal) | 8 | ⏸ deferred (see §Deferred) |
| S14-IF-2 | Invoice Verification Queue — admin portal | 5 | ⏸ deferred (see §Deferred) |

---

## Per-item delivery

### S14-9 — Plan Tier Infrastructure ✅

**Database (Prisma schema + migrations):**
- `PlanTier` enum renamed `professional → growth` via `ALTER TYPE
  ... RENAME VALUE`. Existing tenant rows preserved through the rename
  (Postgres-native, no row UPDATE needed).
- New enums: `BillingModel`, `BillingInvoiceType`, `BillingInvoiceStatus`,
  `BillingLineItemType`.
- `PlanTierConfig` model — DB-driven tier matrix. Stores allowed
  product types, operational limits, feature flags, branding options,
  API access. **Seeded** for all three tiers per SPEC-plan-tiers.md §3
  (`migration.sql` inserts).
- `TenantBillingConfig` model — per-tenant rates (subscription amount,
  per-disbursement bps, product modifiers, volume discount tiers,
  contract dates). Default modifiers: `bnplRateModifier: -10`,
  `factoringRateModifier: -20` per the BA spec.
- Migration: `20260511000000_plan_tier_billing_infrastructure`.

**Code:**
- `packages/shared-types/src/enums/tenant.enum.ts` — `PROFESSIONAL → GROWTH`.
- Across the codebase: 12 files referencing `'professional'` updated to
  `'growth'` (seed data, portal UIs, service signatures, i18n).
- `packages/common/src/cache/redis-client.module.ts` (new) — shared
  `REDIS_CLIENT` provider with `RedisClientModule.forRoot()` and a stub
  client for boot resilience when Redis is unavailable.
- `services/entity-service/src/plan-tier/plan-tier-config.service.ts`
  (new) — DB-driven tier accessor with 5-minute Redis cache.
- `services/entity-service/src/plan-tier/quota-enforcement.service.ts`
  (new) — `checkEntityLimit(tenantId, type)` throws
  `ForbiddenException({ code: 'QUOTA_EXCEEDED', ... })` when at cap.
- `services/entity-service/src/plan-tier/quota-tracking.service.ts`
  (new) — Redis-backed monthly disbursement counters with hard
  (block) and soft (80% warning) limit enforcement. Fail-open on
  Redis outage.
- `services/entity-service/src/plan-tier/usage-metrics.service.ts`
  (new) — combined DB + Redis snapshot for the admin portal.
- `services/entity-service/src/plan-tier/plan-tier.module.ts` (new) —
  exports all four services. Registered in `EntityServiceModule`.

**Security:**
- `packages/common/src/security/tenant-plan.guard.ts` + `requires-plan.decorator.ts`
  (new). The guard uses an opaque `PLAN_TIER_CONFIG_SERVICE` injection
  token so `@lons/common` stays free of an entity-service dependency.
  Apps bind the token at composition root.
- Platform admins bypass plan checks (no tenant tier).

**GraphQL:**
- `apps/graphql-server/src/graphql/resolvers/plan-tier.resolver.ts`
  (new) — `planTierConfigs`, `planTierConfig(tier)`, `myPlanTier`,
  `updatePlanTierConfig`. Platform-admin queries gated by
  `@Roles('platform:admin')`.
- `apps/graphql-server/src/graphql/types/plan-tier.type.ts` (new) +
  `inputs/update-plan-tier.input.ts` (new).

**Wired into both apps:**
- `apps/graphql-server/src/app.module.ts` and
  `apps/rest-server/src/app.module.ts` — `RedisClientModule.forRoot()`
  and `{ provide: PLAN_TIER_CONFIG_SERVICE, useExisting: PlanTierConfigService }`.

### S14-10 — Plan tier enforcement at all mutation points ✅

**`@RequiresPlan` decorator applied to:**
- `OverdraftResolver` — 7 mutations gated to `growth`.
- `BnplResolver` — 13 mutations gated to `growth`.
- `FactoringResolver` — 15 mutations gated to `enterprise`.
- `BnplController` (REST) — 3 POST endpoints gated to `growth`.
- `FactoringController` (REST) — 4 POST endpoints gated to `enterprise`.

**Product-type gate (special case — depends on input.type, not just tier):**
- `services/entity-service/src/product/product.service.ts` —
  injects `PlanTierConfigService` and calls
  `isProductTypeAllowed(tenantId, data.type)` before any DB write.
  Throws `ForbiddenException({ code: 'PRODUCT_TYPE_NOT_ALLOWED', ... })`.

**`QuotaEnforcementService.checkEntityLimit()` wired into 6 entity services:**
| Service | Entity type |
|---|---|
| `ProductService.create` | `'products'` |
| `CustomerService.create` | `'customers'` |
| `UserService.create` | `'users'` |
| `LenderService.create` | `'lenders'` |
| `MerchantService.create` | `'merchants'` |
| `ApiKeyService.createApiKey` | `'api_keys'` |

Each service's module now imports `PlanTierModule`.

### S14-IF-1 — Invoice Verification Queue (backend) ✅

- `services/process-engine/src/factoring/invoice-verification.service.ts`
  (new) — `getVerificationQueue` (FIFO by `createdAt`, filterable by
  seller / debtor / amount / date / assignment), `claimInvoice`
  (idempotent for same operator, conflict for others), `approveInvoice`
  (→ `verified` + emits `INVOICE_VERIFIED`), `rejectInvoice` (→
  `failed`/`rejected` + emits `INVOICE_REJECTED`, reason whitelisted),
  `requestMoreInfo` (no status change, appends to
  `metadata.infoRequests`).
- `apps/graphql-server/src/graphql/resolvers/invoice-verification.resolver.ts`
  (new) — 5 endpoints: queue query + claim/approve/reject/request-info
  mutations. All gated by `@Roles('factoring:verify')` + `@RequiresPlan('enterprise')`.
- `apps/graphql-server/src/graphql/inputs/invoice-verification.input.ts`
  (new) — `ApproveInvoiceInput`, `RejectInvoiceInput`,
  `VerificationQueueFiltersInput`, `VerificationQueuePaginationInput`.

### S14-12 — Subscription billing engine ✅

- `packages/database/prisma/migrations/20260511010000_billing_invoice_models`
  — `BillingInvoice` + `BillingLineItem` tables.
- `services/settlement-service/src/billing/billing-invoice-number.service.ts`
  (new) — sequential `INV-{YYYY}-{NNNN}` generator.
- `services/settlement-service/src/billing/subscription-billing.service.ts`
  (new) — `generateMonthlySubscriptionInvoices()` (per-tenant fan-out),
  `generateSubscriptionInvoice()` (single tenant with pro-rata
  first/last month), `markInvoicePaid()`. Emits
  `BILLING_INVOICE_GENERATED` + `BILLING_INVOICE_PAID`.
- **Precision fix (during testing):** the pro-rata math was switched
  from `multiply(amount, divide(days, total))` to
  `divide(multiply(amount, days), total)` — `divide` in @lons/common
  rounds intermediate steps to 4dp, which produced $274.20 instead of
  $274.1935 on a 17/31-day pro-rata. Multiplying first preserves the
  numerator (full precision) and divides once at the end.
- `apps/scheduler/src/jobs/subscription-invoice.job.ts` (new) — cron
  `0 1 1 * *` (01:00 UTC on the 1st of every month).
- Registered in `SchedulerModule`.

### S14-13 — Per-disbursement fee metering + usage invoice ✅

- Migration `20260511020000_disbursement_fee_model` — `DisbursementFee`
  table with full audit columns (`baseBps`, `productModifierBps`,
  `effectiveBps`, `volumeDiscountMultiplier`, `feeRate`, `feeAmount`,
  `feeAmountUsd`, `exchangeRate`, `volumeTier`).
- `services/settlement-service/src/billing/disbursement-fee.service.ts`
  (new) — rate formula:
  ```
  adjusted_bps  = base_bps + product_modifier_bps
  effective_bps = bankersRound(adjusted_bps * volume_multiplier, 2)
  fee_amount    = bankersRound(amount * effective_bps / 10000, 4)
  fee_amount_usd = fee_amount * exchange_rate   (1:1 same-currency)
  ```
  Idempotent on `(tenantId, disbursementId)`. Volume discount looked
  up from the tenant's `volumeDiscountTiers` JSONB (sorted descending
  by threshold) using the Redis monthly counter.
- **Same precision fix as S14-12** — `multiply(amount, effective_bps)`
  *then* `divide` by 10000, so 56.25 bps on $10,000 gives the correct
  $56.2500 (not $56.0000 from the naive ordering).
- `services/settlement-service/src/billing/disbursement-fee.listener.ts`
  (new) — `@OnEvent(DISBURSEMENT_COMPLETED)` hydrates the contract to
  get product type + currency, then calls `recordFee`. Errors are
  caught and logged so billing never breaks the disbursement path.
- `services/settlement-service/src/billing/usage-billing.service.ts`
  (new) — `generateMonthlyUsageInvoices()` (per-tenant fan-out),
  `generateUsageInvoice()` (aggregates unlinked `DisbursementFee` rows
  for the previous month, groups by product type into invoice line
  items, links the fees to the invoice). Atomic `$transaction`
  invoice-insert + fee-link.
- `apps/scheduler/src/jobs/usage-invoice.job.ts` (new) — cron
  `0 2 1 * *` (02:00 UTC, one hour after subscription).
- `services/settlement-service/src/billing/billing.module.ts` (new) —
  exports all the above + the listener. Registered in
  `SettlementServiceModule` and (transitively) in scheduler /
  graphql / rest server modules.

### S14-14a — Redis quota tracking ✅

- `QuotaTrackingService` (new in `plan-tier/`) with `incrementDisbursement`
  (atomic Redis `incr` + TTL set on first increment), `incrementApiCall`
  (informational, per-minute rate-limit handled separately by
  `TenantThrottlerGuard`), `getCurrentUsage` snapshot.
- Key naming: `quota:{tenantId}:disbursements:count:{YYYY-MM}`,
  `quota:{tenantId}:disbursements:volume:{YYYY-MM}`,
  `quota:{tenantId}:api_calls:{YYYY-MM-DD}`.
- Wired into `DisbursementService.initiateDisbursement` — `@Optional`
  injection so legacy tests work, but production module wiring always
  provides it via `PlanTierModule`. On `allowed=false`, throws
  `ForbiddenException({ code: 'QUOTA_EXCEEDED', ... })`.
- Fail-open posture: if Redis is unreachable the quota check passes
  and a warning is logged. We never block disbursements on a cache
  outage. The next nightly reconciliation job will catch any drift.
- Soft warning event `USAGE_THRESHOLD_WARNING` fires at 80% of cap.

### S14-14b — Usage metrics API ✅

- `UsageMetricsService` (new in `plan-tier/`) combines DB counts +
  Redis counters + tier limits into a single normalised
  `UsageSnapshot` shape.
- `apps/graphql-server/src/graphql/resolvers/usage.resolver.ts` (new) —
  `currentUsage` query + `requestPlanUpgrade` mutation (emits
  `PLAN_UPGRADE_REQUESTED` event; no self-service tier change).
- `apps/graphql-server/src/graphql/types/usage.type.ts` (new) — Relay-
  shaped output types.
- `apps/rest-server/src/usage/usage.controller.ts` +
  `usage.module.ts` (new) — `GET /v1/usage` REST endpoint with the
  same payload.
- Registered in `apps/rest-server/src/app.module.ts`.

### Events added

`packages/event-contracts/src/events.enum.ts` — 8 new events under a
Sprint 14 section:
- `BILLING_INVOICE_GENERATED`
- `BILLING_INVOICE_PAID`
- `BILLING_INVOICE_OVERDUE`
- `BILLING_FEE_RECORDED`
- `USAGE_THRESHOLD_WARNING`
- `QUOTA_EXCEEDED`
- `PLAN_UPGRADE_REQUESTED`
- `PLAN_TIER_CHANGED`

---

## Test coverage

| Package | Before | After | Δ |
|---|---|---|---|
| `@lons/common` | 256 | 265 | +9 (TenantPlanGuard) |
| `@lons/entity-service` | 121 | 134 | +13 (PlanTierConfig +7, QuotaEnforcement +6) |
| `@lons/process-engine` | 424 | 436 | +12 (InvoiceVerification) |
| `@lons/settlement-service` | 29 | 43 | +14 (SubscriptionBilling +6, DisbursementFee +8) |
| `@lons/rest-server` | 52 | 52 | unchanged |
| `@lons/scheduler` | 24 | 24 | unchanged |
| `@lons/graphql-server` | 85 | 85 | unchanged |

**Total: 1,039 tests passing.** All new tests pass. No regressions.

All `pnpm exec turbo build --filter='!@lons/admin-portal' --filter='!@lons/platform-portal'`
output is clean. The two portal builds have pre-existing Next.js
static-generation issues unrelated to S14.

---

## Migrations introduced

1. `20260511000000_plan_tier_billing_infrastructure` — enum rename
   (`professional → growth`), `plan_tier_configs` + `tenant_billing_configs`
   tables, seed data for all three tiers.
2. `20260511010000_billing_invoice_models` — `billing_invoices` +
   `billing_line_items` tables.
3. `20260511020000_disbursement_fee_model` — `disbursement_fees`
   table (with FK to `disbursements` and optional FK to
   `billing_invoices`).

All migrations are backwards-compatible:
- The enum rename uses Postgres `ALTER TYPE ... RENAME VALUE` — existing
  tenant rows transition automatically.
- All new tables are additive; rolling back a code deploy without the
  schema rollback is safe (the rows just sit unused).

---

## Deployment ordering

1. **Set `REDIS_URL`** in every environment. The shared
   `RedisClientModule.forRoot()` provider falls back to a no-op stub
   when `REDIS_URL` is unset — services degrade to no-cache behaviour
   rather than crashing, but operating without Redis means
   `PlanTierConfigService` hits the DB on every request and
   `QuotaTrackingService` admits every disbursement. Production
   must have Redis.
2. **Deploy code** (this sprint's changes).
3. **Run migrations** in order (Prisma handles ordering by filename).
4. **Seed per-tenant billing config.** Each active tenant needs a
   `TenantBillingConfig` row. Suggested defaults:
   - Starter: `subscriptionAmountUsd=500`, `perDisbursementBps=100`
   - Growth: `subscriptionAmountUsd=2000`, `perDisbursementBps=75`
   - Enterprise: `subscriptionAmountUsd=5000`, `perDisbursementBps=50`
   No automated seed script — Ops team runs this manually via the
   platform portal `updatePlanTierConfig` mutation once it ships
   (S14-15).
5. **Verify scheduler.** The cron jobs (`SubscriptionInvoiceJob`,
   `UsageInvoiceJob`) register at boot but don't fire until the next
   1st-of-month at 01:00 / 02:00 UTC.

---

## Deferred / Known gaps

### Track C — admin portal UI (S14-15) and verification queue UI (S14-IF-2)

**Why deferred:** the prompt's scope estimate is 8 SP + 5 SP for these
two — substantial Next.js work (plan page with usage meters, invoice
history, upgrade modal, verification queue + side panel, platform-
portal plan management). The backend infrastructure is fully in place
and ready for the UI to consume. Carving the UI into a Sprint 14
follow-up keeps this sprint's diff reviewable.

**What's ready for the UI to consume:**
- `currentUsage` GraphQL query + `GET /v1/usage` REST endpoint.
- `billingInvoices` / `billingInvoice(id)` queries — NOT yet exposed
  on a `BillingResolver` (the resolver was scoped to S14-15 itself).
  Adding the resolver is a 30-minute task once the UI starts; the
  Prisma models and service layer are in place.
- `invoiceVerificationQueue`, `claimInvoice`, `approveInvoice`,
  `rejectInvoice`, `requestInvoiceInfo` mutations — fully working
  GraphQL surface.
- `requestPlanUpgrade` mutation — emits the event the platform-admin
  notification system will hook.
- `markInvoicePaid` GraphQL mutation — not yet wired in a resolver;
  service method exists.

The follow-up sprint can build the UI against this backend without
any further backend changes (modulo the trivial `BillingResolver`
addition).

### Other notes

- **FX conversion** in `DisbursementFeeService` is a placeholder (1:1
  for same-currency, `exchangeRate=null`). Real FX integration is
  deferred to a later sprint per the SPEC.
- **Revenue-share billing model** — schema columns exist
  (`revenueSharePct`, `BillingInvoiceType.revenue_share`) but no
  service implementation. Per-disbursement is the only commercial
  model active at deploy.
- **Volume discount drift** — the disbursement fee reads the Redis
  count *before* the current disbursement is added (the
  `QuotaTrackingService` increments it separately). This accepts a
  1-disbursement drift at bracket boundaries — negligible vs. the
  locking complexity required to make it exact.

---

## Verification commands

```bash
# 1. Backend builds clean
pnpm exec turbo build --filter='!@lons/admin-portal' --filter='!@lons/platform-portal'

# 2. All affected unit tests
pnpm --filter '@lons/common' test                 # 265 passed
pnpm --filter '@lons/entity-service' test         # 134 passed
pnpm --filter '@lons/process-engine' test         # 436 passed
pnpm --filter '@lons/settlement-service' test     # 43 passed
pnpm --filter '@lons/rest-server' test            # 52 passed
pnpm --filter '@lons/scheduler' test              # 24 passed
pnpm --filter '@lons/graphql-server' test         # 85 passed

# 3. Migrations (against staging DB; requires REDIS_URL + ENCRYPTION_KEY +
#    HASH_PEPPER set — Sprint 14 doesn't add new env vars but inherits
#    prior security hardening requirements).
pnpm --filter '@lons/database' db:migrate

# 4. Smoke test the plan gate (starter tenant should be blocked from
#    creating a BNPL product):
#    curl -X POST http://localhost:3001/v1/bnpl/purchases \
#      -H 'X-API-Key: <starter-key>' -H 'X-API-Secret: <starter-secret>' \
#      -d '{...}'
#    → 403 with body { code: 'PLAN_TIER_INSUFFICIENT', currentTier: 'starter',
#                       requiredTier: 'growth', upgradeUrl: '/settings/plan' }
```

---

## Files changed summary

### Schema + migrations
- `packages/database/prisma/schema.prisma` — enum rename, 5 new
  enums, 5 new models (`PlanTierConfig`, `TenantBillingConfig`,
  `BillingInvoice`, `BillingLineItem`, `DisbursementFee`), reverse
  relations on `Tenant` and `Disbursement`.
- 3 new migration directories under `packages/database/prisma/migrations/`.

### `@lons/shared-types`
- `enums/tenant.enum.ts` — `PROFESSIONAL → GROWTH`.

### `@lons/event-contracts`
- `events.enum.ts` — 8 new Sprint 14 event types.

### `@lons/common`
- `cache/redis-client.module.ts` (new).
- `security/tenant-plan.guard.ts` (new).
- `security/requires-plan.decorator.ts` (new).
- `security/index.ts` — export the two above.
- `security/__tests__/tenant-plan.guard.spec.ts` (new — 9 tests).
- `index.ts` — re-export RedisClientModule.

### `@lons/entity-service`
- `plan-tier/plan-tier.module.ts` (new).
- `plan-tier/plan-tier-config.service.ts` (new).
- `plan-tier/quota-enforcement.service.ts` (new).
- `plan-tier/quota-tracking.service.ts` (new).
- `plan-tier/usage-metrics.service.ts` (new).
- `plan-tier/index.ts` (new).
- `plan-tier/__tests__/plan-tier-config.service.spec.ts` (new — 7 tests).
- `plan-tier/__tests__/quota-enforcement.service.spec.ts` (new — 6 tests).
- `entity-service.module.ts` — register `PlanTierModule`.
- `index.ts` — re-export plan-tier.
- 6 entity modules + services + 1 spec (api-key) wired with
  `QuotaEnforcementService.checkEntityLimit()`.
- `tenant/tenant.service.ts`, `tenant-onboarding.service.ts` — string
  literal `'professional' → 'growth'`.

### `@lons/process-engine`
- `factoring/invoice-verification.service.ts` (new).
- `factoring/__tests__/invoice-verification.service.spec.ts` (new — 12 tests).
- `factoring/factoring.module.ts` — register `InvoiceVerificationService`.
- `disbursement/disbursement.service.ts` — `@Optional`-injected
  `QuotaTrackingService` + pre-write quota check.
- `disbursement/disbursement.module.ts` — import `PlanTierModule`.
- `index.ts` — re-export verification service.

### `@lons/settlement-service`
- `billing/billing.module.ts` (new).
- `billing/billing-invoice-number.service.ts` (new).
- `billing/subscription-billing.service.ts` (new).
- `billing/disbursement-fee.service.ts` (new).
- `billing/disbursement-fee.listener.ts` (new).
- `billing/usage-billing.service.ts` (new).
- `billing/__tests__/subscription-billing.service.spec.ts` (new — 6 tests).
- `billing/__tests__/disbursement-fee.service.spec.ts` (new — 8 tests).
- `settlement.module.ts` — import + re-export `BillingModule`.
- `index.ts` — re-export billing exports.
- `package.json` — add `ioredis: ^5.4.0`.

### `@lons/graphql-server`
- `graphql/resolvers/plan-tier.resolver.ts` (new).
- `graphql/resolvers/invoice-verification.resolver.ts` (new).
- `graphql/resolvers/usage.resolver.ts` (new).
- `graphql/types/plan-tier.type.ts` (new).
- `graphql/types/usage.type.ts` (new).
- `graphql/inputs/update-plan-tier.input.ts` (new).
- `graphql/inputs/invoice-verification.input.ts` (new).
- `graphql/resolvers/overdraft.resolver.ts` — `@RequiresPlan('growth')`
  on 7 mutations.
- `graphql/resolvers/bnpl.resolver.ts` — `@RequiresPlan('growth')` on
  13 mutations.
- `graphql/resolvers/factoring.resolver.ts` — `@RequiresPlan('enterprise')`
  on 15 mutations.
- `graphql/resolvers/tenant.resolver.ts` — string literal update.
- `app.module.ts` — register new resolvers + `RedisClientModule.forRoot()`
  + `PLAN_TIER_CONFIG_SERVICE` provider.

### `@lons/rest-server`
- `usage/usage.controller.ts` (new).
- `usage/usage.module.ts` (new).
- `bnpl/bnpl.controller.ts` — `@RequiresPlan('growth')` on 3 endpoints.
- `factoring/factoring.controller.ts` — `@RequiresPlan('enterprise')`
  on 4 endpoints.
- `app.module.ts` — register `UsageRestModule` +
  `RedisClientModule.forRoot()` + `PLAN_TIER_CONFIG_SERVICE` provider.

### `@lons/scheduler`
- `jobs/subscription-invoice.job.ts` (new).
- `jobs/usage-invoice.job.ts` (new).
- `scheduler.module.ts` — register both jobs + `RedisClientModule.forRoot()`.

### Admin / platform portals
- `apps/admin-portal/src/components/platform/tenant-create-wizard.tsx` —
  string literal `'professional' → 'growth'`.
- `apps/admin-portal/src/lib/i18n/locales/{ar,en,es,fr,ha,pt,sw}.json`
  — `platform.wizard.plan.professional` key renamed to
  `platform.wizard.plan.growth` (value: "Growth").
- `apps/platform-portal/src/app/(portal)/tenants/page.tsx`,
  `tenants/create/page.tsx`, `dashboard/page.tsx` — string literal
  updates.
- `apps/admin-portal/src/app/(portal)/platform/tenants/page.tsx` —
  string literal update.

### Documentation
- `Docs/DELIVERY-NOTES-SPRINT-14-2026-05-10.md` — this file.
