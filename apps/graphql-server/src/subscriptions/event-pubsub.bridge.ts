import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PubSub } from 'graphql-subscriptions';
import { PUB_SUB } from './pubsub.provider';

@Injectable()
export class EventPubSubBridge implements OnModuleInit {
  constructor(
    private eventEmitter: EventEmitter2,
    @Inject(PUB_SUB) private pubSub: PubSub,
  ) {}

  onModuleInit() {
    // Bridge domain events to PubSub
    const events = [
      'loan_request.status_changed',
      'contract.state_changed',
      'repayment.received',
      'monitoring.alert_triggered',
      'reconciliation.completed',
    ];

    for (const event of events) {
      this.eventEmitter.on(event, (payload: any) => {
        const channel = payload.tenantId
          ? `${payload.tenantId}:${event}`
          : event;
        this.pubSub.publish(channel, {
          [this.eventToFieldName(event)]: payload,
        });
      });
    }
  }

  private eventToFieldName(event: string): string {
    // Convert dot-notation / underscore-notation to camelCase field name
    return event.replace(/[._](\w)/g, (_, c: string) => c.toUpperCase());
  }
}
