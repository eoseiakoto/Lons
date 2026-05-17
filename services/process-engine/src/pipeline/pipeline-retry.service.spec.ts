import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { PrismaService } from '@lons/database';
import { EventBusService } from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { PipelineRetryService } from './pipeline-retry.service';
import { PipelineStepLoggerService } from './pipeline-step-logger.service';
import {
  PIPELINE_RETRY_QUEUE,
  PIPELINE_STEP_CONFIGS,
  PipelineStep,
  computeRetryDelay,
  retryJobId,
} from './pipeline-step-registry';

/**
 * S18-12 unit tests.
 *
 * The BullMQ queue is mocked with jest fns so we can assert exact
 * enqueue shape, jobId (idempotency), and delay math.
 */
describe('PipelineRetryService', () => {
  let service: PipelineRetryService;
  let queue: any;
  let logger: jest.Mocked<PipelineStepLoggerService>;
  let eventBus: jest.Mocked<EventBusService>;

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const loanRequestId = '22222222-2222-2222-2222-222222222222';

  beforeEach(async () => {
    queue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      getDelayed: jest.fn().mockResolvedValue([]),
    };
    logger = {
      logStep: jest.fn().mockResolvedValue({ id: 'log-1' }),
      executeAndLog: jest.fn(),
      getStepsForLoanRequest: jest.fn(),
    } as any;
    eventBus = {
      emitAndBuild: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PipelineRetryService,
        { provide: getQueueToken(PIPELINE_RETRY_QUEUE), useValue: queue },
        { provide: PipelineStepLoggerService, useValue: logger },
        { provide: PrismaService, useValue: {} },
        { provide: EventBusService, useValue: eventBus },
      ],
    }).compile();

    service = module.get(PipelineRetryService);
  });

  describe('handleStepFailure — retriable error', () => {
    it('enqueues a delayed job and emits RETRY_SCHEDULED', async () => {
      const { willRetry, nextAttemptAt } = await service.handleStepFailure(
        tenantId,
        loanRequestId,
        PipelineStep.SCORING,
        { code: 'SCORING_TIMEOUT', message: 'timed out' },
        0, // first failure
      );
      expect(willRetry).toBe(true);
      expect(nextAttemptAt).toBeInstanceOf(Date);

      expect(queue.add).toHaveBeenCalledTimes(1);
      const [name, data, opts] = queue.add.mock.calls[0];
      expect(name).toBe('retry-scoring');
      expect(data).toMatchObject({
        tenantId,
        loanRequestId,
        step: PipelineStep.SCORING,
        attempt: 1,
        errorCode: 'SCORING_TIMEOUT',
      });
      expect(opts).toMatchObject({
        attempts: 1, // BullMQ-level retries off — we manage them ourselves
        jobId: retryJobId(loanRequestId, PipelineStep.SCORING, 1),
      });

      expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
        EventType.PIPELINE_STEP_RETRY_SCHEDULED,
        tenantId,
        expect.objectContaining({
          step: PipelineStep.SCORING,
          attempt: 1,
        }),
      );
    });

    it('uses an idempotent jobId so duplicate enqueues are deduped', async () => {
      await service.handleStepFailure(
        tenantId,
        loanRequestId,
        PipelineStep.SCORING,
        { code: 'SCORING_TIMEOUT', message: 'x' },
        1,
      );
      const [, , opts] = queue.add.mock.calls[0];
      expect(opts.jobId).toBe(
        `${loanRequestId}-${PipelineStep.SCORING}-attempt-2`,
      );
    });
  });

  describe('handleStepFailure — non-retriable error', () => {
    it('does not enqueue, logs permanent_failure, emits EXHAUSTED', async () => {
      const { willRetry } = await service.handleStepFailure(
        tenantId,
        loanRequestId,
        PipelineStep.SCORING,
        { code: 'INVALID_SCORING_INPUT', message: 'bad inputs' },
        0,
      );
      expect(willRetry).toBe(false);
      expect(queue.add).not.toHaveBeenCalled();
      expect(logger.logStep).toHaveBeenCalledWith(
        tenantId,
        loanRequestId,
        expect.objectContaining({ outcome: 'permanent_failure' }),
      );
      expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
        EventType.PIPELINE_STEP_RETRY_EXHAUSTED,
        tenantId,
        expect.objectContaining({ reason: 'non_retryable_error' }),
      );
    });
  });

  describe('handleStepFailure — retries exhausted', () => {
    it('does not enqueue, logs max_retries_exceeded, emits EXHAUSTED', async () => {
      const maxRetries =
        PIPELINE_STEP_CONFIGS[PipelineStep.SCORING].maxRetries;
      const { willRetry } = await service.handleStepFailure(
        tenantId,
        loanRequestId,
        PipelineStep.SCORING,
        { code: 'SCORING_TIMEOUT', message: 'x' },
        maxRetries, // already at the cap
      );
      expect(willRetry).toBe(false);
      expect(queue.add).not.toHaveBeenCalled();
      expect(logger.logStep).toHaveBeenCalledWith(
        tenantId,
        loanRequestId,
        expect.objectContaining({ outcome: 'max_retries_exceeded' }),
      );
      expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
        EventType.PIPELINE_STEP_RETRY_EXHAUSTED,
        tenantId,
        expect.objectContaining({ reason: 'max_retries_exceeded' }),
      );
    });
  });

  describe('cancelPendingRetries', () => {
    it('removes only the matching loan request jobs', async () => {
      const remove1 = jest.fn();
      const remove2 = jest.fn();
      queue.getDelayed.mockResolvedValue([
        { data: { loanRequestId }, remove: remove1 },
        { data: { loanRequestId: 'other' }, remove: remove2 },
        { data: { loanRequestId }, remove: remove1 },
      ]);
      const count = await service.cancelPendingRetries(loanRequestId);
      expect(count).toBe(2);
      expect(remove1).toHaveBeenCalledTimes(2);
      expect(remove2).not.toHaveBeenCalled();
    });
  });
});

describe('computeRetryDelay (pure helper)', () => {
  const config = PIPELINE_STEP_CONFIGS[PipelineStep.DISBURSEMENT];
  // Use a fixed RNG to make the jitter deterministic.
  const rand = () => 0; // 0 jitter

  it('attempt 0 → initialDelayMs (5000)', () => {
    expect(computeRetryDelay(config, 0, rand)).toBe(5000);
  });
  it('attempt 1 → 10000 (5000 * 2)', () => {
    expect(computeRetryDelay(config, 1, rand)).toBe(10000);
  });
  it('attempt 2 → 20000 (5000 * 4)', () => {
    expect(computeRetryDelay(config, 2, rand)).toBe(20000);
  });
  it('attempt 4 → capped at maxDelayMs (60000)', () => {
    expect(computeRetryDelay(config, 4, rand)).toBe(60000);
  });

  it('applies up to 10% jitter when rand=0.5', () => {
    // 0.5 * base * 0.1 = 5% of base
    const delay = computeRetryDelay(config, 0, () => 0.5);
    expect(delay).toBeGreaterThanOrEqual(5000);
    expect(delay).toBeLessThanOrEqual(5500);
  });
});
