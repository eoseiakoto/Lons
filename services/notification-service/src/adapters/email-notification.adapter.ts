import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, NotificationChannel, NotificationStatus } from '@lons/database';

@Injectable()
export class EmailNotificationAdapter {
  private readonly logger = new Logger('EmailNotificationAdapter');

  constructor(private prisma: PrismaService) {}

  async send(tenantId: string, params: {
    customerId: string;
    contractId?: string;
    eventType: string;
    recipient: string;
    content: string;
    subject?: string;
  }) {
    this.logger.log(`[EMAIL SANDBOX] To: ${params.recipient} | Subject: ${params.subject || params.eventType} | ${params.content}`);

    return this.prisma.notification.create({
      data: {
        tenantId,
        eventType: params.eventType,
        channel: NotificationChannel.email,
        recipient: params.recipient,
        content: params.content,
        status: NotificationStatus.sent,
        sentAt: new Date(),
        customer: { connect: { id: params.customerId } },
        ...(params.contractId ? { contract: { connect: { id: params.contractId } } } : {}),
      },
    });
  }
}
