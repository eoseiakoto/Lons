import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { NotificationServiceModule } from '@lons/notification-service';
import {
  ObservabilityModule,
  TenantThrottlerGuard,
  RateLimitHeadersInterceptor,
  RedisThrottlerStorage,
  CsrfMiddleware,
  IpWhitelistGuard,
  CorrelationIdMiddleware,
  MetricsInterceptor,
  AuditEventInterceptor,
  RedisClientModule,
  PLAN_TIER_CONFIG_SERVICE,
  // F-ABC-1/-2: DB-driven per-tenant rate-limit resolver.
  RateLimitConfigService,
  REDIS_CLIENT,
} from '@lons/common';
import {
  EntityServiceModule,
  AuditService,
  PlanTierConfigService,
} from '@lons/entity-service';
import { PrismaService } from '@lons/database';

import { LoanRequestModule } from './loan-request/loan-request.module';
import { CustomerModule } from './customer/customer.module';
import { ContractModule } from './contract/contract.module';
import { RepaymentModule } from './repayment/repayment.module';
import { ProductModule } from './product/product.module';
import { WebhookModule } from './webhook/webhook.module';
import { ApiKeyRestModule } from './api-key/api-key.module';
import { PublicModule } from './public/public.module';
import { WalletWebhookModule } from './wallet-webhook/wallet-webhook.module';
import { BnplRestModule } from './bnpl/bnpl.module';
import { FactoringRestModule } from './factoring/factoring.module';
import { DebtorPaymentWebhookModule } from './debtor-payment-webhook/debtor-payment-webhook.module';
import { UsageRestModule } from './usage/usage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }],
      storage: new RedisThrottlerStorage(),
    }),
    ObservabilityModule,
    // Sprint 14 (S14-9) — shared Redis client for plan-tier cache +
    // quota counters. Must precede EntityServiceModule.
    RedisClientModule.forRoot(),
    // DE-NOTE-nestjs-runtime-crashes — NotificationServiceModule
    // registers `BullModule.forRoot(...)` at the composition root.
    // Required here so the `@Processor`-decorated workers pulled in
    // transitively via ProcessEngineModule → DisbursementModule →
    // PipelineRetryModule can be instantiated; without it, NestJS
    // throws "Worker requires a connection" at module-init. Same
    // pattern as graphql-server and scheduler.
    NotificationServiceModule,
    EntityServiceModule,
    LoanRequestModule,
    CustomerModule,
    ContractModule,
    RepaymentModule,
    ProductModule,
    WebhookModule,
    ApiKeyRestModule,
    PublicModule,
    WalletWebhookModule,
    BnplRestModule,
    FactoringRestModule,
    DebtorPaymentWebhookModule,
    // Sprint 14 (S14-14b) — REST usage snapshot endpoint.
    UsageRestModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: TenantThrottlerGuard },
    { provide: APP_GUARD, useClass: IpWhitelistGuard },
    { provide: APP_INTERCEPTOR, useClass: RateLimitHeadersInterceptor },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
    // S13B-1: register the audit-event interceptor on REST routes too. The
    // interceptor honours @AuditAction(...) decorators on controller handlers
    // (mirrors the GraphQL-server registration in apps/graphql-server/src/app.module.ts).
    {
      provide: 'AUDIT_SERVICE',
      useFactory: (prisma: PrismaService) => new AuditService(prisma),
      inject: [PrismaService],
    },
    { provide: APP_INTERCEPTOR, useClass: AuditEventInterceptor },
    // Sprint 14 (S14-9) — bind PLAN_TIER_CONFIG_SERVICE for TenantPlanGuard.
    { provide: PLAN_TIER_CONFIG_SERVICE, useExisting: PlanTierConfigService },
    // F-ABC-1/-2: per-tenant DB-driven rate-limit resolver.
    // TenantThrottlerGuard picks it up via @Optional() injection —
    // without this registration the guard silently falls back to
    // DEFAULT_LIMITS (starter tier) for every tenant. We also alias
    // PrismaService → 'PRISMA_SERVICE' since RateLimitConfigService
    // declares its Prisma dep on the string token to stay
    // import-free of @lons/database (circular).
    { provide: 'PRISMA_SERVICE', useExisting: PrismaService },
    {
      provide: RateLimitConfigService,
      // Redis typed as `unknown` to avoid pulling ioredis into
      // rest-server's dep tree — the service handles the type
      // internally and only does duck-typed get/setex/del calls.
      useFactory: (prisma: PrismaService, redis: unknown) =>
        new RateLimitConfigService(prisma as any, redis as any),
      inject: [PrismaService, REDIS_CLIENT],
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationIdMiddleware, CsrfMiddleware)
      .forRoutes('*');
  }
}
