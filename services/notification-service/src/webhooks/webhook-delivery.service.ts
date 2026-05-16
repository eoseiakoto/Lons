import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@lons/database';
import { AuditService } from '@lons/entity-service';
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
    // S16-FIX-6: outbound webhook delivery audit. Optional so existing
    // tests that wire the service without AuditService keep working;
    // production wiring (notification-service module) provides it.
    @Optional() private readonly auditService?: AuditService,
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
        await this.auditDeliveryAttempt(log, endpoint, {
          httpStatus: response.status,
          success: true,
        });
      } else {
        await this.auditDeliveryAttempt(log, endpoint, {
          httpStatus: response.status,
          success: false,
        });
        await this.handleFailure(
          deliveryLogId,
          log.retryCount,
          response.status,
          truncatedBody,
        );
      }
    } catch (error: any) {
      await this.auditDeliveryAttempt(log, endpoint, {
        httpStatus: null,
        success: false,
        errorMessage: error?.message ?? 'unknown',
      });
      await this.handleFailure(
        deliveryLogId,
        log.retryCount,
        null,
        error.message?.slice(0, 500) ?? 'Unknown error',
      );
    }
  }

  /**
   * S16-FIX-6: write an audit-log entry per delivery attempt. Best-effort —
   * AuditService.log() already swallows its own errors so the primary
   * delivery flow is never blocked. `actorType: 'system'` because this
   * runs from the cron/queue, not a user request.
   */
  private async auditDeliveryAttempt(
    log: {
      id: string;
      retryCount: number;
      event: string;
      payload: { tenantId?: string; data?: { correlationId?: string } } & Record<
        string,
        unknown
      >;
      webhookEndpointId: string;
    },
    endpoint: { url: string },
    result: {
      httpStatus: number | null;
      success: boolean;
      errorMessage?: string;
    },
  ): Promise<void> {
    if (!this.auditService) return;
    const tenantId =
      log.payload?.tenantId ??
      // Fall back to the endpoint's tenant if the payload was malformed.
      (await this.resolveEndpointTenant(log.webhookEndpointId));
    if (!tenantId) return;
    const correlationId = log.payload?.data?.correlationId;
    try {
      await this.auditService.log({
        tenantId,
        actorType: 'system',
        action: 'WEBHOOK_DELIVERY_ATTEMPTED',
        resourceType: 'WebhookEndpoint',
        resourceId: log.webhookEndpointId,
        correlationId,
        metadata: {
          deliveryLogId: log.id,
          url: endpoint.url,
          httpStatus: result.httpStatus,
          success: result.success,
          attempt: log.retryCount + 1,
          eventType: log.event,
          errorMessage: result.errorMessage ?? null,
        },
      });
    } catch (err) {
      // AuditService swallows its own errors; this catch is defence
      // in depth for any unexpected throw.
      this.logger.debug(
        `Webhook delivery audit failed (non-fatal): ${(err as Error).message}`,
      );
    }
  }

  /** S16-FIX-6 helper — resolve tenant when not present in payload. */
  private async resolveEndpointTenant(
    endpointId: string,
  ): Promise<string | undefined> {
    const ep = await (this.prisma as any).webhookEndpoint.findUnique({
      where: { id: endpointId },
      select: { tenantId: true },
    });
    return ep?.tenantId;
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
        select: {
          webhookEndpointId: true,
          event: true,
          payload: true,
          webhookEndpoint: { select: { tenantId: true, url: true } },
        },
      });
      this.eventEmitter.emit('webhook.delivery_exhausted', {
        endpointId: exhaustedLog?.webhookEndpointId ?? 'unknown',
        deliveryLogId: logId,
        event: exhaustedLog?.event ?? 'unknown',
        lastError: responseBody,
        retryCount: nextRetry,
      });

      // S16-FIX-6: dedicated exhaustion audit entry — distinct action
      // type from the per-attempt log so dashboards can count exhausted
      // endpoints directly.
      if (this.auditService && exhaustedLog?.webhookEndpoint?.tenantId) {
        try {
          await this.auditService.log({
            tenantId: exhaustedLog.webhookEndpoint.tenantId,
            actorType: 'system',
            action: 'WEBHOOK_DELIVERY_EXHAUSTED',
            resourceType: 'WebhookEndpoint',
            resourceId: exhaustedLog.webhookEndpointId,
            correlationId: (exhaustedLog.payload as any)?.data?.correlationId,
            metadata: {
              deliveryLogId: logId,
              url: exhaustedLog.webhookEndpoint.url,
              totalAttempts: nextRetry,
              lastHttpStatus: httpStatus,
              lastError: responseBody,
              eventType: exhaustedLog.event,
            },
          });
        } catch (err) {
          this.logger.debug(
            `Webhook exhaustion audit failed (non-fatal): ${(err as Error).message}`,
          );
        }
      }

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
