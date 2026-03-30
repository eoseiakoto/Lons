import { Resolver, Subscription, Args } from '@nestjs/graphql';
import { Inject } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';
import { PUB_SUB } from './pubsub.provider';
import { AlertTriggeredPayload } from './types';

@Resolver()
export class AlertSubscription {
  constructor(@Inject(PUB_SUB) private pubSub: PubSub) {}

  @Subscription(() => AlertTriggeredPayload, {
    name: 'alertTriggered',
    filter: (payload: any, variables: any) => {
      if (variables.severity) {
        return (
          payload.monitoringAlertTriggered?.severity === variables.severity
        );
      }
      return true;
    },
    resolve: (payload: any) => payload.monitoringAlertTriggered ?? payload,
  })
  alertTriggered(
    @Args('tenantId') tenantId: string,
    @Args('severity', { nullable: true }) _severity?: string,
  ) {
    return this.pubSub.asyncIterableIterator(
      `${tenantId}:monitoring.alert_triggered`,
    );
  }
}
