# DE Note: NestJS Services — Runtime Dependency Injection Crashes

**Date:** 2026-05-19
**Reported by:** DE (Deployment Engineer)
**Severity:** Service startup blocker (GraphQL, REST, Scheduler all fail to start)

---

## Summary

All three NestJS backend services compile successfully (`0 errors`) but crash at runtime during NestJS dependency injection. The services fail to start on their assigned ports, leaving only the Next.js portals and Scoring Service operational.

---

## Issue 1: EmiDataService — Uninjectable `number` Parameter

**Affects:** GraphQL Server (port 3000), Scheduler (port 3003)

**Error:**
> Nest can't resolve dependencies of the EmiDataService (EMI_DATA_ADAPTER, PrismaService, ?, Object, EventBusService). Please make sure that the argument Number at index [2] is available in the EmiDataModule context.

**File:** `services/integration-service/src/emi-data/emi-data.service.ts` (lines 47–57)

```typescript
constructor(
  @Inject(EMI_DATA_ADAPTER) private readonly adapter: IEmiDataAdapter,
  private readonly prisma: PrismaService,
  private readonly cacheTtlMs: number = 60 * 60 * 1000,   // ← index [2] — NestJS cannot resolve
  private readonly retryOptions: RetryOptions = DEFAULT_RETRY, // ← index [3] — same problem
  @Optional() private readonly eventBus?: EventBusService,
) {}
```

**Root cause:** NestJS uses TypeScript's emitted metadata to resolve constructor parameters. Primitive types (`number`, plain objects) emit as `Number` / `Object`, which are not valid injection tokens. Default parameter values do **not** act as fallbacks in NestJS DI — the injector tries to resolve the token first and fails before the default is ever reached.

**Module:** `services/integration-service/src/emi-data/emi-data.module.ts` — registers `EmiDataService` as a plain provider with no custom factory or value providers for these parameters.

**Suggested fix — pick one:**

A) **Use `@Inject()` with custom tokens** and provide values in the module:
```typescript
// emi-data.constants.ts
export const EMI_CACHE_TTL_MS = 'EMI_CACHE_TTL_MS';
export const EMI_RETRY_OPTIONS = 'EMI_RETRY_OPTIONS';

// emi-data.service.ts — constructor
@Inject(EMI_CACHE_TTL_MS) private readonly cacheTtlMs: number,
@Inject(EMI_RETRY_OPTIONS) private readonly retryOptions: RetryOptions,

// emi-data.module.ts — providers
{ provide: EMI_CACHE_TTL_MS, useValue: 60 * 60 * 1000 },
{ provide: EMI_RETRY_OPTIONS, useValue: DEFAULT_RETRY },
```

B) **Move config out of the constructor** — set them as class properties with defaults instead of constructor params, keeping the constructor DI-only.

---

## Issue 2: UsageRestModule — ApiKeyGuard Cannot Resolve ApiKeyService

**Affects:** REST Server (port 3001)

**Error:**
> Nest can't resolve dependencies of the ApiKeyGuard (?). Please make sure that the argument ApiKeyService at index [0] is available in the UsageRestModule context.

**Files:**
- Guard: `apps/rest-server/src/guards/api-key.guard.ts` — injects `ApiKeyService` from `@lons/entity-service`
- Controller: `apps/rest-server/src/usage/usage.controller.ts` — uses `@UseGuards(ApiKeyGuard)` at class level
- Module: `apps/rest-server/src/usage/usage.module.ts` — has no imports, only declares the controller

**Root cause:** `ApiKeyGuard` is not registered in any module's `providers` array. It's instantiated by NestJS at the controller level (via `@UseGuards`), and NestJS resolves its dependencies within the declaring module's context (`UsageRestModule`). Since `UsageRestModule` doesn't import `EntityServiceModule`, NestJS cannot provide `ApiKeyService` to the guard.

Note: `EntityServiceModule` **is** imported at the app level (`app.module.ts` line 53), but `ApiKeyService` is not a global provider — it's only available to modules that directly import `EntityServiceModule` or that have the guard registered in a module that does.

**Suggested fix:** Same pattern as the BNPL module fix (see `DE-NOTE-bnpl-rest-module-fix.md`):

```diff
// apps/rest-server/src/usage/usage.module.ts
+import { EntityServiceModule } from '@lons/entity-service';
+
 @Module({
+  imports: [EntityServiceModule],
   controllers: [UsageController],
 })
 export class UsageRestModule {}
```

---

## Secondary Symptom: "Cannot find module './app.module'"

After each initial DI crash, `nest start --watch` attempts to recompile. Because `nest-cli.json` has `"deleteOutDir": true`, it wipes the `dist/` folder before recompiling. The recompile fails (same DI errors), leaving an empty `dist/`. Subsequent restart attempts then fail with `Error: Cannot find module './app.module'`. This is a consequence of the above issues, not a separate bug.

---

## No Fix Applied

This note is for Dev awareness only. The DE has not modified any service code.
