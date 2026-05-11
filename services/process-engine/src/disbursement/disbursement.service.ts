import { ForbiddenException, Injectable, Inject, Optional } from '@nestjs/common';
import { PrismaService, LoanRequestStatus, DisbursementStatus } from '@lons/database';
import { EventBusService, NotFoundError } from '@lons/common';
import { EventType } from '@lons/event-contracts';
import { QuotaTrackingService } from '@lons/entity-service';

import { LoanRequestService } from '../loan-request/loan-request.service';
import { CoolingOffService } from '../cooling-off/cooling-off.service';
import { WALLET_ADAPTER, IWalletAdapter } from './adapters/wallet-adapter.interface';
import { SCREENING_GATE, IScreeningGate } from './screening-gate.interface';

const MAX_RETRIES = 3;

@Injectable()
export class DisbursementService {
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
  ) {}

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

    if (newRetryCount < MAX_RETRIES) {
      // Retry
      return this.attemptTransfer(tenantId, disbursementId, contractId, loanRequestId);
    }

    // Permanent failure
    if (loanRequestId) {
      await this.loanRequestService.transitionStatus(tenantId, loanRequestId, LoanRequestStatus.disbursement_failed);
    }

    this.eventBus.emitAndBuild(EventType.DISBURSEMENT_FAILED, tenantId, {
      disbursementId,
      contractId,
      reason: result.failureReason || 'Max retries exceeded',
      retryCount: newRetryCount,
    });

    return this.prisma.disbursement.findUniqueOrThrow({ where: { id: disbursementId } });
  }
}
