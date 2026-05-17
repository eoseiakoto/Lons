/**
 * Sprint 16 fixes (FIX-5) — unit tests for `EarlySettlementService`.
 *
 * Pinned behaviour:
 *   - Quote total = principal + interest + fees + penalties − rebate + fee
 *   - Rebate calculation: `unearnedInterest × (rebatePercent / 100)`
 *     where unearned = sum of interest on PENDING + dueDate > today
 *   - Settlement fee: flat (use value as-is) OR percentage of principal
 *   - Banker's rounding to 4dp on every Decimal output
 *   - Rejection codes for terminal status, disallowed product, too-soon
 *   - validUntil = end of current UTC day
 *   - breakdown filters zero-amount items
 */
import { ContractStatus } from '@lons/database';
import { ValidationError } from '@lons/common';

import { EarlySettlementService } from '../early-settlement.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const CONTRACT_ID = '22222222-2222-2222-2222-222222222222';

function makeContract(opts: {
  status?: ContractStatus;
  outstandingPrincipal?: string;
  outstandingInterest?: string;
  outstandingFees?: string;
  outstandingPenalties?: string;
  maturityDate?: Date;
  feeStructure?: Record<string, unknown> | null;
  schedule?: Array<{
    status: 'pending' | 'paid' | 'partial';
    dueDate: Date;
    interestAmount?: string;
  }>;
} = {}) {
  return {
    id: CONTRACT_ID,
    tenantId: TENANT_ID,
    status: opts.status ?? ContractStatus.active,
    outstandingPrincipal: opts.outstandingPrincipal ?? '1000.0000',
    outstandingInterest: opts.outstandingInterest ?? '100.0000',
    outstandingFees: opts.outstandingFees ?? '0',
    outstandingPenalties: opts.outstandingPenalties ?? '0',
    // Far enough in the future that minRemainingDays gates pass.
    maturityDate: opts.maturityDate ?? new Date(Date.now() + 90 * 86_400_000),
    product: {
      feeStructure: opts.feeStructure === undefined ? null : opts.feeStructure,
    },
    repaymentSchedule: (opts.schedule ?? [
      {
        status: 'pending',
        dueDate: new Date(Date.now() + 30 * 86_400_000),
        interestAmount: '200',
      },
    ]).map((e, i) => ({
      ...e,
      id: `e-${i}`,
      installmentNumber: i + 1,
    })),
  };
}

function makeService(contract: any) {
  const prisma = {
    contract: {
      findFirst: jest.fn().mockResolvedValue(contract),
    },
  } as any;
  return { service: new EarlySettlementService(prisma), prisma };
}

describe('EarlySettlementService.calculateEarlySettlementAmount', () => {
  describe('rejection paths', () => {
    it('throws NotFoundError when contract is missing', async () => {
      const { service, prisma } = makeService(null);
      prisma.contract.findFirst.mockResolvedValue(null);
      await expect(
        service.calculateEarlySettlementAmount(TENANT_ID, CONTRACT_ID),
      ).rejects.toThrow(/Contract/);
    });

    it('rejects settled contracts', async () => {
      const { service } = makeService(
        makeContract({ status: ContractStatus.settled }),
      );
      try {
        await service.calculateEarlySettlementAmount(TENANT_ID, CONTRACT_ID);
        fail('expected throw');
      } catch (err) {
        expect((err as ValidationError).details?.code).toBe(
          'EARLY_SETTLEMENT_TERMINAL_STATUS',
        );
      }
    });

    it('rejects cancelled contracts', async () => {
      const { service } = makeService(
        makeContract({ status: ContractStatus.cancelled }),
      );
      try {
        await service.calculateEarlySettlementAmount(TENANT_ID, CONTRACT_ID);
        fail('expected throw');
      } catch (err) {
        expect((err as ValidationError).details?.code).toBe(
          'EARLY_SETTLEMENT_TERMINAL_STATUS',
        );
      }
    });

    it('rejects when product config disallows', async () => {
      const { service } = makeService(
        makeContract({
          feeStructure: { earlySettlement: { allowed: false } },
        }),
      );
      try {
        await service.calculateEarlySettlementAmount(TENANT_ID, CONTRACT_ID);
        fail('expected throw');
      } catch (err) {
        expect((err as ValidationError).details?.code).toBe(
          'EARLY_SETTLEMENT_NOT_ALLOWED',
        );
      }
    });

    it('rejects when remaining days < minRemainingDays', async () => {
      const { service } = makeService(
        makeContract({
          maturityDate: new Date(Date.now() + 5 * 86_400_000),
          feeStructure: { earlySettlement: { minRemainingDays: 14 } },
        }),
      );
      try {
        await service.calculateEarlySettlementAmount(TENANT_ID, CONTRACT_ID);
        fail('expected throw');
      } catch (err) {
        expect((err as ValidationError).details?.code).toBe(
          'EARLY_SETTLEMENT_TOO_SOON',
        );
      }
    });
  });

  describe('quote math', () => {
    it('no rebate, no fee → total = principal + interest + fees + penalties', async () => {
      const { service } = makeService(
        makeContract({
          outstandingPrincipal: '500',
          outstandingInterest: '50',
          outstandingFees: '10',
          outstandingPenalties: '5',
          schedule: [
            {
              status: 'pending',
              dueDate: new Date(Date.now() + 30 * 86_400_000),
              interestAmount: '20',
            },
          ],
        }),
      );
      const quote = await service.calculateEarlySettlementAmount(
        TENANT_ID,
        CONTRACT_ID,
      );
      // 500 + 50 + 10 + 5 + 0 fee − 0 rebate = 565.
      expect(Number(quote.totalSettlementAmount)).toBe(565);
      expect(Number(quote.interestRebate)).toBe(0);
      expect(Number(quote.settlementFee)).toBe(0);
    });

    it('50% rebate on 200 unearned interest → 100 rebate', async () => {
      const { service } = makeService(
        makeContract({
          outstandingPrincipal: '1000',
          outstandingInterest: '0',
          outstandingFees: '0',
          outstandingPenalties: '0',
          feeStructure: {
            earlySettlement: { allowed: true, interestRebatePercent: '50' },
          },
          schedule: [
            {
              status: 'pending',
              dueDate: new Date(Date.now() + 30 * 86_400_000),
              interestAmount: '200',
            },
          ],
        }),
      );
      const quote = await service.calculateEarlySettlementAmount(
        TENANT_ID,
        CONTRACT_ID,
      );
      // unearned = 200 → rebate = 100; total = 1000 + 0 + 0 + 0 + 0 − 100 = 900.
      expect(Number(quote.interestRebate)).toBe(100);
      expect(Number(quote.totalSettlementAmount)).toBe(900);
    });

    it('flat settlement fee added to total', async () => {
      const { service } = makeService(
        makeContract({
          outstandingPrincipal: '1000',
          outstandingInterest: '0',
          outstandingFees: '0',
          outstandingPenalties: '0',
          feeStructure: {
            earlySettlement: {
              allowed: true,
              settlementFeeType: 'flat',
              settlementFeeValue: '25',
            },
          },
          schedule: [],
        }),
      );
      const quote = await service.calculateEarlySettlementAmount(
        TENANT_ID,
        CONTRACT_ID,
      );
      expect(Number(quote.settlementFee)).toBe(25);
      expect(Number(quote.totalSettlementAmount)).toBe(1025);
    });

    it('percentage settlement fee = % of remaining principal', async () => {
      const { service } = makeService(
        makeContract({
          outstandingPrincipal: '1000',
          outstandingInterest: '0',
          outstandingFees: '0',
          outstandingPenalties: '0',
          feeStructure: {
            earlySettlement: {
              allowed: true,
              settlementFeeType: 'percentage',
              settlementFeeValue: '1.5',
            },
          },
          schedule: [],
        }),
      );
      const quote = await service.calculateEarlySettlementAmount(
        TENANT_ID,
        CONTRACT_ID,
      );
      // 1.5% of 1000 = 15.
      expect(Number(quote.settlementFee)).toBe(15);
      expect(Number(quote.totalSettlementAmount)).toBe(1015);
    });

    it('combined: rebate + fee in same quote', async () => {
      const { service } = makeService(
        makeContract({
          outstandingPrincipal: '1000',
          outstandingInterest: '0',
          outstandingFees: '0',
          outstandingPenalties: '0',
          feeStructure: {
            earlySettlement: {
              allowed: true,
              interestRebatePercent: '50',
              settlementFeeType: 'flat',
              settlementFeeValue: '10',
            },
          },
          schedule: [
            {
              status: 'pending',
              dueDate: new Date(Date.now() + 30 * 86_400_000),
              interestAmount: '100',
            },
          ],
        }),
      );
      const quote = await service.calculateEarlySettlementAmount(
        TENANT_ID,
        CONTRACT_ID,
      );
      // rebate = 50; fee = 10; total = 1000 + 0 + 0 + 0 + 10 − 50 = 960.
      expect(Number(quote.interestRebate)).toBe(50);
      expect(Number(quote.settlementFee)).toBe(10);
      expect(Number(quote.totalSettlementAmount)).toBe(960);
    });

    it('past-due installments are NOT counted as unearned interest', async () => {
      const { service } = makeService(
        makeContract({
          outstandingPrincipal: '1000',
          outstandingInterest: '0',
          outstandingFees: '0',
          outstandingPenalties: '0',
          feeStructure: {
            earlySettlement: { allowed: true, interestRebatePercent: '100' },
          },
          schedule: [
            // Past-due — does NOT count as unearned even though pending.
            {
              status: 'pending',
              dueDate: new Date(Date.now() - 1 * 86_400_000),
              interestAmount: '500',
            },
            // Future — counts.
            {
              status: 'pending',
              dueDate: new Date(Date.now() + 30 * 86_400_000),
              interestAmount: '100',
            },
          ],
        }),
      );
      const quote = await service.calculateEarlySettlementAmount(
        TENANT_ID,
        CONTRACT_ID,
      );
      // 100% rebate on 100 unearned interest.
      expect(Number(quote.interestRebate)).toBe(100);
    });
  });

  describe('quote shape', () => {
    it('validUntil is end of current UTC day', async () => {
      const { service } = makeService(makeContract());
      const quote = await service.calculateEarlySettlementAmount(
        TENANT_ID,
        CONTRACT_ID,
      );
      const validUntil = new Date(quote.validUntil);
      expect(validUntil.getUTCHours()).toBe(23);
      expect(validUntil.getUTCMinutes()).toBe(59);
      expect(validUntil.getUTCSeconds()).toBe(59);
    });

    it('breakdown filters out zero-amount items', async () => {
      const { service } = makeService(
        makeContract({
          outstandingPrincipal: '500',
          outstandingInterest: '0',
          outstandingFees: '0',
          outstandingPenalties: '0',
          schedule: [],
        }),
      );
      const quote = await service.calculateEarlySettlementAmount(
        TENANT_ID,
        CONTRACT_ID,
      );
      // Only the principal row survives the filter.
      const labels = quote.breakdown.map((b) => b.label);
      expect(labels).toContain('Remaining principal');
      expect(labels).not.toContain('Accrued interest');
      expect(labels).not.toContain('Interest rebate');
      expect(labels).not.toContain('Early settlement fee');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // S17-FIX-BA-5 (S16 carry-forward) — settlement total floor at zero
  // ─────────────────────────────────────────────────────────────────────

  describe('settlement total floor', () => {
    it('floors totalSettlementAmount at zero when rebate exceeds subtotal', async () => {
      // 100% rebate on a contract whose unearned interest exceeds the
      // outstanding principal. Pre-fix this produced a negative quote
      // ("platform pays customer to settle"). Post-fix it floors at 0.
      const { service } = makeService(
        makeContract({
          outstandingPrincipal: '100',
          outstandingInterest: '50',
          outstandingFees: '0',
          outstandingPenalties: '0',
          feeStructure: {
            earlySettlement: { allowed: true, interestRebatePercent: '100' },
          },
          schedule: [
            {
              status: 'pending',
              dueDate: new Date(Date.now() + 30 * 86_400_000),
              // Unearned interest of 500 dwarfs the 150 outstanding
              // total — the raw subtract would be -350.
              interestAmount: '500',
            },
          ],
        }),
      );

      const quote = await service.calculateEarlySettlementAmount(
        TENANT_ID,
        CONTRACT_ID,
      );

      // Floor — never negative.
      expect(quote.totalSettlementAmount).toBe('0.0000');

      // FIX-BA-5 exit criterion #9: breakdown still shows the rebate
      // line for operator transparency even when the total floored.
      const labels = quote.breakdown.map((b) => b.label);
      expect(labels).toContain('Interest rebate');
    });

    it('does not floor when settlement total is positive (normal case)', async () => {
      const { service } = makeService(
        makeContract({
          outstandingPrincipal: '1000',
          outstandingInterest: '100',
          outstandingFees: '50',
          outstandingPenalties: '15',
          feeStructure: {
            earlySettlement: { allowed: true, interestRebatePercent: '50' },
          },
          schedule: [
            {
              status: 'pending',
              dueDate: new Date(Date.now() + 30 * 86_400_000),
              interestAmount: '200',
            },
          ],
        }),
      );

      const quote = await service.calculateEarlySettlementAmount(
        TENANT_ID,
        CONTRACT_ID,
      );

      // Pre-fix math: 1000 + 100 + 50 + 15 - 100 = 1065 — positive,
      // floor is a no-op.
      expect(Number(quote.totalSettlementAmount)).toBeGreaterThan(0);
    });
  });
});
