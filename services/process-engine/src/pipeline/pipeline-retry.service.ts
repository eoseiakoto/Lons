import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { PrismaService } from '@lons/database';
import { EventBusService } from '@lons/common';
import { EventType } from '@lons/event-contracts';

import {
  PIPELINE_RETRY_QUEUE,
  PIPELINE_STEP_CONFIGS,
  PipelineStep,
  computeRetryDelay,
  retryJobId,
} from './pipeline-step-registry';
import { PipelineStepLoggerService } from './pipeline-step-logger.service';

/**
 * Sprint 18 — S18-12 (FR-PE-004).
 *
 * Pipeline-wide retry orchestration. Each pipeline-step service hands
 * failures to `handleStepFailure`, which:
 *
 *   1. Checks the error code against the step's retryable/non-retryable
 *      lists.
 *   2. Checks the attempt count against the step's max.
 *   3. If retriable → enqueues a delayed BullMQ job with exponential
 *      back-off + 10% jitter, emits `PIPELINE_STEP_RETRY_SCHEDULED`,
 *      logs an audit row.
 *   4. If not → logs `permanent_failure` or `max_retries_exceeded`,
 *      emits `PIPELINE_STEP_RETRY_EXHAUSTED`.
 *
 * Idempotency:
 *   - The BullMQ jobId is a deterministic
 *     `{loanRequestId}-{step}-attempt-{n}` string. Two enqueues for the
 *     same tuple are a no-op (BullMQ dedupes), so a worker that itself
 *     fails and calls `handleStepFailure` again with the same attempt
 *     count does NOT double-execute the step.
 *
 * Pure helper note:
 *   - `computeRetryDelay` lives in the registry module so tests can
 *     exercise the math without touching BullMQ.
 */
@Injectable()
export class PipelineRetryService {
  private readonly logger = new Logger(PipelineRetryService.name);

  constructor(
    @InjectQueue(PIPELINE_RETRY_QUEUE) private retryQueue: Queue,
    private readonly pipelineStepLogger: PipelineStepLoggerService,
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  /**
   * Decide whether to retry a failed step and act on it.
   * Returns `{ willRetry, nextAttemptAt? }` so callers (e.g. disbursement)
   * can log a warning with the scheduled time.
   */
  async handleStepFailure(
    tenantId: string,
    loanRequestId: string,
    step: PipelineStep,
    error: { code: string; message: string },
    currentAttempt: number,
  ): Promise<{ willRetry: boolean; nextAttemptAt?: Date }> {
    const config = PIPELINE_STEP_CONFIGS[step];
    if (!config) {
      this.logger.error(
        `Unknown pipeline step ${step} — no retry config; treating as permanent failure`,
      );
      return { willRetry: false };
    }

    const now = new Date();

    // Non-retriable error class — terminate immediately.
    if (config.nonRetryableErrors.includes(error.code)) {
      await this.pipelineStepLogger.logStep(tenantId, loanRequestId, {
        stepName: step,
        stepOrder: config.order,
        outcome: 'permanent_failure',
        errorMessage: error.message,
        errorCode: error.code,
        durationMs: 0,
        startedAt: now,
        completedAt: now,
      });
      this.eventBus.emitAndBuild(
        EventType.PIPELINE_STEP_RETRY_EXHAUSTED,
        tenantId,
        {
          loanRequestId,
          step,
          attempt: currentAttempt,
          maxRetries: config.maxRetries,
          reason: 'non_retryable_error',
          errorCode: error.code,
          errorMessage: error.message,
        },
      );
      return { willRetry: false };
    }

    // Retries exhausted — also terminate.
    if (currentAttempt >= config.maxRetries) {
      await this.pipelineStepLogger.logStep(tenantId, loanRequestId, {
        stepName: step,
        stepOrder: config.order,
        outcome: 'max_retries_exceeded',
        errorMessage: `${error.message} (attempt ${currentAttempt}/${config.maxRetries})`,
        errorCode: error.code,
        durationMs: 0,
        startedAt: now,
        completedAt: now,
      });
      this.eventBus.emitAndBuild(
        EventType.PIPELINE_STEP_RETRY_EXHAUSTED,
        tenantId,
        {
          loanRequestId,
          step,
          attempt: currentAttempt,
          maxRetries: config.maxRetries,
          reason: 'max_retries_exceeded',
          errorCode: error.code,
          errorMessage: error.message,
        },
      );
      return { willRetry: false };
    }

    // Schedule the next attempt.
    const delayMs = computeRetryDelay(config, currentAttempt);
    const nextAttemptAt = new Date(Date.now() + delayMs);
    const nextAttempt = currentAttempt + 1;

    await this.retryQueue.add(
      `retry-${step}`,
      {
        tenantId,
        loanRequestId,
        step,
        attempt: nextAttempt,
        maxRetries: config.maxRetries,
        errorCode: error.code,
        errorMessage: error.message,
      },
      {
        delay: delayMs,
        attempts: 1, // we manage retries ourselves; BullMQ-level retries off
        jobId: retryJobId(loanRequestId, step, nextAttempt),
        removeOnComplete: { age: 86400 }, // keep success records 24h
        removeOnFail: { age: 604800 }, // keep failures 7d for audit
      },
    );

    this.eventBus.emitAndBuild(
      EventType.PIPELINE_STEP_RETRY_SCHEDULED,
      tenantId,
      {
        loanRequestId,
        step,
        attempt: nextAttempt,
        maxRetries: config.maxRetries,
        nextAttemptAt: nextAttemptAt.toISOString(),
        delayMs,
        errorCode: error.code,
        errorMessage: error.message,
      },
    );

    return { willRetry: true, nextAttemptAt };
  }

  /**
   * Cancel all delayed retry jobs for a loan request. Called when the
   * request is manually cancelled / rejected so we don't kick off a
   * scoring retry against a request that's no longer in flight.
   */
  async cancelPendingRetries(loanRequestId: string): Promise<number> {
    const jobs = await this.retryQueue.getDelayed();
    let cancelled = 0;
    for (const job of jobs) {
      if (job.data?.loanRequestId === loanRequestId) {
        await job.remove();
        cancelled++;
      }
    }
    return cancelled;
  }
}
