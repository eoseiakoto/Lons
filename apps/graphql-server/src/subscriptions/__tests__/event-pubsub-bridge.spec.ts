import { EventEmitter2 } from '@nestjs/event-emitter';
import { PubSub } from 'graphql-subscriptions';
import { EventPubSubBridge } from '../event-pubsub.bridge';

describe('EventPubSubBridge', () => {
  let eventEmitter: EventEmitter2;
  let pubSub: PubSub;
  let bridge: EventPubSubBridge;
  let publishSpy: jest.SpyInstance;

  beforeEach(() => {
    eventEmitter = new EventEmitter2();
    pubSub = new PubSub();
    publishSpy = jest.spyOn(pubSub, 'publish');
    bridge = new EventPubSubBridge(eventEmitter, pubSub);
    bridge.onModuleInit();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('publishes to tenant-scoped channel on loan_request.status_changed', () => {
    const payload = {
      tenantId: 'tenant-abc',
      loanRequestId: 'lr-001',
      status: 'APPROVED',
    };

    eventEmitter.emit('loan_request.status_changed', payload);

    expect(publishSpy).toHaveBeenCalledWith(
      'tenant-abc:loan_request.status_changed',
      { loanRequestStatusChanged: payload },
    );
  });

  it('publishes to tenant-scoped channel on contract.state_changed', () => {
    const payload = {
      tenantId: 'tenant-xyz',
      contractId: 'c-001',
      status: 'ACTIVE',
    };

    eventEmitter.emit('contract.state_changed', payload);

    expect(publishSpy).toHaveBeenCalledWith(
      'tenant-xyz:contract.state_changed',
      { contractStateChanged: payload },
    );
  });

  it('publishes to tenant-scoped channel on repayment.received', () => {
    const payload = {
      tenantId: 'tenant-abc',
      repaymentId: 'rp-001',
      contractId: 'c-001',
      amount: '500.00',
    };

    eventEmitter.emit('repayment.received', payload);

    expect(publishSpy).toHaveBeenCalledWith(
      'tenant-abc:repayment.received',
      { repaymentReceived: payload },
    );
  });

  it('falls back to global channel when tenantId is absent', () => {
    const payload = { alertId: 'a-001', severity: 'HIGH' };

    eventEmitter.emit('monitoring.alert_triggered', payload);

    expect(publishSpy).toHaveBeenCalledWith(
      'monitoring.alert_triggered',
      { monitoringAlertTriggered: payload },
    );
  });

  it('publishes to tenant-scoped channel on reconciliation.completed', () => {
    const payload = {
      tenantId: 'tenant-abc',
      reconciliationId: 'rec-001',
      status: 'COMPLETED',
    };

    eventEmitter.emit('reconciliation.completed', payload);

    expect(publishSpy).toHaveBeenCalledWith(
      'tenant-abc:reconciliation.completed',
      { reconciliationCompleted: payload },
    );
  });
});
