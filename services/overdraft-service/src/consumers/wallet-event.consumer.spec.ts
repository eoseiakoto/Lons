/**
 * Wallet event consumer — Sprint 11 A8. Verifies that BullMQ jobs route
 * to the correct domain service, that tenant context is entered, and
 * that idempotency / missing-adapter / no-credit-line edge cases are
 * handled cleanly. Full live-Redis end-to-end coverage is in Sprint 12's
 * integration harness.
 */

import { WalletEventConsumer } from './wallet-event.consumer';
import {
  WALLET_JOB_CREDITED,
  WALLET_JOB_INSUFFICIENT,
  WalletCreditedJob,
  WalletInsufficientJob,
} from './wallet-event.types';

const TENANT = '11111111-1111-1111-1111-111111111111';
const CUSTOMER = '22222222-2222-2222-2222-222222222222';
const PRODUCT = '33333333-3333-3333-3333-333333333333';

const insufficientJob: WalletInsufficientJob = {
  tenantId: TENANT,
  event: {
    customerId: CUSTOMER,
    walletId: 'wallet-abc',
    transactionAmount: '150',
    availableBalance: '50',
    shortfall: '100',
    transactionRef: 'txn-1',
    walletProvider: 'mtn_momo',
  },
};

const creditedJob: WalletCreditedJob = {
  tenantId: TENANT,
  customerId: CUSTOMER,
  walletId: 'wallet-abc',
  creditAmount: '500',
  newBalance: '550',
  transactionRef: 'txn-2',
  walletProvider: 'mtn_momo',
};

function makePrisma(creditLineForCustomer: { productId: string } | null) {
  return {
    enterTenantContext: jest.fn(async (_ctx: any, fn: any) => fn()),
    creditLine: { findFirst: jest.fn().mockResolvedValue(creditLineForCustomer) },
  };
}

describe('WalletEventConsumer', () => {
  describe('handleInsufficient (drawdown path)', () => {
    it('enters tenant context and dispatches to drawdownService.processDrawdown', async () => {
      const prisma = makePrisma({ productId: PRODUCT });
      const drawdown = { processDrawdown: jest.fn().mockResolvedValue({ status: 'approved' }) };
      const repayment = { processAutoRepayment: jest.fn() };
      const disburse = { disburse: jest.fn() };
      const collect = { collect: jest.fn() };

      const consumer = new WalletEventConsumer(
        prisma as any,
        drawdown as any,
        repayment as any,
        disburse as any,
        collect as any,
      );

      await consumer.process({
        name: WALLET_JOB_INSUFFICIENT,
        data: insufficientJob,
      } as any);

      expect(prisma.enterTenantContext).toHaveBeenCalledWith(
        { tenantId: TENANT },
        expect.any(Function),
      );
      expect(drawdown.processDrawdown).toHaveBeenCalledWith(
        TENANT,
        insufficientJob.event,
        PRODUCT,
        disburse,
      );
    });

    it('skips when the customer has no overdraft credit line', async () => {
      const prisma = makePrisma(null);
      const drawdown = { processDrawdown: jest.fn() };
      const repayment = { processAutoRepayment: jest.fn() };
      const disburse = { disburse: jest.fn() };
      const collect = { collect: jest.fn() };

      const consumer = new WalletEventConsumer(
        prisma as any,
        drawdown as any,
        repayment as any,
        disburse as any,
        collect as any,
      );

      const result = await consumer.process({
        name: WALLET_JOB_INSUFFICIENT,
        data: insufficientJob,
      } as any);

      expect(drawdown.processDrawdown).not.toHaveBeenCalled();
      expect(result).toEqual({ skipped: 'no_credit_line' });
    });

    it('throws when no disbursement adapter is registered', async () => {
      const prisma = makePrisma({ productId: PRODUCT });
      const drawdown = { processDrawdown: jest.fn() };
      const repayment = { processAutoRepayment: jest.fn() };
      const collect = { collect: jest.fn() };

      const consumer = new WalletEventConsumer(
        prisma as any,
        drawdown as any,
        repayment as any,
        undefined,
        collect as any,
      );

      await expect(
        consumer.process({ name: WALLET_JOB_INSUFFICIENT, data: insufficientJob } as any),
      ).rejects.toThrow(/No WALLET_DISBURSEMENT_ADAPTER registered/);
    });
  });

  describe('handleCredited (auto-repayment path)', () => {
    it('enters tenant context and dispatches to repaymentService.processAutoRepayment', async () => {
      const prisma = makePrisma({ productId: PRODUCT });
      const drawdown = { processDrawdown: jest.fn() };
      const repayment = {
        processAutoRepayment: jest.fn().mockResolvedValue([
          { creditLineId: 'cl-1', collected: '500.0000' },
        ]),
      };
      const disburse = { disburse: jest.fn() };
      const collect = { collect: jest.fn() };

      const consumer = new WalletEventConsumer(
        prisma as any,
        drawdown as any,
        repayment as any,
        disburse as any,
        collect as any,
      );

      const result = await consumer.process({
        name: WALLET_JOB_CREDITED,
        data: creditedJob,
      } as any);

      expect(prisma.enterTenantContext).toHaveBeenCalledWith(
        { tenantId: TENANT },
        expect.any(Function),
      );
      expect(repayment.processAutoRepayment).toHaveBeenCalledWith(
        TENANT,
        {
          customerId: CUSTOMER,
          walletId: 'wallet-abc',
          creditAmount: '500',
        },
        collect,
      );
      expect(result).toEqual({ creditLines: 1 });
    });

    it('throws when no collection adapter is registered', async () => {
      const prisma = makePrisma({ productId: PRODUCT });
      const drawdown = { processDrawdown: jest.fn() };
      const repayment = { processAutoRepayment: jest.fn() };
      const disburse = { disburse: jest.fn() };

      const consumer = new WalletEventConsumer(
        prisma as any,
        drawdown as any,
        repayment as any,
        disburse as any,
        undefined,
      );

      await expect(
        consumer.process({ name: WALLET_JOB_CREDITED, data: creditedJob } as any),
      ).rejects.toThrow(/No WALLET_COLLECTION_ADAPTER registered/);
    });
  });

  describe('unknown job names', () => {
    it('returns ignored without calling either service', async () => {
      const prisma = makePrisma({ productId: PRODUCT });
      const drawdown = { processDrawdown: jest.fn() };
      const repayment = { processAutoRepayment: jest.fn() };

      const consumer = new WalletEventConsumer(
        prisma as any,
        drawdown as any,
        repayment as any,
        {} as any,
        {} as any,
      );

      const result = await consumer.process({
        name: 'unknown.event',
        data: {},
      } as any);

      expect(result).toEqual({ ignored: true });
      expect(drawdown.processDrawdown).not.toHaveBeenCalled();
      expect(repayment.processAutoRepayment).not.toHaveBeenCalled();
    });
  });
});
