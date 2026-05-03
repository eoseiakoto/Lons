import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '@lons/database';

@Injectable()
export class MessageRetentionJob {
  private readonly logger = new Logger('MessageRetentionJob');
  private readonly RETENTION_DAYS = 90;
  private readonly BATCH_SIZE = 500;

  constructor(private prisma: PrismaService) {}

  @Cron('0 3 * * *') // Daily at 3:00 AM
  async handleCron() {
    this.logger.log('Starting message retention cleanup...');

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.RETENTION_DAYS);

    // Sprint 10B Task 0: this job sweeps platform_messages and
    // message_recipients across all tenants. Run under platform-admin
    // context so RLS doesn't filter the cleanup to a single tenant.
    const totalDeleted = await this.prisma.enterTenantContext(
      { isPlatformAdmin: true },
      async () => {
        let total = 0;
        let batchDeleted = 0;

        do {
          // First delete recipients for old messages
          const oldMessages = await this.prisma.platformMessage.findMany({
            where: { createdAt: { lt: cutoff } },
            select: { id: true },
            take: this.BATCH_SIZE,
          });

          if (oldMessages.length === 0) break;

          const messageIds = oldMessages.map((m) => m.id);

          // Delete recipients first (FK constraint)
          await this.prisma.messageRecipient.deleteMany({
            where: { messageId: { in: messageIds } },
          });

          // Then delete the messages
          const result = await this.prisma.platformMessage.deleteMany({
            where: { id: { in: messageIds } },
          });

          batchDeleted = result.count;
          total += batchDeleted;

          this.logger.log(`Deleted batch of ${batchDeleted} messages (total: ${total})`);
        } while (batchDeleted === this.BATCH_SIZE);

        return total;
      },
    );

    this.logger.log(`Message retention cleanup complete. Deleted ${totalDeleted} messages older than ${this.RETENTION_DAYS} days.`);
  }
}
