import { ForbiddenException, Injectable, Inject, Logger, Optional } from '@nestjs/common';
import { PrismaService, LoanRequestStatus, DisbursementStatus } from '@lons/database';
import { EventBusService, NotFoundError } from '@lons/common';
import { EventType } from '@lons/event-contracts';
import { QuotaTrackingService } from '@lons/entity-service';

import { LoanRequestService } from '../loan-request/loan-request.service';
import { CoolingOffService } from '../cooling-off/cooling-off.service';
import { PipelineRetryService } from '../pipeline/pipeline-retry.service';
import { PipelineStep, PIPELINE_STEP_CONFIGS } from '../pipeline/pipeline-step-registry';
import { WALLET_ADAPTER, IWalletAdapter } from './adapters/wallet-adapter.interface';
import { SCREENING_GATE, IScreeningGate } from './screening-gate.interface';

// Sprint 18 (S18-12): MAX_RETRIES is now sourced from PIPELINE_STEP_CONFIGS
// for the DISBURSEMENT step. The local constant remains as a fallback
// when PipelineRetryService isn't wired (e.g. legacy unit tests) so
// behaviour is preserved.
const MAX_RETRIES_FALLBACK =
  PIPELINE_STEP_CONFIGS[PipelineStep.DISBURSEMENT].maxRetries;

@Injectable()
export class DisbursementService {
  private readonly logger = new Logger(DisbursementService.name);

  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private loanRequestService: LoanRequestService,
    private coolingOffService: CoolingOffService,
    @Inject(SCREENING_GATE) private screeningGate: IScreeningGate,
    @Inject(WALLET_ADAPTER) private walletAdapter: IWalletAdapter,
    // Sprint 14 (S14-14a): plan-tier disbursement quota tracking.
    // `@Optional` so existing tests that build the service via direct
    // construction without the new dep don't break — production wiring
    // always provides it via PlanTierModule.
    @Optional() private quotaTrackingService?: QuotaTrackingService,
    // Sprint 18 (S18-12): pipeline-wide retry orchestrator. When
    // available, disbursement failures delegate retry scheduling to it
    // (BullMQ delayed job + exponential backoff) instead of recursing
    // synchronously. @Optional() so existing unit tests that wire the
    // service without it continue to work — they fall back to the
    // legacy synchronous retry loop.
    @Optional() private pipelineRetryService?: PipelineRetryService,
  ) {}

  /**
   * Resume an in-flight disbursement on the latest existing
   * Disbursement row for the given contract — used by the BullMQ
   * retry worker (S18-12).
   *
   * S18 code-review fix B1 — must NOT call `initiateDisbursement`
   * from the retry path. That entry point re-runs AML screening,
   * double-charges plan-tier quota (incrementDisbursement is
   * idempotency-free at that layer), and creates a fresh
   * `disbursement` row with retryCount=0 — defeating both the
   * S18-8 rollback's "max retries reached" trigger and the quota
   * counter accuracy. Resume in-place on the prior row instead.
   */
  async retryDisbursementForContract(tenantId: string, contractId: string): Promise<unknown> {
    const disbursement = await this.prisma.disbursement.findFirst({
      where: {
        tenantId,
        contractId,
        status: { in: [DisbursementStatus.pending, DisbursementStatus.failed] },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!disbursement) {
      throw new NotFoundError(
        `No pending/failed disbursement found to retry for contract ${contractId}`,
        contractId,
      );
    }

    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
    });
    if (!contract) throw new NotFoundError('Contract', contractId);

    return this.attemptTransfer(tenantId, disbursement.id, contractId, contract.loanRequestId ?? undefined);
  }

  async initiateDisbursement(tenantId: string, contractId: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
      include: { customer: true },
    });
    if (!contract) throw new NotFoundError('Contract', contractId);

    // Find the loan request to transition its status
    const loanRequest = await this.prisma.loanRequest.findFirst({
      where: { contractId, tenantId },
    });

    if (loanRequest) {
      await this.loanRequestService.transitionStatus(tenantId, loanRequest.id, LoanRequestStatus.disbursing);
    }

    // AML screening gate — check before disbursement
    const screening = await this.screeningGate.screenCustomer(tenantId, contract.customerId);

    switch (screening.status) {
      case 'MATCH':
        if (loanRequest) {
          await this.loanRequestService.transitionStatus(tenantId, loanRequest.id, LoanRequestStatus.rejected);
        }
        this.eventBus.emitAndBuild(EventType.SCREENING_MATCH_FOUND, tenantId, {
          customerId: contract.customerId,
          loanRequestId: loanRequest?.id,
          screeningId: screening.screeningId,
        });
        throw new Error(`Disbursement blocked: AML screening match for customer ${contract.customerId}`);

      case 'POTENTIAL_MATCH':
        if (loanRequest) {
          await this.loanRequestService.transitionStatus(tenantId, loanRequest.id, LoanRequestStatus.manual_review);
        }
        this.eventBus.emitAndBuild(EventType.SCREENING_MANUAL_REVIEW_REQUIRED, tenantId, {
          customerId: contract.customerId,
          loanRequestId: loanRequest?.id,
          screeningId: screening.screeningId,
        });
        return { status: 'held_for_review', screeningId: screening.screeningId };

      case 'ERROR':
        // Retry once
        const retryScreening = await this.screeningGate.screenCustomer(tenantId, contract.customerId);
        if (retryScreening.status !== 'CLEAR') {
          if (loanRequest) {
            await this.loanRequestService.transitionStatus(tenantId, loanRequest.id, LoanRequestStatus.manual_review);
          }
          this.eventBus.emitAndBuild(EventType.SCREENING_MANUAL_REVIEW_REQUIRED, tenantId, {
            customerId: contract.customerId,
            loanRequestId: loanRequest?.id,
            screeningId: retryScreening.screeningId,
          });
          return { status: 'held_for_review', screeningId: retryScreening.screeningId };
        }
        break; // CLEAR after retry, proceed

      case 'CLEAR':
        break; // Proceed with disbursement
    }

    // Sprint 14 (S14-14a): plan-tier quota enforcement.
    // After the AML gate but before we commit the disbursement record,
    // check the monthly transaction + USD volume caps. The tracker
    // atomically increments and returns `{ allowed, warning }`. On
    // `allowed=false` we throw a structured ForbiddenException with the
    // QUOTA_EXCEEDED code — the GraphQL filter and REST exception
    // mapper surface it unchanged.
    //
    // Soft-fail on Redis outage: `QuotaTrackingService` returns
    // `allowed=true` when Redis is unavailable, so the disbursement
    // still goes through. We never block payouts on a cache outage.
    if (this.quotaTrackingService) {
      const quota = await this.quotaTrackingService.incrementDisbursement(
        tenantId,
        String(contract.principalAmount),
      );
      if (!quota.allowed) {
        throw new ForbiddenException({
          code: 'QUOTA_EXCEEDED',
          message:
            'Monthly disbursement limit exceeded for your current plan.',
          upgradeUrl: '/settings/plan',
        });
      }
    }

    const disbursement = await this.prisma.disbursement.create({
      data: {
        tenantId,
        amount: contract.principalAmount,
        currency: contract.currency,
        channel: 'wallet',
        destination: contract.customer.phonePrimary || contract.customer.externalId,
        status: DisbursementStatus.pending,
        retryCount: 0,
        contract: { connect: { id: contractId } },
        customer: { connect: { id: contract.customerId } },
      },
    });

    return this.attemptTransfer(tenantId, disbursement.id, contractId, loanRequest?.id);
  }

  private async attemptTransfer(tenantId: string, disbursementId: string, contractId: string, loanRequestId?: string): Promise<any> {
    const disbursement = await this.prisma.disbursement.findUniqueOrThrow({ where: { id: disbursementId } });

    await this.prisma.disbursement.update({
      where: { id: disbursementId },
      data: { status: DisbursementStatus.processing },
    });

    const result = await this.walletAdapter.transfer({
      destination: disbursement.destination || '',
      amount: String(disbursement.amount),
      currency: disbursement.currency,
      reference: disbursementId,
    });

    if (result.success) {
      await this.prisma.disbursement.update({
        where: { id: disbursementId },
        data: {
          status: DisbursementStatus.completed,
          externalRef: result.externalRef,
          completedAt: new Date(),
        },
      });

      // Update contract with disbursement reference
      await this.prisma.contract.update({
        where: { id: contractId },
        data: { disbursementId, status: 'performing' },
      });

      if (loanRequestId) {
        await this.loanRequestService.transitionStatus(tenantId, loanRequestId, LoanRequestStatus.disbursed);
      }

      this.eventBus.emitAndBuild(EventType.DISBURSEMENT_COMPLETED, tenantId, {
        disbursementId,
        contractId,
        customerId: disbursement.customerId,
        amount: String(disbursement.amount),
      });

      // Activate cooling-off period if product requires it
      await this.coolingOffService.activateCoolingOff(tenantId, contractId);

      return this.prisma.disbursement.findUniqueOrThrow({ where: { id: disbursementId } });
    }

    // Handle failure
    const newRetryCount = disbursement.retryCount + 1;
    await this.prisma.disbursement.update({
      where: { id: disbursementId },
      data: {
        status: DisbursementStatus.failed,
        retryCount: newRetryCount,
        failureReason: result.failureReason,
      },
    });

    const maxRetries = MAX_RETRIES_FALLBACK;

    if (newRetryCount < maxRetries) {
      // Sprint 18 (S18-12): prefer the pipeline retry orchestrator
      // (BullMQ delayed job + exponential backoff). When wired,
      // schedule the next attempt asynchronously and return the
      // current disbursement row. The worker calls
      // initiateDisbursement again when the delay elapses.
      if (this.pipelineRetryService && loanRequestId) {
        const errorCode =
          (result as { errorCode?: string }).errorCode || 'WALLET_ERROR';
        const { willRetry, nextAttemptAt } =
          await this.pipelineRetryService.handleStepFailure(
            tenantId,
            loanRequestId,
            PipelineStep.DISBURSEMENT,
            {
              code: errorCode,
              message: result.failureReason || 'Transfer failed',
            },
            newRetryCount,
          );
        if (willRetry) {
          this.logger.warn(
            `Disbursement ${disbursementId} retry ${newRetryCount + 1}/${maxRetries} scheduled for ${nextAttemptAt?.toISOString()}`,
          );
          return this.prisma.disbursement.findUniqueOrThrow({
            where: { id: disbursementId },
          });
        }
        // Pipeline retry decided NOT to retry (non-retryable error or
        // max exhausted) — fall through to the permanent-failure path.
      } else {
        // Legacy synchronous retry — preserved for callers that don't
        // wire PipelineRetryService (existing unit tests).
        return this.attemptTransfer(
          tenantId,
          disbursementId,
          contractId,
          loanRequestId,
        );
      }
    }

    // ── Permanent failure path ─────────────────────────────────────
    if (loanRequestId) {
      await this.loanRequestService.transitionStatus(
        tenantId,
        loanRequestId,
        LoanRequestStatus.disbursement_failed,
      );
    }

    // Sprint 18 (S18-8 / FR-DB-002.3): roll the contract back to
    // CANCELLED. Without this the contract row stays in whatever state
    // it was created in (typically `active`) and shows up in the
    // active-contracts list even though no money ever moved.
    //
    // Safety gates:
    //   - Only roll back if the contract is not already `performing` —
    //     that would mean a previous disbursement succeeded and money
    //     left the system. We never cancel a contract with funded
    //     principal.
    //   - Capture the previous status before the update so the event
    //     payload accurately reflects the transition.
    let contractRolledBack = false;
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: { id: true, status: true, metadata: true, customerId: true, productId: true, principalAmount: true },
    });

    if (contract && contract.status !== 'performing') {
      const previousStatus = contract.status;
      const existingMetadata =
        (contract.metadata as Record<string, unknown> | null) ?? {};
      await this.prisma.contract.update({
        where: { id: contractId },
        data: {
          status: 'cancelled',
          metadata: {
            ...existingMetadata,
            cancellationReason: 'disbursement_failed',
            cancellationDetails: {
              disbursementId,
              failureReason: result.failureReason || 'Max retries exceeded',
              retryCount: newRetryCount,
              cancelledAt: new Date().toISOString(),
            },
          },
        },
      });
      contractRolledBack = true;

      this.eventBus.emitAndBuild(EventType.CONTRACT_STATE_CHANGED, tenantId, {
        contractId,
        previousStatus,
        newStatus: 'cancelled',
        reason: 'disbursement_failed',
      });

      // Sprint 18 (S18-8): restore the subscription's available limit
      // for revolving products. Contract doesn't have a direct
      // subscription FK — look up by (tenant, customer, product). This
      // is best-effort: if no subscription exists (one-shot product)
      // we skip silently. If multiple subscriptions exist that's a
      // data-model violation (`@@unique([tenantId, customerId, productId])`)
      // so `findUnique` is safe.
      try {
        // S18 code-review fix B2 — atomic Decimal increment instead of
        // the prior read-modify-write. Two concurrent restorations (or
        // a restoration concurrent with a fresh disbursement debit on
        // the same subscription) would have lost updates with the old
        // pattern; Prisma's { increment } compiles to a DB-side
        // UPDATE … SET available_limit = available_limit + $1 which
        // is atomic under the row lock.
        const result = await this.prisma.subscription.updateMany({
          where: {
            tenantId,
            customerId: contract.customerId,
            productId: contract.productId,
            availableLimit: { not: null },
          },
          data: {
            availableLimit: { increment: contract.principalAmount },
          },
        });
        if (result.count > 0) {
          this.logger.log(
            `Restored available limit on subscription (tenant=${tenantId} customer=${contract.customerId.slice(0, 8)}… product=${contract.productId.slice(0, 8)}…) by ${String(contract.principalAmount)} after disbursement rollback`,
          );
        }
      } catch (err) {
        // Limit restoration failure must NOT block the rollback path —
        // log loudly so an operator can reconcile manually.
        this.logger.error(
          `Failed to restore subscription limit after disbursement rollback on contract ${contractId}: ${(err as Error).message}`,
        );
      }
    } else if (contract?.status === 'performing') {
      this.logger.warn(
        `Skipping contract ${contractId} rollback: status is already 'performing' — partial disbursement may have occurred`,
      );
    }

    this.eventBus.emitAndBuild(EventType.DISBURSEMENT_FAILED, tenantId, {
      disbursementId,
      contractId,
      reason: result.failureReason || 'Max retries exceeded',
      retryCount: newRetryCount,
      contractRolledBack,
    });

    return this.prisma.disbursement.findUniqueOrThrow({ where: { id: disbursementId } });
  }
}
