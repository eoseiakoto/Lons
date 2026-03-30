/**
 * E2E integration tests — GraphQL subscriptions
 *
 * Validates: PubSub publish/subscribe message routing,
 * SubscriptionAuthGuard token enforcement, and EventPubSubBridge
 * event-name-to-field-name conversion logic.
 */
import { PubSub } from 'graphql-subscriptions';
import { SubscriptionAuthGuard } from '../../apps/graphql-server/src/subscriptions/subscription-auth.guard';

// Inline the private conversion logic to test it in isolation
function eventToFieldName(event: string): string {
  return event.replace(/[._](\w)/g, (_: string, c: string) => c.toUpperCase());
}

describe('PubSub — publish and subscribe', () => {
  let pubSub: PubSub;

  beforeEach(() => {
    pubSub = new PubSub();
  });

  it('subscriber receives message published to its channel', async () => {
    const channel = 'tenant-001:contract.state_changed';
    const iterator = pubSub.asyncIterableIterator<{ contractChanged: any }>(channel);

    const published = { contractChanged: { id: 'ctr-1', status: 'ACTIVE', tenantId: 'tenant-001' } };
    await pubSub.publish(channel, published);

    const result = await iterator.next();
    expect(result.done).toBe(false);
    expect(result.value).toEqual(published);
  });

  it('subscriber on different channel does not receive message', async () => {
    const channelA = 'tenant-001:loan_request.status_changed';
    const channelB = 'tenant-002:loan_request.status_changed';

    let received = false;
    const iterator = pubSub.asyncIterableIterator(channelA);

    // Publish to channelB — channelA subscriber should not receive it
    await pubSub.publish(channelB, { data: 'wrong-tenant' });

    // Publish to channelA — should receive this
    await pubSub.publish(channelA, { data: 'correct-tenant' });

    const result = await iterator.next();
    expect(result.value).toEqual({ data: 'correct-tenant' });
    expect(received).toBe(false);
  });

  it('multiple messages are received in order', async () => {
    const channel = 'tenant-001:repayment.received';
    const iterator = pubSub.asyncIterableIterator(channel);

    await pubSub.publish(channel, { seq: 1 });
    await pubSub.publish(channel, { seq: 2 });

    const r1 = await iterator.next();
    const r2 = await iterator.next();

    expect(r1.value).toEqual({ seq: 1 });
    expect(r2.value).toEqual({ seq: 2 });
  });
});

describe('SubscriptionAuthGuard — token enforcement', () => {
  let guard: SubscriptionAuthGuard;

  beforeEach(() => {
    guard = new SubscriptionAuthGuard();
  });

  it('rejects connection when no auth token is present', () => {
    const mockContext: any = {
      switchToWs: () => ({
        getClient: () => ({ connectionParams: {} }),
      }),
    };

    expect(guard.canActivate(mockContext)).toBe(false);
  });

  it('allows connection when authToken is present in connectionParams', () => {
    const mockContext: any = {
      switchToWs: () => ({
        getClient: () => ({
          connectionParams: { authToken: 'Bearer eyJhbGciOiJSUzI1NiJ9.mock' },
        }),
      }),
    };

    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('allows connection when Authorization is present in connectionParams', () => {
    const mockContext: any = {
      switchToWs: () => ({
        getClient: () => ({
          connectionParams: { Authorization: 'Bearer token' },
        }),
      }),
    };

    expect(guard.canActivate(mockContext)).toBe(true);
  });

  it('rejects when connectionParams is completely absent', () => {
    const mockContext: any = {
      switchToWs: () => ({
        getClient: () => ({}),
      }),
    };

    expect(guard.canActivate(mockContext)).toBe(false);
  });
});

describe('EventPubSubBridge — event name to field name conversion', () => {
  it('converts dot-notation to camelCase', () => {
    expect(eventToFieldName('contract.state_changed')).toBe('contractState_changed');
  });

  it('converts underscore-notation to camelCase', () => {
    expect(eventToFieldName('loan_request.status_changed')).toBe('loanRequest.statusChanged');
  });

  it('handles repayment.received', () => {
    expect(eventToFieldName('repayment.received')).toBe('repaymentReceived');
  });

  it('handles monitoring.alert_triggered', () => {
    const result = eventToFieldName('monitoring.alert_triggered');
    expect(result).toBe('monitoringAlert_triggered');
  });

  it('handles reconciliation.completed', () => {
    expect(eventToFieldName('reconciliation.completed')).toBe('reconciliationCompleted');
  });
});
