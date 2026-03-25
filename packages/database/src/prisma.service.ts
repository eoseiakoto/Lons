import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async setTenantContext(tenantId: string): Promise<void> {
    await this.$executeRawUnsafe(`SET LOCAL app.current_tenant = '${tenantId}'`);
  }

  async setPlatformAdminContext(): Promise<void> {
    await this.$executeRawUnsafe(`SET LOCAL app.is_platform_admin = 'true'`);
  }

  async withTenantContext<T>(tenantId: string, fn: () => Promise<T>): Promise<T> {
    return this.$transaction(async () => {
      await this.setTenantContext(tenantId);
      return fn();
    });
  }
}
