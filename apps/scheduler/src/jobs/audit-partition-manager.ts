import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@lons/database';

@Injectable()
export class AuditPartitionManager {
  private readonly logger = new Logger(AuditPartitionManager.name);
  private readonly retentionMonths: number;

  constructor(private readonly prisma: PrismaService) {
    this.retentionMonths = parseInt(process.env.AUDIT_LOG_RETENTION_MONTHS || '24', 10);
  }

  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async managePartitions(): Promise<void> {
    this.logger.log('Running audit log partition management');
    await this.createFuturePartitions();
    await this.dropExpiredPartitions();
  }

  private async createFuturePartitions(): Promise<void> {
    const now = new Date();
    for (let i = 1; i <= 3; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
      const partitionName = `audit_logs_${date.getFullYear()}_${String(date.getMonth() + 1).padStart(2, '0')}`;
      const fromDate = date.toISOString().split('T')[0];
      const toDate = nextMonth.toISOString().split('T')[0];

      try {
        await this.prisma.$executeRawUnsafe(
          `CREATE TABLE IF NOT EXISTS ${partitionName} PARTITION OF audit_logs FOR VALUES FROM ('${fromDate}') TO ('${toDate}')`,
        );
        this.logger.log(`Ensured partition ${partitionName} exists`);
      } catch (error: any) {
        if (!error.message?.includes('already exists')) {
          this.logger.error(`Failed to create partition ${partitionName}`, error);
        }
      }
    }
  }

  private async dropExpiredPartitions(): Promise<void> {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - this.retentionMonths);
    const cutoffName = `audit_logs_${cutoff.getFullYear()}_${String(cutoff.getMonth() + 1).padStart(2, '0')}`;

    const partitions = await this.prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE tablename LIKE 'audit_logs_%'
      AND tablename < ${cutoffName}
      AND schemaname = 'public'
    `;

    for (const partition of partitions) {
      try {
        await this.prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${partition.tablename}`);
        this.logger.log(`Dropped expired partition ${partition.tablename}`);
      } catch (error) {
        this.logger.error(`Failed to drop partition ${partition.tablename}`, error);
      }
    }
  }
}
