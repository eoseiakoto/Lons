import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@lons/database';
import { InterestAccrualService } from '@lons/process-engine';

@Injectable()
export class InterestAccrualJob {
  private readonly logger = new Logger('InterestAccrualJob');

  constructor(
    private prisma: PrismaService,
    private interestAccrualService: InterestAccrualService,
  ) {}

  @Cron('0 1 * * *') // Daily at 1:00 AM
  async handleCron() {
    this.logger.log('Starting daily interest accrual...');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Sprint 10B Task 0: scheduler jobs run with no HTTP request, so the
    // global RLS interceptor never fires. We have to manually enter a
    // platform-admin context to look up tenants (RLS would otherwise return
    // zero rows), and then re-enter per-tenant context for each iteration so
    // the service work runs scoped to that tenant.
    const tenants = await this.prisma.enterTenantContext(
      { isPlatformAdmin: true },
      () => this.prisma.tenant.findMany({ where: { status: 'active', deletedAt: null } }),
    );

    for (const tenant of tenants) {
      try {
        const result = await this.prisma.enterTenantContext(
          { tenantId: tenant.id },
          () => this.interestAccrualService.accrueForDate(tenant.id, today),
        );
        this.logger.log(`Tenant ${tenant.name}: ${result.processedCount} contracts accrued, total: ${result.totalAccrued}`);
      } catch (error) {
        this.logger.error(`Accrual failed for tenant ${tenant.name}: ${error}`);
      }
    }
  }
}
