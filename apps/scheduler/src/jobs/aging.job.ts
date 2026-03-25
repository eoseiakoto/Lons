import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@lons/database';
import { AgingService } from '@lons/process-engine';

@Injectable()
export class AgingJob {
  private readonly logger = new Logger('AgingJob');

  constructor(
    private prisma: PrismaService,
    private agingService: AgingService,
  ) {}

  @Cron('30 1 * * *') // Daily at 1:30 AM
  async handleCron() {
    this.logger.log('Starting daily aging classification...');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'active', deletedAt: null },
    });

    for (const tenant of tenants) {
      try {
        const result = await this.agingService.classifyPortfolio(tenant.id, today);
        this.logger.log(`Tenant ${tenant.name}: ${result.processed} contracts, ${result.transitioned.length} transitioned`);
      } catch (error) {
        this.logger.error(`Aging failed for tenant ${tenant.name}: ${error}`);
      }
    }
  }
}
