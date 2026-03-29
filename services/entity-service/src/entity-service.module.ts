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
  ],
})
export class EntityServiceModule {}
