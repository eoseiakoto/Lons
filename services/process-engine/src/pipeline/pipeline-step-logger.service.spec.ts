import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@lons/database';

import { PipelineStepLoggerService } from './pipeline-step-logger.service';

/**
 * S18-7 unit tests. The PrismaService is a hand-rolled mock so we can
 * assert the exact shape of the row we'd write to `pipeline_step_logs`.
 */
describe('PipelineStepLoggerService', () => {
  let service: PipelineStepLoggerService;
  let prisma: jest.Mocked<any>;

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const loanRequestId = '22222222-2222-2222-2222-222222222222';

  beforeEach(async () => {
    prisma = {
      pipelineStepLog: {
        create: jest.fn().mockResolvedValue({ id: 'log-1' }),
        findMany: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineStepLoggerService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(PipelineStepLoggerService);
  });

  describe('logStep', () => {
    it('creates a row with the exact step shape', async () => {
      const startedAt = new Date('2026-05-17T10:00:00Z');
      const completedAt = new Date('2026-05-17T10:00:01Z');
      await service.logStep(tenantId, loanRequestId, {
        stepName: 'scoring',
        stepOrder: 2,
        outcome: 'success',
        inputs: { customerId: 'cust-1' },
        outputs: { score: 720 },
        durationMs: 1000,
        startedAt,
        completedAt,
      });
      expect(prisma.pipelineStepLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId,
          loanRequestId,
          stepName: 'scoring',
          stepOrder: 2,
          outcome: 'success',
          inputs: { customerId: 'cust-1' },
          outputs: { score: 720 },
          durationMs: 1000,
          startedAt,
          completedAt,
        }),
        select: { id: true },
      });
    });

    it('swallows DB errors so the audit trail never blocks the pipeline', async () => {
      prisma.pipelineStepLog.create.mockRejectedValue(
        new Error('permission denied on table'),
      );
      const result = await service.logStep(tenantId, loanRequestId, {
        stepName: 'scoring',
        stepOrder: 2,
        outcome: 'error',
        durationMs: 0,
        startedAt: new Date(),
        completedAt: new Date(),
      });
      expect(result.id).toBe('log-write-failed');
    });
  });

  describe('PII sanitisation', () => {
    it('redacts top-level PII fields', async () => {
      await service.logStep(tenantId, loanRequestId, {
        stepName: 'pre_qualification',
        stepOrder: 1,
        outcome: 'success',
        inputs: {
          customerId: 'cust-1',
          nationalId: 'GHA-123456789-X',
          phone: '+233245678901',
          email: 'jane@example.com',
          fullName: 'Jane Doe',
          dateOfBirth: '1990-01-01',
        },
        durationMs: 5,
        startedAt: new Date(),
        completedAt: new Date(),
      });
      const args = prisma.pipelineStepLog.create.mock.calls[0][0];
      expect(args.data.inputs).toEqual({
        customerId: 'cust-1',
        nationalId: '***REDACTED***',
        phone: '***REDACTED***',
        email: '***REDACTED***',
        fullName: '***REDACTED***',
        dateOfBirth: '***REDACTED***',
      });
    });

    it('redacts snake_case variants', async () => {
      await service.logStep(tenantId, loanRequestId, {
        stepName: 'scoring',
        stepOrder: 2,
        outcome: 'success',
        inputs: {
          national_id: 'GHA-x',
          phone_primary: '+233...',
          full_name: 'Jane',
          date_of_birth: '1990-01-01',
        },
        durationMs: 5,
        startedAt: new Date(),
        completedAt: new Date(),
      });
      const args = prisma.pipelineStepLog.create.mock.calls[0][0];
      expect(args.data.inputs).toEqual({
        national_id: '***REDACTED***',
        phone_primary: '***REDACTED***',
        full_name: '***REDACTED***',
        date_of_birth: '***REDACTED***',
      });
    });

    it('recursively redacts nested PII', async () => {
      await service.logStep(tenantId, loanRequestId, {
        stepName: 'scoring',
        stepOrder: 2,
        outcome: 'success',
        inputs: {
          customer: {
            id: 'cust-1',
            phone: '+233...',
            nested: { email: 'a@b.c', other: 42 },
          },
        },
        durationMs: 5,
        startedAt: new Date(),
        completedAt: new Date(),
      });
      const args = prisma.pipelineStepLog.create.mock.calls[0][0];
      expect(args.data.inputs).toEqual({
        customer: {
          id: 'cust-1',
          phone: '***REDACTED***',
          nested: { email: '***REDACTED***', other: 42 },
        },
      });
    });

    it('redacts PII inside arrays of objects', async () => {
      await service.logStep(tenantId, loanRequestId, {
        stepName: 'scoring',
        stepOrder: 2,
        outcome: 'success',
        inputs: {
          contacts: [
            { phone: '+233...', name: 'A' },
            { phone: '+233...', name: 'B' },
          ],
        },
        durationMs: 5,
        startedAt: new Date(),
        completedAt: new Date(),
      });
      const args = prisma.pipelineStepLog.create.mock.calls[0][0];
      expect(args.data.inputs).toEqual({
        contacts: [
          { phone: '***REDACTED***', name: 'A' },
          { phone: '***REDACTED***', name: 'B' },
        ],
      });
    });
  });

  describe('executeAndLog', () => {
    it('logs a success outcome with timing', async () => {
      const result = await service.executeAndLog(
        tenantId,
        loanRequestId,
        'scoring',
        2,
        { customerId: 'cust-1' },
        async () => ({ score: 700 }),
      );
      expect(result).toEqual({ score: 700 });
      const args = prisma.pipelineStepLog.create.mock.calls[0][0];
      expect(args.data.outcome).toBe('success');
      expect(args.data.outputs).toEqual({ score: 700 });
      expect(args.data.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('logs an error outcome and re-throws', async () => {
      const error = Object.assign(new Error('scoring failed'), {
        code: 'SCORING_TIMEOUT',
      });
      await expect(
        service.executeAndLog(
          tenantId,
          loanRequestId,
          'scoring',
          2,
          { customerId: 'cust-1' },
          async () => {
            throw error;
          },
        ),
      ).rejects.toThrow('scoring failed');
      const args = prisma.pipelineStepLog.create.mock.calls[0][0];
      expect(args.data.outcome).toBe('error');
      expect(args.data.errorCode).toBe('SCORING_TIMEOUT');
      expect(args.data.errorMessage).toBe('scoring failed');
    });
  });

  describe('getStepsForLoanRequest', () => {
    it('returns step logs ordered by stepOrder', async () => {
      prisma.pipelineStepLog.findMany.mockResolvedValue([
        { id: 'a', stepOrder: 1 },
        { id: 'b', stepOrder: 2 },
      ]);
      const result = await service.getStepsForLoanRequest(
        tenantId,
        loanRequestId,
      );
      expect(prisma.pipelineStepLog.findMany).toHaveBeenCalledWith({
        where: { tenantId, loanRequestId },
        orderBy: [{ stepOrder: 'asc' }, { startedAt: 'asc' }],
      });
      expect(result).toHaveLength(2);
    });
  });
});
