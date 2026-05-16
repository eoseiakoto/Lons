/**
 * BNPL lifecycle integration tests (Sprint 11 Track B FIX 24).
 *
 * Mock-Prisma integration coverage of the four critical end-to-end
 * scenarios. Each test wires the four BNPL services
 * (origination, installment, refund, settlement) against a single
 * shared Prisma stub so we can assert state transitions across
 * service boundaries — not just unit-level behaviour.
 */

import {
  BnplTransactionStatus,
  CustomerStatus,
  InstallmentStatus,
  MerchantStatus,
  ProductStatus,
  ProductType,
  SettlementType,
} from '@lons/database';

import { BnplOriginationService } from '../bnpl-origination.service';
import { BnplInstallmentService } from '../bnpl-installment.service';
import { BnplRefundService } from '../bnpl-refund.service';
import { MerchantSettlementService } from '../merchant-settlement.service';

const TENANT = '11111111-1111-1111-1111-111111111111';
const CUSTOMER = '22222222-2222-2222-2222-222222222222';
const MERCHANT = '33333333-3333-3333-3333-333333333333';
const PRODUCT = '44444444-4444-4444-4444-444444444444';
const LENDER = '55555555-5555-5555-5555-555555555555';

/**
 * Build a shared Prisma stub that maintains in-memory state for one
 * BnplTransaction + its installments + a single MerchantSettlement.
 * Enough fidelity to exercise origination → payment → completion +
 * acceleration + refund without a live database.
 */
function makeWorld(opts: {
  merchantSettlementType?: SettlementType;
  merchantDiscountRate?: string;
} = {}) {
  const TX_ID = '66666666-6666-6666-6666-666666666666';

  // Shared state.
  const installments: Array<{
    id: string;
    transactionId: string;
    tenantId: string;
    installmentNumber: number;
    amount: string;
    paidAmount: string;
    status: InstallmentStatus;
    dueDate: Date;
    daysPastDue: number;
  }> = [];

  let transaction: any = null;
  let settlement: any = null;

  const merchant = {
    id: MERCHANT,
    tenantId: TENANT,
    code: 'ACME',
    status: MerchantStatus.active,
    settlementType: opts.merchantSettlementType ?? SettlementType.IMMEDIATE,
    discountRate: opts.merchantDiscountRate ?? '0.025',
    walletId: 'merchant-wallet',
    walletProvider: 'mtn_momo',
  };

  const customer = {
    id: CUSTOMER,
    tenantId: TENANT,
    status: CustomerStatus.active,
    kycLevel: 'tier_2',
  };

  const product = {
    id: PRODUCT,
    tenantId: TENANT,
    type: ProductType.bnpl,
    status: ProductStatus.active,
    lenderId: LENDER,
    currency: 'GHS',
    minAmount: 10,
    maxAmount: 5000,
    interestRate: '0',
    eligibilityRules: { minKycLevel: 'tier_1' },
    overdraftConfig: {
      installmentIntervalDays: 30,
      acceleration: { maxConsecutiveMissed: 2 },
    },
  };

  const prisma: any = {
    bnplTransaction: {
      // First call (idempotency) returns null, then the existing-default
      // gate also returns null. Subsequent flows read the stored tx.
      findFirst: jest.fn(async (args: any) => {
        if (args?.where?.idempotencyKey) return null; // idempotency miss
        if (args?.where?.status?.in) return null; // default gate miss
        if (args?.where?.id === TX_ID) {
          return {
            ...transaction,
            installments: installments.slice().sort((a, b) => a.installmentNumber - b.installmentNumber),
            merchant,
            product,
          };
        }
        return null;
      }),
      create: jest.fn(async (args: any) => {
        transaction = { id: TX_ID, ...args.data };
        return transaction;
      }),
      update: jest.fn(async (args: any) => {
        Object.assign(transaction, args.data);
        return transaction;
      }),
      updateMany: jest.fn(async () => ({ count: 1 })),
      count: jest.fn(async () => 0),
    },
    merchant: {
      findFirst: jest.fn(async () => merchant),
      findMany: jest.fn(async () => [merchant]),
    },
    customer: {
      findFirst: jest.fn(async () => customer),
    },
    product: {
      findFirst: jest.fn(async () => product),
    },
    installmentSchedule: {
      createMany: jest.fn(async (args: any) => {
        for (const row of args.data) {
          installments.push({
            id: `inst-${row.installmentNumber}`,
            ...row,
            // Prisma defaults: real DB applies these from the schema. The
            // mock has to mirror them so downstream service filters work.
            status: row.status ?? InstallmentStatus.pending,
            paidAmount: row.paidAmount ?? '0',
            daysPastDue: row.daysPastDue ?? 0,
          });
        }
        return { count: args.data.length };
      }),
      findFirst: jest.fn(async (args: any) => {
        const id = args?.where?.id;
        if (id) {
          const inst = installments.find((i) => i.id === id);
          if (!inst) return null;
          return { ...inst, transaction };
        }
        // payNextDue selects earliest unpaid by installmentNumber
        const candidates = installments
          .filter((i) =>
            i.status === InstallmentStatus.pending ||
            i.status === InstallmentStatus.due ||
            i.status === InstallmentStatus.overdue,
          )
          .sort((a, b) => a.installmentNumber - b.installmentNumber);
        return candidates[0] ?? null;
      }),
      findMany: jest.fn(async () => installments.slice()),
      update: jest.fn(async (args: any) => {
        const inst = installments.find((i) => i.id === args.where.id);
        if (inst) Object.assign(inst, args.data);
        return inst;
      }),
      updateMany: jest.fn(async () => ({ count: installments.length })),
      count: jest.fn(async (args: any) => {
        const wantedStatuses: string[] = args?.where?.status?.in ?? [];
        return installments.filter((i) => wantedStatuses.includes(i.status)).length;
      }),
    },
    merchantSettlement: {
      create: jest.fn(async (args: any) => {
        settlement = { id: 'settlement-1', ...args.data };
        return settlement;
      }),
    },
    // Sprint 15 (S15-9): origination now requires a subscription +
    // BnplCreditLine. Provide enough headroom for the lifecycle test.
    subscription: {
      findFirst: jest.fn(async () => ({
        id: 'sub-1',
        tenantId: TENANT,
        customerId: CUSTOMER,
        productId: PRODUCT,
        status: 'active',
      })),
    },
    bnplCreditLine: {
      findFirst: jest.fn(async () => ({
        id: 'cl-1',
        tenantId: TENANT,
        customerId: CUSTOMER,
        subscriptionId: 'sub-1',
        productId: PRODUCT,
        approvedLimit: '10000.0000',
        availableLimit: '10000.0000',
        status: 'active',
        deletedAt: null,
      })),
      update: jest.fn(async () => ({})),
      findUniqueOrThrow: jest.fn(async () => ({
        id: 'cl-1',
        availableLimit: '10000.0000',
        approvedLimit: '10000.0000',
      })),
    },
    $transaction: jest.fn(async (ops: any) => {
      if (typeof ops === 'function') {
        const txClient = {
          bnplTransaction: prisma.bnplTransaction,
          installmentSchedule: prisma.installmentSchedule,
          bnplCreditLine: prisma.bnplCreditLine,
          // FIX-7: atomic UPDATE WHERE returns affected count.
          $executeRawUnsafe: jest.fn(async () => 1),
        };
        return ops(txClient);
      }
      return Array.isArray(ops) ? ops.map(() => ({})) : ops;
    }),
  };

  const eventBus = { emitAndBuild: jest.fn() };

  const settlementService = new MerchantSettlementService(
    prisma as any,
    eventBus as any,
  );
  const originationService = new BnplOriginationService(
    prisma as any,
    eventBus as any,
    settlementService,
  );
  const installmentService = new BnplInstallmentService(
    prisma as any,
    eventBus as any,
  );
  const refundService = new BnplRefundService(prisma as any, eventBus as any);

  return {
    prisma,
    eventBus,
    settlementService,
    originationService,
    installmentService,
    refundService,
    state: () => ({ transaction, installments, settlement }),
    constants: { TX_ID },
  };
}

describe('BNPL lifecycle integration (FIX 24)', () => {
  describe('Happy path: purchase → pay all installments → completed', () => {
    it('walks from initiate through final installment payment', async () => {
      const world = makeWorld();

      const initiated = await world.originationService.initiate(TENANT, {
        merchantCode: 'ACME',
        customerId: CUSTOMER,
        purchaseAmount: '120',
        currency: 'GHS',
        numberOfInstallments: 3,
        purchaseRef: 'order-1',
        idempotencyKey: 'idem-1',
      });

      expect(initiated.status).toBe(BnplTransactionStatus.approved);
      expect(initiated.installments).toHaveLength(3);
      expect(world.state().installments).toHaveLength(3);

      // Pay all three installments via payNextDue.
      const payments = [];
      for (let i = 0; i < 3; i++) {
        payments.push(
          await world.installmentService.payNextDue(
            TENANT,
            world.constants.TX_ID,
            world.state().installments
              .find((inst) => inst.status !== InstallmentStatus.paid)?.amount ?? '0',
          ),
        );
      }

      // Last payment completes the transaction.
      expect(payments[2].transactionCompleted).toBe(true);
      expect(world.state().transaction.status).toBe(BnplTransactionStatus.completed);

      const evtNames = world.eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
      expect(evtNames).toContain('bnpl.purchase.approved');
      expect(evtNames).toContain('bnpl.installment.paid');
      expect(evtNames).toContain('bnpl.purchase.completed');
    });
  });

  describe('Acceleration: missed installments cross threshold', () => {
    it('flips transaction to accelerated and emits collections referral', async () => {
      const world = makeWorld();

      await world.originationService.initiate(TENANT, {
        merchantCode: 'ACME',
        customerId: CUSTOMER,
        purchaseAmount: '120',
        currency: 'GHS',
        numberOfInstallments: 3,
        purchaseRef: 'order-acc',
        idempotencyKey: 'idem-acc',
      });

      // Force the first two installments overdue, then evaluate.
      world.state().installments[0].status = InstallmentStatus.overdue;
      world.state().installments[1].status = InstallmentStatus.overdue;

      const result = await world.installmentService.evaluateAcceleration(
        TENANT,
        world.constants.TX_ID,
      );

      expect(result.accelerated).toBe(true);
      expect(world.state().transaction.status).toBe(BnplTransactionStatus.accelerated);
      const evtNames = world.eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
      // FIX 7: collections referral fires alongside acceleration.
      expect(evtNames).toContain('bnpl.accelerated');
      expect(evtNames).toContain('bnpl.collections.referred');
    });
  });

  describe('Full refund: customer reimbursed paid + merchant clawback NET', () => {
    it('waives unpaid installments, reimburses paid amount, and computes NET clawback (FIX 1)', async () => {
      const world = makeWorld({ merchantDiscountRate: '0.025' });

      await world.originationService.initiate(TENANT, {
        merchantCode: 'ACME',
        customerId: CUSTOMER,
        purchaseAmount: '120',
        currency: 'GHS',
        numberOfInstallments: 3,
        purchaseRef: 'order-rf',
        idempotencyKey: 'idem-rf',
      });

      // Pay one installment (40), leaving two unpaid.
      await world.installmentService.processInstallmentPayment(
        TENANT,
        world.state().installments[0].id,
        world.state().installments[0].amount,
      );

      const refundResult = await world.refundService.initiate(TENANT, {
        transactionId: world.constants.TX_ID,
        amount: '120',
        type: 'full',
        reason: 'merchandise_returned',
        operatorId: 'op-1',
      });

      // Customer paid 40; full refund returns that 40.
      expect(refundResult.refundedToCustomer).toBe('40.0000');
      // Merchant clawback = 120 × (1 − 0.025) = 117.00 NET, not gross 120.
      expect(refundResult.clawedBackFromMerchant).toBe('117.0000');
      expect(world.state().transaction.status).toBe(BnplTransactionStatus.refunded);
    });
  });

  describe('Partial refund: proportional reduction', () => {
    it('reduces unpaid installments without flipping the transaction status', async () => {
      const world = makeWorld({ merchantDiscountRate: '0.025' });

      await world.originationService.initiate(TENANT, {
        merchantCode: 'ACME',
        customerId: CUSTOMER,
        purchaseAmount: '120',
        currency: 'GHS',
        numberOfInstallments: 3,
        purchaseRef: 'order-pr',
        idempotencyKey: 'idem-pr',
      });

      const result = await world.refundService.initiate(TENANT, {
        transactionId: world.constants.TX_ID,
        amount: '30',
        type: 'partial',
        reason: 'price_adjustment',
        operatorId: 'op-1',
      });

      expect(result.reducedInstallments).toBeGreaterThan(0);
      expect(result.refundedToCustomer).toBe('0.0000'); // No paid amounts to reimburse
      // Transaction stays approved (only `full` flips to `refunded`).
      expect(world.state().transaction.status).toBe(BnplTransactionStatus.approved);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Sprint 16 (S16-BA-12) — concurrent deduction integration test.
  //
  // Backstop for the FIX-7 (Sprint 15) atomic UPDATE WHERE behaviour.
  // Two purchases for ~80% of available limit each race against the
  // same credit line. Postgres' row-level UPDATE WHERE guarantees
  // serial execution: exactly ONE must succeed; the other rolls back
  // with `BNPL_INSUFFICIENT_CREDIT_LIMIT`.
  //
  // The mock here simulates the conditional UPDATE by short-circuiting
  // the second $executeRawUnsafe call to return `0` (affected rows)
  // when the running balance would go negative. That's what real
  // Postgres does in production via `WHERE available_limit >= $1`.
  // ────────────────────────────────────────────────────────────────────
  describe('Sprint 16 (S16-BA-12) — concurrent deduction (FIX-7 backstop)', () => {
    it('rejects the second concurrent purchase when both would exhaust availableLimit', async () => {
      const world = makeWorld();

      // Wire the mock prisma to simulate a real "available = 500"
      // credit line. The first UPDATE succeeds (returns 1), drops
      // available to 100; the second sees insufficient headroom and
      // returns 0 — driving the resolver to throw.
      const availableLimitRef = { current: '500.0000' };
      (world.prisma.bnplCreditLine.findFirst as jest.Mock).mockImplementation(
        async () => ({
          id: 'cl-concurrent',
          tenantId: TENANT,
          customerId: CUSTOMER,
          subscriptionId: 'sub-concurrent',
          productId: PRODUCT,
          approvedLimit: '500.0000',
          availableLimit: availableLimitRef.current,
          status: 'active',
          deletedAt: null,
        }),
      );
      (world.prisma.bnplCreditLine.findUniqueOrThrow as jest.Mock).mockImplementation(
        async () => ({
          id: 'cl-concurrent',
          availableLimit: availableLimitRef.current,
          approvedLimit: '500.0000',
        }),
      );

      // Hijack $transaction to simulate the atomic UPDATE WHERE.
      (world.prisma.$transaction as jest.Mock).mockImplementation(
        async (ops: any) => {
          if (typeof ops === 'function') {
            const txClient = {
              bnplTransaction: world.prisma.bnplTransaction,
              installmentSchedule: world.prisma.installmentSchedule,
              bnplCreditLine: world.prisma.bnplCreditLine,
              $executeRawUnsafe: jest.fn(async (_sql: string, amount: string) => {
                // Atomic UPDATE … WHERE available_limit >= amount:
                // return 1 (affected) if there's headroom, 0 otherwise.
                const current = Number(availableLimitRef.current);
                const requested = Number(amount);
                if (current >= requested) {
                  availableLimitRef.current = (current - requested).toFixed(4);
                  return 1;
                }
                return 0;
              }),
            };
            return ops(txClient);
          }
          return Array.isArray(ops) ? ops.map(() => ({})) : ops;
        },
      );

      // Two purchases of 400 each — sum 800, but only 500 available.
      const [result1, result2] = await Promise.allSettled([
        world.originationService.initiate(TENANT, {
          merchantCode: 'ACME',
          customerId: CUSTOMER,
          purchaseAmount: '400',
          currency: 'GHS',
          numberOfInstallments: 3,
          purchaseRef: 'order-concurrent-1',
          idempotencyKey: 'idem-concurrent-1',
        }),
        world.originationService.initiate(TENANT, {
          merchantCode: 'ACME',
          customerId: CUSTOMER,
          purchaseAmount: '400',
          currency: 'GHS',
          numberOfInstallments: 3,
          purchaseRef: 'order-concurrent-2',
          idempotencyKey: 'idem-concurrent-2',
        }),
      ]);

      const successes = [result1, result2].filter((r) => r.status === 'fulfilled');
      const failures = [result1, result2].filter((r) => r.status === 'rejected');

      // Exactly one succeeded, exactly one rolled back.
      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);

      // The failure carries the structured error code from the
      // FIX-7 path so a client can recognise the rejection.
      const failure = failures[0] as PromiseRejectedResult;
      const failureReason = failure.reason as { message?: string };
      expect(failureReason.message).toMatch(/Concurrent purchase consumed credit headroom/);

      // Credit line ends at 500 − 400 = 100.
      expect(availableLimitRef.current).toBe('100.0000');
    });
  });
});
