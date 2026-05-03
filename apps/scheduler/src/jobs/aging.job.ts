import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@lons/database';
import { AgingService } from '@lons/process-engine';
import { OverdraftAgingService } from '@lons/overdraft-service';

@Injectable()
export class AgingJob {
  private readonly logger = new Logger('AgingJob');

  constructor(
    private prisma: PrismaService,
    private agingService: AgingService,
    private overdraftAgingService: OverdraftAgingService,
  ) {}

  @Cron('30 1 * * *') // Daily at 1:30 AM
  async handleCron() {
    this.logger.log('Starting daily aging classification...');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Sprint 10B Task 0: scheduler jobs run outside HTTP request scope, so
    // the global RLS interceptor never fires. Look up tenants under platform
    // admin context, then re-enter per-tenant for the service call.
    const tenants = await this.prisma.enterTenantContext(
      { isPlatformAdmin: true },
      () => this.prisma.tenant.findMany({ where: { status: 'active', deletedAt: null } }),
    );

    for (const tenant of tenants) {
      // Contract aging (process-engine) — fixed-tenor instalment loans.
      try {
        const result = await this.prisma.enterTenantContext(
          { tenantId: tenant.id },
          () => this.agingService.classifyPortfolio(tenant.id, today),
        );
        this.logger.log(
          `Tenant ${tenant.name}: ${result.processed} contracts, ${result.transitioned.length} transitioned`,
        );
      } catch (error) {
        this.logger.error(`Contract aging failed for tenant ${tenant.name}: ${error}`);
      }

      // Overdraft aging (Sprint 11 A5) — open-ended credit lines with a
      // dueDate per cycle. Failure here doesn't block the contract aging
      // pass above, and vice versa.
      try {
        const odResult = await this.prisma.enterTenantContext(
          { tenantId: tenant.id },
          () => this.overdraftAgingService.classifyPortfolio(tenant.id, today),
        );
        this.logger.log(
          `Tenant ${tenant.name}: ${odResult.processed} credit lines, ${odResult.transitioned.length} transitioned`,
        );
      } catch (error) {
        this.logger.error(`Overdraft aging failed for tenant ${tenant.name}: ${error}`);
      }
    }
  }
}
