import { WriteOffService } from '../write-off.service';
import { ValidationError } from '@lons/common';
import { Prisma } from '@prisma/client';

/**
 * S19-8 — write-off approval workflow tests.
 *
 * Coverage:
 *   - Threshold resolution (L1-only / L1+L2 / all three / no config fallback)
 *   - Request transitions the case + creates the approval rows
 *   - Approve flow reaches executeWriteOff only when ALL required
 *     levels approve
 *   - Reject cancels sibling pending rows + transitions case back to
 *     escalated
 *   - Cannot re-decide a finalised row
 *   - Cannot request when case is in a terminal/pending state
 */

const TENANT = 'tenant-1';
const CASE = 'case-1';
const ACTOR = 'user-1';

function makeService(opts: {
  caseStatus?: string;
  thresholds?: Array<{ level: any; maxAmountThreshold: any }>;
  existingApprovals?: any[];
}) {
  const collectionsCase: any = {
    id: CASE,
    tenantId: TENANT,
    contractId: 'contract-1',
    customerId: 'customer-1',
    status: opts.caseStatus ?? 'escalated',
    deletedAt: null,
  };
  const writeOffApprovalRows: any[] = opts.existingApprovals ?? [];

  const tx = {
    writeOffApproval: {
      create: jest.fn().mockImplementation(({ data }) => {
        const row = { id: `wo-${data.level}`, ...data };
        writeOffApprovalRows.push(row);
        return row;
      }),
    },
    collectionsCase: {
      update: jest.fn().mockResolvedValue({}),
    },
    contract: {
      update: jest.fn().mockResolvedValue({}),
    },
    ledgerEntry: {
      create: jest.fn().mockResolvedValue({}),
    },
  };

  const prisma: any = {
    collectionsCase: {
      findFirst: jest.fn().mockResolvedValue(collectionsCase),
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        ...collectionsCase,
        contract: { id: collectionsCase.contractId },
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    writeOffApproval: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockImplementation(() => writeOffApprovalRows),
      update: jest.fn().mockImplementation(({ where, data }) => {
        const row = writeOffApprovalRows.find((r) => r.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      }),
      updateMany: jest.fn().mockImplementation(({ where, data }) => {
        const matched = writeOffApprovalRows.filter((r) =>
          where.caseId === undefined || r.caseId === where.caseId,
        ).filter((r) => where.decision === undefined || r.decision === where.decision);
        for (const r of matched) Object.assign(r, data);
        return { count: matched.length };
      }),
    },
    writeOffThreshold: {
      findMany: jest.fn().mockResolvedValue(opts.thresholds ?? []),
    },
    $transaction: jest.fn().mockImplementation((cb: any) => cb(tx)),
  };

  const stateMachine: any = {
    transition: jest.fn().mockResolvedValue({}),
  };
  const eventBus: any = { emitAndBuild: jest.fn() };

  const service = new WriteOffService(prisma, stateMachine, eventBus);
  return { service, prisma, stateMachine, eventBus, tx, writeOffApprovalRows };
}

describe('WriteOffService.getRequiredApprovalLevels', () => {
  it('requires all 3 levels when no thresholds configured', async () => {
    const { service } = makeService({ thresholds: [] });
    const levels = await service.getRequiredApprovalLevels(TENANT, new Prisma.Decimal('100'), 'GHS');
    expect(levels).toEqual(['l1_officer', 'l2_manager', 'l3_director']);
  });

  it('L1-only when amount ≤ L1 threshold', async () => {
    const { service } = makeService({
      thresholds: [
        { level: 'l1_officer', maxAmountThreshold: new Prisma.Decimal('500') },
        { level: 'l2_manager', maxAmountThreshold: new Prisma.Decimal('5000') },
      ],
    });
    const levels = await service.getRequiredApprovalLevels(TENANT, new Prisma.Decimal('400'), 'GHS');
    expect(levels).toEqual(['l1_officer']);
  });

  it('L1+L2 when amount is between L1 and L2 thresholds', async () => {
    const { service } = makeService({
      thresholds: [
        { level: 'l1_officer', maxAmountThreshold: new Prisma.Decimal('500') },
        { level: 'l2_manager', maxAmountThreshold: new Prisma.Decimal('5000') },
      ],
    });
    const levels = await service.getRequiredApprovalLevels(TENANT, new Prisma.Decimal('2500'), 'GHS');
    expect(levels).toEqual(['l1_officer', 'l2_manager']);
  });

  it('All 3 levels when amount exceeds L2 threshold', async () => {
    const { service } = makeService({
      thresholds: [
        { level: 'l1_officer', maxAmountThreshold: new Prisma.Decimal('500') },
        { level: 'l2_manager', maxAmountThreshold: new Prisma.Decimal('5000') },
        { level: 'l3_director', maxAmountThreshold: new Prisma.Decimal('999999999') },
      ],
    });
    const levels = await service.getRequiredApprovalLevels(TENANT, new Prisma.Decimal('50000'), 'GHS');
    expect(levels).toEqual(['l1_officer', 'l2_manager', 'l3_director']);
  });
});

describe('WriteOffService.requestWriteOff', () => {
  const lowAmountThresholds = [
    { level: 'l1_officer', maxAmountThreshold: new Prisma.Decimal('500') },
    { level: 'l2_manager', maxAmountThreshold: new Prisma.Decimal('5000') },
  ];

  it('refuses when case is already in write_off_pending', async () => {
    const { service } = makeService({ caseStatus: 'write_off_pending' });
    await expect(
      service.requestWriteOff(TENANT, CASE, new Prisma.Decimal('100'), 'GHS', 'reason', ACTOR),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses when case is already written_off', async () => {
    const { service } = makeService({ caseStatus: 'written_off' });
    await expect(
      service.requestWriteOff(TENANT, CASE, new Prisma.Decimal('100'), 'GHS', 'reason', ACTOR),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('transitions case to write_off_pending + creates L1 approved row', async () => {
    const { service, stateMachine, writeOffApprovalRows } = makeService({
      caseStatus: 'escalated',
      thresholds: lowAmountThresholds,
    });
    await service.requestWriteOff(TENANT, CASE, new Prisma.Decimal('100'), 'GHS', 'no recourse', ACTOR);
    expect(stateMachine.transition).toHaveBeenCalledWith(
      TENANT, CASE, 'write_off_pending', ACTOR, 'user', expect.any(String),
    );
    expect(writeOffApprovalRows[0]).toMatchObject({
      level: 'l1_officer',
      decision: 'approved',
      currency: 'GHS',
    });
  });

  it('creates L2 pending row when amount > L1 threshold', async () => {
    const { service, writeOffApprovalRows } = makeService({
      caseStatus: 'escalated',
      thresholds: lowAmountThresholds,
    });
    await service.requestWriteOff(TENANT, CASE, new Prisma.Decimal('1000'), 'GHS', 'over L1', ACTOR);
    const l2 = writeOffApprovalRows.find((r) => r.level === 'l2_manager');
    expect(l2).toBeDefined();
    expect(l2.decision).toBe('pending');
  });

  it('executes immediately when L1-only is sufficient', async () => {
    const { service, stateMachine, tx } = makeService({
      caseStatus: 'escalated',
      thresholds: lowAmountThresholds,
    });
    await service.requestWriteOff(TENANT, CASE, new Prisma.Decimal('100'), 'GHS', 'small', ACTOR);
    // executeWriteOff was called → ledger entry + written_off transition.
    expect(tx.ledgerEntry.create).toHaveBeenCalled();
    expect(stateMachine.transition).toHaveBeenCalledWith(
      TENANT, CASE, 'written_off', ACTOR, 'user', expect.any(String),
    );
  });
});

describe('WriteOffService.decideWriteOff', () => {
  function setupApprovals(existing: any[]) {
    return makeService({
      caseStatus: 'write_off_pending',
      existingApprovals: existing,
    });
  }

  it('rejects re-deciding an already-finalised approval', async () => {
    const { service, prisma } = setupApprovals([]);
    prisma.writeOffApproval.findUnique.mockResolvedValueOnce({
      id: 'wo-l2', tenantId: TENANT, caseId: CASE,
      level: 'l2_manager', decision: 'approved',
      amount: new Prisma.Decimal('1000'), currency: 'GHS',
    });
    await expect(
      service.decideWriteOff(TENANT, CASE, 'l2_manager', 'approved', ACTOR),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejection cancels sibling pending rows and transitions case back to escalated', async () => {
    const { service, stateMachine, prisma, writeOffApprovalRows } = setupApprovals([
      { id: 'wo-l1', caseId: CASE, level: 'l1_officer', decision: 'approved',
        amount: new Prisma.Decimal('10000'), currency: 'GHS' },
      { id: 'wo-l2', caseId: CASE, level: 'l2_manager', decision: 'pending',
        amount: new Prisma.Decimal('10000'), currency: 'GHS' },
      { id: 'wo-l3', caseId: CASE, level: 'l3_director', decision: 'pending',
        amount: new Prisma.Decimal('10000'), currency: 'GHS' },
    ]);
    prisma.writeOffApproval.findUnique.mockResolvedValueOnce({
      id: 'wo-l2', tenantId: TENANT, caseId: CASE,
      level: 'l2_manager', decision: 'pending',
      amount: new Prisma.Decimal('10000'), currency: 'GHS',
    });
    await service.decideWriteOff(TENANT, CASE, 'l2_manager', 'rejected', ACTOR, 'manager veto');
    expect(stateMachine.transition).toHaveBeenCalledWith(
      TENANT, CASE, 'escalated', ACTOR, 'user', expect.stringContaining('manager veto'),
    );
    // L3 row also flipped to rejected.
    const l3 = writeOffApprovalRows.find((r) => r.id === 'wo-l3');
    expect(l3.decision).toBe('rejected');
  });

  it('approval at L2 (with L3 still pending) does NOT execute', async () => {
    const { service, stateMachine, prisma } = setupApprovals([
      { id: 'wo-l1', caseId: CASE, level: 'l1_officer', decision: 'approved',
        amount: new Prisma.Decimal('10000'), currency: 'GHS' },
      { id: 'wo-l2', caseId: CASE, level: 'l2_manager', decision: 'pending',
        amount: new Prisma.Decimal('10000'), currency: 'GHS' },
      { id: 'wo-l3', caseId: CASE, level: 'l3_director', decision: 'pending',
        amount: new Prisma.Decimal('10000'), currency: 'GHS' },
    ]);
    prisma.writeOffApproval.findUnique.mockResolvedValueOnce({
      id: 'wo-l2', tenantId: TENANT, caseId: CASE,
      level: 'l2_manager', decision: 'pending',
      amount: new Prisma.Decimal('10000'), currency: 'GHS',
    });
    await service.decideWriteOff(TENANT, CASE, 'l2_manager', 'approved', ACTOR);
    // No written_off transition while L3 is still pending.
    expect(stateMachine.transition).not.toHaveBeenCalledWith(
      TENANT, CASE, 'written_off', expect.anything(), expect.anything(), expect.anything(),
    );
  });

  it('approval at the LAST pending level executes the write-off', async () => {
    const { service, stateMachine, prisma, tx } = setupApprovals([
      { id: 'wo-l1', caseId: CASE, level: 'l1_officer', decision: 'approved',
        amount: new Prisma.Decimal('1000'), currency: 'GHS' },
      { id: 'wo-l2', caseId: CASE, level: 'l2_manager', decision: 'pending',
        amount: new Prisma.Decimal('1000'), currency: 'GHS' },
    ]);
    prisma.writeOffApproval.findUnique.mockResolvedValueOnce({
      id: 'wo-l2', tenantId: TENANT, caseId: CASE,
      level: 'l2_manager', decision: 'pending',
      amount: new Prisma.Decimal('1000'), currency: 'GHS',
    });
    // After update, both rows are approved (the test mock mutates the
    // row in place so findMany returns the updated state).
    await service.decideWriteOff(TENANT, CASE, 'l2_manager', 'approved', ACTOR);
    expect(tx.ledgerEntry.create).toHaveBeenCalled();
    expect(stateMachine.transition).toHaveBeenCalledWith(
      TENANT, CASE, 'written_off', ACTOR, 'user', expect.any(String),
    );
  });
});
