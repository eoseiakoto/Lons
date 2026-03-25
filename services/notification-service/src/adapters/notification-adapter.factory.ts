import { Injectable } from '@nestjs/common';
import { ConsoleNotificationAdapter } from './console-notification.adapter';
import { SmsNotificationAdapter } from './sms-notification.adapter';
import { EmailNotificationAdapter } from './email-notification.adapter';

@Injectable()
export class NotificationAdapterFactory {
  constructor(
    private consoleAdapter: ConsoleNotificationAdapter,
    private smsAdapter: SmsNotificationAdapter,
    private emailAdapter: EmailNotificationAdapter,
  ) {}

  getAdapter(channel: string) {
    switch (channel) {
      case 'sms': return this.smsAdapter;
      case 'email': return this.emailAdapter;
      default: return this.consoleAdapter;
    }
  }
}
