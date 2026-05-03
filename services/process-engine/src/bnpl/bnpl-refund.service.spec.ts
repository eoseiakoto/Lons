/**
 * BNPL refunds — Sprint 11 Track B / B8.
 */

import { BnplRefundService } from './bnpl-refund.service';
import {
  BnplTransactionStatus,
  InstallmentStatus,
} from '@lons/database';

const TENANT = '11111111-1111-1111-1111-111111111111';
const CUSTOMER = '22222222-2222-2222-2222-222222222222';
const MERCHANT = '33333333-3333-3333-3333-333333333333';
const TX_ID = '44444444-4444-4444-4444-444444444444';

function makeInstallment(num: number, overrides: Partial<any> = {}) {
  return {
    id: `inst-${num}`,
    installmentNumber: num,
    amount: '40',
    paidAmount: '0',
    status: InstallmentStatus.pending,
    ...overrides,
  };
}

function makeTx(overrides: Partial<any> = {}) {
  return {
    id: TX_ID,
    tenantId: TENANT,
    customerId: CUSTOMER,
    merchantId: MERCHANT,
    purchaseAmount: '120',
    status: BnplTransactionStatus.active,
    installments: [makeInstallment(1), makeInstallment(2), makeInstallment(3)],
    merchant: { id: MERCHANT, discountRate: '0' },
    ...overrides,
  };
}

describe('BnplRefundService.initiate', () => {
  it('throws when transaction is missing', async () => {
    const prisma = {
      bnplTransaction: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new BnplRefundService(
      prisma as any,
      { emitAndBuild: jest.fn() } as any,
    );

    await expect(
      service.initiate(TENANT, {
        transactionId: TX_ID,
        amount: '40',
        type: 'partial',
        reason: 'r',
        operatorId: 'op',
      }),
    ).rejects.toThrow();
  });

  it('rejects refund on already-refunded transactions', async () => {
    const prisma = {
      bnplTransaction: {
        findFirst: jest
          .fn()
          .mockResolvedValue(makeTx({ status: BnplTransactionStatus.refunded })),
      },
    };
    const service = new BnplRefundService(
      prisma as any,
      { emitAndBuild: jest.fn() } as any,
    );

    await expect(
      service.initiate(TENANT, {
        transactionId: TX_ID,
        amount: '40',
        type: 'partial',
        reason: 'r',
        operatorId: 'op',
      }),
    ).rejects.toThrow(/Cannot refund/);
  });

  it('rejects partial refund with non-positive amount', async () => {
    const prisma = {
      bnplTransaction: { findFirst: jest.fn().mockResolvedValue(makeTx()) },
    };
    const service = new BnplRefundService(
      prisma as any,
      { emitAndBuild: jest.fn() } as any,
    );

    await expect(
      service.initiate(TENANT, {
        transactionId: TX_ID,
        amount: '0',
        type: 'partial',
        reason: 'r',
        operatorId: 'op',
      }),
    ).rejects.toThrow(/positive/);
  });

  describe('full refund', () => {
    it('waives unpaid installments, reimburses paid ones, flips transaction to refunded', async () => {
      const tx = makeTx({
        installments: [
          makeInstallment(1, { status: InstallmentStatus.paid, paidAmount: '40' }),
          makeInstallment(2, { status: InstallmentStatus.paid, paidAmount: '40' }),
          makeInstallment(3, { status: InstallmentStatus.pending }),
        ],
      });
      const prisma = {
        bnplTransaction: {
          findFirst: jest.fn().mockResolvedValue(tx),
          update: jest.fn(),
        },
        installmentSchedule: { update: jest.fn() },
      };
      const eventBus = { emitAndBuild: jest.fn() };
      const service = new BnplRefundService(prisma as any, eventBus as any);

      const result = await service.initiate(TENANT, {
        transactionId: TX_ID,
        amount: '120',
        type: 'full',
        reason: 'merchandise_returned',
        operatorId: 'op',
      });

      // Customer gets back their two paid installments (80). Merchant
      // clawback is NET (purchaseAmount × (1 − discountRate)). With a
      // discountRate of 0 in the default fixture, net == gross == 120.
      expect(result.refundedToCustomer).toBe('80.0000');
      expect(result.clawedBackFromMerchant).toBe('120.0000');
      expect(result.cancelledInstallments).toBe(1);

      // Transaction marked refunded.
      expect(prisma.bnplTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: BnplTransactionStatus.refunded }),
        }),
      );

      const evtNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
      expect(evtNames).toContain('bnpl.refund.initiated');
      expect(evtNames).toContain('bnpl.refund.completed');
    });

    it('FIX 1 (P0): claws back NET (purchase × (1 − discountRate)), not gross', async () => {
      // 100.00 purchase × 2.5% discount = 2.50 fee → merchant received 97.50
      // net. Clawback must equal 97.50, not 100.00.
      const tx = makeTx({
        purchaseAmount: '100',
        installments: [
          makeInstallment(1, { status: InstallmentStatus.paid, paidAmount: '50' }),
          makeInstallment(2, { status: InstallmentStatus.pending }),
        ],
        merchant: { id: MERCHANT, discountRate: '0.025' },
      });
      const prisma = {
        bnplTransaction: {
          findFirst: jest.fn().mockResolvedValue(tx),
          update: jest.fn(),
        },
        installmentSchedule: { update: jest.fn() },
      };
      const eventBus = { emitAndBuild: jest.fn() };
      const service = new BnplRefundService(prisma as any, eventBus as any);

      const result = await service.initiate(TENANT, {
        transactionId: TX_ID,
        amount: '100',
        type: 'full',
        reason: 'damage',
        operatorId: 'op',
      });

      expect(result.clawedBackFromMerchant).toBe('97.5000');
      // Customer is reimbursed only what they actually paid in.
      expect(result.refundedToCustomer).toBe('50.0000');
    });
  });

  describe('partial refund', () => {
    it('proportionally reduces unpaid installments when amount fits within remaining', async () => {
      const tx = makeTx({
        installments: [
          makeInstallment(1, { status: InstallmentStatus.paid, paidAmount: '40' }),
          makeInstallment(2, { status: InstallmentStatus.pending }),
          makeInstallment(3, { status: InstallmentStatus.pending }),
        ],
      });
      const prisma = {
        bnplTransaction: { findFirst: jest.fn().mockResolvedValue(tx) },
        installmentSchedule: { update: jest.fn() },
      };
      const eventBus = { emitAndBuild: jest.fn() };
      const service = new BnplRefundService(prisma as any, eventBus as any);

      // 30 refund, unpaid total = 80, ratio = 0.375.
      // Inst 2: 40 - (40 × 0.375) = 25
      // Inst 3 (last): 40 - (30 - 15) = 25
      const result = await service.initiate(TENANT, {
        transactionId: TX_ID,
        amount: '30',
        type: 'partial',
        reason: 'r',
        operatorId: 'op',
      });

      expect(result.refundedToCustomer).toBe('0.0000');
      expect(result.clawedBackFromMerchant).toBe('30.0000');
      expect(result.reducedInstallments).toBe(2);
      // Two updates, one per unpaid installment.
      expect(prisma.installmentSchedule.update).toHaveBeenCalledTimes(2);
    });

    it('reimburses customer the difference when refund exceeds remaining unpaid', async () => {
      const tx = makeTx({
        installments: [
          makeInstallment(1, { status: InstallmentStatus.paid, paidAmount: '40' }),
          makeInstallment(2, { status: InstallmentStatus.paid, paidAmount: '40' }),
          makeInstallment(3, { status: InstallmentStatus.pending }),
        ],
      });
      const prisma = {
        bnplTransaction: { findFirst: jest.fn().mockResolvedValue(tx) },
        installmentSchedule: { update: jest.fn() },
      };
      const eventBus = { emitAndBuild: jest.fn() };
      const service = new BnplRefundService(prisma as any, eventBus as any);

      // Refund 60: unpaid total is 40, so absorb 40 (waive inst 3) and
      // reimburse the customer 20 from their already-paid amount.
      const result = await service.initiate(TENANT, {
        transactionId: TX_ID,
        amount: '60',
        type: 'partial',
        reason: 'r',
        operatorId: 'op',
      });

      expect(result.refundedToCustomer).toBe('20.0000');
      expect(result.clawedBackFromMerchant).toBe('60.0000');
    });

    it('claws back NET (not gross) on partial refund — F-BN-1 fix', async () => {
      // Merchant was settled `amount × (1 − discountRate)`, so partial clawback
      // must mirror — clawing back gross would over-collect by the discount fee.
      const tx = makeTx({
        purchaseAmount: '200',
        merchant: { id: MERCHANT, discountRate: '0.05' }, // 5% discount
        installments: [
          makeInstallment(1, { status: InstallmentStatus.paid, paidAmount: '50' }),
          makeInstallment(2, { status: InstallmentStatus.pending }),
        ],
      });
      const prisma = {
        bnplTransaction: { findFirst: jest.fn().mockResolvedValue(tx) },
        installmentSchedule: { update: jest.fn() },
      };
      const eventBus = { emitAndBuild: jest.fn() };
      const service = new BnplRefundService(prisma as any, eventBus as any);

      // Partial refund of 100 with 5% discount rate:
      //   discountFee = 100 × 0.05 = 5
      //   netClawback = 100 − 5 = 95
      const result = await service.initiate(TENANT, {
        transactionId: TX_ID,
        amount: '100',
        type: 'partial',
        reason: 'r',
        operatorId: 'op',
      });

      expect(result.clawedBackFromMerchant).toBe('95.0000');
    });

    it('rejects partial >= purchaseAmount with a hint to use full', async () => {
      const prisma = {
        bnplTransaction: { findFirst: jest.fn().mockResolvedValue(makeTx()) },
      };
      const service = new BnplRefundService(
        prisma as any,
        { emitAndBuild: jest.fn() } as any,
      );

      await expect(
        service.initiate(TENANT, {
          transactionId: TX_ID,
          amount: '120',
          type: 'partial',
          reason: 'r',
          operatorId: 'op',
        }),
      ).rejects.toThrow(/use type="full"/);
    });
  });
});
