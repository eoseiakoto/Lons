# Sprint 6 — Wiring Fix Instructions

> **Context**: Sprint 6 rebuild is code-complete at the component level. All utilities, services, guards, interceptors, and middleware exist and have tests. What remains is **wiring** — connecting these components into the NestJS runtime so they actually execute. This document lists 8 targeted fixes.
>
> **Deferred to Sprint 7**: Password validation wiring (`PasswordService.validateStrength()` into user creation) — no raw-password user registration endpoints exist yet.

---

## Fix 1: Wire PII Encryption Middleware into PrismaService

**Problem**: `createFieldEncryptionMiddleware()` exists in `packages/common/src/encryption/field-encryption.middleware.ts` and is fully tested — but `PrismaService.onModuleInit()` never calls `this.$use()` to register it. **Encryption is not active at runtime.**

**File to modify**: `packages/database/src/prisma.service.ts`

**Changes**:
1. Import `createFieldEncryptionMiddleware` and `createKeyProvider` from `@lons/common`.
2. In `onModuleInit()`, after `this.$connect()`, create the key provider and register the middleware:

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { createFieldEncryptionMiddleware, createKeyProvider } from '@lons/common';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();

    // Register PII field encryption middleware
    const keyProvider = createKeyProvider();
    this.$use(createFieldEncryptionMiddleware(keyProvider));
    this.logger.log('PII field encryption middleware registered');
  }

  // ... rest unchanged
}
```

**Also modify**: `packages/database/src/prisma.module.ts` — no changes needed; the key provider is instantiated inside PrismaService itself using the factory function. But do verify that `@lons/common` is listed as a dependency in `packages/database/package.json`. If not, add it:

```json
"dependencies": {
  "@lons/common": "workspace:*"
}
```

**Verification**: Write a quick integration test or add a log statement that encrypts + decrypts a value on startup to confirm the middleware is active.

---

## Fix 2: Wire Hash Chaining into AuditService.log()

**Problem**: `computeEntryHash()` exists in `packages/common/src/audit/audit-hash.util.ts` but `AuditService.log()` in `services/entity-service/src/audit/audit.service.ts` creates audit entries **without populating `entryHash` or `previousHash`**. The tamper-evident chain is broken.

**File to modify**: `services/entity-service/src/audit/audit.service.ts`

**Changes**:
1. Import `computeEntryHash` from `@lons/common`.
2. Before creating the audit entry, query the most recent entry for the same tenant to get `previousHash`.
3. After the Prisma `create()` returns (with the generated `id` and `createdAt`), compute the hash and update the record.

Alternatively (preferred — single write), use a Prisma `$transaction` to:
  a. Query the latest audit log entry for this tenant to get its `entryHash` as the `previousHash`.
  b. Create the new entry with a placeholder.
  c. Compute the hash using the generated `id`, `createdAt`, `action`, `resourceId`, and `previousHash`.
  d. Update the entry with `entryHash` and `previousHash`.

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, Prisma, ActorType } from '@lons/database';
import { computeEntryHash } from '@lons/common';

// ... AuditLogInput interface unchanged ...

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async log(input: AuditLogInput): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // 1. Get the previous entry's hash for this tenant
        const previousEntry = await tx.auditLog.findFirst({
          where: { tenantId: input.tenantId },
          orderBy: { createdAt: 'desc' },
          select: { entryHash: true },
        });
        const previousHash = previousEntry?.entryHash ?? null;

        // 2. Create the audit log entry
        const entry = await tx.auditLog.create({
          data: {
            tenantId: input.tenantId,
            actorId: input.actorId,
            actorType: input.actorType as ActorType,
            actorIp: input.actorIp,
            action: input.action,
            resourceType: input.resourceType,
            resourceId: input.resourceId,
            beforeValue: input.beforeValue ?? undefined,
            afterValue: input.afterValue ?? undefined,
            correlationId: input.correlationId,
            metadata: input.metadata ?? undefined,
            previousHash,
          },
        });

        // 3. Compute the hash and update the entry
        const entryHash = computeEntryHash(
          {
            id: entry.id,
            createdAt: entry.createdAt,
            action: entry.action,
            resourceId: entry.resourceId,
          },
          previousHash,
        );

        await tx.auditLog.update({
          where: { id: entry.id },
          data: { entryHash },
        });
      });
    } catch (error) {
      // Audit logging must never break the primary operation
      this.logger.error('Failed to write audit log', error);
    }
  }

  // ... findMany() unchanged ...
}
```

**Important**: The `auditLog` table schema already has `previousHash` and `entryHash` columns (CHAR(64)). Ensure they allow NULL for the first entry in a chain.

---

## Fix 3: Apply @AuditAction Decorators to All GraphQL Mutations

**Problem**: The `AuditEventInterceptor` only fires when it finds `@AuditAction()` metadata on a handler. Currently **zero** mutations have this decorator, so no audit logs are created automatically.

**Files to modify** (add `@AuditAction` decorator to each `@Mutation` method):

All resolvers are in `apps/graphql-server/src/graphql/resolvers/`. Each file needs:
```typescript
import { AuditAction, AuditActionType, AuditResourceType } from '@lons/common';
```

Here is the complete mapping. Apply `@AuditAction(action, resource)` immediately after each `@Mutation()` decorator:

| Resolver File | Method | Decorator |
|---|---|---|
| `customer.resolver.ts` | `createCustomer` | `@AuditAction(AuditActionType.CREATE, AuditResourceType.CUSTOMER)` |
| `customer.resolver.ts` | `updateCustomer` | `@AuditAction(AuditActionType.UPDATE, AuditResourceType.CUSTOMER)` |
| `product.resolver.ts` | `createProduct` | `@AuditAction(AuditActionType.CREATE, AuditResourceType.PRODUCT)` |
| `product.resolver.ts` | `updateProduct` | `@AuditAction(AuditActionType.UPDATE, AuditResourceType.PRODUCT)` |
| `product.resolver.ts` | `activateProduct` | `@AuditAction(AuditActionType.UPDATE, AuditResourceType.PRODUCT)` |
| `product.resolver.ts` | `deactivateProduct` | `@AuditAction(AuditActionType.UPDATE, AuditResourceType.PRODUCT)` |
| `loan-request.resolver.ts` | `createLoanRequest` | `@AuditAction(AuditActionType.CREATE, AuditResourceType.LOAN_REQUEST)` |
| `loan-request.resolver.ts` | `processLoanRequest` | `@AuditAction(AuditActionType.UPDATE, AuditResourceType.LOAN_REQUEST)` |
| `loan-request.resolver.ts` | `acceptOffer` | `@AuditAction(AuditActionType.UPDATE, AuditResourceType.LOAN_REQUEST)` |
| `loan-request.resolver.ts` | `rejectOffer` | `@AuditAction(AuditActionType.UPDATE, AuditResourceType.LOAN_REQUEST)` |
| `repayment.resolver.ts` | `recordRepayment` | `@AuditAction(AuditActionType.REPAYMENT, AuditResourceType.REPAYMENT)` |
| `settlement.resolver.ts` | `runSettlement` | `@AuditAction(AuditActionType.SETTLEMENT, AuditResourceType.SETTLEMENT)` |
| `settlement.resolver.ts` | `approveSettlement` | `@AuditAction(AuditActionType.UPDATE, AuditResourceType.SETTLEMENT)` |
| `collections.resolver.ts` | `assignCollectionAction` | `@AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)` |
| `webhook.resolver.ts` | `createWebhookEndpoint` | `@AuditAction(AuditActionType.CREATE, AuditResourceType.WEBHOOK)` |
| `webhook.resolver.ts` | `updateWebhookEndpoint` | `@AuditAction(AuditActionType.UPDATE, AuditResourceType.WEBHOOK)` |
| `webhook.resolver.ts` | `deleteWebhookEndpoint` | `@AuditAction(AuditActionType.DELETE, AuditResourceType.WEBHOOK)` |
| `api-key.resolver.ts` | `rotateApiKey` | `@AuditAction(AuditActionType.API_KEY_ROTATED, AuditResourceType.API_KEY)` |
| `api-key.resolver.ts` | `revokeApiKey` | `@AuditAction(AuditActionType.API_KEY_REVOKED, AuditResourceType.API_KEY)` |
| `auth.resolver.ts` | `login` | `@AuditAction(AuditActionType.LOGIN, AuditResourceType.USER)` |
| `auth.resolver.ts` | `register` | `@AuditAction(AuditActionType.CREATE, AuditResourceType.USER)` |
| `auth.resolver.ts` | `refreshToken` | (skip — not a state-changing action worth auditing) |
| `auth.resolver.ts` | `logout` | `@AuditAction(AuditActionType.LOGOUT, AuditResourceType.USER)` |
| `subscription.resolver.ts` | `createSubscription` | `@AuditAction(AuditActionType.CREATE, AuditResourceType.WEBHOOK)` |
| `subscription.resolver.ts` | `cancelSubscription` | `@AuditAction(AuditActionType.DELETE, AuditResourceType.WEBHOOK)` |
| `reconciliation.resolver.ts` | `resolveException` | `@AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)` |
| `reconciliation.resolver.ts` | `batchResolveExceptions` | `@AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)` |
| `integration.resolver.ts` | `createWalletProviderConfig` | `@AuditAction(AuditActionType.CONFIG_CHANGE, AuditResourceType.TENANT)` |
| `integration.resolver.ts` | `updateWalletProviderConfig` | `@AuditAction(AuditActionType.CONFIG_CHANGE, AuditResourceType.TENANT)` |
| `integration.resolver.ts` | `deleteWalletProviderConfig` | `@AuditAction(AuditActionType.DELETE, AuditResourceType.TENANT)` |

**Also**: Register the `AuditEventInterceptor` globally in `apps/graphql-server/src/app.module.ts`:

```typescript
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditEventInterceptor } from '@lons/common';

// In the providers array, add:
{
  provide: APP_INTERCEPTOR,
  useClass: AuditEventInterceptor,
},
```

And provide the `AUDIT_SERVICE` token so the interceptor can inject it:

```typescript
import { AuditService } from '@lons/entity-service';

// In the providers array, add:
{
  provide: 'AUDIT_SERVICE',
  useClass: AuditService,
},
```

Ensure `AuditService` is exported from `EntityServiceModule`. If it isn't, export it.

---

## Fix 4: Replace Generic ThrottlerGuard with TenantThrottlerGuard in REST Server

**Problem**: `apps/rest-server/src/app.module.ts` uses the generic `ThrottlerGuard` with a flat `100 req/min` limit. No per-tenant isolation.

**File to modify**: `apps/rest-server/src/app.module.ts`

**Changes**:
1. Replace `ThrottlerGuard` import with `TenantThrottlerGuard` from `@lons/common`.
2. Replace the `ThrottlerModule.forRoot()` config to use `RedisThrottleStorage` from `@lons/common` (optional — can keep default for now, but switch the guard):

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import {
  ObservabilityModule,
  TenantThrottlerGuard,
  RateLimitHeadersInterceptor,
} from '@lons/common';

// ... other imports unchanged ...

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    ObservabilityModule,
    HealthModule,
    LoanRequestModule,
    CustomerModule,
    ContractModule,
    RepaymentModule,
    ProductModule,
    WebhookModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: TenantThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: RateLimitHeadersInterceptor },
  ],
})
export class AppModule {}
```

---

## Fix 5: Add Rate Limiting to GraphQL Server

**Problem**: `apps/graphql-server/src/app.module.ts` has **no rate limiting at all**. The `TenantThrottlerGuard` and `RateLimitHeadersInterceptor` must be registered.

**File to modify**: `apps/graphql-server/src/app.module.ts`

**Changes**:
1. Import `ThrottlerModule` from `@nestjs/throttler`.
2. Import `TenantThrottlerGuard` and `RateLimitHeadersInterceptor` from `@lons/common`.
3. Add `ThrottlerModule.forRoot(...)` to imports.
4. Add both to providers.

```typescript
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import {
  ObservabilityModule,
  QueryComplexityPlugin,
  TenantThrottlerGuard,
  RateLimitHeadersInterceptor,
  AuditEventInterceptor,
} from '@lons/common';

// In imports array, add:
ThrottlerModule.forRoot([{ ttl: 60000, limit: 200 }]),

// In providers array, add:
{ provide: APP_GUARD, useClass: TenantThrottlerGuard },
{ provide: APP_INTERCEPTOR, useClass: RateLimitHeadersInterceptor },
```

**Note**: The GraphQL server should have a higher base limit (200/min) since a single page load may trigger multiple queries. The `TenantThrottlerGuard` will further differentiate by category (read: 1000, write: 200, scoring: 100).

---

## Fix 6: Register Security Middleware (CSRF + IP Whitelist)

**Problem**: `CsrfMiddleware` and `IpWhitelistGuard` exist in `packages/common/src/security/` but are not registered in any app module.

### 6a. CSRF Middleware — REST Server

**File to modify**: `apps/rest-server/src/main.ts`

CSRF protection should be applied at the application level. Since it's a NestJS middleware (not an Express middleware), it needs to be registered via a module configure method. Add to `AppModule`:

```typescript
import { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { CsrfMiddleware } from '@lons/common';

export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CsrfMiddleware)
      .forRoutes('*');
  }
}
```

**Note**: CSRF is primarily relevant for cookie-based auth (admin portal). For REST API endpoints that use API key or Bearer token auth, CSRF middleware will pass through (it skips when no cookie is present). This is correct behavior.

### 6b. IP Whitelist Guard — REST Server

The `IpWhitelistGuard` should be registered as an optional guard. It reads tenant settings to determine if an IP whitelist is configured; if not, it allows all traffic.

**File to modify**: `apps/rest-server/src/app.module.ts`

```typescript
import { IpWhitelistGuard } from '@lons/common';

// Add to providers (AFTER the TenantThrottlerGuard):
{ provide: APP_GUARD, useClass: IpWhitelistGuard },
```

**Note**: The guard already handles the case where no whitelist is configured (allows all traffic), so this is safe to register globally.

---

## Fix 7: Wire REST Controllers to Actual Services

**Problem**: All 6 REST controllers (`loan-request`, `customer`, `contract`, `repayment`, `webhook`, `product`) return placeholder strings instead of calling actual services.

**Files to modify**:
- `apps/rest-server/src/loan-request/loan-request.controller.ts`
- `apps/rest-server/src/customer/customer.controller.ts`
- `apps/rest-server/src/contract/contract.controller.ts`
- `apps/rest-server/src/repayment/repayment.controller.ts`
- `apps/rest-server/src/webhook/webhook.controller.ts`
- `apps/rest-server/src/product/product.controller.ts`

**Pattern for each controller**: Inject the appropriate service via constructor and delegate to it. Example for `loan-request.controller.ts`:

```typescript
import { Controller, Post, Get, Param, Body, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { ProcessEngineService } from '@lons/process-engine';

@ApiTags('Loan Requests')
@ApiBearerAuth()
@Controller('v1/loan-requests')
export class LoanRequestController {
  constructor(private readonly processEngine: ProcessEngineService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a loan request' })
  @ApiResponse({ status: 201, description: 'Loan request created' })
  @ApiHeader({ name: 'X-Idempotency-Key', required: false })
  async create(@Body() body: any, @Headers('x-idempotency-key') idempotencyKey?: string) {
    // Delegate to the process engine — the same service used by the GraphQL resolver
    return this.processEngine.createLoanRequest(body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get loan request by ID' })
  async findOne(@Param('id') id: string) {
    return this.processEngine.findLoanRequest(id);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept a loan offer' })
  async accept(@Param('id') id: string) {
    return this.processEngine.acceptOffer(id);
  }
}
```

**Service mappings for each controller**:

| Controller | Service to Inject | Import From |
|---|---|---|
| `LoanRequestController` | `ProcessEngineService` | `@lons/process-engine` |
| `CustomerController` | `CustomerService` (EntityService) | `@lons/entity-service` |
| `ContractController` | `ContractService` or `ProcessEngineService` | `@lons/process-engine` or `@lons/entity-service` |
| `RepaymentController` | `RepaymentService` | `@lons/repayment-service` |
| `WebhookController` | `WebhookDeliveryService` | `@lons/notification-service` |
| `ProductController` | `ProductService` | `@lons/entity-service` |

**Important**: Each controller's NestJS module (`*.module.ts`) must import the corresponding service module so the service is available for injection. Check each module file in `apps/rest-server/src/<domain>/<domain>.module.ts` and add the service module import if missing.

**If a service method name doesn't match exactly**, look at how the corresponding GraphQL resolver calls the service and use the same pattern. The REST controllers are thin wrappers around the same business logic.

**If a service is not yet exported from its module**, add it to the module's `exports` array.

---

## Fix 8: Register AuditEventInterceptor AUDIT_SERVICE Provider

**Problem**: The `AuditEventInterceptor` uses `@Inject('AUDIT_SERVICE')` to get the audit service. This token must be provided in the GraphQL server's module.

This is already covered in Fix 3 above. Repeating for clarity — in `apps/graphql-server/src/app.module.ts`, ensure both:

```typescript
{ provide: 'AUDIT_SERVICE', useExisting: AuditService },
{ provide: APP_INTERCEPTOR, useClass: AuditEventInterceptor },
```

If `AuditService` is not directly importable, use `useFactory`:

```typescript
{
  provide: 'AUDIT_SERVICE',
  useFactory: (prisma: PrismaService) => new AuditService(prisma),
  inject: [PrismaService],
},
```

---

## Execution Order

These fixes have minimal interdependencies. Recommended order:

1. **Fix 1** (PII encryption wiring) — standalone
2. **Fix 2** (Audit hash chaining) — standalone
3. **Fix 4** (REST rate limiting) — standalone
4. **Fix 5** (GraphQL rate limiting) — standalone
5. **Fix 6** (CSRF + IP whitelist) — standalone
6. **Fix 3 + Fix 8** (Audit decorators + interceptor + provider) — do together
7. **Fix 7** (REST controller wiring) — depends on service modules being accessible

---

## DO NOT Modify

The following are working correctly and should not be touched:
- All files in `packages/common/src/encryption/` (AES-GCM, middleware, key providers)
- All files in `packages/common/src/audit/` (hash util, diff util, decorator, interceptor, constants)
- All files in `packages/common/src/rate-limiting/` (guard, decorator, headers, storage)
- All files in `packages/common/src/security/` (CSRF, IP whitelist, query complexity, input sanitizer)
- All files in `packages/common/src/observability/` (logger, metrics, health, tracing, correlation)
- All files in `apps/graphql-server/src/subscriptions/` (subscriptions working)
- All files in `services/notification-service/src/webhooks/` (webhook delivery pipeline)
- All e2e test files in `tests/`
- REST server interceptors/filters (`response-envelope`, `business-exception`, `idempotency`)

---

## Verification After Fixes

After all fixes are applied, verify:

1. **PII Encryption**: Create a customer via GraphQL → query the database directly → `nationalId`, `phonePrimary`, `email` should be encrypted JSON blobs, not plaintext.
2. **Audit Hash Chain**: Perform any mutation → query `auditLogs` → entries should have non-null `entryHash` and `previousHash` (except the first entry).
3. **Rate Limiting (REST)**: Send 101 requests in under 60 seconds → should get 429 on the 101st. Response should include `X-RateLimit-*` headers.
4. **Rate Limiting (GraphQL)**: Same test via GraphQL queries.
5. **Audit Decorators**: Perform a `createCustomer` mutation → query `auditLogs` → should see an entry with `action: 'create'`, `resourceType: 'customer'`.
6. **REST Controllers**: `POST /v1/loan-requests` with a valid body → should return actual loan request data (not a placeholder string).
7. **CSRF**: `POST` request without CSRF token when cookies are present → should get 403.

---

## Dependencies to Verify

Ensure these packages are in the relevant `package.json` files:

| Package | Required In |
|---|---|
| `@lons/common` | `packages/database/package.json` (for encryption imports) |
| `@nestjs/throttler` | `apps/graphql-server/package.json` |
| `@lons/process-engine` | `apps/rest-server/package.json` |
| `@lons/entity-service` | `apps/rest-server/package.json` |
| `@lons/repayment-service` | `apps/rest-server/package.json` |
| `@lons/notification-service` | `apps/rest-server/package.json` |

Run `pnpm install` after updating any `package.json`.
