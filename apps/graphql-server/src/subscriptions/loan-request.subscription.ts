import { Resolver, Subscription, Args } from '@nestjs/graphql';
import { Inject } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import { PUB_SUB } from './pubsub.provider';
import { LoanRequestStatePayload } from './types';

@Resolver()
export class LoanRequestSubscription {
  constructor(@Inject(PUB_SUB) private pubSub: PubSub) {}

  @Subscription(() => LoanRequestStatePayload, {
    name: 'loanRequestStateChanged',
    filter: (payload: any, variables: any) => {
      if (variables.productId) {
        return (
          payload.loanRequestStatusChanged?.productId === variables.productId
        );
      }
      return true;
    },
    resolve: (payload: any) => payload.loanRequestStatusChanged ?? payload,
  })
  loanRequestStateChanged(
    @Args('tenantId') tenantId: string,
    @Args('productId', { nullable: true }) _productId?: string,
  ) {
    return this.pubSub.asyncIterableIterator(
      `${tenantId}:loan_request.status_changed`,
    );
  }
}
