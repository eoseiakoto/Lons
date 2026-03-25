import { Module } from '@nestjs/common';
import { PrismaModule } from '@lons/database';

import { NotificationService } from './notification.service';
import { ConsoleNotificationAdapter } from './adapters/console-notification.adapter';
import { SmsNotificationAdapter } from './adapters/sms-notification.adapter';
import { EmailNotificationAdapter } from './adapters/email-notification.adapter';
import { NotificationAdapterFactory } from './adapters/notification-adapter.factory';

@Module({
  imports: [PrismaModule],
  providers: [
    NotificationService,
    ConsoleNotificationAdapter,
    SmsNotificationAdapter,
    EmailNotificationAdapter,
    NotificationAdapterFactory,
  ],
  exports: [NotificationService, NotificationAdapterFactory],
})
export class NotificationServiceModule {}
