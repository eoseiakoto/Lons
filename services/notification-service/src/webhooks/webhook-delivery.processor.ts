import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '@lons/database';
import { WebhookDeliveryService } from './webhook-delivery.service';

@Injectable()
export class WebhookDeliveryProcessor {
  private readonly logger = new Logger(WebhookDeliveryProcessor.name);

  constructor(
    private prisma: PrismaService,
    private deliveryService: WebhookDeliveryService,
  ) {}

  /**
   * Fallback sweep for pending retries whose nextRetryAt has elapsed.
   * Runs every 5 minutes as a safety net for any jobs missed by BullMQ.
   * Returns the number of logs processed.
   */
  @Interval(300000)
  async processRetries(): Promise<number> {
    const pendingRetries = await (this.prisma as any).webhookDeliveryLog.findMany({
      where: {
        status: 'failed',
        nextRetryAt: { lte: new Date() },
      },
      take: 50,
      orderBy: { nextRetryAt: 'asc' },
    });

    for (const log of pendingRetries) {
      try {
        await this.deliveryService.attemptDelivery(log.id);
      } catch (err: any) {
        this.logger.error(
          `Retry failed for delivery log ${log.id}: ${err.message}`,
        );
      }
    }

    if (pendingRetries.length > 0) {
      this.logger.log(`Processed ${pendingRetries.length} webhook retries`);
    }

    return pendingRetries.length;
  }
}
