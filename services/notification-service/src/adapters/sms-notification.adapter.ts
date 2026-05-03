import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, NotificationChannel, NotificationStatus } from '@lons/database';
import { maskPhone } from '@lons/common';

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
    // P1-003 fix: sandbox logs the masked phone and message size only — never
    // the cleartext number or message body, which can include amounts, names,
    // and contract identifiers.
    this.logger.log(
      `[SMS SANDBOX] To: ${maskPhone(params.recipient)} | event=${params.eventType} customer=${params.customerId.slice(0, 8)}… contentBytes=${params.content.length}`,
    );

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
