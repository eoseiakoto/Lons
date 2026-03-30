import { Resolver, Mutation, Args, ID, Float } from '@nestjs/graphql';
import { SubscriptionService, CurrentTenant, Roles } from '@lons/entity-service';
import { AuditAction, AuditActionType, AuditResourceType } from '@lons/common';

import { SubscriptionType } from '../types/subscription.type';

@Resolver(() => SubscriptionType)
export class SubscriptionResolver {
  constructor(private subscriptionService: SubscriptionService) {}

  @Mutation(() => SubscriptionType)
  @AuditAction(AuditActionType.CREATE, AuditResourceType.WEBHOOK)
  @Roles('subscription:create')
  async activateSubscription(
    @CurrentTenant() tenantId: string,
    @Args('customerId', { type: () => ID }) customerId: string,
    @Args('productId', { type: () => ID }) productId: string,
    @Args('creditLimit', { type: () => Float, nullable: true }) creditLimit?: number,
  ): Promise<SubscriptionType> {
    return this.subscriptionService.activate(tenantId, {
      customerId,
      productId,
      creditLimit,
    }) as unknown as SubscriptionType;
  }

  @Mutation(() => SubscriptionType)
  @AuditAction(AuditActionType.DELETE, AuditResourceType.WEBHOOK)
  @Roles('subscription:update')
  async deactivateSubscription(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<SubscriptionType> {
    return this.subscriptionService.deactivate(tenantId, id) as unknown as SubscriptionType;
  }
}
