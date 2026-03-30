import { Resolver, Subscription, Args } from '@nestjs/graphql';
import { Inject } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import { PUB_SUB } from './pubsub.provider';
import { RepaymentReceivedPayload } from './types';

@Resolver()
export class RepaymentSubscription {
  constructor(@Inject(PUB_SUB) private pubSub: PubSub) {}

  @Subscription(() => RepaymentReceivedPayload, {
    name: 'repaymentReceived',
    filter: (payload: any, variables: any) => {
      if (variables.contractId) {
        return (
          payload.repaymentReceived?.contractId === variables.contractId
        );
      }
      return true;
    },
    resolve: (payload: any) => payload.repaymentReceived ?? payload,
  })
  repaymentReceived(
    @Args('tenantId') tenantId: string,
    @Args('contractId', { nullable: true }) _contractId?: string,
  ) {
    return this.pubSub.asyncIterableIterator(
      `${tenantId}:repayment.received`,
    );
  }
}
