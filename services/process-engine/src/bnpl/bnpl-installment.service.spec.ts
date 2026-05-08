/**
 * BNPL installment lifecycle — Sprint 11 Track B / B6-2 + B9.
 * Mock-Prisma tests for payment processing, mark-overdue scheduler pass,
 * acceleration, and waiver.
 */

import { BnplInstallmentService } from './bnpl-installment.service';
import {
  BnplTransactionStatus,
  InstallmentStatus,
} from '@lons/database';

const TENANT = '11111111-1111-1111-1111-111111111111';
const CUSTOMER = '22222222-2222-2222-2222-222222222222';
const TX_ID = '33333333-3333-3333-3333-333333333333';
const INST_ID = '44444444-4444-4444-4444-444444444444';

function makeInstallment(overrides: Partial<any> = {}) {
  return {
    id: INST_ID,
    transactionId: TX_ID,
    tenantId: TENANT,
    installmentNumber: 1,
    amount: '40',
    paidAmount: '0',
    status: InstallmentStatus.pending,
    dueDate: new Date('2026-05-01'),
    transaction: {
      id: TX_ID,
      customerId: CUSTOMER,
      currency: 'GHS',
      totalRepayable: '120.0000',
      status: BnplTransactionStatus.approved,
      product: { overdraftConfig: { acceleration: { maxConsecutiveMissed: 2 } } },
      installments: [],
    },
    ...overrides,
  };
}

describe('BnplInstallmentService.processInstallmentPayment', () => {
  it('rejects non-positive amounts', async () => {
    const prisma = {
      installmentSchedule: { findFirst: jest.fn().mockResolvedValue(makeInstallment()) },
    };
    const service = new BnplInstallmentService(
      prisma as any,
      { emitAndBuild: jest.fn() } as any,
    );
    await expect(
      service.processInstallmentPayment(TENANT, INST_ID, '0'),
    ).rejects.toThrow(/positive/);
  });

  it('rejects payment on an already-paid installment', async () => {
    const prisma = {
      installmentSchedule: {
        findFirst: jest
          .fn()
          .mockResolvedValue(makeInstallment({ status: InstallmentStatus.paid })),
      },
    };
    const service = new BnplInstallmentService(
      prisma as any,
      { emitAndBuild: jest.fn() } as any,
    );
    await expect(
      service.processInstallmentPayment(TENANT, INST_ID, '40'),
    ).rejects.toThrow(/already paid/);
  });

  it('rejects payment that exceeds remaining balance on the installment', async () => {
    const prisma = {
      installmentSchedule: {
        findFirst: jest.fn().mockResolvedValue(makeInstallment({ paidAmount: '20' })),
      },
    };
    const service = new BnplInstallmentService(
      prisma as any,
      { emitAndBuild: jest.fn() } as any,
    );
    // 20 already paid, 20 remaining → 25 is too much
    await expect(
      service.processInstallmentPayment(TENANT, INST_ID, '25'),
    ).rejects.toThrow(/exceeds remaining/);
  });

  it('records a partial payment without flipping status', async () => {
    const prisma = {
      installmentSchedule: {
        findFirst: jest.fn().mockResolvedValue(makeInstallment()),
        update: jest.fn(),
      },
      bnplTransaction: { update: jest.fn() },
      installmentSchedule_count: jest.fn().mockResolvedValue(0),
    };
    (prisma.installmentSchedule as any).count = jest.fn();
    const eventBus = { emitAndBuild: jest.fn() };
    const service = new BnplInstallmentService(prisma as any, eventBus as any);

    const result = await service.processInstallmentPayment(TENANT, INST_ID, '10');

    expect(result.installmentPaidInFull).toBe(false);
    expect(result.transactionCompleted).toBe(false);
    expect(prisma.installmentSchedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paidAmount: '10.0000' }),
      }),
    );
    // Partial — paid event not emitted yet
    const evtNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
    expect(evtNames).not.toContain('bnpl.installment.paid');
  });

  it('flips installment to paid + emits paid event when fully covered', async () => {
    const prisma = {
      installmentSchedule: {
        findFirst: jest.fn().mockResolvedValue(makeInstallment()),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(1), // still other installments unpaid
      },
      bnplTransaction: { update: jest.fn() },
    };
    const eventBus = { emitAndBuild: jest.fn() };
    const service = new BnplInstallmentService(prisma as any, eventBus as any);

    const result = await service.processInstallmentPayment(TENANT, INST_ID, '40');

    expect(result.installmentPaidInFull).toBe(true);
    expect(result.transactionCompleted).toBe(false);
    const evtNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
    expect(evtNames).toContain('bnpl.installment.paid');
    expect(evtNames).not.toContain('bnpl.purchase.completed');
  });

  it('completes the transaction when the last installment is paid', async () => {
    const prisma = {
      installmentSchedule: {
        findFirst: jest.fn().mockResolvedValue(makeInstallment()),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      bnplTransaction: { update: jest.fn() },
    };
    const eventBus = { emitAndBuild: jest.fn() };
    const service = new BnplInstallmentService(prisma as any, eventBus as any);

    const result = await service.processInstallmentPayment(TENANT, INST_ID, '40');

    expect(result.transactionCompleted).toBe(true);
    expect(prisma.bnplTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: BnplTransactionStatus.completed }),
      }),
    );
    const evtNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
    expect(evtNames).toContain('bnpl.purchase.completed');
  });
});

describe('BnplInstallmentService.markOverdueInstallments', () => {
  it('marks pending installments past dueDate as overdue and emits events', async () => {
    const inst = makeInstallment({
      status: InstallmentStatus.pending,
      dueDate: new Date('2026-04-25'),
    });
    // The mark-overdue pass invokes evaluateAcceleration per affected tx,
    // so the bnplTransaction.findFirst stub needs to return a tx whose
    // installments don't cross the acceleration threshold.
    const txForAcceleration = {
      id: TX_ID,
      tenantId: TENANT,
      customerId: CUSTOMER,
      status: BnplTransactionStatus.approved,
      product: { overdraftConfig: { acceleration: { maxConsecutiveMissed: 2 } } },
      installments: [{ status: InstallmentStatus.overdue, amount: '40', paidAmount: '0' }],
    };
    const prisma = {
      installmentSchedule: {
        findMany: jest.fn().mockResolvedValue([inst]),
        update: jest.fn(),
      },
      bnplTransaction: { findFirst: jest.fn().mockResolvedValue(txForAcceleration) },
    };
    const eventBus = { emitAndBuild: jest.fn() };
    const service = new BnplInstallmentService(prisma as any, eventBus as any);

    const result = await service.markOverdueInstallments(TENANT, new Date('2026-05-02'));

    expect(result.markedOverdue).toBe(1);
    expect(result.accelerated).toBe(0); // 1 overdue < threshold of 2
    expect(prisma.installmentSchedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: InstallmentStatus.overdue,
          daysPastDue: 7,
        }),
      }),
    );
    const evtNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
    expect(evtNames).toContain('bnpl.installment.overdue');
  });

  it('skips when no installments are past due', async () => {
    const prisma = {
      installmentSchedule: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new BnplInstallmentService(
      prisma as any,
      { emitAndBuild: jest.fn() } as any,
    );

    const result = await service.markOverdueInstallments(TENANT, new Date('2026-05-02'));
    expect(result).toEqual({ markedOverdue: 0, accelerated: 0 });
  });
});

describe('BnplInstallmentService.evaluateAcceleration (B9)', () => {
  function withInstallments(rows: Array<{ status: InstallmentStatus; amount?: string }>) {
    return {
      id: TX_ID,
      tenantId: TENANT,
      customerId: CUSTOMER,
      status: BnplTransactionStatus.approved,
      product: { overdraftConfig: { acceleration: { maxConsecutiveMissed: 2 } } },
      installments: rows.map((r, i) => ({
        installmentNumber: i + 1,
        status: r.status,
        amount: r.amount ?? '40',
        paidAmount: '0',
      })),
    };
  }

  it('does NOT accelerate below the threshold', async () => {
    const prisma = {
      bnplTransaction: {
        findFirst: jest
          .fn()
          .mockResolvedValue(withInstallments([{ status: InstallmentStatus.overdue }])),
      },
    };
    const eventBus = { emitAndBuild: jest.fn() };
    const service = new BnplInstallmentService(prisma as any, eventBus as any);

    const result = await service.evaluateAcceleration(TENANT, TX_ID);
    expect(result.accelerated).toBe(false);
  });

  it('accelerates when N consecutive overdue installments are observed', async () => {
    const prisma = {
      bnplTransaction: {
        findFirst: jest.fn().mockResolvedValue(
          withInstallments([
            { status: InstallmentStatus.overdue },
            { status: InstallmentStatus.overdue },
            { status: InstallmentStatus.pending },
          ]),
        ),
        update: jest.fn(),
      },
      installmentSchedule: { updateMany: jest.fn() },
      $transaction: jest.fn(async (ops: any) => ops),
    };
    const eventBus = { emitAndBuild: jest.fn() };
    const service = new BnplInstallmentService(prisma as any, eventBus as any);

    const result = await service.evaluateAcceleration(TENANT, TX_ID);

    expect(result.accelerated).toBe(true);
    expect(result.missedInstallments).toBe(2);
    expect(prisma.$transaction).toHaveBeenCalled();
    const evtNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
    expect(evtNames).toContain('bnpl.accelerated');
    // FIX 7: collections referral fires alongside acceleration.
    expect(evtNames).toContain('bnpl.collections.referred');
    const referral = eventBus.emitAndBuild.mock.calls.find(
      (c) => c[0] === 'bnpl.collections.referred',
    );
    expect(referral?.[2]).toMatchObject({
      transactionId: TX_ID,
      customerId: CUSTOMER,
      missedInstallments: 2,
    });
  });

  it('skips acceleration on already-accelerated transactions', async () => {
    const prisma = {
      bnplTransaction: {
        findFirst: jest.fn().mockResolvedValue({
          ...withInstallments([{ status: InstallmentStatus.overdue }, { status: InstallmentStatus.overdue }]),
          status: BnplTransactionStatus.accelerated,
        }),
      },
    };
    const service = new BnplInstallmentService(
      prisma as any,
      { emitAndBuild: jest.fn() } as any,
    );

    const result = await service.evaluateAcceleration(TENANT, TX_ID);
    expect(result.accelerated).toBe(false);
  });
});

describe('BnplInstallmentService.waiveInstallment', () => {
  it('marks the installment waived and emits event', async () => {
    const prisma = {
      installmentSchedule: {
        findFirst: jest.fn().mockResolvedValue(makeInstallment()),
        update: jest.fn(),
      },
    };
    const eventBus = { emitAndBuild: jest.fn() };
    const service = new BnplInstallmentService(prisma as any, eventBus as any);

    await service.waiveInstallment(TENANT, INST_ID, 'goodwill_partial_refund', 'op-1');

    expect(prisma.installmentSchedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: InstallmentStatus.waived },
      }),
    );
    expect(eventBus.emitAndBuild.mock.calls[0][0]).toBe('bnpl.installment.waived');
  });

  it('rejects waiver of a paid installment', async () => {
    const prisma = {
      installmentSchedule: {
        findFirst: jest
          .fn()
          .mockResolvedValue(makeInstallment({ status: InstallmentStatus.paid })),
      },
    };
    const service = new BnplInstallmentService(
      prisma as any,
      { emitAndBuild: jest.fn() } as any,
    );

    await expect(
      service.waiveInstallment(TENANT, INST_ID, 'r', 'op-1'),
    ).rejects.toThrow(/already paid/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Sprint 12 G2 — collectInstallment (auto-collection on due date)
// ───────────────────────────────────────────────────────────────────────────

describe('BnplInstallmentService.collectInstallment (Sprint 12 G2)', () => {
  function makeAutoCollectInstallment(overrides: Partial<any> = {}) {
    return {
      ...makeInstallment(),
      collectionAttemptCount: 0,
      lastCollectionAttemptAt: null,
      transaction: {
        ...makeInstallment().transaction,
        currency: 'GHS',
        product: {
          bnplConfig: {
            autoCollectOnDueDate: true,
            collectionRetryMaxAttempts: 3,
          },
        },
        customer: {
          id: CUSTOMER,
          metadata: { walletId: 'WALLET-EVEN-AAA' }, // even hash for happy paths
        },
      },
      ...overrides,
    };
  }

  it('collects successfully — emits BNPL_INSTALLMENT_COLLECTED + BNPL_INSTALLMENT_PAID, returns collected', async () => {
    const inst = makeAutoCollectInstallment();
    const prisma = {
      installmentSchedule: {
        findFirst: jest.fn().mockResolvedValue(inst),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
      },
      bnplTransaction: { update: jest.fn() },
    } as any;
    const eventBus = { emitAndBuild: jest.fn() };
    const adapter = {
      collect: jest.fn().mockResolvedValue({ success: true, walletRef: 'OK-1' }),
    };
    const service = new BnplInstallmentService(
      prisma,
      eventBus as any,
      adapter as any,
    );

    const result = await service.collectInstallment(TENANT, INST_ID, 'idem-1');

    expect(result.status).toBe('collected');
    expect(adapter.collect).toHaveBeenCalledWith(
      // amount is already-canonical Decimal-as-string ('40' minus '0' = '40.0000').
      expect.objectContaining({ walletId: 'WALLET-EVEN-AAA', amount: '40.0000' }),
    );
    const evtNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
    expect(evtNames).toContain('bnpl.installment.collected');
    expect(evtNames).toContain('bnpl.installment.paid');
  });

  it('insufficient balance — increments counter, emits failed + wallet insufficient events', async () => {
    const inst = makeAutoCollectInstallment({
      collectionAttemptCount: 1,
    });
    const prisma = {
      installmentSchedule: {
        findFirst: jest.fn().mockResolvedValue(inst),
        update: jest.fn(),
      },
    } as any;
    const eventBus = { emitAndBuild: jest.fn() };
    const adapter = {
      collect: jest
        .fn()
        .mockResolvedValue({ success: false, reason: 'insufficient_balance' }),
    };
    const service = new BnplInstallmentService(
      prisma,
      eventBus as any,
      adapter as any,
    );

    const result = await service.collectInstallment(TENANT, INST_ID, 'idem-2');

    expect(result).toEqual({
      status: 'failed',
      reason: 'insufficient_balance',
      attempt: 2,
    });
    // Counter and timestamp persisted.
    expect(prisma.installmentSchedule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ collectionAttemptCount: 2 }),
      }),
    );
    const evtNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
    expect(evtNames).toContain('bnpl.installment.collection_failed');
    expect(evtNames).toContain('wallet.balance.insufficient');
    expect(evtNames).not.toContain('bnpl.installment.paid');
  });

  it('skips when auto-collect is disabled in bnplConfig', async () => {
    const inst = makeAutoCollectInstallment({
      transaction: {
        ...makeAutoCollectInstallment().transaction,
        product: { bnplConfig: { autoCollectOnDueDate: false } },
      },
    });
    const prisma = {
      installmentSchedule: { findFirst: jest.fn().mockResolvedValue(inst) },
    } as any;
    const adapter = { collect: jest.fn() };
    const service = new BnplInstallmentService(
      prisma,
      { emitAndBuild: jest.fn() } as any,
      adapter as any,
    );

    const result = await service.collectInstallment(TENANT, INST_ID);

    expect(result).toEqual({ status: 'skipped', reason: 'auto_collect_disabled' });
    expect(adapter.collect).not.toHaveBeenCalled();
  });

  it('skips when collection attempt count has reached the max', async () => {
    const inst = makeAutoCollectInstallment({
      collectionAttemptCount: 3, // == default cap
    });
    const prisma = {
      installmentSchedule: { findFirst: jest.fn().mockResolvedValue(inst) },
    } as any;
    const adapter = { collect: jest.fn() };
    const service = new BnplInstallmentService(
      prisma,
      { emitAndBuild: jest.fn() } as any,
      adapter as any,
    );

    const result = await service.collectInstallment(TENANT, INST_ID);

    expect(result).toEqual({ status: 'skipped', reason: 'max_attempts_reached' });
    expect(adapter.collect).not.toHaveBeenCalled();
  });

  it('skips when the installment is already paid', async () => {
    const inst = makeAutoCollectInstallment({ status: InstallmentStatus.paid });
    const prisma = {
      installmentSchedule: { findFirst: jest.fn().mockResolvedValue(inst) },
    } as any;
    const adapter = { collect: jest.fn() };
    const service = new BnplInstallmentService(
      prisma,
      { emitAndBuild: jest.fn() } as any,
      adapter as any,
    );

    const result = await service.collectInstallment(TENANT, INST_ID);

    expect(result.status).toBe('skipped');
    expect(adapter.collect).not.toHaveBeenCalled();
  });

  it('throws a clear error if no wallet adapter is registered', async () => {
    const prisma = { installmentSchedule: { findFirst: jest.fn() } } as any;
    const service = new BnplInstallmentService(
      prisma,
      { emitAndBuild: jest.fn() } as any,
    );

    await expect(service.collectInstallment(TENANT, INST_ID)).rejects.toThrow(
      /no BNPL_COLLECTION_ADAPTER/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Sprint 12 G3 — early settlement + advance payment
// ─────────────────────────────────────────────────────────────────────────

function makeTransaction(overrides: Partial<any> = {}) {
  const installments = overrides.installments ?? [
    {
      id: 'inst-1',
      installmentNumber: 1,
      amount: '40',
      paidAmount: '0',
      status: InstallmentStatus.pending,
      dueDate: new Date('2026-05-15'),
    },
    {
      id: 'inst-2',
      installmentNumber: 2,
      amount: '40',
      paidAmount: '0',
      status: InstallmentStatus.pending,
      dueDate: new Date('2026-06-15'),
    },
    {
      id: 'inst-3',
      installmentNumber: 3,
      amount: '40',
      paidAmount: '0',
      status: InstallmentStatus.pending,
      dueDate: new Date('2026-07-15'),
    },
  ];
  return {
    id: TX_ID,
    tenantId: TENANT,
    customerId: CUSTOMER,
    merchantId: 'merch-1',
    currency: 'GHS',
    totalRepayable: '120.0000',
    status: BnplTransactionStatus.active,
    product: {
      bnplConfig: {
        earlySettlementAllowed: true,
        earlySettlementDiscountPercent: '0',
        advancePaymentAllowed: true,
      },
      overdraftConfig: null,
    },
    customer: { id: CUSTOMER, metadata: { walletId: 'wallet-even' } },
    deletedAt: null,
    ...overrides,
    installments,
  };
}

function makeMockAdapter(success = true) {
  return {
    collect: jest.fn().mockResolvedValue(
      success
        ? { success: true, walletRef: 'MOCK-REF-1' }
        : { success: false, reason: 'insufficient_balance' },
    ),
  };
}

function makePrismaForTx(tx: any) {
  return {
    bnplTransaction: {
      findFirst: jest.fn().mockResolvedValue(tx),
      update: jest.fn().mockResolvedValue(tx),
    },
    installmentSchedule: {
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
    $transaction: jest.fn(async (ops: any) => ops),
  };
}

describe('BnplInstallmentService.earlySettlement', () => {
  it('settles 3 pending installments of 40 each with 0% discount → 120 / 0 / 3', async () => {
    const tx = makeTransaction();
    const prisma = makePrismaForTx(tx);
    const eventBus = { emitAndBuild: jest.fn() };
    const adapter = makeMockAdapter(true);
    const service = new BnplInstallmentService(
      prisma as any,
      eventBus as any,
      adapter as any,
    );

    const result = await service.earlySettlement(TENANT, {
      transactionId: TX_ID,
      idempotencyKey: 'key-1',
    });

    expect(result.settlementAmount).toBe('120.0000');
    expect(result.discountApplied).toBe('0.0000');
    expect(result.installmentsClosed).toBe(3);
    expect(adapter.collect).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '120.0000' }),
    );
    const evtNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
    expect(evtNames).toContain('bnpl.early_settlement');
    expect(evtNames).toContain('bnpl.purchase.completed');
  });

  it('applies a 2% discount → 120 × 0.98 = 117.6 settlement, 2.4 discount', async () => {
    const tx = makeTransaction({
      product: {
        bnplConfig: {
          earlySettlementAllowed: true,
          earlySettlementDiscountPercent: '2.00',
          advancePaymentAllowed: true,
        },
        overdraftConfig: null,
      },
    });
    const prisma = makePrismaForTx(tx);
    const eventBus = { emitAndBuild: jest.fn() };
    const adapter = makeMockAdapter(true);
    const service = new BnplInstallmentService(
      prisma as any,
      eventBus as any,
      adapter as any,
    );

    const result = await service.earlySettlement(TENANT, {
      transactionId: TX_ID,
      idempotencyKey: 'key-2',
    });

    expect(result.settlementAmount).toBe('117.6000');
    expect(result.discountApplied).toBe('2.4000');
    expect(result.installmentsClosed).toBe(3);
    const evtPayload = eventBus.emitAndBuild.mock.calls.find(
      (c) => c[0] === 'bnpl.early_settlement',
    )?.[2];
    expect(evtPayload).toMatchObject({
      settlementAmount: '117.6000',
      discountApplied: '2.4000',
      installmentsClosed: 3,
      currency: 'GHS',
    });
  });

  it('rejects when bnplConfig.earlySettlementAllowed is false', async () => {
    const tx = makeTransaction({
      product: {
        bnplConfig: {
          earlySettlementAllowed: false,
          earlySettlementDiscountPercent: '0',
        },
        overdraftConfig: null,
      },
    });
    const prisma = makePrismaForTx(tx);
    const eventBus = { emitAndBuild: jest.fn() };
    const adapter = makeMockAdapter(true);
    const service = new BnplInstallmentService(
      prisma as any,
      eventBus as any,
      adapter as any,
    );

    await expect(
      service.earlySettlement(TENANT, {
        transactionId: TX_ID,
        idempotencyKey: 'key-3',
      }),
    ).rejects.toThrow(/not allowed/);
    expect(adapter.collect).not.toHaveBeenCalled();
  });

  it('rejects early settlement on a refunded transaction', async () => {
    const tx = makeTransaction({ status: BnplTransactionStatus.refunded });
    const prisma = makePrismaForTx(tx);
    const eventBus = { emitAndBuild: jest.fn() };
    const adapter = makeMockAdapter(true);
    const service = new BnplInstallmentService(
      prisma as any,
      eventBus as any,
      adapter as any,
    );

    await expect(
      service.earlySettlement(TENANT, {
        transactionId: TX_ID,
        idempotencyKey: 'key-4',
      }),
    ).rejects.toThrow(/Cannot early-settle/);
  });

  it('idempotency: re-running on an already-completed transaction returns cached result without re-charging', async () => {
    const completedInstallments = [
      {
        id: 'inst-1',
        installmentNumber: 1,
        amount: '40',
        paidAmount: '40',
        status: InstallmentStatus.paid,
        dueDate: new Date('2026-05-15'),
      },
      {
        id: 'inst-2',
        installmentNumber: 2,
        amount: '40',
        paidAmount: '40',
        status: InstallmentStatus.paid,
        dueDate: new Date('2026-06-15'),
      },
      {
        id: 'inst-3',
        installmentNumber: 3,
        amount: '40',
        paidAmount: '40',
        status: InstallmentStatus.paid,
        dueDate: new Date('2026-07-15'),
      },
    ];
    const tx = makeTransaction({
      status: BnplTransactionStatus.completed,
      installments: completedInstallments,
    });
    const prisma = makePrismaForTx(tx);
    const eventBus = { emitAndBuild: jest.fn() };
    const adapter = makeMockAdapter(true);
    const service = new BnplInstallmentService(
      prisma as any,
      eventBus as any,
      adapter as any,
    );

    const result = await service.earlySettlement(TENANT, {
      transactionId: TX_ID,
      idempotencyKey: 'key-replay',
    });

    expect(result.settlementAmount).toBe('120.0000');
    expect(result.installmentsClosed).toBe(0);
    expect(adapter.collect).not.toHaveBeenCalled();
    // No state-change events on a replay.
    const evtNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
    expect(evtNames).not.toContain('bnpl.early_settlement');
    expect(evtNames).not.toContain('bnpl.purchase.completed');
  });

  // ───────────────────────────────────────────────────────────────────────
  // Sprint 13 S13-5 — discount must apply to actual unpaid balance.
  // ───────────────────────────────────────────────────────────────────────

  it('applies discount to actual remaining balance, not gross installment amounts (S13-5 fix)', async () => {
    const installments = [
      {
        id: 'inst-1',
        installmentNumber: 1,
        amount: '1000',
        paidAmount: '0',
        status: InstallmentStatus.pending,
        dueDate: new Date('2026-05-15'),
      },
      {
        id: 'inst-2',
        installmentNumber: 2,
        amount: '1000',
        paidAmount: '400',
        status: InstallmentStatus.pending,
        dueDate: new Date('2026-06-15'),
      },
      {
        id: 'inst-3',
        installmentNumber: 3,
        amount: '1000',
        paidAmount: '0',
        status: InstallmentStatus.pending,
        dueDate: new Date('2026-07-15'),
      },
    ];
    const tx = makeTransaction({
      product: {
        bnplConfig: {
          earlySettlementAllowed: true,
          earlySettlementDiscountPercent: '0',
          advancePaymentAllowed: true,
        },
        overdraftConfig: null,
      },
      installments,
    });
    const prisma = makePrismaForTx(tx);
    const eventBus = { emitAndBuild: jest.fn() };
    const adapter = makeMockAdapter(true);
    const service = new BnplInstallmentService(
      prisma as any,
      eventBus as any,
      adapter as any,
    );

    const result = await service.earlySettlement(TENANT, {
      transactionId: TX_ID,
      idempotencyKey: 'key-s13-5-a',
    });

    // Actual remaining = 1000 + (1000 - 400) + 1000 = 2600, NOT 3000.
    expect(result.settlementAmount).toBe('2600.0000');
    expect(result.discountApplied).toBe('0.0000');
    expect(result.installmentsClosed).toBe(3);
    expect(adapter.collect).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '2600.0000' }),
    );
  });

  it('preserves prior behavior when no installments are partially paid', async () => {
    const installments = [
      {
        id: 'inst-1',
        installmentNumber: 1,
        amount: '1000',
        paidAmount: '0',
        status: InstallmentStatus.pending,
        dueDate: new Date('2026-05-15'),
      },
      {
        id: 'inst-2',
        installmentNumber: 2,
        amount: '1000',
        paidAmount: '0',
        status: InstallmentStatus.pending,
        dueDate: new Date('2026-06-15'),
      },
      {
        id: 'inst-3',
        installmentNumber: 3,
        amount: '1000',
        paidAmount: '0',
        status: InstallmentStatus.pending,
        dueDate: new Date('2026-07-15'),
      },
    ];
    const tx = makeTransaction({
      product: {
        bnplConfig: {
          earlySettlementAllowed: true,
          earlySettlementDiscountPercent: '2.00',
          advancePaymentAllowed: true,
        },
        overdraftConfig: null,
      },
      installments,
    });
    const prisma = makePrismaForTx(tx);
    const eventBus = { emitAndBuild: jest.fn() };
    const adapter = makeMockAdapter(true);
    const service = new BnplInstallmentService(
      prisma as any,
      eventBus as any,
      adapter as any,
    );

    const result = await service.earlySettlement(TENANT, {
      transactionId: TX_ID,
      idempotencyKey: 'key-s13-5-b',
    });

    // totalRemaining = 3000; discount = 60; settlement = 2940.
    expect(result.settlementAmount).toBe('2940.0000');
    expect(result.discountApplied).toBe('60.0000');
    expect(result.installmentsClosed).toBe(3);
    expect(adapter.collect).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '2940.0000' }),
    );
  });

  it('applies discount to actual remaining when multiple installments partially paid', async () => {
    const installments = [
      {
        id: 'inst-1',
        installmentNumber: 1,
        amount: '1000',
        paidAmount: '250',
        status: InstallmentStatus.pending,
        dueDate: new Date('2026-05-15'),
      },
      {
        id: 'inst-2',
        installmentNumber: 2,
        amount: '1000',
        paidAmount: '750',
        status: InstallmentStatus.pending,
        dueDate: new Date('2026-06-15'),
      },
    ];

    // 0% discount → totalRemaining = 750 + 250 = 1000 → settlement = 1000.
    {
      const tx = makeTransaction({
        product: {
          bnplConfig: {
            earlySettlementAllowed: true,
            earlySettlementDiscountPercent: '0',
            advancePaymentAllowed: true,
          },
          overdraftConfig: null,
        },
        installments,
      });
      const prisma = makePrismaForTx(tx);
      const eventBus = { emitAndBuild: jest.fn() };
      const adapter = makeMockAdapter(true);
      const service = new BnplInstallmentService(
        prisma as any,
        eventBus as any,
        adapter as any,
      );

      const result = await service.earlySettlement(TENANT, {
        transactionId: TX_ID,
        idempotencyKey: 'key-s13-5-c-0pct',
      });

      expect(result.settlementAmount).toBe('1000.0000');
      expect(result.discountApplied).toBe('0.0000');
      expect(result.installmentsClosed).toBe(2);
      expect(adapter.collect).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '1000.0000' }),
      );
    }

    // 5% discount → discount = 50, settlement = 950.
    {
      const tx = makeTransaction({
        product: {
          bnplConfig: {
            earlySettlementAllowed: true,
            earlySettlementDiscountPercent: '5.00',
            advancePaymentAllowed: true,
          },
          overdraftConfig: null,
        },
        installments,
      });
      const prisma = makePrismaForTx(tx);
      const eventBus = { emitAndBuild: jest.fn() };
      const adapter = makeMockAdapter(true);
      const service = new BnplInstallmentService(
        prisma as any,
        eventBus as any,
        adapter as any,
      );

      const result = await service.earlySettlement(TENANT, {
        transactionId: TX_ID,
        idempotencyKey: 'key-s13-5-c-5pct',
      });

      expect(result.settlementAmount).toBe('950.0000');
      expect(result.discountApplied).toBe('50.0000');
      expect(result.installmentsClosed).toBe(2);
      expect(adapter.collect).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '950.0000' }),
      );
    }
  });
});

describe('BnplInstallmentService.advancePayment', () => {
  it('pays installments [2, 3] of 4 pending and leaves [1, 4] pending', async () => {
    const installments = [
      {
        id: 'inst-1',
        installmentNumber: 1,
        amount: '40',
        paidAmount: '0',
        status: InstallmentStatus.pending,
        dueDate: new Date('2026-05-15'),
      },
      {
        id: 'inst-2',
        installmentNumber: 2,
        amount: '40',
        paidAmount: '0',
        status: InstallmentStatus.pending,
        dueDate: new Date('2026-06-15'),
      },
      {
        id: 'inst-3',
        installmentNumber: 3,
        amount: '40',
        paidAmount: '0',
        status: InstallmentStatus.pending,
        dueDate: new Date('2026-07-15'),
      },
      {
        id: 'inst-4',
        installmentNumber: 4,
        amount: '40',
        paidAmount: '0',
        status: InstallmentStatus.pending,
        dueDate: new Date('2026-08-15'),
      },
    ];
    const tx = makeTransaction({ installments });
    const prisma = makePrismaForTx(tx);
    // Two installments still pending after advance payment closes 2/3.
    prisma.installmentSchedule.count = jest.fn().mockResolvedValue(2);
    const eventBus = { emitAndBuild: jest.fn() };
    const adapter = makeMockAdapter(true);
    const service = new BnplInstallmentService(
      prisma as any,
      eventBus as any,
      adapter as any,
    );

    const result = await service.advancePayment(TENANT, {
      transactionId: TX_ID,
      installmentNumbers: [2, 3],
      idempotencyKey: 'adv-key-1',
    });

    expect(result.totalPaid).toBe('80.0000');
    expect(result.installmentsClosed).toBe(2);
    // Wallet was charged the summed amount in a single round-trip.
    expect(adapter.collect).toHaveBeenCalledTimes(1);
    expect(adapter.collect).toHaveBeenCalledWith(
      expect.objectContaining({ amount: '80.0000' }),
    );
    // Two installment.paid events fire (one per target).
    const paidEventCount = eventBus.emitAndBuild.mock.calls.filter(
      (c) => c[0] === 'bnpl.installment.paid',
    ).length;
    expect(paidEventCount).toBe(2);
    const evtNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
    expect(evtNames).toContain('bnpl.advance_payment');
    // Tx still has 2 pending installments → not completed.
    expect(evtNames).not.toContain('bnpl.purchase.completed');
  });

  it('rejects when bnplConfig.advancePaymentAllowed is false', async () => {
    const tx = makeTransaction({
      product: {
        bnplConfig: {
          earlySettlementAllowed: true,
          advancePaymentAllowed: false,
        },
        overdraftConfig: null,
      },
    });
    const prisma = makePrismaForTx(tx);
    const eventBus = { emitAndBuild: jest.fn() };
    const adapter = makeMockAdapter(true);
    const service = new BnplInstallmentService(
      prisma as any,
      eventBus as any,
      adapter as any,
    );

    await expect(
      service.advancePayment(TENANT, {
        transactionId: TX_ID,
        installmentNumbers: [2, 3],
        idempotencyKey: 'adv-key-2',
      }),
    ).rejects.toThrow(/not allowed/);
    expect(adapter.collect).not.toHaveBeenCalled();
  });

  it("rejects when an installment number doesn't exist on the transaction", async () => {
    const tx = makeTransaction(); // installments 1, 2, 3 only
    const prisma = makePrismaForTx(tx);
    const eventBus = { emitAndBuild: jest.fn() };
    const adapter = makeMockAdapter(true);
    const service = new BnplInstallmentService(
      prisma as any,
      eventBus as any,
      adapter as any,
    );

    await expect(
      service.advancePayment(TENANT, {
        transactionId: TX_ID,
        installmentNumbers: [9],
        idempotencyKey: 'adv-key-3',
      }),
    ).rejects.toThrow(/does not exist/);
  });

  it('rejects when an installment is already paid', async () => {
    const installments = [
      {
        id: 'inst-1',
        installmentNumber: 1,
        amount: '40',
        paidAmount: '40',
        status: InstallmentStatus.paid,
        dueDate: new Date('2026-05-15'),
      },
      {
        id: 'inst-2',
        installmentNumber: 2,
        amount: '40',
        paidAmount: '0',
        status: InstallmentStatus.pending,
        dueDate: new Date('2026-06-15'),
      },
    ];
    const tx = makeTransaction({ installments });
    const prisma = makePrismaForTx(tx);
    const eventBus = { emitAndBuild: jest.fn() };
    const adapter = makeMockAdapter(true);
    const service = new BnplInstallmentService(
      prisma as any,
      eventBus as any,
      adapter as any,
    );

    await expect(
      service.advancePayment(TENANT, {
        transactionId: TX_ID,
        installmentNumbers: [1, 2],
        idempotencyKey: 'adv-key-4',
      }),
    ).rejects.toThrow(/only pending installments can be paid in advance/);
  });
});
