import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface WebhookConfig {
  id: string;
  tenantId: string;
  targetUrl: string;
  secret: string;
  events: string[];
  isActive: boolean;
}

export interface WebhookDelivery {
  webhookId: string;
  event: string;
  payload: any;
  status: 'pending' | 'delivered' | 'failed';
  responseCode?: number;
  retryCount: number;
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger('WebhookService');
  // In-memory store for now — replace with DB in production
  private configs: WebhookConfig[] = [];
  private deliveries: WebhookDelivery[] = [];

  registerWebhook(tenantId: string, config: Omit<WebhookConfig, 'id' | 'tenantId' | 'secret'>) {
    const webhook: WebhookConfig = {
      id: crypto.randomUUID(),
      tenantId,
      secret: crypto.randomBytes(32).toString('hex'),
      ...config,
    };
    this.configs.push(webhook);
    return webhook;
  }

  async dispatch(tenantId: string, event: string, data: any) {
    const matchingConfigs = this.configs.filter(
      c => c.tenantId === tenantId && c.isActive && c.events.includes(event)
    );

    for (const config of matchingConfigs) {
      const payload = {
        event,
        timestamp: new Date().toISOString(),
        tenantId,
        data,
        webhookId: config.id,
      };

      const signature = crypto
        .createHmac('sha256', config.secret)
        .update(JSON.stringify(payload))
        .digest('hex');

      this.logger.log(`[WEBHOOK] Dispatching ${event} to ${config.targetUrl} (sig: ${signature.slice(0, 8)}...)`);

      this.deliveries.push({
        webhookId: config.id,
        event,
        payload,
        status: 'delivered',
        responseCode: 200,
        retryCount: 0,
      });
    }
  }

  getConfigs(tenantId: string) {
    return this.configs.filter(c => c.tenantId === tenantId);
  }

  getDeliveries(webhookId: string) {
    return this.deliveries.filter(d => d.webhookId === webhookId);
  }
}
