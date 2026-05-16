/**
 * Sprint 15 fixes (FIX-4) — late fee calculation tests for
 * `BnplInstallmentService.markOverdueInstallments`.
 *
 * Targets the S15-10 late-fee logic:
 *   - flat-only mode
 *   - percentage-only mode
 *   - combined flat + percentage
 *   - maxFeePercent cap (against ORIGINAL installment amount, not the
 *     already-inflated `amount` column)
 *   - applicationMode `once` vs `per_bucket`
 *   - missing config → fee stays at zero (back-compat)
 */
import { BnplInstallmentService } from './bnpl-installment.service';
import {
  BnplTransactionStatus,
  InstallmentStatus,
} from '@lons/database';

const TENANT = '11111111-1111-1111-1111-111111111111';
const TX_ID = '22222222-2222-2222-2222-222222222222';
const INST_ID = '33333333-3333-3333-3333-333333333333';

function makeInstallment(
  bnplConfig: Record<string, unknown> | null,
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    id: INST_ID,
    transactionId: TX_ID,
    tenantId: TENANT,
    installmentNumber: 1,
    amount: '100.0000',
    paidAmount: '0',
    feePortion: '0',
    status: InstallmentStatus.pending,
    dueDate: new Date('2026-05-01'),
    daysPastDue: 0,
    transaction: {
      id: TX_ID,
      customerId: 'cust',
      currency: 'GHS',
      status: BnplTransactionStatus.approved,
      product: { bnplConfig },
      installments: [],
    },
    ...overrides,
  };
}

function makeService(installmentRows: any[]) {
  const installmentSchedule = {
    findMany: jest.fn().mockResolvedValue(installmentRows),
    update: jest.fn().mockResolvedValue({}),
  };
  // `markOverdueInstallments` also calls `evaluateAcceleration` per
  // affected transaction. Return a minimal transaction so the
  // acceleration path is a no-op (already-approved with no missed
  // history) and the late-fee assertions are unaffected.
  const bnplTransaction = {
    findFirst: jest.fn().mockResolvedValue({
      id: TX_ID,
      status: BnplTransactionStatus.approved,
      product: { bnplConfig: null, overdraftConfig: null },
      installments: [],
    }),
    update: jest.fn(),
  };
  const prisma = { installmentSchedule, bnplTransaction } as any;
  const eventBus = { emitAndBuild: jest.fn() } as any;
  const service = new BnplInstallmentService(prisma, eventBus);
  return { service, prisma, eventBus, installmentSchedule };
}

describe('S15-10 late fee — flat only', () => {
  it('charges the flat fee on first overdue transition', async () => {
    const inst = makeInstallment({
      lateFee: { flatFee: '5.0000', applicationMode: 'once' },
    });
    const { service, installmentSchedule, eventBus } = makeService([inst]);

    await service.markOverdueInstallments(
      TENANT,
      new Date('2026-05-10'),
    );

    const update = installmentSchedule.update.mock.calls[0][0];
    expect(Number(update.data.feePortion)).toBe(5);
    expect(Number(update.data.amount)).toBe(105);
    const event = eventBus.emitAndBuild.mock.calls.find(
      (c: any) => c[0] === 'bnpl.installment.overdue',
    );
    expect(Number(event?.[2].lateFeeAmount)).toBe(5);
  });
});

describe('S15-10 late fee — percentage only', () => {
  it('charges percentageFee × original amount', async () => {
    const inst = makeInstallment({
      lateFee: { percentageFee: 0.05, applicationMode: 'once' },
    });
    const { service, installmentSchedule } = makeService([inst]);

    await service.markOverdueInstallments(TENANT, new Date('2026-05-10'));

    const update = installmentSchedule.update.mock.calls[0][0];
    // 5% of 100 = 5.0000
    expect(Number(update.data.feePortion)).toBe(5);
    expect(Number(update.data.amount)).toBe(105);
  });
});

describe('S15-10 late fee — combined flat + percentage', () => {
  it('sums both into a single fee charge', async () => {
    const inst = makeInstallment({
      lateFee: {
        flatFee: '2.0000',
        percentageFee: 0.05,
        applicationMode: 'once',
      },
    });
    const { service, installmentSchedule } = makeService([inst]);

    await service.markOverdueInstallments(TENANT, new Date('2026-05-10'));

    const update = installmentSchedule.update.mock.calls[0][0];
    // 2 + 5 = 7
    expect(Number(update.data.feePortion)).toBe(7);
    expect(Number(update.data.amount)).toBe(107);
  });
});

describe('S15-10 late fee — cap enforcement', () => {
  it('trims fee to maxFeePercent of ORIGINAL installment amount', async () => {
    // Fee config would charge 50, but cap is 10% of 100 = 10.
    const inst = makeInstallment({
      lateFee: {
        flatFee: '50.0000',
        applicationMode: 'once',
        maxFeePercent: 0.1,
      },
    });
    const { service, installmentSchedule } = makeService([inst]);

    await service.markOverdueInstallments(TENANT, new Date('2026-05-10'));

    const update = installmentSchedule.update.mock.calls[0][0];
    expect(Number(update.data.feePortion)).toBe(10);
    expect(Number(update.data.amount)).toBe(110);
  });

  it('per-bucket cycles never bypass the cap', async () => {
    // Pre-existing feePortion of 8 — adding another 5 would put us at 13,
    // but cap is 10% of 100 = 10. Should trim to delta of 2.
    const inst = makeInstallment(
      {
        lateFee: {
          flatFee: '5.0000',
          applicationMode: 'per_bucket',
          maxFeePercent: 0.1,
        },
      },
      { feePortion: '8.0000', amount: '108.0000', daysPastDue: 7 },
    );
    const { service, installmentSchedule } = makeService([inst]);

    await service.markOverdueInstallments(TENANT, new Date('2026-05-15'));

    const update = installmentSchedule.update.mock.calls[0][0];
    expect(Number(update.data.feePortion)).toBe(10);
    expect(Number(update.data.amount)).toBe(110);
  });
});

describe('S15-10 late fee — applicationMode behaviour', () => {
  it('`once` mode does not re-charge on subsequent buckets', async () => {
    // daysPastDue > 0 means this is NOT the first overdue transition.
    const inst = makeInstallment(
      {
        lateFee: { flatFee: '5.0000', applicationMode: 'once' },
      },
      { daysPastDue: 14 },
    );
    const { service, installmentSchedule, eventBus } = makeService([inst]);

    await service.markOverdueInstallments(TENANT, new Date('2026-05-30'));

    const update = installmentSchedule.update.mock.calls[0][0];
    // No fee added — feePortion stays at the existing value.
    expect(update.data.feePortion).toBeUndefined();
    expect(update.data.amount).toBeUndefined();
    const event = eventBus.emitAndBuild.mock.calls.find(
      (c: any) => c[0] === 'bnpl.installment.overdue',
    );
    expect(event?.[2].lateFeeAmount).toBe('0');
  });

  it('`per_bucket` mode re-charges on every overdue mark pass', async () => {
    const inst = makeInstallment(
      {
        lateFee: { flatFee: '3.0000', applicationMode: 'per_bucket' },
      },
      { daysPastDue: 7 },
    );
    const { service, installmentSchedule } = makeService([inst]);

    await service.markOverdueInstallments(TENANT, new Date('2026-05-15'));

    const update = installmentSchedule.update.mock.calls[0][0];
    expect(Number(update.data.feePortion)).toBe(3);
    expect(Number(update.data.amount)).toBe(103);
  });
});

describe('S15-10 late fee — missing config', () => {
  it('no bnplConfig.lateFee → fee stays at zero (back-compat)', async () => {
    const inst = makeInstallment(null);
    const { service, installmentSchedule, eventBus } = makeService([inst]);

    await service.markOverdueInstallments(TENANT, new Date('2026-05-10'));

    const update = installmentSchedule.update.mock.calls[0][0];
    // Update went through but no fee fields touched.
    expect(update.data.feePortion).toBeUndefined();
    expect(update.data.amount).toBeUndefined();
    expect(update.data.status).toBe(InstallmentStatus.overdue);
    const event = eventBus.emitAndBuild.mock.calls.find(
      (c: any) => c[0] === 'bnpl.installment.overdue',
    );
    expect(event?.[2].lateFeeAmount).toBe('0');
  });
});
