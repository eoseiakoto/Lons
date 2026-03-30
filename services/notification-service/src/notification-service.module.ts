import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '@lons/database';
import { ObservabilityModule } from '@lons/common';

import { NotificationService } from './notification.service';
import { ConsoleNotificationAdapter } from './adapters/console-notification.adapter';
import { SmsNotificationAdapter } from './adapters/sms-notification.adapter';
import { EmailNotificationAdapter } from './adapters/email-notification.adapter';
import { NotificationAdapterFactory } from './adapters/notification-adapter.factory';
import { RecordingNotificationAdapter } from './adapters/recording-notification.adapter';
import { NotificationAdapterResolver } from './adapters/notification-adapter-resolver.service';
import { WebhookSigner } from './webhooks/webhook-signer';
import { WebhookDeliveryService } from './webhooks/webhook-delivery.service';
import { WebhookDeliveryProcessor } from './webhooks/webhook-delivery.processor';
import { WebhookDeliveryConsumer } from './webhooks/webhook-delivery.consumer';
import { WebhookEventListener } from './webhooks/webhook-event.listener';
import { WebhookDeliveryExhaustedListener } from './webhooks/webhook-delivery-exhausted.listener';

@Module({
  imports: [
    PrismaModule,
    ObservabilityModule,
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
      },
    }),
    BullModule.registerQueue({ name: 'webhook-delivery' }),
  ],
  providers: [
    NotificationService,
    ConsoleNotificationAdapter,
    SmsNotificationAdapter,
    EmailNotificationAdapter,
    NotificationAdapterFactory,
    RecordingNotificationAdapter,
    NotificationAdapterResolver,
    WebhookSigner,
    WebhookDeliveryService,
    WebhookDeliveryProcessor,
    WebhookDeliveryConsumer,
    WebhookEventListener,
    WebhookDeliveryExhaustedListener,
  ],
  exports: [
    NotificationService,
    NotificationAdapterFactory,
    RecordingNotificationAdapter,
    NotificationAdapterResolver,
    WebhookDeliveryService,
  ],
})
export class NotificationServiceModule {}
