/**
 * Merchant settlement engine — Sprint 11 Track B / B7. Mock-Prisma
 * tests for IMMEDIATE creation, T+1 batching, and settleNow dispatch.
 */

import { MerchantSettlementService } from './merchant-settlement.service';
import {
  MerchantSettlementStatus,
  SettlementType,
  BnplTransactionStatus,
  MerchantStatus,
} from '@lons/database';

const TENANT = '11111111-1111-1111-1111-111111111111';
const MERCHANT = '22222222-2222-2222-2222-222222222222';
const TX_ID = '33333333-3333-3333-3333-333333333333';
const SETTLE_ID = '44444444-4444-4444-4444-444444444444';

describe('MerchantSettlementService.createImmediateSettlement', () => {
  it('throws if the transaction does not exist', async () => {
    const prisma = {
      bnplTransaction: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new MerchantSettlementService(
      prisma as any,
      { emitAndBuild: jest.fn() } as any,
    );

    await expect(
      service.createImmediateSettlement(TENANT, TX_ID),
    ).rejects.toThrow(/not found/);
  });

  it('throws when the merchant is not on IMMEDIATE settlement', async () => {
    const prisma = {
      bnplTransaction: {
        findFirst: jest.fn().mockResolvedValue({
          id: TX_ID,
          merchantId: MERCHANT,
          merchant: { settlementType: SettlementType.T_PLUS_1, discountRate: '0.025' },
          status: BnplTransactionStatus.approved,
        }),
      },
    };
    const service = new MerchantSettlementService(
      prisma as any,
      { emitAndBuild: jest.fn() } as any,
    );

    await expect(
      service.createImmediateSettlement(TENANT, TX_ID),
    ).rejects.toThrow(/not on IMMEDIATE/);
  });

  it('throws when the transaction is not approved', async () => {
    const prisma = {
      bnplTransaction: {
        findFirst: jest.fn().mockResolvedValue({
          id: TX_ID,
          merchantId: MERCHANT,
          merchant: { settlementType: SettlementType.IMMEDIATE, discountRate: '0.025' },
          status: BnplTransactionStatus.cancelled,
        }),
      },
    };
    const service = new MerchantSettlementService(
      prisma as any,
      { emitAndBuild: jest.fn() } as any,
    );

    await expect(
      service.createImmediateSettlement(TENANT, TX_ID),
    ).rejects.toThrow(/only approved/);
  });

  it('creates a single-transaction settlement row with correct discount math', async () => {
    const prisma = {
      bnplTransaction: {
        findFirst: jest.fn().mockResolvedValue({
          id: TX_ID,
          tenantId: TENANT,
          merchantId: MERCHANT,
          purchaseAmount: '120.00',
          currency: 'GHS',
          status: BnplTransactionStatus.approved,
          merchant: {
            settlementType: SettlementType.IMMEDIATE,
            discountRate: '0.025',
          },
        }),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      merchantSettlement: {
        create: jest
          .fn()
          .mockImplementation(async (args: any) => ({ id: SETTLE_ID, ...args.data })),
      },
    };
    const eventBus = { emitAndBuild: jest.fn() };
    const service = new MerchantSettlementService(prisma as any, eventBus as any);

    const result = await service.createImmediateSettlement(TENANT, TX_ID);

    // 120 × 0.025 = 3.0000 fee → 117.0000 net
    expect(result.netAmount).toBe('117.0000');
    expect(prisma.merchantSettlement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT,
          merchantId: MERCHANT,
          grossAmount: '120.0000',
          discountFee: '3.0000',
          netAmount: '117.0000',
          status: MerchantSettlementStatus.pending,
          transactionCount: 1,
        }),
      }),
    );
    // FIX 5: the transaction is linked back to the settlement via
    // settlementId on the BnplTransaction side.
    expect((prisma as any).bnplTransaction.update).toHaveBeenCalledWith({
      where: { id: TX_ID },
      data: { settlementId: SETTLE_ID },
    });
    expect(eventBus.emitAndBuild.mock.calls[0][0]).toBe(
      'bnpl.merchant_settlement.generated',
    );
  });
});

describe('MerchantSettlementService.runDailyBatch', () => {
  it('creates one batch settlement per T+1 merchant covering yesterday', async () => {
    const prisma = {
      merchant: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: MERCHANT,
            tenantId: TENANT,
            settlementType: SettlementType.T_PLUS_1,
            status: MerchantStatus.active,
            discountRate: '0.05',
          },
        ]),
      },
      bnplTransaction: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'tx-1', purchaseAmount: '100', currency: 'GHS' },
          { id: 'tx-2', purchaseAmount: '50', currency: 'GHS' },
          { id: 'tx-3', purchaseAmount: '50', currency: 'GHS' },
        ]),
        updateMany: jest.fn(),
      },
      merchantSettlement: {
        create: jest
          .fn()
          .mockImplementation(async (args: any) => ({ id: SETTLE_ID, ...args.data })),
      },
    };
    const eventBus = { emitAndBuild: jest.fn() };
    const service = new MerchantSettlementService(prisma as any, eventBus as any);

    const result = await service.runDailyBatch(TENANT, new Date('2026-05-02T01:00:00Z'));

    expect(result).toEqual({ batches: 1, transactions: 3 });
    // Gross 200, fee 200 × 0.05 = 10, net 190
    const args = prisma.merchantSettlement.create.mock.calls[0][0];
    expect(args.data.grossAmount).toBe('200.0000');
    expect(args.data.discountFee).toBe('10.0000');
    expect(args.data.netAmount).toBe('190.0000');
    expect(args.data.transactionCount).toBe(3);
    // FIX 5: every transaction in the batch is linked to this settlement.
    expect(prisma.bnplTransaction.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['tx-1', 'tx-2', 'tx-3'] }, tenantId: TENANT },
      data: { settlementId: SETTLE_ID },
    });
  });

  it('skips merchants with no eligible transactions', async () => {
    const prisma = {
      merchant: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: MERCHANT,
            tenantId: TENANT,
            settlementType: SettlementType.T_PLUS_1,
            status: MerchantStatus.active,
            discountRate: '0.05',
          },
        ]),
      },
      bnplTransaction: { findMany: jest.fn().mockResolvedValue([]) },
      merchantSettlement: { create: jest.fn() },
    };
    const service = new MerchantSettlementService(
      prisma as any,
      { emitAndBuild: jest.fn() } as any,
    );

    const result = await service.runDailyBatch(TENANT, new Date('2026-05-02'));
    expect(result).toEqual({ batches: 0, transactions: 0 });
    expect(prisma.merchantSettlement.create).not.toHaveBeenCalled();
  });
});

describe('MerchantSettlementService.settleNow', () => {
  it('returns ok without re-settling an already-settled row', async () => {
    const prisma = {
      merchantSettlement: {
        findFirst: jest.fn().mockResolvedValue({
          id: SETTLE_ID,
          status: MerchantSettlementStatus.settled,
          merchant: { walletId: 'w-1', walletProvider: 'mtn_momo' },
        }),
      },
    };
    const service = new MerchantSettlementService(
      prisma as any,
      { emitAndBuild: jest.fn() } as any,
    );

    const result = await service.settleNow(TENANT, SETTLE_ID, {
      payout: jest.fn(),
    });
    expect(result).toEqual({ ok: true });
  });

  it('marks failed and emits failed event when merchant has no wallet configured', async () => {
    const prisma = {
      merchantSettlement: {
        findFirst: jest.fn().mockResolvedValue({
          id: SETTLE_ID,
          merchantId: MERCHANT,
          netAmount: '100',
          status: MerchantSettlementStatus.pending,
          merchant: { walletId: null, walletProvider: null },
        }),
        update: jest.fn(),
      },
    };
    const eventBus = { emitAndBuild: jest.fn() };
    const service = new MerchantSettlementService(prisma as any, eventBus as any);

    const result = await service.settleNow(TENANT, SETTLE_ID, { payout: jest.fn() });

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/wallet/);
    expect(prisma.merchantSettlement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: MerchantSettlementStatus.failed }),
      }),
    );
    const evtName = eventBus.emitAndBuild.mock.calls[0][0];
    expect(evtName).toBe('bnpl.merchant_settlement.failed');
  });

  it('dispatches via the adapter and marks settled on success', async () => {
    const prisma = {
      merchantSettlement: {
        findFirst: jest.fn().mockResolvedValue({
          id: SETTLE_ID,
          merchantId: MERCHANT,
          netAmount: '100',
          status: MerchantSettlementStatus.pending,
          merchant: { walletId: 'w-1', walletProvider: 'mtn_momo' },
        }),
        update: jest.fn(),
      },
    };
    const eventBus = { emitAndBuild: jest.fn() };
    const adapter = {
      payout: jest.fn().mockResolvedValue({ success: true, walletRef: 'PAY-1' }),
    };
    const service = new MerchantSettlementService(prisma as any, eventBus as any);

    const result = await service.settleNow(TENANT, SETTLE_ID, adapter);

    expect(result.ok).toBe(true);
    expect(adapter.payout).toHaveBeenCalled();
    // First update sets processing, second sets settled.
    const lastUpdate = prisma.merchantSettlement.update.mock.calls.at(-1)![0];
    expect(lastUpdate.data.status).toBe(MerchantSettlementStatus.settled);
    expect(lastUpdate.data.walletRef).toBe('PAY-1');
    const evtNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
    expect(evtNames).toContain('bnpl.merchant_settlement.completed');
  });

  it('emits failed event and reason when adapter fails', async () => {
    const prisma = {
      merchantSettlement: {
        findFirst: jest.fn().mockResolvedValue({
          id: SETTLE_ID,
          merchantId: MERCHANT,
          netAmount: '100',
          status: MerchantSettlementStatus.pending,
          merchant: { walletId: 'w-1', walletProvider: 'mtn_momo' },
        }),
        update: jest.fn(),
      },
    };
    const eventBus = { emitAndBuild: jest.fn() };
    const adapter = {
      payout: jest.fn().mockResolvedValue({ success: false, reason: 'wallet_offline' }),
    };
    const service = new MerchantSettlementService(prisma as any, eventBus as any);

    const result = await service.settleNow(TENANT, SETTLE_ID, adapter);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe('wallet_offline');
    const evtNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
    expect(evtNames).toContain('bnpl.merchant_settlement.failed');
  });
});
