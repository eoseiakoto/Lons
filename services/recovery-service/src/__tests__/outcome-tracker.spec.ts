import { OutcomeTrackerService } from '../outcome-tracker.service';
import { RecoveryStrategyType, RecoveryOutcomeStatus } from '@lons/shared-types';

describe('OutcomeTrackerService', () => {
  let service: OutcomeTrackerService;
  let mockPrisma: any;
  let mockEventBus: any;

  beforeEach(() => {
    mockPrisma = {
      contract: { findFirst: jest.fn() },
      recoveryOutcome: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
    };
    mockEventBus = {
      emitAndBuild: jest.fn(),
    };
    service = new OutcomeTrackerService(mockPrisma, mockEventBus);
  });

  describe('recordOutcome', () => {
    it('should create a recovery outcome record', async () => {
      mockPrisma.contract.findFirst.mockResolvedValue({ id: 'contract-1', tenantId: 'tenant-1' });
      mockPrisma.recoveryOutcome.create.mockResolvedValue({
        id: 'outcome-1',
        tenantId: 'tenant-1',
        contractId: 'contract-1',
        strategyType: RecoveryStrategyType.GRACE_PERIOD,
        status: RecoveryOutcomeStatus.PENDING,
      });

      const result = await service.recordOutcome('tenant-1', 'contract-1', {
        strategyType: RecoveryStrategyType.GRACE_PERIOD,
        notes: 'Testing grace period',
      });

      expect(result.id).toBe('outcome-1');
      expect(result.status).toBe(RecoveryOutcomeStatus.PENDING);
      expect(mockPrisma.recoveryOutcome.create).toHaveBeenCalled();
      expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
        'recovery.strategy_applied',
        'tenant-1',
        expect.objectContaining({
          outcomeId: 'outcome-1',
          contractId: 'contract-1',
        }),
      );
    });

    it('should throw NotFoundError for non-existent contract', async () => {
      mockPrisma.contract.findFirst.mockResolvedValue(null);

      await expect(
        service.recordOutcome('tenant-1', 'non-existent', {
          strategyType: RecoveryStrategyType.RESTRUCTURE,
        }),
      ).rejects.toThrow('Contract');
    });
  });

  describe('updateOutcome', () => {
    it('should update outcome status and emit event', async () => {
      const existing = {
        id: 'outcome-1',
        tenantId: 'tenant-1',
        contractId: 'contract-1',
        strategyType: RecoveryStrategyType.GRACE_PERIOD,
        status: RecoveryOutcomeStatus.PENDING,
        appliedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        notes: 'original note',
      };
      mockPrisma.recoveryOutcome.findUnique.mockResolvedValue(existing);
      mockPrisma.recoveryOutcome.update.mockResolvedValue({
        ...existing,
        status: RecoveryOutcomeStatus.SUCCESS,
        amountRecovered: 5000,
      });

      const result = await service.updateOutcome('outcome-1', {
        status: RecoveryOutcomeStatus.SUCCESS,
        amountRecovered: '5000.0000',
        notes: 'Full recovery',
      });

      expect(result.status).toBe(RecoveryOutcomeStatus.SUCCESS);
      expect(mockEventBus.emitAndBuild).toHaveBeenCalledWith(
        'recovery.outcome_recorded',
        'tenant-1',
        expect.objectContaining({
          outcomeId: 'outcome-1',
          status: RecoveryOutcomeStatus.SUCCESS,
        }),
      );
    });

    it('should throw NotFoundError for non-existent outcome', async () => {
      mockPrisma.recoveryOutcome.findUnique.mockResolvedValue(null);

      await expect(
        service.updateOutcome('non-existent', {
          status: RecoveryOutcomeStatus.SUCCESS,
        }),
      ).rejects.toThrow('RecoveryOutcome');
    });

    it('should set resolvedAt when status is terminal', async () => {
      const existing = {
        id: 'outcome-1',
        tenantId: 'tenant-1',
        contractId: 'contract-1',
        strategyType: RecoveryStrategyType.RESTRUCTURE,
        status: RecoveryOutcomeStatus.PENDING,
        appliedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      };
      mockPrisma.recoveryOutcome.findUnique.mockResolvedValue(existing);
      mockPrisma.recoveryOutcome.update.mockImplementation(({ data }: any) => ({
        ...existing,
        ...data,
      }));

      await service.updateOutcome('outcome-1', {
        status: RecoveryOutcomeStatus.FAILED,
      });

      expect(mockPrisma.recoveryOutcome.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            resolvedAt: expect.any(Date),
            daysToResolution: expect.any(Number),
          }),
        }),
      );
    });
  });

  describe('getOutcomes', () => {
    it('should return outcomes for a contract', async () => {
      const outcomes = [
        { id: 'outcome-1', contractId: 'contract-1', status: 'success' },
        { id: 'outcome-2', contractId: 'contract-1', status: 'pending' },
      ];
      mockPrisma.recoveryOutcome.findMany.mockResolvedValue(outcomes);

      const result = await service.getOutcomes('tenant-1', 'contract-1');

      expect(result).toHaveLength(2);
      expect(mockPrisma.recoveryOutcome.findMany).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-1', contractId: 'contract-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('getStrategyEffectiveness', () => {
    it('should return zero stats when no outcomes exist', async () => {
      mockPrisma.recoveryOutcome.findMany.mockResolvedValue([]);

      const result = await service.getStrategyEffectiveness('tenant-1', RecoveryStrategyType.GRACE_PERIOD);

      expect(result.successRate).toBe(0);
      expect(result.avgRecovery).toBe('0.0000');
      expect(result.avgDaysToResolve).toBe(0);
      expect(result.totalOutcomes).toBe(0);
    });

    it('should calculate correct effectiveness metrics', async () => {
      mockPrisma.recoveryOutcome.findMany.mockResolvedValue([
        { status: RecoveryOutcomeStatus.SUCCESS, amountRecovered: 5000, daysToResolution: 10 },
        { status: RecoveryOutcomeStatus.SUCCESS, amountRecovered: 3000, daysToResolution: 15 },
        { status: RecoveryOutcomeStatus.FAILED, amountRecovered: 0, daysToResolution: 30 },
        { status: RecoveryOutcomeStatus.PARTIAL, amountRecovered: 2000, daysToResolution: 20 },
      ]);

      const result = await service.getStrategyEffectiveness('tenant-1', RecoveryStrategyType.GRACE_PERIOD);

      expect(result.totalOutcomes).toBe(4);
      // 3 success/partial out of 4 = 0.75
      expect(result.successRate).toBeCloseTo(0.75, 2);
      // avg recovery: (5000 + 3000 + 0 + 2000) / 4 = 2500
      expect(Number(result.avgRecovery)).toBeCloseTo(2500, 0);
      // avg days: (10 + 15 + 30 + 20) / 4 = 18.75
      expect(result.avgDaysToResolve).toBeCloseTo(18.75, 1);
    });
  });
});
