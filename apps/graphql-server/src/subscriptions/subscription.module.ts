import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { EntityServiceModule } from '@lons/entity-service';
import { PubSubProvider } from './pubsub.provider';
import { EventPubSubBridge } from './event-pubsub.bridge';
import { SubscriptionAuthGuard } from './subscription-auth.guard';
import { LoanRequestSubscription } from './loan-request.subscription';
import { ContractSubscription } from './contract.subscription';
import { RepaymentSubscription } from './repayment.subscription';
import { AlertSubscription } from './alert.subscription';
import { ReconciliationSubscription } from './reconciliation.subscription';

@Module({
  imports: [EventEmitterModule, EntityServiceModule],
  providers: [
    PubSubProvider,
    EventPubSubBridge,
    SubscriptionAuthGuard,
    LoanRequestSubscription,
    ContractSubscription,
    RepaymentSubscription,
    AlertSubscription,
    ReconciliationSubscription,
  ],
  exports: [PubSubProvider],
})
export class SubscriptionModule {}
