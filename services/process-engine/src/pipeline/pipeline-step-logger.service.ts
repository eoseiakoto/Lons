import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, Prisma } from '@lons/database';

/**
 * Sprint 18 — S18-7 (FR-PE-006).
 *
 * Per-step pipeline audit trail. Every stage of the loan-origination
 * pipeline (pre-qualification → scoring → approval → offer → contract →
 * disbursement) writes one row here with inputs, outputs, outcome, and
 * timing.
 *
 * Append-only invariant:
 *   - CLAUDE.md ledger/audit rule: no UPDATE, no DELETE.
 *   - Enforced at the database level: the Phase 0 migration revoked
 *     UPDATE/DELETE on `pipeline_step_logs` from the `lons_app` role, so
 *     accidental code paths trip a Postgres permission error.
 *   - This service NEVER calls `.update()` or `.delete()`.
 *
 * PII sanitisation:
 *   - Inputs/outputs are stripped of `nationalId`, `phone`, `email`,
 *     `fullName`, `dateOfBirth` (and snake_case variants) before storage.
 *   - Nested objects are sanitised recursively. Arrays are traversed
 *     element-by-element.
 *   - The masking is destructive — we redact rather than mask because
 *     the audit row is the wrong place to keep partial identifiers.
 */

export type PipelineStepOutcome =
  | 'success'
  | 'rejected'
  | 'error'
  | 'skipped'
  | 'timeout'
  | 'permanent_failure'
  | 'max_retries_exceeded';

export interface LogStepArgs {
  stepName: string;
  stepOrder: number;
  outcome: PipelineStepOutcome;
  inputs?: Record<string, unknown> | null;
  outputs?: Record<string, unknown> | null;
  errorMessage?: string | null;
  errorCode?: string | null;
  durationMs: number;
  triggeredBy?: string | null;
  startedAt: Date;
  completedAt: Date;
}

@Injectable()
export class PipelineStepLoggerService {
  private readonly logger = new Logger(PipelineStepLoggerService.name);

  /** Field names — both camelCase and snake_case — that must never be
   * persisted to `pipeline_step_logs`. Keep this list in sync with the
   * PII column list in CLAUDE.md §Security. */
  private static readonly PII_FIELDS = new Set([
    'nationalId',
    'national_id',
    'phone',
    'phonePrimary',
    'phone_primary',
    'phoneSecondary',
    'phone_secondary',
    'email',
    'fullName',
    'full_name',
    'firstName',
    'first_name',
    'lastName',
    'last_name',
    'dateOfBirth',
    'date_of_birth',
    'dob',
    'address',
    'ssn',
    'taxId',
    'tax_id',
    'password',
    'secret',
    'token',
    'apiKey',
    'api_key',
  ]);

  constructor(private prisma: PrismaService) {}

  /**
   * Persist a step execution. Inputs/outputs are sanitised here — the
   * caller is responsible for not putting PII in fields that we don't
   * know to redact, but the common patterns (customer, applicant
   * objects) are covered.
   */
  async logStep(
    tenantId: string,
    loanRequestId: string,
    step: LogStepArgs,
  ): Promise<{ id: string }> {
    try {
      const row = await this.prisma.pipelineStepLog.create({
        data: {
          tenantId,
          loanRequestId,
          stepName: step.stepName,
          stepOrder: step.stepOrder,
          outcome: step.outcome,
          inputs: step.inputs
            ? (this.sanitize(step.inputs) as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          outputs: step.outputs
            ? (this.sanitize(step.outputs) as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          errorMessage: step.errorMessage ?? null,
          errorCode: step.errorCode ?? null,
          durationMs: step.durationMs,
          triggeredBy: step.triggeredBy ?? null,
          startedAt: step.startedAt,
          completedAt: step.completedAt,
        },
        select: { id: true },
      });
      return row;
    } catch (err) {
      // The audit trail must never block the pipeline. If the DB write
      // fails (e.g. RLS misconfigured, append-only grant tripped on a
      // bug elsewhere), log loudly and swallow — the caller's transition
      // has already happened or is about to.
      this.logger.error(
        `Failed to write pipeline step log for ${step.stepName} on loan request ${loanRequestId}: ${(err as Error).message}`,
      );
      return { id: 'log-write-failed' };
    }
  }

  /**
   * Convenience wrapper: time `fn`, log success/failure outcome, and
   * re-throw on error so the caller's state machine reacts as before.
   *
   * The wrapper deliberately does NOT swallow errors — pipeline retry
   * logic (S18-12) needs to see them.
   */
  async executeAndLog<T>(
    tenantId: string,
    loanRequestId: string,
    stepName: string,
    stepOrder: number,
    inputs: Record<string, unknown>,
    fn: () => Promise<T>,
    triggeredBy?: string,
  ): Promise<T> {
    const startedAt = new Date();
    try {
      const result = await fn();
      const completedAt = new Date();
      await this.logStep(tenantId, loanRequestId, {
        stepName,
        stepOrder,
        outcome: 'success',
        inputs,
        outputs:
          result && typeof result === 'object'
            ? (result as Record<string, unknown>)
            : { result },
        durationMs: completedAt.getTime() - startedAt.getTime(),
        triggeredBy,
        startedAt,
        completedAt,
      });
      return result;
    } catch (err) {
      const completedAt = new Date();
      const e = err as { message?: string; code?: string };
      await this.logStep(tenantId, loanRequestId, {
        stepName,
        stepOrder,
        outcome: 'error',
        inputs,
        errorMessage: e.message ?? String(err),
        errorCode: e.code ?? 'UNKNOWN',
        durationMs: completedAt.getTime() - startedAt.getTime(),
        triggeredBy,
        startedAt,
        completedAt,
      });
      throw err;
    }
  }

  /**
   * Return step logs for a loan request in execution order. Powers the
   * audit timeline on the application review page (Track A — S18-1).
   */
  async getStepsForLoanRequest(tenantId: string, loanRequestId: string) {
    return this.prisma.pipelineStepLog.findMany({
      where: { tenantId, loanRequestId },
      orderBy: [{ stepOrder: 'asc' }, { startedAt: 'asc' }],
    });
  }

  /**
   * Recursive PII redaction. Returns a new object; the input is not
   * mutated (callers may keep a reference for their own logging).
   *
   * Algorithm:
   *   - For known PII keys → replace value with `***REDACTED***`.
   *   - For object values → recurse.
   *   - For array values → recurse on each element (sanitise objects,
   *     leave primitives alone).
   *   - For primitives in non-PII keys → keep as-is.
   */
  private sanitize(data: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (PipelineStepLoggerService.PII_FIELDS.has(key)) {
        out[key] = '***REDACTED***';
        continue;
      }
      out[key] = this.sanitizeValue(value);
    }
    return out;
  }

  private sanitizeValue(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) {
      return value.map((v) => this.sanitizeValue(v));
    }
    if (typeof value === 'object') {
      // Preserve Date instances as ISO strings — they're not PII and
      // useful for the audit trail.
      if (value instanceof Date) return value.toISOString();
      return this.sanitize(value as Record<string, unknown>);
    }
    return value;
  }
}
