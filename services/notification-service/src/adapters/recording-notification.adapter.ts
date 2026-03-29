import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@lons/database';

@Injectable()
export class RecordingNotificationAdapter {
  private readonly logger = new Logger(RecordingNotificationAdapter.name);

  constructor(private readonly prisma: PrismaService) {}

  async send(tenantId: string, params: {
    customerId: string;
    contractId?: string;
    eventType: string;
    channel: string;
    recipient: string;
    content: string;
    correlationId?: string;
    templateId?: string;
  }): Promise<{ success: boolean; messageId: string }> {
    const record = await this.prisma.notificationMockLog.create({
      data: {
        tenantId,
        channel: params.channel,
        recipient: params.recipient,
        templateId: params.templateId,
        renderedContent: params.content,
        status: 'SENT',
        correlationId: params.correlationId,
      },
    });

    this.logger.log(
      `[RECORDING] ${params.channel.toUpperCase()} → ${params.recipient}: ${params.templateId ?? params.eventType}`,
    );

    return { success: true, messageId: record.id };
  }
}
