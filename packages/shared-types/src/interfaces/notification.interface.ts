import { NotificationChannel, NotificationStatus } from '../enums';
import { IBaseEntity, ITenantScoped } from './common.interface';

export interface INotification extends IBaseEntity, ITenantScoped {
  customerId: string;
  contractId?: string;
  eventType: string;
  channel: NotificationChannel;
  recipient?: string;
  templateId?: string;
  content?: string;
  status: NotificationStatus;
  externalRef?: string;
  retryCount: number;
  sentAt?: Date;
  deliveredAt?: Date;
  failedAt?: Date;
  failureReason?: string;
}
