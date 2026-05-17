/**
 * Sprint 18 — S18-12 (FR-PE-004).
 *
 * Central registry of pipeline steps and their retry configuration.
 * Every retriable failure path on the origination pipeline reads its
 * caps and back-off curve from here so that retry policy is declarative
 * and step-local — no scattered MAX_RETRIES constants.
 *
 * Adding a new step:
 *   1. Add a value to `PipelineStep`.
 *   2. Add a config row to `PIPELINE_STEP_CONFIGS`.
 *   3. Teach `PipelineRetryWorker.executeStep` how to invoke it.
 */

export enum PipelineStep {
  PRE_QUALIFICATION = 'pre_qualification',
  SCORING = 'scoring',
  APPROVAL = 'approval',
  OFFER_GENERATION = 'offer_generation',
  CONTRACT_CREATION = 'contract_creation',
  DISBURSEMENT = 'disbursement',
}

export interface PipelineStepConfig {
  step: PipelineStep;
  /** Execution order in the pipeline — informational, used for audit
   * row ordering. Not used to gate execution. */
  order: number;
  /** Total number of retry attempts (excluding the initial attempt).
   * `attempt === maxRetries` triggers the exhausted path. */
  maxRetries: number;
  /** First retry delay, in milliseconds. */
  initialDelayMs: number;
  /** Cap for the exponential ramp. */
  maxDelayMs: number;
  /** Exponential factor: delay = initialDelay * (multiplier ^ attempt). */
  backoffMultiplier: number;
  /** Error codes that should trigger a retry. */
  retryableErrors: string[];
  /** Error codes that must NEVER retry (permanent failures). */
  nonRetryableErrors: string[];
}

export const PIPELINE_STEP_CONFIGS: Record<PipelineStep, PipelineStepConfig> = {
  [PipelineStep.PRE_QUALIFICATION]: {
    step: PipelineStep.PRE_QUALIFICATION,
    order: 1,
    maxRetries: 2,
    initialDelayMs: 1000,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    retryableErrors: ['DATABASE_TIMEOUT', 'CONNECTION_ERROR'],
    nonRetryableErrors: ['VALIDATION_FAILED', 'PRODUCT_NOT_FOUND'],
  },
  [PipelineStep.SCORING]: {
    step: PipelineStep.SCORING,
    order: 2,
    maxRetries: 3,
    initialDelayMs: 2000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    retryableErrors: [
      'SCORING_SERVICE_UNAVAILABLE',
      'SCORING_TIMEOUT',
      'CONNECTION_ERROR',
    ],
    nonRetryableErrors: ['INVALID_SCORING_INPUT', 'SCORECARD_NOT_FOUND'],
  },
  [PipelineStep.APPROVAL]: {
    step: PipelineStep.APPROVAL,
    order: 3,
    maxRetries: 2,
    initialDelayMs: 1000,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    retryableErrors: ['DATABASE_TIMEOUT', 'CONNECTION_ERROR'],
    nonRetryableErrors: ['ALREADY_DECIDED', 'LIMIT_EXCEEDED'],
  },
  [PipelineStep.OFFER_GENERATION]: {
    step: PipelineStep.OFFER_GENERATION,
    order: 4,
    maxRetries: 2,
    initialDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    retryableErrors: ['DATABASE_TIMEOUT', 'CONNECTION_ERROR'],
    nonRetryableErrors: ['INVALID_TERMS', 'PRODUCT_DISABLED'],
  },
  [PipelineStep.CONTRACT_CREATION]: {
    step: PipelineStep.CONTRACT_CREATION,
    order: 5,
    maxRetries: 2,
    initialDelayMs: 1000,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
    retryableErrors: ['DATABASE_TIMEOUT', 'CONNECTION_ERROR'],
    nonRetryableErrors: ['DUPLICATE_CONTRACT', 'OFFER_EXPIRED'],
  },
  [PipelineStep.DISBURSEMENT]: {
    step: PipelineStep.DISBURSEMENT,
    order: 6,
    // Matches the previous MAX_RETRIES = 3 in disbursement.service.ts so
    // S18-12 is behaviour-preserving on the existing retry surface.
    maxRetries: 3,
    initialDelayMs: 5000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
    retryableErrors: [
      'WALLET_TIMEOUT',
      'WALLET_UNAVAILABLE',
      'INSUFFICIENT_FLOAT',
      'CONNECTION_ERROR',
      'WALLET_ERROR',
    ],
    nonRetryableErrors: [
      'INVALID_ACCOUNT',
      'SCREENING_FAILED',
      'WALLET_REJECTED',
    ],
  },
};

/** BullMQ queue name — used by both the producer (PipelineRetryService)
 * and the consumer (PipelineRetryWorker). Exported so the module
 * registration and tests share a single source. */
export const PIPELINE_RETRY_QUEUE = 'pipeline-step-retry';

/** Stable job id for idempotent enqueue. BullMQ dedupes on jobId — two
 * enqueues with the same id are a no-op. Critical because the worker
 * may itself fail and trigger another `handleStepFailure` for the same
 * (loanRequest, step, attempt) tuple. */
export function retryJobId(
  loanRequestId: string,
  step: PipelineStep,
  attempt: number,
): string {
  return `${loanRequestId}-${step}-attempt-${attempt}`;
}

/**
 * Pure helper: compute the next retry delay with 10% jitter. Kept
 * outside the service class so tests can exercise the math directly.
 */
export function computeRetryDelay(
  config: PipelineStepConfig,
  attempt: number,
  rand: () => number = Math.random,
): number {
  const base = Math.min(
    config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt),
    config.maxDelayMs,
  );
  const jitter = Math.floor(rand() * base * 0.1);
  return base + jitter;
}
