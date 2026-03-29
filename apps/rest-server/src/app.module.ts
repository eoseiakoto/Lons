import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import {
  ObservabilityModule,
  TenantThrottlerGuard,
  RateLimitHeadersInterceptor,
  RedisThrottlerStorage,
  CsrfMiddleware,
  IpWhitelistGuard,
  CorrelationIdMiddleware,
  MetricsInterceptor,
} from '@lons/common';
import { EntityServiceModule } from '@lons/entity-service';

import { LoanRequestModule } from './loan-request/loan-request.module';
import { CustomerModule } from './customer/customer.module';
import { ContractModule } from './contract/contract.module';
import { RepaymentModule } from './repayment/repayment.module';
import { ProductModule } from './product/product.module';
import { WebhookModule } from './webhook/webhook.module';
import { ApiKeyRestModule } from './api-key/api-key.module';

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
    EntityServiceModule,
    LoanRequestModule,
    CustomerModule,
    ContractModule,
    RepaymentModule,
    ProductModule,
    WebhookModule,
    ApiKeyRestModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: TenantThrottlerGuard },
    { provide: APP_GUARD, useClass: IpWhitelistGuard },
    { provide: APP_INTERCEPTOR, useClass: RateLimitHeadersInterceptor },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CorrelationIdMiddleware, CsrfMiddleware)
      .forRoutes('*');
  }
}
