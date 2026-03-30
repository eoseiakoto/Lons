import { Resolver, Subscription, Args } from '@nestjs/graphql';
import { Inject } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import { PUB_SUB } from './pubsub.provider';
import { ReconciliationExceptionPayload } from './types';

@Resolver()
export class ReconciliationSubscription {
  constructor(@Inject(PUB_SUB) private pubSub: PubSub) {}

  @Subscription(() => ReconciliationExceptionPayload, {
    name: 'reconciliationExceptionCreated',
    filter: () => true,
    resolve: (payload: any) => payload.reconciliationCompleted ?? payload,
  })
  reconciliationExceptionCreated(@Args('tenantId') tenantId: string) {
    return this.pubSub.asyncIterableIterator(
      `${tenantId}:reconciliation.completed`,
    );
  }
}
