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
    this.$use(createFieldEncryptionMiddleware(keyProvider) as any);
    this.logger.log('PII field encryption middleware registered');
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
