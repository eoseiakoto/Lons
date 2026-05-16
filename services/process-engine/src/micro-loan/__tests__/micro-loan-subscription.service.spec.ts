/**
 * Sprint 16 fixes (FIX-2) — unit tests for `MicroLoanSubscriptionService`.
 *
 * Pinned behaviour:
 *   - Deactivation rejected when ANY non-terminal contract exists for
 *     the customer + product (regardless of status — active, due,
 *     overdue, delinquent, default).
 *   - Deactivation allowed when all contracts are in terminal states
 *     (settled, cancelled, written_off).
 *   - Product-type guard: only micro-loan subscriptions are handled.
 *   - Already-deactivated subscriptions are not re-deactivated.
 *   - SUBSCRIPTION_DEACTIVATED event emitted on success.
 */
import {
  ContractStatus,
  ProductType,
  SubscriptionStatus,
} from '@lons/database';
import { EventType } from '@lons/event-contracts';

import { MicroLoanSubscriptionService } from '../micro-loan-subscription.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const SUBSCRIPTION_ID = '22222222-2222-2222-2222-222222222222';
const CUSTOMER_ID = '33333333-3333-3333-3333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-4444-444444444444';
const OPERATOR_ID = '55555555-5555-5555-5555-555555555555';

function makeSubscription(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: SUBSCRIPTION_ID,
    tenantId: TENANT_ID,
    customerId: CUSTOMER_ID,
    productId: PRODUCT_ID,
    status: SubscriptionStatus.active,
    activatedAt: new Date(),
    deactivatedAt: null,
    product: { type: ProductType.micro_loan },
    ...overrides,
  };
}

function makeService() {
  const subscription = {
    findFirst: jest.fn(),
    update: jest.fn().mockImplementation(async (args: any) => ({
      ...makeSubscription(),
      ...args.data,
    })),
  };
  const contract = {
    findMany: jest.fn(),
  };
  const prisma = { subscription, contract } as any;
  const eventBus = { emitAndBuild: jest.fn() } as any;
  const service = new MicroLoanSubscriptionService(prisma, eventBus);
  return { service, prisma, eventBus, subscription, contract };
}

describe('MicroLoanSubscriptionService.deactivate', () => {
  it('throws NotFoundError when subscription is missing', async () => {
    const { service, subscription } = makeService();
    subscription.findFirst.mockResolvedValue(null);

    await expect(
      service.deactivate(TENANT_ID, SUBSCRIPTION_ID, OPERATOR_ID),
    ).rejects.toThrow(/Subscription/);
  });

  it('rejects non-micro-loan products', async () => {
    const { service, subscription } = makeService();
    subscription.findFirst.mockResolvedValue(
      makeSubscription({ product: { type: ProductType.bnpl } }),
    );

    await expect(
      service.deactivate(TENANT_ID, SUBSCRIPTION_ID, OPERATOR_ID),
    ).rejects.toThrow(/only handles micro-loan/);
  });

  it('rejects already-deactivated subscriptions', async () => {
    const { service, subscription } = makeService();
    subscription.findFirst.mockResolvedValue(
      makeSubscription({ status: SubscriptionStatus.deactivated }),
    );

    await expect(
      service.deactivate(TENANT_ID, SUBSCRIPTION_ID, OPERATOR_ID),
    ).rejects.toThrow(/not active/);
  });

  it('rejects when an active contract exists', async () => {
    const { service, subscription, contract } = makeService();
    subscription.findFirst.mockResolvedValue(makeSubscription());
    contract.findMany.mockResolvedValue([
      { id: 'c-1', totalOutstanding: '100', status: ContractStatus.active },
    ]);

    await expect(
      service.deactivate(TENANT_ID, SUBSCRIPTION_ID, OPERATOR_ID),
    ).rejects.toThrow(/outstanding contract/);
  });

  it('rejects when an overdue contract exists', async () => {
    const { service, subscription, contract } = makeService();
    subscription.findFirst.mockResolvedValue(makeSubscription());
    contract.findMany.mockResolvedValue([
      { id: 'c-2', totalOutstanding: '50', status: ContractStatus.overdue },
    ]);

    await expect(
      service.deactivate(TENANT_ID, SUBSCRIPTION_ID, OPERATOR_ID),
    ).rejects.toThrow(/outstanding contract/);
  });

  it('rejects when a delinquent contract exists', async () => {
    const { service, subscription, contract } = makeService();
    subscription.findFirst.mockResolvedValue(makeSubscription());
    contract.findMany.mockResolvedValue([
      { id: 'c-3', totalOutstanding: '50', status: ContractStatus.delinquent },
    ]);

    await expect(
      service.deactivate(TENANT_ID, SUBSCRIPTION_ID, OPERATOR_ID),
    ).rejects.toThrow(/outstanding contract/);
  });

  it('terminal-status contracts (settled/cancelled/written_off) do NOT block', async () => {
    const { service, subscription, contract } = makeService();
    subscription.findFirst.mockResolvedValue(makeSubscription());
    // Only terminal contracts present → query filters them out → empty.
    contract.findMany.mockResolvedValue([]);

    const result = await service.deactivate(
      TENANT_ID,
      SUBSCRIPTION_ID,
      OPERATOR_ID,
    );
    expect(result.status).toBe(SubscriptionStatus.deactivated);

    // The query asserts the notIn filter shape so the
    // (active|due|overdue|delinquent|default_status|cooling_off)
    // statuses are still scanned.
    const where = contract.findMany.mock.calls[0][0].where;
    expect(where.status.notIn).toEqual(
      expect.arrayContaining([
        ContractStatus.settled,
        ContractStatus.cancelled,
        ContractStatus.written_off,
      ]),
    );
  });

  it('flips status to deactivated + stamps deactivatedAt + emits event', async () => {
    const { service, subscription, contract, eventBus } = makeService();
    subscription.findFirst.mockResolvedValue(makeSubscription());
    contract.findMany.mockResolvedValue([]);

    const result = await service.deactivate(
      TENANT_ID,
      SUBSCRIPTION_ID,
      OPERATOR_ID,
    );

    expect(subscription.update).toHaveBeenCalledWith({
      where: { id: SUBSCRIPTION_ID },
      data: expect.objectContaining({
        status: SubscriptionStatus.deactivated,
        deactivatedAt: expect.any(Date),
      }),
    });
    expect(result.status).toBe(SubscriptionStatus.deactivated);

    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.SUBSCRIPTION_DEACTIVATED,
      TENANT_ID,
      expect.objectContaining({
        subscriptionId: SUBSCRIPTION_ID,
        customerId: CUSTOMER_ID,
        productId: PRODUCT_ID,
        deactivatedBy: OPERATOR_ID,
      }),
    );
  });

  it('falls back to "customer" actor when operatorId omitted', async () => {
    const { service, subscription, contract, eventBus } = makeService();
    subscription.findFirst.mockResolvedValue(makeSubscription());
    contract.findMany.mockResolvedValue([]);

    await service.deactivate(TENANT_ID, SUBSCRIPTION_ID);

    expect(eventBus.emitAndBuild.mock.calls[0][2].deactivatedBy).toBe('customer');
  });
});
