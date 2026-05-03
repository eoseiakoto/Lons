import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@lons/database';
import { ReconciliationService } from '@lons/reconciliation-service';

@Injectable()
export class ReconciliationJob {
  private readonly logger = new Logger('ReconciliationJob');

  constructor(
    private prisma: PrismaService,
    private reconciliationService: ReconciliationService,
  ) {}

  @Cron('0 2 * * *') // Daily at 2:00 AM
  async handleCron() {
    this.logger.log('Starting daily reconciliation...');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    // Sprint 10B Task 0: scheduler runs outside HTTP request scope. Wrap the
    // tenant lookup in platform-admin context and each per-tenant call in
    // tenant context so RLS policies admit the correct rows.
    const tenants = await this.prisma.enterTenantContext(
      { isPlatformAdmin: true },
      () => this.prisma.tenant.findMany({ where: { status: 'active', deletedAt: null } }),
    );

    for (const tenant of tenants) {
      try {
        const result = await this.prisma.enterTenantContext(
          { tenantId: tenant.id },
          () => this.reconciliationService.runDailyReconciliation(tenant.id, yesterday),
        );
        this.logger.log(`Tenant ${tenant.name}: ${result.totalTxns} txns, ${result.matchedTxns} matched, ${result.exceptionCount} exceptions`);
      } catch (error) {
        this.logger.error(`Reconciliation failed for tenant ${tenant.name}: ${error}`);
      }
    }
  }
}
