import { IBaseEvent } from './base-event';
import { EventType } from './events.enum';

export interface ITenantCreatedEvent extends IBaseEvent<{ tenantId: string; name: string }> {
  event: EventType.TENANT_CREATED;
}

export interface IUserCreatedEvent extends IBaseEvent<{ userId: string; email: string; roleId: string }> {
  event: EventType.USER_CREATED;
}

export interface IProductCreatedEvent extends IBaseEvent<{ productId: string; code: string; type: string }> {
  event: EventType.PRODUCT_CREATED;
}

export interface IProductActivatedEvent extends IBaseEvent<{ productId: string; code: string }> {
  event: EventType.PRODUCT_ACTIVATED;
}

export interface ICustomerCreatedEvent extends IBaseEvent<{ customerId: string; externalId: string }> {
  event: EventType.CUSTOMER_CREATED;
}

export interface ICustomerBlacklistedEvent extends IBaseEvent<{ customerId: string; reason: string }> {
  event: EventType.CUSTOMER_BLACKLISTED;
}

export interface ISubscriptionActivatedEvent extends IBaseEvent<{ subscriptionId: string; customerId: string; productId: string }> {
  event: EventType.SUBSCRIPTION_ACTIVATED;
}

export interface ILenderCreatedEvent extends IBaseEvent<{ lenderId: string; name: string }> {
  event: EventType.LENDER_CREATED;
}
