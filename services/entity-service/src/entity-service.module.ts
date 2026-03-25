import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';

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

@Module({
  imports: [
    PrismaModule,
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
  ],
})
export class EntityServiceModule {}
