import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, NotificationChannel, NotificationStatus } from '@lons/database';
import { maskEmail } from '@lons/common';

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
    // P1-003 fix: subject is templated and may include the customer name
    // ("Welcome, Akua"), so we log only the event type and content size.
    // Recipient email is masked.
    this.logger.log(
      `[EMAIL SANDBOX] To: ${maskEmail(params.recipient)} | event=${params.eventType} customer=${params.customerId.slice(0, 8)}… contentBytes=${params.content.length}`,
    );

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
