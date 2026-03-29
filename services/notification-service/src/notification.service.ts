import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import { NotificationAdapterResolver } from './adapters/notification-adapter-resolver.service';
import { renderTemplate, NOTIFICATION_TEMPLATES } from './templates/template-renderer';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private prisma: PrismaService,
    private resolver: NotificationAdapterResolver,
  ) {}

  async sendNotification(tenantId: string, params: {
    customerId: string;
    contractId?: string;
    eventType: string;
    channel?: string;
    variables: Record<string, string>;
  }) {
    const channel = params.channel || 'sms';
    const templates = NOTIFICATION_TEMPLATES[params.eventType];
    if (!templates || !templates[channel]) return null;

    const content = renderTemplate(templates[channel], params.variables);

    const customer = await this.prisma.customer.findFirst({
      where: { id: params.customerId, tenantId },
      select: { phonePrimary: true, email: true },
    });

    const recipient = channel === 'email' ? (customer?.email || '') : (customer?.phonePrimary || '');

    // Resolve the correct adapter for this tenant + channel
    const channelEnum = channel.toUpperCase() as 'SMS' | 'EMAIL' | 'PUSH';
    const adapter = await this.resolver.resolve(tenantId, channelEnum);

    return adapter.send(tenantId, {
      customerId: params.customerId,
      contractId: params.contractId,
      eventType: params.eventType,
      channel,
      recipient,
      content,
    });
  }
}
