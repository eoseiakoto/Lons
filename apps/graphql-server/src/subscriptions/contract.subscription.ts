import { Resolver, Subscription, Args } from '@nestjs/graphql';
import { Inject } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import { PUB_SUB } from './pubsub.provider';
import { ContractStatePayload } from './types';

@Resolver()
export class ContractSubscription {
  constructor(@Inject(PUB_SUB) private pubSub: PubSub) {}

  @Subscription(() => ContractStatePayload, {
    name: 'contractStateChanged',
    filter: (payload: any, variables: any) => {
      if (variables.productId) {
        return (
          payload.contractStateChanged?.productId === variables.productId
        );
      }
      return true;
    },
    resolve: (payload: any) => payload.contractStateChanged ?? payload,
  })
  contractStateChanged(
    @Args('tenantId') tenantId: string,
    @Args('productId', { nullable: true }) _productId?: string,
  ) {
    return this.pubSub.asyncIterableIterator(
      `${tenantId}:contract.state_changed`,
    );
  }
}
