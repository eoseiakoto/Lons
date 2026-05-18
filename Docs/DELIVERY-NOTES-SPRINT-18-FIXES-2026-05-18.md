# Sprint 18 PM-Review Fix Delivery — 2026-05-18

**Branch:** `claude/hopeful-haibt-32d778`
**Spec:** `Docs/DEV-PROMPT-SPRINT-18-FIXES.md`
**Scope:** 11 fixes (1× P1, 10× P2). All complete.

---

## TL;DR

All 11 PM-review findings closed. Test suites pass:

| Package | Suites | Tests |
|---|---|---|
| `@lons/process-engine` | 57 ✓ | 632 ✓ |
| `@lons/entity-service` | 25 ✓ | 265 ✓ |
| `@lons/graphql-server` | 9 ✓ | 85 ✓ |

`graphql-server` and `process-engine` builds clean (after rebuilding `@lons/entity-service` / `@lons/integration-service` to refresh `.d.ts` declarations consumed across workspace boundaries). Admin-portal lint shows only pre-existing import-order warnings in unrelated files.

---

## Fixes

### FIX-1 (P1) — Idempotency key regenerated per mount + per successful submit
**Finding:** F-S18-FIX-1
**Files:** `apps/admin-portal/src/app/(portal)/loans/contracts/[id]/page.tsx`

Replaced the deterministic `mp:${c.id}:${input.paymentRef}` idempotency key with a per-mount UUID (`paymentIdemKey` state + `regeneratePaymentIdemKey()`). New UUID is minted (a) when the payment panel opens and (b) after every successful submit. Prevents accidental replays from collapsing distinct user-initiated payments onto the same row.

### FIX-2 (P2) — DB fallback status list includes every operator-approved downstream state
**Finding:** F-S18-FIX-2
**Files:**
- `services/process-engine/src/approval/approval-limit.service.ts`
- `services/process-engine/src/approval/approval-limit.service.spec.ts`

Expanded the count-as-today-approved list from 5 statuses to 10 (`approved`, `offer_sent`, `accepted`, `disbursing`, `disbursed`, `declined`, `expired`, `contract_created`, `disbursement_failed`, `cancelled`). Added an inline state-machine flow diagram in the source explaining why each is downstream of an approve action. Added the test `'DB fallback counts every status downstream of an approve action'` which pins the exact list and asserts `rejected`/`escalated` are NOT in it. 18/18 tests pass.

### FIX-3 (P2) — Plan-tier quota counter rolled back on permanent disbursement failure
**Finding:** F-S18-FIX-3
**Files:**
- `services/entity-service/src/plan-tier/quota-tracking.service.ts` — new method `decrementDisbursement(tenantId, amountUsd)` (DECR count clamped at 0, INCRBYFLOAT volume with negated amount clamped at 0; best-effort logging on Redis failure).
- `services/process-engine/src/disbursement/disbursement.service.ts` — rollback path now calls `quotaTrackingService.decrementDisbursement(tenantId, String(contract.principalAmount))` after restoring `subscription.availableLimit`.
- `services/process-engine/src/disbursement/disbursement.service.spec.ts` — new test `'S18-FIX-3: decrements plan-tier quota counter on permanent failure'`.

Pre-fix, the rollback only restored the subscription limit; the Redis count + volume counters stayed inflated by the failed attempt and the tenant lost monthly headroom they hadn't actually used.

### FIX-4 (P2) — `usageHistory` accessible to all plan tiers
**Finding:** F-S18-FIX-4
**File:** `apps/graphql-server/src/graphql/resolvers/billing.resolver.ts`

Removed `@RequiresPlan('growth')` from the `usageHistory` Query. Every tenant should be able to audit their own billing regardless of tier. The `@RequiresPlan` import remains in use by 3 other queries in the same file. Inline comment explains the rationale.

### FIX-5 (P2) — Sidebar surfaces Settings → API Keys / Billing
**Finding:** F-S18-FIX-5
**Files:**
- `apps/admin-portal/src/components/layout/sidebar.tsx` — new "Settings" section with `Key` and `CreditCard` lucide icons routing to `/settings/api-keys` and `/settings/billing`.

### FIX-6 (P2) — All Sprint 18 admin-portal pages have i18n keys in all 7 locales
**Finding:** F-S18-FIX-6
**Files:** `apps/admin-portal/src/lib/i18n/locales/{en,fr,es,sw,ar,ha,pt}.json` plus source updates in `apps/admin-portal/src/app/(portal)/loans/applications/{page,[id]/page}.tsx`.

Hand-curated translations across all 7 locales for ~120 Sprint 18 keys (API keys, billing, EMI settings, factoring queue, application review, contract management). Resolved a JSON structural conflict where `loans.review.approve` was being used both as a button-label string and as a parent object for modal field labels — promoted button labels to `loans.review.button.{approve,reject,escalate,modifyTerms}` and updated source code references. Final scan: **0 missing keys across all 7 locales**.

### FIX-7 (P2) — Pipeline audit trail integration spec
**Finding:** F-S18-7-1
**File:** `services/process-engine/src/pipeline/__tests__/pipeline-audit.integration.spec.ts` (new)

3 test cases inside `describe('Pipeline Audit Trail (integration)')`:
1. Full pipeline run writes one `pipeline_step_logs` row per canonical step (6 steps from `PIPELINE_STEP_CONFIGS`) with correct `stepName`, `outcome='success'`, `durationMs>=0`, non-null `inputs`, and stepOrder ordering.
2. A step that throws produces a row with `outcome='error'`, matching `errorMessage` + `errorCode`.
3. `getStepsForLoanRequest(tenantA, ...)` returns only tenantA rows — verifies `tenantId` is in the where-clause so the DB-level RLS policy can match. 3/3 pass.

### FIX-8 (P2) — Pipeline log duplication on retry resolved
**Finding:** F-S18-12-1
**Files:**
- `services/process-engine/src/pipeline/pipeline-step-logger.service.ts` — exports `pipelineLogSuppressionContext` (`AsyncLocalStorage`); `executeAndLog` checks `getStore()?.suppress` and skips its own log on retry.
- `services/process-engine/src/pipeline/pipeline-retry.worker.ts` — wraps `executeStep(...)` in `pipelineLogSuppressionContext.run({ suppress: true, reason: 'retry' }, ...)` so the worker's `${step}_retry` row is the single source of truth per retry attempt.
- `services/process-engine/src/pipeline/pipeline-step-logger.service.spec.ts` — new describe block with 3 tests confirming suppression on success, failure, and absence outside the context.
- `services/process-engine/src/pipeline/pipeline-retry.worker.spec.ts` — new describe block confirming the worker runs the step inside the context and emits exactly one row.

`AsyncLocalStorage` was chosen over threading an `options` flag through 6 service method signatures — same idiom as the existing `requestContext` in `@lons/common/observability`.

### FIX-9 (P2) — `portfolioMetrics` resolver accepts and forwards filter args
**Finding:** F-C-1
**Files:**
- `services/process-engine/src/analytics/analytics.service.ts` — new `PortfolioMetricsFilters` interface; `getPortfolioMetrics(tenantId, filters = {})` ANDs `productId`, `productType` (via `product.is`), `lenderId`, `region`/`customerSegment` (via `customer.is`), and `dateFrom`/`dateTo` into the contract.findMany where clause.
- `apps/graphql-server/src/graphql/resolvers/collections.resolver.ts` — new `PortfolioMetricsFilterInput` GQL input type; resolver accepts `@Args('filter', { nullable: true })` and parses date strings to `Date` before forwarding.

### FIX-10 (P2) — `WALLET_ADAPTER` production override wired
**Finding:** F-D-4
**Files:**
- `services/integration-service/src/adapters/tenant-aware-wallet.adapter.ts` (new) — `TenantAwareWalletAdapter` implements `IWalletAdapter`; resolves the per-tenant adapter via `WalletAdapterResolver.resolve(getTenantId())` for every method call. Throws loudly if no tenant is in the AsyncLocalStorage `requestContext` (fails-loud beats silent mock fallback).
- `services/integration-service/src/integration-service.module.ts` — adapter added to providers + exports.
- `services/integration-service/src/index.ts` — adapter re-exported.
- `apps/graphql-server/src/app.module.ts` — new provider `{ provide: WALLET_ADAPTER, useExisting: TenantAwareWalletAdapter }` matches the existing SCREENING_GATE / CREDIT_BUREAU_GATEWAY / PAYMENT_SERVICE_FOR_MANUAL_PAYMENT pattern.

Tests still pick up the `DisbursementModule` default `MockWalletAdapter` via standard NestJS test-module isolation.

### FIX-11 (P2) — `PlanTierConfig` seed data
**Finding:** F-S18-11-C
**File:** `packages/database/prisma/seed.ts`

New `[1.5/8]` step before the tenant loop upserts 3 tier configs (`starter`, `growth`, `enterprise`) per `Docs/SPEC-plan-tiers.md` §2 — allowedProductTypes, operational limits, featureFlags, API access, brandingOptions. Keyed on `tier @unique` so re-running the seed is idempotent.

---

## Verification

```bash
pnpm --filter @lons/process-engine test         # 57 suites, 632 tests
pnpm --filter @lons/entity-service test         # 25 suites, 265 tests
pnpm --filter graphql-server build              # OK
pnpm --filter graphql-server test               # 9 suites, 85 tests
node -e "<i18n missing-key scan>"               # 0 missing across en/fr/es/sw/ar/ha/pt
```

Admin-portal lint shows only pre-existing import/order warnings + 1 unrelated unused-`t` error in `loans/factoring/queue/page.tsx` (not touched by this fix bundle).

## Cross-package build note

After modifying public surfaces in `@lons/entity-service` (FIX-3) and `@lons/process-engine` (FIX-9 type export), the corresponding `dist/.d.ts` files had to be rebuilt before downstream packages (`graphql-server`) would type-check. CI's monorepo build order handles this; the dev loop here required explicit `pnpm --filter <pkg> build` steps in order.
