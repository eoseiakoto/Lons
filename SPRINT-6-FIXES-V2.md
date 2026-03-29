# Sprint 6 — BA Review Fix Instructions (V2)

> **Context**: The BA has reviewed the Sprint 6 build and withheld sign-off on 6 tasks, citing 12 gaps that are accepted for immediate fix. This document covers those 12 fixes. Items deferred to Sprint 7 are NOT included here.
>
> **Scope**: These are targeted fixes — most are wiring, one is a new script, one adds filters, one adds a migration. Do not refactor or restructure existing working code.
>
> **UPDATE**: Fix 12 added per BA follow-up — JWT validation on WebSocket subscriptions.

---

## Fix 1: Schedule Webhook Retry Processor

**Problem**: `processRetries()` in `webhook-delivery.processor.ts` exists but nothing calls it. No `@Cron`, no `@Interval`, no scheduler. Retries never execute.

**File to modify**: `services/notification-service/src/webhooks/webhook-delivery.processor.ts`

**Changes**:
1. Import `@nestjs/schedule` — add `Cron` or `Interval` decorator.
2. Decorate `processRetries()` with `@Interval(30000)` (every 30 seconds) or `@Cron('*/30 * * * * *')`.
3. The method already queries for failed deliveries with `nextRetryAt <= now()` and batches them (take: 50). Just needs the trigger.

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
// ... existing imports ...

@Injectable()
export class WebhookDeliveryProcessor {
  // ... existing constructor ...

  @Interval(30000) // Run every 30 seconds
  async processRetries(): Promise<void> {
    // ... existing implementation unchanged ...
  }
}
```

**Also verify**: `@nestjs/schedule` is in `services/notification-service/package.json` dependencies. If not, add it:
```json
"@nestjs/schedule": "^4.0.0"
```

And ensure `ScheduleModule.forRoot()` is imported in the notification service module:
```typescript
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [ScheduleModule.forRoot(), ...],
  // ...
})
```

---

## Fix 2: Emit Event on Exhausted Webhook Retries

**Problem**: `handleFailure()` in `webhook-delivery.service.ts` sets status to "exhausted" and logs a warning, but no event is emitted. SPs silently miss events with no alert.

**File to modify**: `services/notification-service/src/webhooks/webhook-delivery.service.ts`

**Changes**:
1. Inject `EventEmitter2` from `@nestjs/event-emitter` in the constructor.
2. In `handleFailure()`, when status is set to `'exhausted'`, emit a `webhook.delivery_exhausted` event with the endpoint and delivery log details.

```typescript
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class WebhookDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signer: WebhookSigner,
    private readonly eventEmitter: EventEmitter2, // ADD THIS
  ) {}

  // In handleFailure(), after setting status to 'exhausted':
  private async handleFailure(deliveryLog: any, error: Error): Promise<void> {
    // ... existing retry logic ...

    if (deliveryLog.retryCount >= this.MAX_RETRIES) {
      await this.prisma.webhookDeliveryLog.update({
        where: { id: deliveryLog.id },
        data: { status: 'exhausted' },
      });

      this.logger.warn(`Webhook delivery exhausted after ${this.MAX_RETRIES} retries`, {
        deliveryLogId: deliveryLog.id,
        endpointId: deliveryLog.webhookEndpointId,
        event: deliveryLog.event,
      });

      // ADD: Emit event for SP operator notification
      this.eventEmitter.emit('webhook.delivery_exhausted', {
        tenantId: deliveryLog.tenantId ?? 'unknown',
        endpointId: deliveryLog.webhookEndpointId,
        deliveryLogId: deliveryLog.id,
        event: deliveryLog.event,
        lastError: error.message,
        retryCount: deliveryLog.retryCount,
      });

      return;
    }

    // ... existing retry scheduling logic ...
  }
}
```

**Also verify**: `@nestjs/event-emitter` is in the notification-service dependencies and `EventEmitterModule.forRoot()` is imported in the module.

---

## Fix 3: Add Filters to Webhook Delivery Logs Query

**Problem**: `webhookDeliveryLogs` query only filters by `endpointId`. Missing status, event type, and date range filters per FR-WH-002.5.

**File to modify**: `apps/graphql-server/src/graphql/resolvers/webhook.resolver.ts`

**Changes**: Add optional filter arguments to the `webhookDeliveryLogs` query:

```typescript
@Query(() => WebhookDeliveryLogConnection)
async webhookDeliveryLogs(
  @Args('endpointId', { type: () => ID }) endpointId: string,
  @Args('status', { type: () => String, nullable: true }) status?: string,
  @Args('event', { type: () => String, nullable: true }) event?: string,
  @Args('fromDate', { type: () => Date, nullable: true }) fromDate?: Date,
  @Args('toDate', { type: () => Date, nullable: true }) toDate?: Date,
  @Args('first', { type: () => Int, nullable: true, defaultValue: 20 }) first?: number,
  @Args('after', { type: () => String, nullable: true }) after?: string,
) {
  const where: any = { webhookEndpointId: endpointId };
  if (status) where.status = status;
  if (event) where.event = event;
  if (fromDate || toDate) {
    where.createdAt = {};
    if (fromDate) where.createdAt.gte = fromDate;
    if (toDate) where.createdAt.lte = toDate;
  }

  const logs = await this.prisma.webhookDeliveryLog.findMany({
    where,
    take: (first ?? 20) + 1,
    ...(after ? { cursor: { id: after }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
  });

  return {
    items: logs.slice(0, first ?? 20),
    hasMore: logs.length > (first ?? 20),
  };
}
```

---

## Fix 4: Implement Encrypt-Existing-PII Script

**Problem**: `scripts/encrypt-existing-pii.ts` is 0 bytes. Without this, existing plaintext PII cannot be migrated.

**File to create/overwrite**: `scripts/encrypt-existing-pii.ts`

**Requirements**:
- Idempotent: safe to run multiple times (skip already-encrypted fields by checking for JSON blob format `{"ciphertext":...,"iv":...,"tag":...}`)
- Resumable: process in batches with cursor-based pagination (batch size 100)
- Progress tracking: log progress every batch (`Processed X/Y customers`)
- Use `createKeyProvider()` and `encryptToString()` from `@lons/common`
- Target fields: `nationalId`, `phonePrimary`, `phoneSecondary`, `email`, `dateOfBirth`, `fullName` on the Customer model
- Run in a transaction per batch for consistency
- Exit with error count summary

```typescript
import { PrismaClient } from '@prisma/client';
import { createKeyProvider, encryptToString } from '@lons/common';

const BATCH_SIZE = 100;
const PII_FIELDS = ['nationalId', 'phonePrimary', 'phoneSecondary', 'email', 'dateOfBirth', 'fullName'];

function isEncryptedBlob(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed !== null && 'ciphertext' in parsed && 'iv' in parsed && 'tag' in parsed;
  } catch {
    return false;
  }
}

async function main() {
  const prisma = new PrismaClient();
  const keyProvider = createKeyProvider();
  const key = await keyProvider.getKey();

  let cursor: string | undefined;
  let totalProcessed = 0;
  let totalEncrypted = 0;
  let totalErrors = 0;

  const totalCount = await prisma.customer.count();
  console.log(`Starting PII encryption migration for ${totalCount} customers...`);

  while (true) {
    const customers = await prisma.customer.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
    });

    if (customers.length === 0) break;

    for (const customer of customers) {
      try {
        const updates: Record<string, string> = {};

        for (const field of PII_FIELDS) {
          const value = (customer as Record<string, unknown>)[field];
          if (value == null || isEncryptedBlob(value)) continue;
          updates[field] = encryptToString(String(value), key);
        }

        if (Object.keys(updates).length > 0) {
          await prisma.customer.update({
            where: { id: customer.id },
            data: updates,
          });
          totalEncrypted++;
        }
      } catch (error) {
        console.error(`Error encrypting customer ${customer.id}:`, error);
        totalErrors++;
      }

      totalProcessed++;
    }

    cursor = customers[customers.length - 1].id;
    console.log(`Progress: ${totalProcessed}/${totalCount} customers processed, ${totalEncrypted} encrypted, ${totalErrors} errors`);
  }

  console.log(`\nMigration complete:`);
  console.log(`  Total processed: ${totalProcessed}`);
  console.log(`  Total encrypted: ${totalEncrypted}`);
  console.log(`  Total errors: ${totalErrors}`);

  await prisma.$disconnect();
  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

Add a run script to the root `package.json`:
```json
"scripts": {
  "encrypt-pii": "tsx scripts/encrypt-existing-pii.ts"
}
```

---

## Fix 5: Register EncryptionStartupValidator in PrismaModule

**Problem**: `EncryptionStartupValidator` is exported from `@lons/common` but not registered as a provider in any module. It won't block startup when `ENCRYPTION_KEY` is missing.

**File to modify**: `packages/database/src/prisma.module.ts`

**Changes**: Add `EncryptionStartupValidator` as a provider:

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { EncryptionStartupValidator } from '@lons/common';

@Global()
@Module({
  providers: [PrismaService, EncryptionStartupValidator],
  exports: [PrismaService],
})
export class PrismaModule {}
```

---

## Fix 6: Add fullName to Encrypted Fields Config

**Problem**: `fullName` was listed in the Sprint 6 plan as an encrypted field but is missing from `ENCRYPTED_FIELDS`.

**File to modify**: `packages/common/src/encryption/encrypted-fields.config.ts`

**Changes**: Add `'fullName'` to the Customer fields array:

```typescript
export const ENCRYPTED_FIELDS: Record<string, string[]> = {
  Customer: ['nationalId', 'phonePrimary', 'phoneSecondary', 'email', 'dateOfBirth', 'fullName'],
};
```

---

## Fix 7: Add INSERT-Only DB Grants for Audit Logs

**Problem**: Audit log table is append-only at the application level but not enforced at the database level. A compromised connection could UPDATE or DELETE records.

**File to create**: `packages/database/prisma/migrations/<timestamp>_audit_log_insert_only_grants/migration.sql`

Generate a new Prisma migration or create the SQL file manually. The migration should:

```sql
-- Create a restricted role for audit log writes
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'audit_writer') THEN
    CREATE ROLE audit_writer NOLOGIN;
  END IF;
END
$$;

-- Grant INSERT-only on audit_logs to audit_writer
GRANT INSERT ON audit_logs TO audit_writer;

-- Explicitly revoke UPDATE and DELETE
REVOKE UPDATE, DELETE ON audit_logs FROM audit_writer;

-- Grant SELECT for hash chain lookups (needed by AuditService.log)
GRANT SELECT ON audit_logs TO audit_writer;

-- Also revoke TRUNCATE for extra safety
REVOKE TRUNCATE ON audit_logs FROM audit_writer;

-- NOTE: The application connection should use the audit_writer role
-- when writing audit logs. This can be done via SET ROLE or a
-- separate connection string. For now, the grants establish the
-- permission boundary; role switching will be wired in Sprint 7
-- with the full infrastructure setup.
```

**Important**: Run `pnpm --filter database db:migrate` after creating this migration. Since the application connection may not switch roles yet (that's Sprint 7 infrastructure), the grants establish the permission boundary now. Add a comment in `AuditService` noting the future `SET ROLE audit_writer` requirement.

---

## Fix 8: Add Audit Flow Integration Test

**Problem**: Audit e2e tests only validate utilities (hash chain, diffs). No test verifies the actual flow: perform mutation → audit entry created.

**File to modify**: `tests/audit-logging.e2e-spec.ts`

**Changes**: Add a new describe block that tests the interceptor → service → DB flow:

```typescript
describe('Audit Flow Integration', () => {
  it('should create audit entry when AuditEventInterceptor fires', async () => {
    // Create a mock execution context simulating a GraphQL mutation
    // with @AuditAction metadata
    const mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const interceptor = new AuditEventInterceptor(
      new Reflector(),
      mockAuditService as any,
    );

    // Simulate a handler decorated with @AuditAction('create', 'customer')
    const mockHandler = jest.fn();
    Reflect.defineMetadata('audit_action', { action: 'create', resource: 'customer' }, mockHandler);

    const mockContext = createMockExecutionContext({
      handler: mockHandler,
      user: { id: 'user-1', tenantId: 'tenant-1', type: 'user', role: 'admin' },
      headers: { 'x-correlation-id': 'corr-123' },
    });

    const mockCallHandler = {
      handle: () => of({ id: 'cust-1', name: 'Test Customer' }),
    };

    const result$ = interceptor.intercept(mockContext, mockCallHandler as any);

    await lastValueFrom(result$);

    // Wait for async tap
    await new Promise((r) => setTimeout(r, 50));

    expect(mockAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        actorId: 'user-1',
        actorType: 'user',
        action: 'create',
        resourceType: 'customer',
        resourceId: 'cust-1',
        correlationId: 'corr-123',
        metadata: expect.objectContaining({
          accessType: 'tenant_scoped',
        }),
      }),
    );
  });

  it('should tag platform admin cross-tenant access', async () => {
    const mockAuditService = { log: jest.fn().mockResolvedValue(undefined) };
    const interceptor = new AuditEventInterceptor(new Reflector(), mockAuditService as any);

    const mockHandler = jest.fn();
    Reflect.defineMetadata('audit_action', { action: 'read', resource: 'customer' }, mockHandler);

    const mockContext = createMockExecutionContext({
      handler: mockHandler,
      user: { id: 'admin-1', tenantId: 'tenant-2', type: 'user', role: 'platform_admin' },
    });

    const mockCallHandler = { handle: () => of({ id: 'cust-2' }) };
    const result$ = interceptor.intercept(mockContext, mockCallHandler as any);
    await lastValueFrom(result$);
    await new Promise((r) => setTimeout(r, 50));

    expect(mockAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          accessType: 'platform_admin_cross_tenant',
        }),
      }),
    );
  });
});
```

Add necessary imports at the top: `of`, `lastValueFrom` from `rxjs`, `Reflector` from `@nestjs/core`, `AuditEventInterceptor` from `@lons/common`.

---

## Fix 9: Register CorrelationIdMiddleware and MetricsInterceptor Globally

**Problem**: Both are exported from `@lons/common` and `ObservabilityModule` is imported, but neither is actually registered. Correlation IDs are not propagated and HTTP metrics are not collected. Dead code.

### 9a. GraphQL Server

**File to modify**: `apps/graphql-server/src/app.module.ts`

Add `CorrelationIdMiddleware` via `NestModule.configure()` and `MetricsInterceptor` as `APP_INTERCEPTOR`:

```typescript
import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import {
  ObservabilityModule,
  QueryComplexityPlugin,
  TenantThrottlerGuard,
  RateLimitHeadersInterceptor,
  AuditEventInterceptor,
  CorrelationIdMiddleware,
  MetricsInterceptor,
} from '@lons/common';

// In providers array, add:
{ provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },

// Make AppModule implement NestModule:
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationIdMiddleware)
      .forRoutes('*');
  }
}
```

### 9b. REST Server

**File to modify**: `apps/rest-server/src/app.module.ts`

The REST server already implements `NestModule` with `CsrfMiddleware`. Add `CorrelationIdMiddleware` to the same `configure()` and `MetricsInterceptor` to providers:

```typescript
import {
  ObservabilityModule,
  TenantThrottlerGuard,
  RateLimitHeadersInterceptor,
  CsrfMiddleware,
  IpWhitelistGuard,
  CorrelationIdMiddleware,
  MetricsInterceptor,
} from '@lons/common';

// In providers array, add:
{ provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },

// In configure(), chain the middleware:
configure(consumer: MiddlewareConsumer) {
  consumer
    .apply(CorrelationIdMiddleware, CsrfMiddleware)
    .forRoutes('*');
}
```

---

## Fix 10: Register ApiKeyResolver in GraphQL AppModule

**Problem**: `ApiKeyResolver` exists with `rotateApiKey` and `revokeApiKey` mutations fully implemented, but is not listed in the AppModule providers. The mutations are unreachable.

**File to modify**: `apps/graphql-server/src/app.module.ts`

**Changes**: Add the import and register in providers:

```typescript
import { ApiKeyResolver } from './graphql/resolvers/api-key.resolver';

// In providers array, add:
ApiKeyResolver,
```

---

## Fix 11: Add Helmet to GraphQL Server

**Problem**: GraphQL server has no Helmet middleware. No security headers (X-Frame-Options, X-Content-Type-Options, etc.) are sent.

**File to modify**: `apps/graphql-server/src/main.ts`

**Changes**: Import and use Helmet with stricter CSP (no Swagger UI to worry about):

```typescript
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );

  // ... rest of bootstrap unchanged ...
}
```

**Verify**: `helmet` is in `apps/graphql-server/package.json` dependencies. If not, add it.

---

## Fix 12: Add JWT Verification to WebSocket Subscription Auth Guard

**Problem**: `SubscriptionAuthGuard` in `apps/graphql-server/src/subscriptions/subscription-auth.guard.ts` checks for the *presence* of an auth token but never validates it. Any arbitrary string (e.g., `authToken: "anything"`) passes WebSocket authentication and grants access to tenant-scoped real-time events. This is a security hole.

**File to modify**: `apps/graphql-server/src/subscriptions/subscription-auth.guard.ts`

**Changes**: Inject `JwtService` from `@lons/entity-service` and call `verifyToken()` to validate the JWT signature and expiry. Attach the decoded payload to the client for downstream tenant-scoping.

```typescript
import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@lons/entity-service';

@Injectable()
export class SubscriptionAuthGuard implements CanActivate {
  private readonly logger = new Logger(SubscriptionAuthGuard.name);

  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const ctx = context.switchToWs();
    const client = ctx.getClient();
    const connectionParams =
      client?.connectionParams || client?.handshake?.auth || {};

    // Extract token from connection params
    const token =
      connectionParams.authToken || connectionParams.Authorization;
    if (!token) {
      return false;
    }

    // Strip "Bearer " prefix if present
    const rawToken = typeof token === 'string' && token.startsWith('Bearer ')
      ? token.slice(7)
      : token;

    try {
      // Validate JWT signature and expiry using RS256
      const payload = this.jwtService.verifyToken(rawToken);

      // Attach decoded user info to the client for downstream use
      client.user = {
        id: payload.sub,
        tenantId: payload.tenantId,
        role: payload.role,
        permissions: payload.permissions,
        type: 'user' as const,
      };

      return true;
    } catch (error) {
      this.logger.warn('WebSocket auth failed: invalid or expired token');
      return false;
    }
  }
}
```

**Also verify**: The `SubscriptionModule` (in `apps/graphql-server/src/subscriptions/subscription.module.ts`) imports `EntityServiceModule` (or at minimum the `AuthModule` from entity-service) so that `JwtService` is available for injection. If not, add the import:

```typescript
import { EntityServiceModule } from '@lons/entity-service';

@Module({
  imports: [EntityServiceModule],
  providers: [SubscriptionAuthGuard, /* ...other providers */],
  exports: [SubscriptionAuthGuard],
})
export class SubscriptionModule {}
```

**Update the test**: Update `subscription-auth.guard.spec.ts` (if it exists) to:
- Test that a valid JWT passes authentication and user info is attached to client
- Test that an invalid JWT (bad signature) is rejected
- Test that an expired JWT is rejected
- Test that the "Bearer " prefix is properly stripped

---

## Execution Order

No dependencies between fixes. Can be applied in any order or in parallel. Recommended grouping:

**Group A — Webhook fixes (1, 2, 3)**: All in notification-service + webhook resolver.
**Group B — PII encryption fixes (4, 5, 6)**: Script + module + config.
**Group C — Audit + observability (7, 8, 9)**: Migration + test + middleware registration.
**Group D — Security wiring (10, 11, 12)**: AppModule + main.ts + subscription auth guard.

---

## DO NOT Modify

All files listed in SPRINT-6-FIXES.md "DO NOT Modify" section remain protected. Additionally:
- Do not change `AuditService.log()` — hash chaining was wired in v1 fixes and is working.
- Do not change `PrismaService.onModuleInit()` — encryption middleware was wired in v1 fixes and is working.
- Do not change existing `@AuditAction` decorators on resolvers — all 29 were applied in v1 fixes.
- Do not change `TenantThrottlerGuard` registration in either server — wired in v1 fixes.

---

## Verification After Fixes

1. **Webhook retries**: Create a webhook endpoint pointing to a non-existent URL → trigger an event → verify delivery log shows retry attempts at increasing intervals.
2. **Exhausted notification**: After all retries exhaust → verify `webhook.delivery_exhausted` event is emitted (check logs or event listener).
3. **Delivery log filters**: Query `webhookDeliveryLogs` with `status: "failed"` and date range → verify filtered results.
4. **PII migration script**: Run `pnpm encrypt-pii` → verify Customer PII fields in DB are encrypted JSON blobs.
5. **Startup validation**: Remove `ENCRYPTION_KEY` from `.env` → start service → verify it fails with descriptive error.
6. **fullName encryption**: Create a customer with fullName → query DB directly → verify fullName is encrypted.
7. **Audit DB grants**: Verify `audit_writer` role exists with `SELECT, INSERT` only on audit_logs.
8. **Audit flow test**: Run `pnpm test tests/audit-logging.e2e-spec.ts` → new tests pass.
9. **Correlation IDs**: Make any API request → verify response includes `X-Correlation-Id` header and logs contain correlation ID.
10. **Metrics**: Hit `GET /metrics` → verify `http_requests_total` counter is incrementing.
11. **API key rotation**: Run `rotateApiKey` mutation → verify it works (no longer unreachable).
12. **GraphQL Helmet**: Make a GraphQL request → verify response includes security headers (X-Frame-Options, etc.).
13. **WebSocket JWT auth**: Attempt WebSocket subscription with invalid token → verify connection rejected. With valid JWT → verify connection accepted and user info attached.
