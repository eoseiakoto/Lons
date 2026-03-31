import { Injectable, Inject } from '@nestjs/common';
import { PrismaService, LoanRequestStatus, DisbursementStatus } from '@lons/database';
import { EventBusService, NotFoundError } from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { LoanRequestService } from '../loan-request/loan-request.service';
import { WALLET_ADAPTER, IWalletAdapter } from './adapters/wallet-adapter.interface';

const MAX_RETRIES = 3;

@Injectable()
export class DisbursementService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private loanRequestService: LoanRequestService,
    @Inject(WALLET_ADAPTER) private walletAdapter: IWalletAdapter,
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
