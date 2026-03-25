import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, NotificationChannel, NotificationStatus } from '@lons/database';

@Injectable()
export class SmsNotificationAdapter {
  private readonly logger = new Logger('SmsNotificationAdapter');

  constructor(private prisma: PrismaService) {}

  async send(tenantId: string, params: {
    customerId: string;
    contractId?: string;
    eventType: string;
    recipient: string;
    content: string;
  }) {
    // Sandbox mode: log instead of calling real SMS API
    this.logger.log(`[SMS SANDBOX] To: ${params.recipient} | ${params.content}`);

    return this.prisma.notification.create({
      data: {
        tenantId,
        eventType: params.eventType,
        channel: NotificationChannel.sms,
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
