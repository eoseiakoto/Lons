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

    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active', deletedAt: null },
    });

    for (const tenant of tenants) {
      try {
        const result = await this.reconciliationService.runDailyReconciliation(tenant.id, yesterday);
        this.logger.log(`Tenant ${tenant.name}: ${result.totalTxns} txns, ${result.matchedTxns} matched, ${result.exceptionCount} exceptions`);
      } catch (error) {
        this.logger.error(`Reconciliation failed for tenant ${tenant.name}: ${error}`);
      }
    }
  }
}
