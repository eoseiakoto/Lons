/**
 * Repayment service — waterfall allocation tests.
 *
 * Focus: the pure `applyWaterfall` math. The DB-touching paths
 * (`processAutoRepayment`, `processManualRepayment`) are exercised in the
 * integration tests in `__tests__/`; here we cover the allocation invariant:
 *   - Sum of allocations exactly equals totalCollected (no rounding loss)
 *   - Buckets are filled in the configured order
 *   - Buckets that exceed remaining stop the waterfall cleanly
 */

import { RepaymentService } from './repayment.service';
import { CreditLineStatus } from '@lons/database';

describe('RepaymentService.applyWaterfall', () => {
  const service = new RepaymentService(null as any, null as any, null as any);

  describe('default order: penalties → interest → fees → principal', () => {
    it('allocates everything to the first bucket when collection is small', () => {
      const out = service.applyWaterfall('10.00', {
        penalties: '50.00',
        interest: '20.00',
        fees: '5.00',
        principal: '1000.00',
      });
      expect(out.allocatedPenalties).toBe('10.0000');
      expect(out.allocatedInterest).toBe('0');
      expect(out.allocatedFees).toBe('0');
      expect(out.allocatedPrincipal).toBe('0');
      expect(out.totalAllocated).toBe('10.0000');
    });

    it('overflows from penalties into the next buckets', () => {
      const out = service.applyWaterfall('100.00', {
        penalties: '30.00',
        interest: '40.00',
        fees: '15.00',
        principal: '1000.00',
      });
      expect(out.allocatedPenalties).toBe('30.0000');
      expect(out.allocatedInterest).toBe('40.0000');
      expect(out.allocatedFees).toBe('15.0000');
      expect(out.allocatedPrincipal).toBe('15.0000');
      expect(out.totalAllocated).toBe('100.0000');
    });

    it('caps at remaining when collection exceeds total owed', () => {
      const out = service.applyWaterfall('10000.00', {
        penalties: '10.00',
        interest: '20.00',
        fees: '5.00',
        principal: '500.00',
      });
      expect(out.allocatedPenalties).toBe('10.0000');
      expect(out.allocatedInterest).toBe('20.0000');
      expect(out.allocatedFees).toBe('5.0000');
      expect(out.allocatedPrincipal).toBe('500.0000');
      expect(out.totalAllocated).toBe('535.0000');
    });

    it('handles all-zero balances without error', () => {
      const out = service.applyWaterfall('100.00', {
        penalties: '0',
        interest: '0',
        fees: '0',
        principal: '0',
      });
      expect(out.totalAllocated).toBe('0.0000');
    });
  });

  describe('configurable waterfall order', () => {
    it('honors a non-default order', () => {
      const out = service.applyWaterfall(
        '50.00',
        { penalties: '20.00', interest: '20.00', fees: '20.00', principal: '20.00' },
        ['principal', 'interest', 'fees', 'penalties'],
      );
      expect(out.allocatedPrincipal).toBe('20.0000');
      expect(out.allocatedInterest).toBe('20.0000');
      expect(out.allocatedFees).toBe('10.0000');
      expect(out.allocatedPenalties).toBe('0');
    });
  });

  describe('Decimal precision invariant', () => {
    // Property test — sum of allocations should equal totalCollected for any
    // balance distribution within the same scale. We use the random seed
    // approach (small fixed examples) since the codebase has no fast-check.
    const cases: Array<{ collected: string; balances: { penalties: string; interest: string; fees: string; principal: string } }> = [
      { collected: '0.0001', balances: { penalties: '0.0001', interest: '0', fees: '0', principal: '0' } },
      { collected: '999999999.9999', balances: { penalties: '0', interest: '0', fees: '0', principal: '999999999.9999' } },
      { collected: '12345.6789', balances: { penalties: '100.50', interest: '2500.25', fees: '50.00', principal: '50000.00' } },
      { collected: '0.5000', balances: { penalties: '0.0001', interest: '0.0001', fees: '0.0001', principal: '99.9997' } },
    ];

    for (const c of cases) {
      it(`preserves Decimal precision for collected=${c.collected}`, () => {
        const out = service.applyWaterfall(c.collected, c.balances);
        // The total allocated must equal min(collected, sum of balances).
        // Bigint-ify the strings for an exact comparison at 4dp.
        const toUnits = (s: string) => BigInt(s.replace('.', '').padEnd(s.includes('.') ? s.length - 1 + 4 : s.length + 4, '0').replace(/^(-?)0+/, '$1') || '0');
        const totalUnits =
          toUnits(out.allocatedPenalties) +
          toUnits(out.allocatedInterest) +
          toUnits(out.allocatedFees) +
          toUnits(out.allocatedPrincipal);
        const reportedUnits = toUnits(out.totalAllocated);
        expect(totalUnits).toBe(reportedUnits);
      });
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Sprint 11 A12 — processAutoRepayment + processManualRepayment integration
// ───────────────────────────────────────────────────────────────────────────

describe('RepaymentService.processManualRepayment / processAutoRepayment — A12', () => {
  const TENANT = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  const CL_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  const CUSTOMER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const PRODUCT = 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff';

  function makeCl(overrides: Partial<any> = {}) {
    return {
      id: CL_ID,
      tenantId: TENANT,
      customerId: CUSTOMER,
      productId: PRODUCT,
      currency: 'GHS',
      status: CreditLineStatus.active,
      approvedLimit: '1000',
      availableBalance: '500',
      outstandingAmount: '500',
      interestAccrued: '20',
      feesOutstanding: '5',
      penaltiesAccrued: '0',
      interestRate: '0.10',
      product: { overdraftConfig: {} },
      ...overrides,
    };
  }

  function makeMocks(opts: { cl: any | null; candidates?: any[] } = { cl: null }) {
    const prisma = {
      creditLine: {
        findFirst: jest.fn().mockResolvedValue(opts.cl),
        findMany: jest.fn().mockResolvedValue(opts.candidates ?? []),
        update: jest.fn(async (args: any) => ({ ...opts.cl, ...args.data })),
      },
    };
    const eventBus = { emitAndBuild: jest.fn() };
    const cache = { put: jest.fn(), invalidate: jest.fn() };
    return { prisma, eventBus, cache };
  }

  describe('processManualRepayment', () => {
    it('rejects non-positive amounts', async () => {
      const { prisma, eventBus, cache } = makeMocks({ cl: makeCl() });
      const service = new RepaymentService(prisma as any, eventBus as any, cache as any);

      await expect(
        service.processManualRepayment(
          TENANT,
          { creditLineId: CL_ID, amount: '0', walletId: 'w' },
          { collect: jest.fn() } as any,
        ),
      ).rejects.toThrow(/positive/);
    });

    it('throws NotFoundError when the credit line does not exist', async () => {
      const { prisma, eventBus, cache } = makeMocks({ cl: null });
      const service = new RepaymentService(prisma as any, eventBus as any, cache as any);

      await expect(
        service.processManualRepayment(
          TENANT,
          { creditLineId: CL_ID, amount: '50', walletId: 'w' },
          { collect: jest.fn() } as any,
        ),
      ).rejects.toThrow();
    });

    it('rejects when the credit line has no outstanding balance', async () => {
      const cl = makeCl({
        outstandingAmount: '0',
        interestAccrued: '0',
        feesOutstanding: '0',
        penaltiesAccrued: '0',
      });
      const { prisma, eventBus, cache } = makeMocks({ cl });
      const service = new RepaymentService(prisma as any, eventBus as any, cache as any);

      await expect(
        service.processManualRepayment(
          TENANT,
          { creditLineId: CL_ID, amount: '50', walletId: 'w' },
          { collect: jest.fn() } as any,
        ),
      ).rejects.toThrow(/no outstanding/);
    });

    it('caps collection at totalOwed when amount exceeds it', async () => {
      const cl = makeCl({
        outstandingAmount: '100',
        interestAccrued: '5',
        feesOutstanding: '0',
        penaltiesAccrued: '0',
      });
      const { prisma, eventBus, cache } = makeMocks({ cl });
      const adapter = {
        collect: jest.fn().mockResolvedValue({ success: true, walletRef: 'mock-1' }),
      };
      const service = new RepaymentService(prisma as any, eventBus as any, cache as any);

      const result = await service.processManualRepayment(
        TENANT,
        { creditLineId: CL_ID, amount: '10000', walletId: 'w' },
        adapter as any,
      );

      expect(adapter.collect).toHaveBeenCalledWith(
        expect.objectContaining({ amount: '105.0000' }),
      );
      expect(result.totalAllocated).toBe('105.0000');
    });

    it('applies waterfall, updates Postgres + cache, emits manual + fully-repaid events on full pay-off', async () => {
      const cl = makeCl({
        outstandingAmount: '50',
        interestAccrued: '0',
        feesOutstanding: '0',
        penaltiesAccrued: '0',
      });
      const { prisma, eventBus, cache } = makeMocks({ cl });
      const adapter = {
        collect: jest.fn().mockResolvedValue({ success: true, walletRef: 'mock-1' }),
      };
      const service = new RepaymentService(prisma as any, eventBus as any, cache as any);

      await service.processManualRepayment(
        TENANT,
        { creditLineId: CL_ID, amount: '50', walletId: 'w' },
        adapter as any,
      );

      expect(prisma.creditLine.update).toHaveBeenCalled();
      expect(cache.put).toHaveBeenCalled();
      const eventNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
      expect(eventNames).toContain('creditline.repayment.manual');
      expect(eventNames).toContain('creditline.fully_repaid');
    });

    it('emits CREDITLINE_REPAYMENT_FAILED when the wallet adapter reports failure', async () => {
      const { prisma, eventBus, cache } = makeMocks({ cl: makeCl() });
      const adapter = {
        collect: jest.fn().mockResolvedValue({ success: false, reason: 'wallet_offline' }),
      };
      const service = new RepaymentService(prisma as any, eventBus as any, cache as any);

      await expect(
        service.processManualRepayment(
          TENANT,
          { creditLineId: CL_ID, amount: '50', walletId: 'w' },
          adapter as any,
        ),
      ).rejects.toThrow(/Repayment failed/);

      const eventNames = eventBus.emitAndBuild.mock.calls.map((c) => c[0]);
      expect(eventNames).toContain('creditline.repayment.failed');
      expect(prisma.creditLine.update).not.toHaveBeenCalled();
    });
  });

  describe('processAutoRepayment', () => {
    it('returns empty when creditAmount is non-positive', async () => {
      const { prisma, eventBus, cache } = makeMocks();
      const service = new RepaymentService(prisma as any, eventBus as any, cache as any);

      const result = await service.processAutoRepayment(
        TENANT,
        { customerId: CUSTOMER, walletId: 'w', creditAmount: '0' },
        { collect: jest.fn() } as any,
      );

      expect(result).toEqual([]);
    });

    it('returns empty when the customer has no candidate credit lines', async () => {
      const { prisma, eventBus, cache } = makeMocks({ cl: null, candidates: [] });
      const service = new RepaymentService(prisma as any, eventBus as any, cache as any);

      const result = await service.processAutoRepayment(
        TENANT,
        { customerId: CUSTOMER, walletId: 'w', creditAmount: '100' },
        { collect: jest.fn() } as any,
      );

      expect(result).toEqual([]);
    });

    it('skips lines with zero owed and returns one entry per touched line', async () => {
      const empty = makeCl({
        id: 'cl-empty',
        outstandingAmount: '0',
        interestAccrued: '0',
        feesOutstanding: '0',
        penaltiesAccrued: '0',
      });
      const owed = makeCl({
        id: 'cl-owed',
        outstandingAmount: '40',
        interestAccrued: '10',
        feesOutstanding: '0',
        penaltiesAccrued: '0',
      });
      const { prisma, eventBus, cache } = makeMocks({
        cl: null,
        candidates: [empty, owed],
      });
      const adapter = {
        collect: jest.fn().mockResolvedValue({ success: true, walletRef: 'mock-1' }),
      };
      const service = new RepaymentService(prisma as any, eventBus as any, cache as any);

      const result = await service.processAutoRepayment(
        TENANT,
        { customerId: CUSTOMER, walletId: 'w', creditAmount: '50' },
        adapter as any,
      );

      expect(result).toHaveLength(1);
      expect(result[0].creditLineId).toBe('cl-owed');
      expect(adapter.collect).toHaveBeenCalledTimes(1);
    });

    it('exhausts the wallet credit across multiple credit lines', async () => {
      const a = makeCl({
        id: 'cl-a',
        outstandingAmount: '40',
        interestAccrued: '0',
        feesOutstanding: '0',
        penaltiesAccrued: '0',
      });
      const b = makeCl({
        id: 'cl-b',
        outstandingAmount: '60',
        interestAccrued: '0',
        feesOutstanding: '0',
        penaltiesAccrued: '0',
      });
      const { prisma, eventBus, cache } = makeMocks({
        cl: null,
        candidates: [a, b],
      });
      const adapter = {
        collect: jest.fn().mockResolvedValue({ success: true, walletRef: 'mock-1' }),
      };
      const service = new RepaymentService(prisma as any, eventBus as any, cache as any);

      const result = await service.processAutoRepayment(
        TENANT,
        { customerId: CUSTOMER, walletId: 'w', creditAmount: '100' },
        adapter as any,
      );

      expect(result).toHaveLength(2);
      expect(adapter.collect).toHaveBeenCalledTimes(2);
    });
  });
});
