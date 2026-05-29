import { NplSuspensionListener } from '../npl-suspension.listener';

/**
 * S19-7 — NPL auto-suspension listener tests.
 *
 * Coverage:
 *   - Suspends only on doubtful / loss / npl classifications
 *     (special_mention + substandard are ignored)
 *   - Idempotent: already-suspended customer is not double-processed
 *   - Updates subscriptions + credit lines via updateMany
 *   - Emits COLLECTIONS_NPL_SUSPENDED event
 *   - Calls AuditService.log with system actor
 *   - Skips bureau report when no consent
 *   - Emits bureau report when consent exists
 *   - CREDITLINE_NPL_CLASSIFIED event takes the same path
 */

const TENANT = 'tenant-1';
const CUSTOMER = 'customer-1';
const CONTRACT = 'contract-1';

function makeListener(opts: {
  customerStatus?: string;
  customerMetadata?: any;
  hasConsent?: boolean;
}) {
  const customer = opts.customerStatus === null
    ? null
    : { status: opts.customerStatus ?? 'active', metadata: opts.customerMetadata ?? null };

  const prisma: any = {
    enterTenantContext: jest.fn().mockImplementation(async (_ctx: any, cb: any) => cb()),
    customer: {
      findUnique: jest.fn().mockResolvedValue(customer),
      update: jest.fn().mockResolvedValue({}),
    },
    subscription: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    creditLine: {
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    customerConsent: {
      findFirst: jest.fn().mockResolvedValue(
        opts.hasConsent ? { id: 'consent-1', granted: true } : null,
      ),
    },
  };
  const eventBus: any = { emitAndBuild: jest.fn() };
  const auditService: any = { log: jest.fn().mockResolvedValue(undefined) };

  const listener = new NplSuspensionListener(prisma, eventBus, auditService);
  return { listener, prisma, eventBus, auditService };
}

function makeContractAgedEvent(classification?: string) {
  return {
    event: 'contract.aged',
    tenantId: TENANT,
    timestamp: new Date().toISOString(),
    correlationId: 'c-1',
    data: {
      contractId: CONTRACT,
      customerId: CUSTOMER,
      daysOverdue: 95,
      outstandingAmount: '5000',
      currency: 'GHS',
      classification,
    },
  };
}

describe('NplSuspensionListener.onContractAged', () => {
  it('does NOT suspend on special_mention', async () => {
    const { listener, prisma } = makeListener({ customerStatus: 'active', hasConsent: true });
    await listener.onContractAged(makeContractAgedEvent('special_mention'));
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('does NOT suspend on substandard', async () => {
    const { listener, prisma } = makeListener({ customerStatus: 'active', hasConsent: true });
    await listener.onContractAged(makeContractAgedEvent('substandard'));
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('suspends on doubtful classification', async () => {
    const { listener, prisma } = makeListener({ customerStatus: 'active', hasConsent: true });
    await listener.onContractAged(makeContractAgedEvent('doubtful'));
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: CUSTOMER },
      data: expect.objectContaining({ status: 'suspended' }),
    });
  });

  it('suspends on loss classification', async () => {
    const { listener, prisma } = makeListener({ customerStatus: 'active', hasConsent: true });
    await listener.onContractAged(makeContractAgedEvent('loss'));
    expect(prisma.customer.update).toHaveBeenCalled();
  });

  it('is idempotent on already-suspended customer', async () => {
    const { listener, prisma } = makeListener({ customerStatus: 'suspended', hasConsent: true });
    await listener.onContractAged(makeContractAgedEvent('loss'));
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('is idempotent on blacklisted customer', async () => {
    const { listener, prisma } = makeListener({ customerStatus: 'blacklisted', hasConsent: true });
    await listener.onContractAged(makeContractAgedEvent('loss'));
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it('suspends active subscriptions + freezes active credit lines', async () => {
    const { listener, prisma } = makeListener({ customerStatus: 'active', hasConsent: true });
    await listener.onContractAged(makeContractAgedEvent('loss'));
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, customerId: CUSTOMER, status: 'active' },
      data: { status: 'suspended' },
    });
    expect(prisma.creditLine.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ tenantId: TENANT, customerId: CUSTOMER }),
      data: expect.objectContaining({ status: 'frozen' }),
    });
  });

  it('emits COLLECTIONS_NPL_SUSPENDED with counts', async () => {
    const { listener, eventBus } = makeListener({ customerStatus: 'active', hasConsent: true });
    await listener.onContractAged(makeContractAgedEvent('loss'));
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      'collections.npl.suspended',
      TENANT,
      expect.objectContaining({
        customerId: CUSTOMER,
        suspendedSubscriptions: 1,
        frozenCreditLines: 2,
      }),
    );
  });

  it('writes an audit log with system actor', async () => {
    const { listener, auditService } = makeListener({ customerStatus: 'active', hasConsent: true });
    await listener.onContractAged(makeContractAgedEvent('loss'));
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        resourceId: CUSTOMER,
        actorType: 'system',
      }),
    );
  });
});

describe('NplSuspensionListener — credit bureau', () => {
  it('skips bureau report when no consent exists', async () => {
    const { listener, eventBus } = makeListener({ customerStatus: 'active', hasConsent: false });
    await listener.onContractAged(makeContractAgedEvent('loss'));
    const eventNames = (eventBus.emitAndBuild as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    expect(eventNames).toContain('collections.npl.suspended');
    expect(eventNames).not.toContain('collections.credit_bureau.reported');
  });

  it('emits bureau report when consent is granted', async () => {
    const { listener, eventBus } = makeListener({ customerStatus: 'active', hasConsent: true });
    await listener.onContractAged(makeContractAgedEvent('loss'));
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      'collections.credit_bureau.reported',
      TENANT,
      expect.objectContaining({
        customerId: CUSTOMER,
        reportType: 'negative',
      }),
    );
  });
});

describe('NplSuspensionListener.onCreditLineNpl', () => {
  it('suspends + reports identically to contract-aged path', async () => {
    const { listener, prisma, eventBus } = makeListener({ customerStatus: 'active', hasConsent: true });
    await listener.onCreditLineNpl({
      event: 'creditline.npl.classified',
      tenantId: TENANT,
      timestamp: new Date().toISOString(),
      correlationId: 'c-2',
      data: { creditLineId: 'cl-1', customerId: CUSTOMER },
    });
    expect(prisma.customer.update).toHaveBeenCalled();
    const eventNames = (eventBus.emitAndBuild as jest.Mock).mock.calls.map((c: any[]) => c[0]);
    expect(eventNames).toContain('collections.npl.suspended');
    expect(eventNames).toContain('collections.credit_bureau.reported');
  });
});
