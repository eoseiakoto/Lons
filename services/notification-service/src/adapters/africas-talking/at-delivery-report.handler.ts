import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, NotificationStatus } from '@lons/database';
import { maskPhone } from '@lons/common';
import { ATDeliveryReport } from './at-sms.types';

/**
 * AT Delivery Report Handler
 *
 * Processes incoming delivery reports from Africa's Talking webhooks.
 * Handles idempotent status updates and retry queuing for failed deliveries.
 */
@Injectable()
export class ATDeliveryReportHandler {
  private readonly logger = new Logger('ATDeliveryReportHandler');
  private static readonly MAX_RETRY_COUNT = 3;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Process an incoming delivery report from Africa's Talking.
   * Idempotent: if the notification has already been updated to the same
   * terminal status, no further action is taken.
   */
  async processDeliveryReport(report: ATDeliveryReport): Promise<void> {
    const maskedPhone = maskPhone(report.phoneNumber);
    this.logger.log(
      `[AT Delivery] Processing report for ${maskedPhone}, status: ${report.status}, id: ${report.id}`,
    );

    // Find notification by externalRef (AT message ID)
    const notification = await this.prisma.notification.findFirst({
      where: { externalRef: report.id },
    });

    if (!notification) {
      this.logger.warn(
        `[AT Delivery] No notification found for externalRef: ${report.id}`,
      );
      return;
    }

    // Idempotency check: skip if already in a terminal state matching the report
    const mappedStatus = this.mapATStatus(report.status);
    if (this.isTerminalStatus(notification.status as NotificationStatus) &&
        notification.status === mappedStatus) {
      this.logger.debug(
        `[AT Delivery] Already processed externalRef: ${report.id}, status: ${mappedStatus}`,
      );
      return;
    }

    // Update notification status
    const updateData: Record<string, any> = {
      status: mappedStatus,
    };

    if (mappedStatus === NotificationStatus.delivered) {
      updateData.deliveredAt = new Date();
    } else if (mappedStatus === NotificationStatus.failed) {
      updateData.failedAt = new Date();
      updateData.failureReason = report.failureReason || 'Unknown delivery failure';

      // Check if we should retry
      if (notification.retryCount < ATDeliveryReportHandler.MAX_RETRY_COUNT) {
        updateData.retryCount = notification.retryCount + 1;
        updateData.status = NotificationStatus.pending; // Queue for re-send

        this.logger.log(
          `[AT Delivery] Queuing retry ${notification.retryCount + 1}/${ATDeliveryReportHandler.MAX_RETRY_COUNT} for ${maskedPhone}`,
        );
      } else {
        this.logger.warn(
          `[AT Delivery] Max retries (${ATDeliveryReportHandler.MAX_RETRY_COUNT}) reached for ${maskedPhone}, marking as failed`,
        );
      }
    }

    await this.prisma.notification.update({
      where: { id: notification.id },
      data: updateData,
    });

    this.logger.debug(
      `[AT Delivery] Updated notification ${notification.id} to status: ${updateData.status}`,
    );
  }

  /**
   * Map Africa's Talking delivery status to internal NotificationStatus
   */
  private mapATStatus(atStatus: string): NotificationStatus {
    const statusMap: Record<string, NotificationStatus> = {
      Success: NotificationStatus.delivered,
      Sent: NotificationStatus.sent,
      Buffered: NotificationStatus.sent,
      Rejected: NotificationStatus.failed,
      Failed: NotificationStatus.failed,
      Expired: NotificationStatus.failed,
    };
    return statusMap[atStatus] || NotificationStatus.failed;
  }

  /**
   * Check if a notification status is terminal (delivered or permanently failed)
   */
  private isTerminalStatus(status: NotificationStatus): boolean {
    return (
      status === NotificationStatus.delivered ||
      status === NotificationStatus.bounced
    );
  }
}
