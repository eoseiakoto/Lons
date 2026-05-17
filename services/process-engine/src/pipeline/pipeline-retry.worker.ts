import { Logger, Optional } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PrismaService } from '@lons/database';

import {
  PIPELINE_RETRY_QUEUE,
  PIPELINE_STEP_CONFIGS,
  PipelineStep,
} from './pipeline-step-registry';
import { PipelineStepLoggerService } from './pipeline-step-logger.service';
import { PipelineRetryService } from './pipeline-retry.service';

// All pipeline-step services are @Optional()-injected so the worker can
// boot even in deployments that only have a subset of the pipeline
// modules (e.g. a unit-test composition that only exercises retries).
// Each step looks up its handler at execution time and throws a clear
// error if the service isn't available.
import { ScoringService } from '../scoring/scoring.service';
import { PreQualificationService } from '../pre-qualification/pre-qualification.service';
import { ApprovalService } from '../approval/approval.service';
import { OfferService } from '../offer/offer.service';
import { ContractService } from '../contract/contract.service';
import { DisbursementService } from '../disbursement/disbursement.service';

/**
 * Sprint 18 — S18-12 BullMQ worker.
 *
 * Consumes delayed retry jobs enqueued by `PipelineRetryService` and
 * re-invokes the originating pipeline step. On success, writes a
 * `${step}_retry` audit row with outcome=success. On failure, feeds the
 * error back into `PipelineRetryService.handleStepFailure` so the next
 * attempt is scheduled (or the retry budget exhausts and emits
 * PIPELINE_STEP_RETRY_EXHAUSTED).
 *
 * Skips work if the loan request has reached a terminal state since the
 * retry was scheduled (cancelled / rejected / disbursed) — retries are
 * advisory, not transactional.
 */
export interface PipelineRetryJobData {
  tenantId: string;
  loanRequestId: string;
  step: PipelineStep;
  attempt: number;
  maxRetries: number;
  errorCode: string;
  errorMessage: string;
}

@Processor(PIPELINE_RETRY_QUEUE)
export class PipelineRetryWorker extends WorkerHost {
  private readonly logger = new Logger(PipelineRetryWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pipelineRetryService: PipelineRetryService,
    private readonly pipelineStepLogger: PipelineStepLoggerService,
    @Optional() private readonly preQualificationService?: PreQualificationService,
    @Optional() private readonly scoringService?: ScoringService,
    @Optional() private readonly approvalService?: ApprovalService,
    @Optional() private readonly offerService?: OfferService,
    @Optional() private readonly contractService?: ContractService,
    @Optional() private readonly disbursementService?: DisbursementService,
  ) {
    super();
  }

  async process(job: Job<PipelineRetryJobData>): Promise<void> {
    const { tenantId, loanRequestId, step, attempt } = job.data;

    // Terminal-state guard. A loan request may have been manually
    // cancelled or rejected between when the retry was scheduled and
    // when BullMQ delivered the job. In that case the retry is
    // meaningless — skip and let the job complete cleanly.
    const lr = await this.prisma.loanRequest.findFirst({
      where: { id: loanRequestId, tenantId },
      select: { id: true, status: true },
    });
    if (!lr) {
      this.logger.warn(
        `Skipping retry: loan request ${loanRequestId} not found in tenant ${tenantId}`,
      );
      return;
    }
    if (['cancelled', 'rejected', 'disbursed'].includes(lr.status)) {
      this.logger.log(
        `Skipping retry for ${step} on ${loanRequestId}: terminal status ${lr.status}`,
      );
      return;
    }

    const config = PIPELINE_STEP_CONFIGS[step as PipelineStep];
    const startedAt = new Date();
    try {
      await this.executeStep(tenantId, loanRequestId, step);
      const completedAt = new Date();
      await this.pipelineStepLogger.logStep(tenantId, loanRequestId, {
        stepName: `${step}_retry`,
        stepOrder: config?.order ?? 0,
        outcome: 'success',
        inputs: { attempt, retriedFrom: job.data.errorCode },
        durationMs: completedAt.getTime() - startedAt.getTime(),
        startedAt,
        completedAt,
      });
    } catch (err) {
      const e = err as { code?: string; message?: string };
      await this.pipelineRetryService.handleStepFailure(
        tenantId,
        loanRequestId,
        step,
        { code: e.code ?? 'UNKNOWN', message: e.message ?? String(err) },
        attempt,
      );
    }
  }

  /**
   * Dispatch the retry to the originating service. The signatures here
   * are the actual production signatures — NOT the simplified versions
   * sketched in the spec. Keep the dispatch logic narrow: re-invoke
   * with the same arguments the pipeline would have used.
   */
  private async executeStep(
    tenantId: string,
    loanRequestId: string,
    step: PipelineStep,
  ): Promise<void> {
    const lr = await this.prisma.loanRequest.findFirstOrThrow({
      where: { id: loanRequestId, tenantId },
      include: { contract: true },
    });

    switch (step) {
      case PipelineStep.PRE_QUALIFICATION:
        if (!this.preQualificationService) {
          throw new Error(
            'PreQualificationService not registered — cannot retry pre_qualification',
          );
        }
        await this.preQualificationService.evaluate(
          tenantId,
          lr.customerId,
          lr.productId,
          String(lr.requestedAmount),
        );
        return;

      case PipelineStep.SCORING:
        if (!this.scoringService) {
          throw new Error(
            'ScoringService not registered — cannot retry scoring',
          );
        }
        await this.scoringService.scoreCustomer(
          tenantId,
          lr.customerId,
          lr.productId,
          'application',
          String(lr.requestedAmount),
        );
        return;

      case PipelineStep.APPROVAL:
        if (!this.approvalService) {
          throw new Error(
            'ApprovalService not registered — cannot retry approval',
          );
        }
        // Only auto/semi-auto approvals are retriable — manual ones
        // require an operator. The makeDecision call handles both paths.
        await this.approvalService.makeDecision(tenantId, loanRequestId);
        return;

      case PipelineStep.OFFER_GENERATION:
        if (!this.offerService) {
          throw new Error(
            'OfferService not registered — cannot retry offer_generation',
          );
        }
        await this.offerService.generateOffer(tenantId, loanRequestId);
        return;

      case PipelineStep.CONTRACT_CREATION:
        if (!this.contractService) {
          throw new Error(
            'ContractService not registered — cannot retry contract_creation',
          );
        }
        // The contract service constructs the contract from the
        // already-accepted offer attached to the loan request.
        await this.contractService.createFromAcceptedRequest(
          tenantId,
          loanRequestId,
        );
        return;

      case PipelineStep.DISBURSEMENT: {
        if (!this.disbursementService) {
          throw new Error(
            'DisbursementService not registered — cannot retry disbursement',
          );
        }
        if (!lr.contract) {
          throw new Error(
            `Cannot retry disbursement: loan request ${loanRequestId} has no contract`,
          );
        }
        await this.disbursementService.initiateDisbursement(
          tenantId,
          lr.contract.id,
        );
        return;
      }

      default:
        throw new Error(`Unknown pipeline step: ${step}`);
    }
  }
}
