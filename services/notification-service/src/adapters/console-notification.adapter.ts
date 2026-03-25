import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, NotificationChannel, NotificationStatus } from '@lons/database';

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
    this.logger.log(`[${params.channel.toUpperCase()}] To: ${params.recipient} | ${params.content}`);

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
