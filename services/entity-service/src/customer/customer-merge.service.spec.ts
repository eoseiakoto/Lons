/**
 * S17-8 / FR-CM-001.3 — CustomerMergeService unit tests.
 *
 * Exercises:
 *   - Source/target validation (self-merge rejected, missing IDs throw).
 *   - All child tables are re-parented inside a single transaction.
 *   - Metadata merge: target keys win on conflict, source-only keys
 *     survive.
 *   - Source customer is soft-deleted with `inactive` status and a
 *     `_mergedInto` metadata trail.
 *   - Audit log is emitted with merge metadata.
 *   - Idempotency replay returns the prior result without re-running.
 */
import { CustomerMergeService } from './customer-merge.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const SOURCE_ID = '22222222-2222-2222-2222-222222222222';
const TARGET_ID = '33333333-3333-3333-3333-333333333333';
const ACTOR_ID = '44444444-4444-4444-4444-444444444444';

const REPARENT_TABLES = [
  'subscription',
  'loanRequest',
  'scoringResult',
  'contract',
  'disbursement',
  'repayment',
  'notification',
  'screeningResult',
  'creditLine',
  'customerConsent',
  'walletAccountMapping',
  'bnplTransaction',
  'bnplCreditLine',
  'microLoanCreditLimitChange',
  'customerFinancialData',
];

function makeService(opts: {
  source?: any;
  target?: any;
  reparentCounts?: Record<string, number>;
  priorAuditLog?: any;
} = {}) {
  // Use the `in opts` check so `{ source: null }` doesn't fall through
  // to the default — null is a legitimate test fixture for "not found".
  const source = 'source' in opts
    ? opts.source
    : {
        id: SOURCE_ID,
        tenantId: TENANT_ID,
        deletedAt: null,
        metadata: { sourceOnlyKey: 'kept', sharedKey: 'sourceValue' },
      };
  const target = 'target' in opts
    ? opts.target
    : {
        id: TARGET_ID,
        tenantId: TENANT_ID,
        deletedAt: null,
        metadata: { targetOnlyKey: 'present', sharedKey: 'targetWins' },
      };

  const findFirst = jest.fn().mockImplementation(async ({ where }) => {
    if (where.id === SOURCE_ID) return source;
    if (where.id === TARGET_ID) return target;
    return null;
  });

  // Transaction client receives table-specific mocks; each updateMany
  // returns the configured row count.
  const txUpdateMany = jest.fn();
  txUpdateMany.mockImplementation(async () => ({ count: 0 }));
  const tx: any = {
    customer: {
      update: jest.fn(async () => ({})),
    },
  };
  for (const t of REPARENT_TABLES) {
    tx[t] = {
      updateMany: jest.fn(async () => ({
        count: opts.reparentCounts?.[t] ?? 0,
      })),
    };
  }

  const $transaction = jest.fn(async (cb: any) => cb(tx));

  const auditFindFirst = jest
    .fn()
    .mockResolvedValue(opts.priorAuditLog ?? null);

  const prisma = {
    customer: { findFirst },
    auditLog: { findFirst: auditFindFirst },
    $transaction,
  } as any;

  const auditService = { log: jest.fn(async () => undefined) } as any;
  const eventBus = { emitAndBuild: jest.fn() } as any;
  const service = new CustomerMergeService(prisma, auditService, eventBus);
  return { service, prisma, tx, auditService, eventBus, $transaction, auditFindFirst };
}

describe('CustomerMergeService (S17-8)', () => {
  it('rejects self-merge before any DB call', async () => {
    const { service, $transaction } = makeService();
    await expect(
      service.mergeCustomers(TENANT_ID, SOURCE_ID, SOURCE_ID, ACTOR_ID, 'k1'),
    ).rejects.toThrow(/Cannot merge a customer into itself/);
    expect($transaction).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when source customer is missing', async () => {
    const { service } = makeService({ source: null });
    await expect(
      service.mergeCustomers(TENANT_ID, SOURCE_ID, TARGET_ID, ACTOR_ID, 'k1'),
    ).rejects.toThrow(/Customer/);
  });

  it('throws NotFoundError when target customer is missing', async () => {
    const { service } = makeService({ target: null });
    await expect(
      service.mergeCustomers(TENANT_ID, SOURCE_ID, TARGET_ID, ACTOR_ID, 'k1'),
    ).rejects.toThrow(/Customer/);
  });

  it('re-parents every configured child table inside a transaction', async () => {
    const { service, tx, $transaction } = makeService({
      reparentCounts: {
        contract: 3,
        subscription: 2,
        loanRequest: 5,
      },
    });

    const result = await service.mergeCustomers(
      TENANT_ID,
      SOURCE_ID,
      TARGET_ID,
      ACTOR_ID,
      'k-1',
    );

    expect($transaction).toHaveBeenCalledTimes(1);
    for (const t of REPARENT_TABLES) {
      expect(tx[t].updateMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, customerId: SOURCE_ID },
        data: { customerId: TARGET_ID },
      });
    }
    expect(result.reparented.contract).toBe(3);
    expect(result.reparented.subscription).toBe(2);
    expect(result.reparented.loanRequest).toBe(5);
    expect(result.idempotentReplay).toBe(false);
  });

  it('merges metadata with target keys winning, source-only keys preserved', async () => {
    const { service, tx } = makeService();
    await service.mergeCustomers(
      TENANT_ID,
      SOURCE_ID,
      TARGET_ID,
      ACTOR_ID,
      'k-2',
    );

    // Find the target update call (not the source soft-delete).
    const targetUpdate = tx.customer.update.mock.calls.find(
      (c: any) => c[0].where.id === TARGET_ID,
    );
    expect(targetUpdate).toBeDefined();
    const merged = targetUpdate[0].data.metadata;
    // Target keys win.
    expect(merged.sharedKey).toBe('targetWins');
    expect(merged.targetOnlyKey).toBe('present');
    // Source-only keys survive.
    expect(merged.sourceOnlyKey).toBe('kept');
  });

  it('soft-deletes the source and records merge trail in metadata', async () => {
    const { service, tx } = makeService();
    await service.mergeCustomers(
      TENANT_ID,
      SOURCE_ID,
      TARGET_ID,
      ACTOR_ID,
      'k-3',
    );

    const sourceUpdate = tx.customer.update.mock.calls.find(
      (c: any) => c[0].where.id === SOURCE_ID,
    );
    expect(sourceUpdate).toBeDefined();
    const data = sourceUpdate[0].data;
    expect(data.status).toBe('inactive');
    expect(data.deletedAt).toBeInstanceOf(Date);
    expect(data.metadata._mergedInto).toBe(TARGET_ID);
    expect(data.metadata._mergedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    // Source-only metadata preserved on the soft-deleted row too.
    expect(data.metadata.sourceOnlyKey).toBe('kept');
  });

  it('emits an audit log with merge details', async () => {
    const { service, auditService } = makeService({
      reparentCounts: { contract: 1 },
    });

    await service.mergeCustomers(
      TENANT_ID,
      SOURCE_ID,
      TARGET_ID,
      ACTOR_ID,
      'k-4',
    );

    expect(auditService.log).toHaveBeenCalledTimes(1);
    const audit = auditService.log.mock.calls[0][0];
    expect(audit.tenantId).toBe(TENANT_ID);
    expect(audit.actorId).toBe(ACTOR_ID);
    expect(audit.actorType).toBe('user');
    expect(audit.resourceType).toBe('customer');
    expect(audit.resourceId).toBe(TARGET_ID);
    expect(audit.metadata.event).toBe('customer_merged');
    expect(audit.metadata.sourceCustomerId).toBe(SOURCE_ID);
    expect(audit.metadata.targetCustomerId).toBe(TARGET_ID);
    expect(audit.metadata.idempotencyKey).toBe('k-4');
    expect(audit.metadata.reparented.contract).toBe(1);
  });

  it('idempotent replay returns the prior result without touching DB', async () => {
    const priorMergedAt = '2026-05-17T10:00:00.000Z';
    const priorAuditLog = {
      id: 'audit-1',
      createdAt: new Date(priorMergedAt),
      metadata: {
        event: 'customer_merged',
        sourceCustomerId: SOURCE_ID,
        targetCustomerId: TARGET_ID,
        idempotencyKey: 'replay-key',
        reparented: { contract: 7 },
        mergedAt: priorMergedAt,
      },
    };
    const { service, $transaction, auditService } = makeService({
      priorAuditLog,
    });

    const result = await service.mergeCustomers(
      TENANT_ID,
      SOURCE_ID,
      TARGET_ID,
      ACTOR_ID,
      'replay-key',
    );

    expect(result.idempotentReplay).toBe(true);
    expect(result.targetCustomerId).toBe(TARGET_ID);
    expect(result.sourceCustomerId).toBe(SOURCE_ID);
    expect(result.reparented).toEqual({ contract: 7 });
    expect(result.mergedAt).toBe(priorMergedAt);

    // No transaction, no new audit log.
    expect($transaction).not.toHaveBeenCalled();
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('does not replay when the prior audit metadata is a different event', async () => {
    const priorAuditLog = {
      id: 'audit-1',
      createdAt: new Date(),
      metadata: {
        event: 'some_other_event',
        idempotencyKey: 'k-5',
      },
    };
    const { service, $transaction } = makeService({ priorAuditLog });

    await service.mergeCustomers(
      TENANT_ID,
      SOURCE_ID,
      TARGET_ID,
      ACTOR_ID,
      'k-5',
    );

    // Merge proceeded normally — replay short-circuit was rejected by
    // the event-type guard.
    expect($transaction).toHaveBeenCalledTimes(1);
  });
});
