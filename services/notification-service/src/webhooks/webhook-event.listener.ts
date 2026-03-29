import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { WebhookDeliveryService } from './webhook-delivery.service';

@Injectable()
export class WebhookEventListener {
  private readonly logger = new Logger(WebhookEventListener.name);

  constructor(private deliveryService: WebhookDeliveryService) {}

  @OnEvent('**')
  async handleDomainEvent(payload: any): Promise<void> {
    if (!payload?.tenantId || !payload?.event) {
      return;
    }

    try {
      await this.deliveryService.fanOutEvent(
        payload.tenantId,
        payload.event,
        payload,
      );
    } catch (err: any) {
      this.logger.error(
        `Webhook fan-out failed for event "${payload.event}": ${err.message}`,
      );
    }
  }
}
