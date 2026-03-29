import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, NotificationChannel, NotificationStatus } from '@lons/database';
import { maskPhone } from '@lons/common';
import { randomUUID } from 'crypto';
import {
  ATSendRequest,
  ATSendResponse,
  ATRecipient,
  AT_COST_PER_SMS,
  AT_DEFAULT_COST,
} from './at-sms.types';

/**
 * Africa's Talking SMS Adapter
 *
 * Replaces the basic SmsNotificationAdapter with Africa's Talking integration.
 * Runs in sandbox mode by default, simulating AT API responses including
 * delivery reports, cost tracking, and realistic latency.
 */
@Injectable()
export class AfricasTalkingSmsAdapter {
  private readonly logger = new Logger('AfricasTalkingSmsAdapter');

  private readonly apiKey: string;
  private readonly username: string;
  private readonly senderId: string;
  private readonly isSandbox: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('AFRICAS_TALKING_API_KEY', '');
    this.username = this.config.get<string>('AFRICAS_TALKING_USERNAME', 'sandbox');
    this.senderId = this.config.get<string>('AFRICAS_TALKING_SENDER_ID', 'LONS');
    this.isSandbox = !this.apiKey || this.username === 'sandbox';

    if (this.isSandbox) {
      this.logger.warn('Africa\'s Talking SMS adapter running in SANDBOX mode');
    }
  }

  /**
   * Send SMS notification matching the existing adapter interface.
   * Creates a Notification record in DB and simulates AT API response in sandbox mode.
   */
  async send(
    tenantId: string,
    params: {
      customerId: string;
      contractId?: string;
      eventType: string;
      recipient: string;
      content: string;
    },
  ) {
    const maskedRecipient = maskPhone(params.recipient);
    const messageId = this.generateMessageId();
    const cost = this.calculateCost(params.recipient);

    this.logger.log(
      `[AT SMS] Sending to: ${maskedRecipient} | Event: ${params.eventType} | Cost: ${cost.currency} ${cost.cost}`,
    );

    let status: NotificationStatus = NotificationStatus.sent;
    let failureReason: string | undefined;

    if (this.isSandbox) {
      const result = this.simulateSandboxSend({
        to: params.recipient,
        message: params.content,
        from: this.senderId,
      });

      const recipient = result.SMSMessageData.Recipients[0];
      if (recipient.statusCode >= 400) {
        status = NotificationStatus.failed;
        failureReason = recipient.status;
        this.logger.warn(
          `[AT SMS] Send failed for ${maskedRecipient}: ${recipient.status}`,
        );
      } else {
        this.logger.debug(
          `[AT SMS] Sandbox send success for ${maskedRecipient}, messageId: ${messageId}`,
        );
      }
    }

    // Create notification record in database
    const notification = await this.prisma.notification.create({
      data: {
        tenantId,
        eventType: params.eventType,
        channel: NotificationChannel.sms,
        recipient: params.recipient,
        content: params.content,
        status,
        externalRef: messageId,
        sentAt: status === NotificationStatus.sent ? new Date() : undefined,
        failedAt: status === NotificationStatus.failed ? new Date() : undefined,
        failureReason: failureReason ?? null,
        customer: { connect: { id: params.customerId } },
        ...(params.contractId
          ? { contract: { connect: { id: params.contractId } } }
          : {}),
      },
    });

    // Schedule delivery report simulation in sandbox mode
    if (this.isSandbox && status === NotificationStatus.sent) {
      this.scheduleDeliveryReport(notification.id, messageId, params.recipient);
    }

    return notification;
  }

  /**
   * Send SMS to multiple recipients (bulk send).
   * Iterates through recipients and sends individually.
   */
  async sendBulk(
    tenantId: string,
    params: {
      customerId: string;
      contractId?: string;
      eventType: string;
      recipients: string[];
      content: string;
    },
  ) {
    const results = [];

    for (const recipient of params.recipients) {
      try {
        const result = await this.send(tenantId, {
          customerId: params.customerId,
          contractId: params.contractId,
          eventType: params.eventType,
          recipient,
          content: params.content,
        });
        results.push(result);
      } catch (error) {
        const maskedRecipient = maskPhone(recipient);
        this.logger.error(
          `[AT SMS] Bulk send failed for ${maskedRecipient}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return results;
  }

  /**
   * Generate a unique AT-style message ID
   */
  generateMessageId(): string {
    return `ATXid_${randomUUID().replace(/-/g, '').substring(0, 20)}`;
  }

  /**
   * Calculate cost per SMS based on recipient country code
   */
  calculateCost(phoneNumber: string): { cost: string; currency: string } {
    for (const [prefix, costInfo] of Object.entries(AT_COST_PER_SMS)) {
      if (phoneNumber.startsWith(prefix)) {
        return costInfo;
      }
    }
    return AT_DEFAULT_COST;
  }

  /**
   * Simulate Africa's Talking API response in sandbox mode
   */
  private simulateSandboxSend(request: ATSendRequest): ATSendResponse {
    const cost = this.calculateCost(request.to);
    const statusRoll = Math.random();

    let statusCode: number;
    let status: string;

    if (statusRoll < 0.05) {
      // 5% failure rate
      statusCode = 403;
      status = 'InvalidPhoneNumber';
    } else {
      // 95% accepted
      statusCode = 101;
      status = 'Success';
    }

    const recipient: ATRecipient = {
      statusCode,
      number: request.to,
      cost: `${cost.currency} ${cost.cost}`,
      status,
      messageId: this.generateMessageId(),
    };

    return {
      SMSMessageData: {
        Message: `Sent to 1/${statusCode < 400 ? 1 : 0}`,
        Recipients: [recipient],
      },
    };
  }

  /**
   * Schedule a simulated delivery report after 1-3 seconds.
   * In sandbox mode, simulates realistic delivery outcomes:
   * - 85% delivered
   * - 10% sent but not delivered
   * - 5% failed
   */
  private scheduleDeliveryReport(
    notificationId: string,
    messageId: string,
    phoneNumber: string,
  ): void {
    const delayMs = 1000 + Math.floor(Math.random() * 2000); // 1-3 seconds

    setTimeout(async () => {
      try {
        const deliveryRoll = Math.random();
        let deliveryStatus: NotificationStatus;
        let failureReason: string | null = null;

        if (deliveryRoll < 0.85) {
          deliveryStatus = NotificationStatus.delivered;
        } else if (deliveryRoll < 0.95) {
          // Sent but not delivered — keep as sent
          deliveryStatus = NotificationStatus.sent;
        } else {
          deliveryStatus = NotificationStatus.failed;
          failureReason = 'DeliveryFailure';
        }

        await this.prisma.notification.update({
          where: { id: notificationId },
          data: {
            status: deliveryStatus,
            deliveredAt:
              deliveryStatus === NotificationStatus.delivered
                ? new Date()
                : undefined,
            failedAt:
              deliveryStatus === NotificationStatus.failed
                ? new Date()
                : undefined,
            failureReason,
          },
        });

        const maskedPhone = maskPhone(phoneNumber);
        this.logger.debug(
          `[AT SMS] Delivery report for ${maskedPhone}: ${deliveryStatus} (messageId: ${messageId})`,
        );
      } catch (error) {
        this.logger.error(
          `[AT SMS] Failed to process delivery report for messageId ${messageId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }, delayMs);
  }
}
