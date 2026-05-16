/**
 * Sprint 16 fixes (FIX-2) — unit tests for `MicroLoanCreditLimitAuditService`.
 *
 * The audit service is a thin write/read wrapper over Prisma — these
 * tests pin the contract:
 *   - `record()` passes the correct shape to `prisma.create()` (incl.
 *     FIX-1 sourceId)
 *   - `record()` accepts an external tx client and uses it instead of
 *     `this.prisma` (so the calling service can keep the audit row
 *     atomic with the subscription update)
 *   - `list()` queries by `(tenantId, customerId, [subscriptionId])`
 *     newest-first with cap-100 pagination
 */
import { MicroLoanCreditLimitAuditService } from '../micro-loan-credit-limit-audit.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const CUSTOMER_ID = '22222222-2222-2222-2222-222222222222';
const SUBSCRIPTION_ID = '33333333-3333-3333-3333-333333333333';
const SOURCE_ID = '44444444-4444-4444-4444-444444444444';

function makeService() {
  const microLoanCreditLimitChange = {
    create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    findMany: jest.fn().mockResolvedValue([]),
  };
  const prisma = { microLoanCreditLimitChange } as any;
  const service = new MicroLoanCreditLimitAuditService(prisma);
  return { service, prisma, microLoanCreditLimitChange };
}

describe('record()', () => {
  it('writes an append-only row with the correct shape', async () => {
    const { service, microLoanCreditLimitChange } = makeService();
    await service.record(TENANT_ID, {
      customerId: CUSTOMER_ID,
      subscriptionId: SUBSCRIPTION_ID,
      previousLimit: '1000.0000',
      newLimit: '1100.0000',
      changeType: 'increase',
      reason: 'Auto review on repayment.',
      triggeredBy: 'system',
      sourceId: SOURCE_ID,
    });

    expect(microLoanCreditLimitChange.create).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        subscriptionId: SUBSCRIPTION_ID,
        previousLimit: '1000.0000',
        newLimit: '1100.0000',
        changeType: 'increase',
        reason: 'Auto review on repayment.',
        triggeredBy: 'system',
        sourceId: SOURCE_ID,
      },
    });
  });

  it('FIX-1: persists sourceId — drives the dedupe lookup', async () => {
    const { service, microLoanCreditLimitChange } = makeService();
    await service.record(TENANT_ID, {
      customerId: CUSTOMER_ID,
      subscriptionId: SUBSCRIPTION_ID,
      previousLimit: '500',
      newLimit: '250',
      changeType: 'decrease',
      reason: 'Auto reduction on default.',
      triggeredBy: 'system',
      sourceId: SOURCE_ID,
    });
    expect(
      microLoanCreditLimitChange.create.mock.calls[0][0].data.sourceId,
    ).toBe(SOURCE_ID);
  });

  it('accepts undefined sourceId (manual operator path)', async () => {
    const { service, microLoanCreditLimitChange } = makeService();
    await service.record(TENANT_ID, {
      customerId: CUSTOMER_ID,
      subscriptionId: SUBSCRIPTION_ID,
      previousLimit: '500',
      newLimit: '750',
      changeType: 'restoration',
      reason: 'Operator restored after investigation.',
      triggeredBy: 'manual:user-42',
    });
    expect(
      microLoanCreditLimitChange.create.mock.calls[0][0].data.sourceId,
    ).toBeUndefined();
  });

  it('uses passed tx client when provided', async () => {
    const { service, microLoanCreditLimitChange } = makeService();
    const txClient = {
      microLoanCreditLimitChange: {
        create: jest.fn().mockResolvedValue({ id: 'tx-audit' }),
      },
    } as any;
    await service.record(
      TENANT_ID,
      {
        customerId: CUSTOMER_ID,
        subscriptionId: SUBSCRIPTION_ID,
        previousLimit: '0',
        newLimit: '100',
        changeType: 'increase',
        reason: 'test',
        triggeredBy: 'system',
      },
      txClient,
    );
    // Used the tx client, NOT the root prisma client.
    expect(txClient.microLoanCreditLimitChange.create).toHaveBeenCalledTimes(1);
    expect(microLoanCreditLimitChange.create).not.toHaveBeenCalled();
  });
});

describe('list()', () => {
  it('queries by tenantId + customerId, newest first, cap 100', async () => {
    const { service, microLoanCreditLimitChange } = makeService();
    await service.list(TENANT_ID, { customerId: CUSTOMER_ID }, { take: 200 });
    const args = microLoanCreditLimitChange.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ tenantId: TENANT_ID, customerId: CUSTOMER_ID });
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
    // Cap at 100, take = 100 + 1 for hasNextPage detection.
    expect(args.take).toBe(101);
  });

  it('filters by subscriptionId when provided', async () => {
    const { service, microLoanCreditLimitChange } = makeService();
    await service.list(
      TENANT_ID,
      { customerId: CUSTOMER_ID, subscriptionId: SUBSCRIPTION_ID },
      { take: 10 },
    );
    expect(
      microLoanCreditLimitChange.findMany.mock.calls[0][0].where.subscriptionId,
    ).toBe(SUBSCRIPTION_ID);
  });

  it('cursor pagination skips the cursor row', async () => {
    const { service, microLoanCreditLimitChange } = makeService();
    await service.list(
      TENANT_ID,
      { customerId: CUSTOMER_ID },
      { take: 10, cursor: 'audit-cursor' },
    );
    const args = microLoanCreditLimitChange.findMany.mock.calls[0][0];
    expect(args.cursor).toEqual({ id: 'audit-cursor' });
    expect(args.skip).toBe(1);
  });
});
