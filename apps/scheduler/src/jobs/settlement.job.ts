import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@lons/database';
import { SettlementService } from '@lons/settlement-service';

@Injectable()
export class SettlementJob {
  private readonly logger = new Logger('SettlementJob');

  constructor(
    private prisma: PrismaService,
    private settlementService: SettlementService,
  ) {}

  @Cron('0 3 * * *') // 3:00 AM daily
  async handleSettlementRun() {
    const tenants = await this.prisma.tenant.findMany({ where: { status: 'active' } });
    for (const tenant of tenants) {
      try {
        const settings = (tenant.settings as any) || {};
        const frequency = settings.settlementFrequency || 'daily';
        const now = new Date();

        // Determine period based on frequency
        let periodStart: Date;
        let periodEnd: Date;

        if (frequency === 'daily') {
          periodEnd = new Date(now);
          periodEnd.setDate(periodEnd.getDate() - 1);
          periodEnd.setHours(23, 59, 59, 999);
          periodStart = new Date(periodEnd);
          periodStart.setHours(0, 0, 0, 0);
        } else if (frequency === 'weekly' && now.getDay() === 1) { // Monday
          periodEnd = new Date(now);
          periodEnd.setDate(periodEnd.getDate() - 1); // Sunday
          periodEnd.setHours(23, 59, 59, 999);
          periodStart = new Date(periodEnd);
          periodStart.setDate(periodStart.getDate() - 6); // Previous Monday
          periodStart.setHours(0, 0, 0, 0);
        } else if (frequency === 'monthly' && now.getDate() === 1) {
          periodEnd = new Date(now);
          periodEnd.setDate(periodEnd.getDate() - 1); // Last day of prev month
          periodEnd.setHours(23, 59, 59, 999);
          periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1);
        } else {
          continue; // Skip -- not the right day for this frequency
        }

        await this.settlementService.calculateSettlement(tenant.id, periodStart, periodEnd);
        this.logger.log(`Settlement calculated for tenant ${tenant.id}`);
      } catch (error) {
        this.logger.error(`Settlement failed for tenant ${tenant.id}: ${error instanceof Error ? error.message : error}`);
      }
    }
  }
}
