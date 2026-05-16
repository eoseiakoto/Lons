import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';
import { ObservabilityModule } from '@lons/common';

import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { TenantModule } from './tenant/tenant.module';
import { UserModule } from './user/user.module';
import { RoleModule } from './role/role.module';
import { LenderModule } from './lender/lender.module';
import { CustomerModule } from './customer/customer.module';
import { ProductModule } from './product/product.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { WebhookModule } from './webhook/webhook.module';
import { ApiKeyModule } from './api-key/api-key.module';
import { MessagingModule } from './messaging/messaging.module';
import { PlatformUserModule } from './platform-user/platform-user.module';
import { AnonymizationModule } from './anonymization/anonymization.module';
import { PlatformConfigModule } from './platform-config/platform-config.module';
import { MerchantModule } from './merchant/merchant.module';
import { PlanTierModule } from './plan-tier/plan-tier.module';
import { BnplCreditLineModule } from './bnpl-credit-line/bnpl-credit-line.module';

@Module({
  imports: [
    PrismaModule,
    ObservabilityModule,
    AuthModule,
    AuditModule,
    TenantModule,
    UserModule,
    RoleModule,
    LenderModule,
    CustomerModule,
    ProductModule,
    SubscriptionModule,
    WebhookModule,
    ApiKeyModule,
    MessagingModule,
    PlatformUserModule,
    AnonymizationModule,
    PlatformConfigModule,
    MerchantModule,
    // Sprint 14 (S14-9) — plan-tier infrastructure (config, quota,
    // tracking, metrics). Requires `RedisClientModule.forRoot()` to be
    // registered at the app composition root so REDIS_CLIENT resolves.
    PlanTierModule,
    // Sprint 15 (S15-1 + S15-2) — per-customer BNPL credit lines.
    BnplCreditLineModule,
  ],
  exports: [
    AuthModule,
    AuditModule,
    TenantModule,
    UserModule,
    RoleModule,
    LenderModule,
    CustomerModule,
    ProductModule,
    SubscriptionModule,
    WebhookModule,
    ApiKeyModule,
    MessagingModule,
    PlatformUserModule,
    AnonymizationModule,
    PlatformConfigModule,
    MerchantModule,
    PlanTierModule,
    BnplCreditLineModule,
  ],
})
export class EntityServiceModule {}
