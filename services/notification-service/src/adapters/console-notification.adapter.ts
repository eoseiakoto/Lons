import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, NotificationChannel, NotificationStatus } from '@lons/database';
import { maskNotificationRecipient } from './pii-masking';

@Injectable()
export class ConsoleNotificationAdapter {
  private readonly logger = new Logger('NotificationService');

  constructor(private prisma: PrismaService) {}

  async send(tenantId: string, params: {
    customerId: string;
    contractId?: string;
    eventType: string;
    channel: string;
    recipient: string;
    content: string;
  }) {
    // P1-003 fix: never log cleartext recipients or full content. Templated
    // messages routinely embed names, amounts, and contract numbers — none
    // of which belong in plaintext logs (CLAUDE.md §Security).
    this.logger.log(
      `[${params.channel.toUpperCase()}] To: ${maskNotificationRecipient(params.channel, params.recipient)} | event=${params.eventType} customer=${params.customerId.slice(0, 8)}… contentBytes=${params.content.length}`,
    );

    const notification = await this.prisma.notification.create({
      data: {
        tenantId,
        eventType: params.eventType,
        channel: params.channel as NotificationChannel,
        recipient: params.recipient,
        content: params.content,
        status: NotificationStatus.sent,
        sentAt: new Date(),
        customer: { connect: { id: params.customerId } },
        ...(params.contractId ? { contract: { connect: { id: params.contractId } } } : {}),
      },
    });

    return notification;
  }
}
