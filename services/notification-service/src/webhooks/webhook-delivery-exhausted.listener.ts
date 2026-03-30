import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@lons/database';
import { EmailNotificationAdapter } from '../adapters/email-notification.adapter';

interface WebhookDeliveryExhaustedPayload {
  endpointId: string;
  deliveryLogId: string;
  event: string;
  lastError: string;
  retryCount: number;
}

@Injectable()
export class WebhookDeliveryExhaustedListener {
  private readonly logger = new Logger(WebhookDeliveryExhaustedListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailAdapter: EmailNotificationAdapter,
  ) {}

  @OnEvent('webhook.delivery_exhausted')
  async handleExhaustedDelivery(payload: WebhookDeliveryExhaustedPayload): Promise<void> {
    try {
      this.logger.warn('Webhook delivery exhausted — notifying SP admins', {
        endpointId: payload.endpointId,
        event: payload.event,
        retryCount: payload.retryCount,
      });

      // 1. Look up the webhook endpoint to get tenantId and URL
      const endpoint = await this.prisma.webhookEndpoint.findUnique({
        where: { id: payload.endpointId },
        select: { tenantId: true, url: true },
      });

      if (!endpoint) {
        this.logger.error(`Webhook endpoint ${payload.endpointId} not found`);
        return;
      }

      // 2. Find admin users for this tenant (role name-based lookup)
      const adminUsers = await this.prisma.user.findMany({
        where: {
          tenantId: endpoint.tenantId,
          role: { name: { in: ['admin', 'Admin', 'sp_admin', 'SP Admin', 'operator', 'Operator'] } },
          status: 'active',
          deletedAt: null,
        },
        select: { id: true, email: true, name: true },
      });

      if (adminUsers.length === 0) {
        this.logger.warn(`No admin users found for tenant ${endpoint.tenantId} — cannot send exhaustion alert`);
        return;
      }

      // 3. Send email notification to each admin
      const subject = `[Lōns Alert] Webhook delivery failed permanently`;
      const content = [
        `A webhook delivery has permanently failed after ${payload.retryCount} retry attempts.`,
        ``,
        `Endpoint URL: ${endpoint.url}`,
        `Event: ${payload.event}`,
        `Delivery Log ID: ${payload.deliveryLogId}`,
        `Last Error: ${payload.lastError?.substring(0, 500) ?? 'Unknown'}`,
        ``,
        `Please check the webhook endpoint configuration and ensure the target URL is accessible.`,
        `You can review delivery logs in the admin portal under Webhooks > Delivery Logs.`,
      ].join('\n');

      for (const recipient of adminUsers) {
        try {
          await this.emailAdapter.send(endpoint.tenantId, {
            customerId: recipient.id,
            eventType: 'webhook.delivery_exhausted',
            recipient: recipient.email,
            content,
            subject,
          });
          this.logger.log(`Exhaustion alert sent to ${recipient.email}`);
        } catch (emailError) {
          this.logger.error(`Failed to send exhaustion alert to ${recipient.email}`, emailError);
        }
      }
    } catch (error) {
      // Notification failures must not propagate
      this.logger.error('Failed to process webhook delivery exhaustion event', error);
    }
  }
}
