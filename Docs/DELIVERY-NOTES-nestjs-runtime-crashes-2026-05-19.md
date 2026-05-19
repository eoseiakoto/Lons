# Delivery — NestJS Runtime Crashes — 2026-05-19

**Branch:** `main`
**Source:** `Docs/DE-NOTE-nestjs-runtime-crashes.md` (DE bug note)
**Severity:** All three NestJS backend services unable to start.

## Outcome

```
  graphql-server: ✅ started
  rest-server:    ✅ started (:3001)
  scheduler:      ✅ started (port 3003)
```

Tests: entity-service 265, integration-service 265, graphql-server 89, rest-server 52, scheduler 49 — all green. No regressions.

---

## What the DE flagged + extra bugs uncovered

The DE note listed two specific DI crashes. Boot verification exposed three more failures behind them. All five are fixed.

### 1. DE-Issue-1 — `EmiDataService` primitive constructor params

**Files:**
- `services/integration-service/src/emi-data/emi-data.constants.ts` (new)
- `services/integration-service/src/emi-data/emi-data.service.ts`
- `services/integration-service/src/emi-data/emi-data.module.ts`

NestJS resolves DI from TypeScript's emitted `design:paramtypes` metadata. Primitives emit as `Number` / `Object`, which are not valid injection tokens. Default parameter values do *not* act as fallbacks — the injector throws before the default ever runs. Took the DE note's "Option A": explicit `@Inject()` tokens (`EMI_CACHE_TTL_MS`, `EMI_RETRY_OPTIONS`) with `useValue` providers wired in `EmiDataModule`. Positional construction (`new EmiDataService(adapter, prisma, ttl, retry)` in the spec file) still works unchanged.

### 2. DE-Issue-2 — `UsageRestModule` missing `EntityServiceModule`

**File:** `apps/rest-server/src/usage/usage.module.ts`

`@UseGuards(ApiKeyGuard)` resolves its dependencies in the declaring module's DI context, not at the app level. Same pattern as the BNPL fix. Added `EntityServiceModule` to the module's `imports`. Confirmed every other rest-server module using the guard already does this.

### 3. *(cascade)* `TenantPlanGuard` couldn't resolve `Symbol(PLAN_TIER_CONFIG_SERVICE)` in `BnplRestModule` and `FactoringRestModule`

**File:** `services/entity-service/src/plan-tier/plan-tier.module.ts`

Surfaced once Issue 2 was fixed. The token was only bound in each app's composition-root `app.module.ts`; sub-modules couldn't see it. `PlanTierModule` already exports the underlying `PlanTierConfigService` class but never the symbol token, so `@RequiresPlan`-decorated controllers (which auto-attach `TenantPlanGuard`) crashed. Bound `PLAN_TIER_CONFIG_SERVICE` to `useExisting: PlanTierConfigService` inside `PlanTierModule.providers` and exported it. Now flows transitively through every module that imports `EntityServiceModule`.

### 4. *(cascade)* graphql-server schema-builder `UndefinedTypeError` on `string | null` fields

**Files:**
- `apps/graphql-server/src/graphql/inputs/update-plan-tier.input.ts`
- `apps/graphql-server/src/graphql/types/usage.type.ts`
- `apps/graphql-server/src/graphql/types/plan-tier-dashboard.type.ts`

TypeScript collapses `string | null` to `Object` in the metadata it emits, and `@Field({ nullable: true })` can't recover the original type. Six fields across three files were affected (`maxMonthlyDisbursementVolumeUsd`, `contractStartDate`/`End`, `limit`, `reason`). Switched each to explicit `@Field(() => String, { nullable: true })`. Scan for remaining `string|number|boolean | null` fields with implicit `@Field` decorators afterwards: zero hits.

### 5. *(cascade)* rest-server BullMQ `"Worker requires a connection"`

**File:** `apps/rest-server/src/app.module.ts`

The rest-server transitively pulls in `@Processor()`-decorated workers via `ProcessEngineModule → DisbursementModule → PipelineRetryModule`. Without `BullModule.forRoot({ connection })` registered at the composition root, BullMQ's worker registrar throws at module-init. graphql-server and scheduler get this transitively through `NotificationServiceModule`; rest-server didn't import it. Added the same `NotificationServiceModule` import (already a workspace dep), no new packages needed.

### 6. *(cascade)* graphql schema name collision — `MicroLoanCreditLimitChangeType`

**File:** `apps/graphql-server/src/graphql/types/micro-loan.type.ts`

A `registerEnumType(...)` was registering an enum with the same name as a sibling `@ObjectType()` class — GraphQL requires unique type names. Renamed the enum's schema name to `MicroLoanCreditLimitChangeKind` (more accurate — the enum is the *kind* of change). No admin-portal consumers reference either name yet, so no further changes needed.

---

## Verification

```bash
# All three apps boot successfully
pkill -f "node.*dist/main"; for s in graphql-server rest-server scheduler; do
  pnpm --filter $s start > /tmp/lons-boot/$s.log 2>&1 &
done
# → all three log "Nest application successfully started"

# Tests pass on every touched package
pnpm --filter @lons/entity-service test       # 265/265
pnpm --filter @lons/integration-service test  # 265/265
pnpm --filter graphql-server test             # 89/89
pnpm --filter @lons/rest-server test          # 52/52
pnpm --filter scheduler test                  # 49/49
```

---

## Note for follow-up

The DE note's title called out "Dependency Injection Crashes", but only the first two issues are pure DI. Issues 4–6 are GraphQL schema-builder and BullMQ-registrar bugs that the DE wouldn't have seen because each is masked by the DI crash before it. The five fixes together are what's needed to actually get the services running. The DE may want to re-run their environment to confirm the end-to-end boot.
