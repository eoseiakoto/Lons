import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@lons/database';
import { WebhookSigner } from './webhook-signer';

@Injectable()
export class WebhookDeliveryService {
  private readonly logger = new Logger(WebhookDeliveryService.name);
  // Retry delays in seconds: 1m, 5m, 30m, 2h, 12h
  private readonly RETRY_DELAYS = [60, 300, 1800, 7200, 43200];

  constructor(
    private prisma: PrismaService,
    private signer: WebhookSigner,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue('webhook-delivery') private readonly webhookQueue: Queue,
  ) {}

  async fanOutEvent(
    tenantId: string,
    event: string,
    data: Record<string, any>,
  ): Promise<void> {
    const endpoints = await (this.prisma as any).webhookEndpoint.findMany({
      where: {
        tenantId,
        active: true,
        deletedAt: null,
        events: { has: event },
      },
    });

    for (const endpoint of endpoints) {
      const payload = {
        event,
        timestamp: new Date().toISOString(),
        tenantId,
        data,
        webhookId: endpoint.id,
      };
      await this.createDeliveryLog(endpoint.id, event, payload);
    }
  }

  private async createDeliveryLog(
    endpointId: string,
    event: string,
    payload: any,
  ): Promise<void> {
    const log = await (this.prisma as any).webhookDeliveryLog.create({
      data: {
        webhookEndpointId: endpointId,
        event,
        payload,
        status: 'pending',
        retryCount: 0,
      },
    });
    await this.attemptDelivery(log.id);
  }

  async attemptDelivery(deliveryLogId: string): Promise<void> {
    const log = await (this.prisma as any).webhookDeliveryLog.findUnique({
      where: { id: deliveryLogId },
      include: { webhookEndpoint: true },
    });

    if (!log || log.status === 'delivered' || log.status === 'exhausted') {
      return;
    }

    const endpoint = log.webhookEndpoint;
    const { signature, timestamp } = this.signer.sign(log.payload, endpoint.secret);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Timestamp': String(timestamp),
        },
        body: JSON.stringify(log.payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const responseBody = await response.text().catch(() => '');
      const truncatedBody = responseBody.slice(0, 1000);

      if (response.ok) {
        await (this.prisma as any).webhookDeliveryLog.update({
          where: { id: deliveryLogId },
          data: {
            status: 'delivered',
            httpStatus: response.status,
            responseBody: truncatedBody,
            deliveredAt: new Date(),
          },
        });
        this.logger.debug(`Webhook delivered: log=${deliveryLogId}`);
      } else {
        await this.handleFailure(
          deliveryLogId,
          log.retryCount,
          response.status,
          truncatedBody,
        );
      }
    } catch (error: any) {
      await this.handleFailure(
        deliveryLogId,
        log.retryCount,
        null,
        error.message?.slice(0, 500) ?? 'Unknown error',
      );
    }
  }

  private async handleFailure(
    logId: string,
    currentRetry: number,
    httpStatus: number | null,
    responseBody: string | null,
  ): Promise<void> {
    const nextRetry = currentRetry + 1;

    if (nextRetry >= this.RETRY_DELAYS.length) {
      await (this.prisma as any).webhookDeliveryLog.update({
        where: { id: logId },
        data: {
          status: 'exhausted',
          httpStatus,
          responseBody,
          retryCount: nextRetry,
        },
      });
      this.logger.warn(`Webhook delivery exhausted for log ${logId}`);

      // Emit event for SP operator notification
      const exhaustedLog = await (this.prisma as any).webhookDeliveryLog.findUnique({
        where: { id: logId },
        select: { webhookEndpointId: true, event: true },
      });
      this.eventEmitter.emit('webhook.delivery_exhausted', {
        endpointId: exhaustedLog?.webhookEndpointId ?? 'unknown',
        deliveryLogId: logId,
        event: exhaustedLog?.event ?? 'unknown',
        lastError: responseBody,
        retryCount: nextRetry,
      });

      return;
    }

    const delaySeconds = this.RETRY_DELAYS[nextRetry];
    const backoffMs = delaySeconds * 1000;
    await (this.prisma as any).webhookDeliveryLog.update({
      where: { id: logId },
      data: {
        status: 'failed',
        httpStatus,
        responseBody,
        retryCount: nextRetry,
        nextRetryAt: new Date(Date.now() + backoffMs),
      },
    });

    await this.webhookQueue.add(
      'retry',
      { deliveryLogId: logId },
      { delay: backoffMs, attempts: 1, removeOnComplete: true, removeOnFail: 100 },
    );

    this.logger.debug(
      `Webhook delivery failed for log ${logId}; retry #${nextRetry} scheduled in ${delaySeconds}s`,
    );
  }
}
