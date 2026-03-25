import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { EventBusService } from '@lons/common';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger('WebhookService');
  private processedKeys = new Set<string>();

  constructor(private eventBus: EventBusService) {}

  verifySignature(payload: string, signature: string, secret: string): boolean {
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  isIdempotent(idempotencyKey: string): boolean {
    if (this.processedKeys.has(idempotencyKey)) return true;
    this.processedKeys.add(idempotencyKey);
    // In production, store in Redis with TTL
    return false;
  }

  async handleWebhookEvent(provider: string, eventType: string, payload: Record<string, unknown>, tenantId: string): Promise<void> {
    this.logger.log(`Webhook received: ${provider} ${eventType}`);
    this.eventBus.emitAndBuild(`webhook.${provider}.${eventType}`, tenantId, payload);
  }
}
