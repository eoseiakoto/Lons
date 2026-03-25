import { SubscriptionStatus } from '../enums';
import { IBaseEntity, ITenantScoped } from './common.interface';

export interface ISubscription extends IBaseEntity, ITenantScoped {
  customerId: string;
  productId: string;
  creditLimit?: string;
  availableLimit?: string;
  status: SubscriptionStatus;
  activatedAt?: Date;
  deactivatedAt?: Date;
  lastLimitReview?: Date;
}
