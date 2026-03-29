import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WebhookDeliveryService } from './webhook-delivery.service';

@Processor('webhook-delivery')
export class WebhookDeliveryConsumer extends WorkerHost {
  private readonly logger = new Logger(WebhookDeliveryConsumer.name);

  constructor(private readonly deliveryService: WebhookDeliveryService) {
    super();
  }

  async process(job: Job<{ deliveryLogId: string }>): Promise<void> {
    this.logger.log(
      `Processing webhook retry job ${job.id} for delivery ${job.data.deliveryLogId}`,
    );
    await this.deliveryService.attemptDelivery(job.data.deliveryLogId);
  }
}
