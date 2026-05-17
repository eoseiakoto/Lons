/**
 * S17-FIX-5 — unit tests for scoped SUSPEND_BORROWING in AgingActionService.
 *
 * Scenarios (per dev prompt):
 *   1. Default (no scope field): only subscriptions for the same product
 *      are suspended (scope defaults to 'product').
 *   2. scope: 'product': same behaviour as default.
 *   3. scope: 'all': all active subscriptions for the customer are suspended.
 *   4. Already-suspended subscriptions are not affected (updateMany skips them
 *      via the `status: 'active'` filter).
 */
import { AgingActionService } from './aging-action.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const CONTRACT_ID = '22222222-2222-2222-2222-222222222222';
const CUSTOMER_ID = '33333333-3333-3333-3333-333333333333';
const PRODUCT_ID = '44444444-4444-4444-4444-444444444444';

function makeBucketConfig(actionOverrides: Record<string, unknown> = {}) {
  return {
    id: 'bucket-1',
    tenantId: TENANT_ID,
    actions: [
      {
        type: 'SUSPEND_BORROWING',
        config: {},
        ...actionOverrides,
      },
    ],
  } as any;
}

function makeService() {
  const updateMany = jest.fn().mockResolvedValue({ count: 1 });
  const subscription = { updateMany };
  const prisma = { subscription } as any;
  const eventBus = { emitAndBuild: jest.fn() } as any;
  const service = new AgingActionService(prisma, eventBus);
  return { service, subscription, updateMany };
}

describe('AgingActionService — S17-FIX-5 scoped SUSPEND_BORROWING', () => {
  it('scenario 1: no scope field → defaults to product scope, filters by productId', async () => {
    const { service, updateMany } = makeService();

    await service.executeActions(
      TENANT_ID,
      CONTRACT_ID,
      CUSTOMER_ID,
      makeBucketConfig(), // no scope field
      PRODUCT_ID,
    );

    expect(updateMany).toHaveBeenCalledTimes(1);
    const [call] = updateMany.mock.calls;
    expect(call[0].where.productId).toBe(PRODUCT_ID);
    expect(call[0].where.customerId).toBe(CUSTOMER_ID);
    expect(call[0].where.tenantId).toBe(TENANT_ID);
    expect(call[0].where.status).toBe('active');
  });

  it('scenario 2: scope: "product" → only product\'s subscriptions suspended', async () => {
    const { service, updateMany } = makeService();

    await service.executeActions(
      TENANT_ID,
      CONTRACT_ID,
      CUSTOMER_ID,
      makeBucketConfig({ scope: 'product' }),
      PRODUCT_ID,
    );

    expect(updateMany).toHaveBeenCalledTimes(1);
    const [call] = updateMany.mock.calls;
    expect(call[0].where.productId).toBe(PRODUCT_ID);
  });

  it('scenario 3: scope: "all" → all active subscriptions for customer suspended (no productId filter)', async () => {
    const { service, updateMany } = makeService();

    await service.executeActions(
      TENANT_ID,
      CONTRACT_ID,
      CUSTOMER_ID,
      makeBucketConfig({ scope: 'all' }),
      PRODUCT_ID,
    );

    expect(updateMany).toHaveBeenCalledTimes(1);
    const [call] = updateMany.mock.calls;
    // 'all' scope must NOT add productId to the WHERE clause.
    expect(call[0].where.productId).toBeUndefined();
    expect(call[0].where.customerId).toBe(CUSTOMER_ID);
    expect(call[0].where.status).toBe('active');
  });

  it('scenario 4: updateMany is called with status: active — already-suspended rows unaffected', async () => {
    const { service, updateMany } = makeService();
    // Prisma's updateMany with status: 'active' naturally skips already-
    // suspended rows. We verify the WHERE clause targets active only.
    updateMany.mockResolvedValue({ count: 0 }); // simulate all already suspended

    await service.executeActions(
      TENANT_ID,
      CONTRACT_ID,
      CUSTOMER_ID,
      makeBucketConfig(),
      PRODUCT_ID,
    );

    const [call] = updateMany.mock.calls;
    expect(call[0].where.status).toBe('active');
    // No error thrown even when count === 0.
  });

  it('no productId passed + scope product → falls back to all scope (backward compat)', async () => {
    const { service, updateMany } = makeService();

    await service.executeActions(
      TENANT_ID,
      CONTRACT_ID,
      CUSTOMER_ID,
      makeBucketConfig(), // scope: 'product' implicit
      undefined, // no productId
    );

    expect(updateMany).toHaveBeenCalledTimes(1);
    const [call] = updateMany.mock.calls;
    // Without productId, the filter cannot scope to product — falls back to all-customer.
    expect(call[0].where.productId).toBeUndefined();
  });
});
