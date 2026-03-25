import { Injectable } from '@nestjs/common';
import { PrismaService, LoanRequestStatus, Prisma } from '@lons/database';
import { ValidationError } from '@lons/common';

import { LoanRequestService } from '../loan-request/loan-request.service';
import { calculateCostOfCredit, CostOfCreditInput } from './cost-of-credit.calculator';

@Injectable()
export class OfferService {
  constructor(
    private prisma: PrismaService,
    private loanRequestService: LoanRequestService,
  ) {}

  async generateOffer(tenantId: string, loanRequestId: string) {
    const lr = await this.loanRequestService.findById(tenantId, loanRequestId);

    if (lr.status !== LoanRequestStatus.approved) {
      throw new ValidationError('Loan request must be approved before generating offer');
    }

    const product = lr.product;
    const approvedAmount = String(lr.approvedAmount);
    const tenor = lr.approvedTenor || product.maxTenorDays || 30;

    const costInput: CostOfCreditInput = {
      principalAmount: approvedAmount,
      interestRate: product.interestRate ? String(product.interestRate) : '0',
      interestRateModel: product.interestRateModel as 'flat' | 'reducing_balance' | 'tiered',
      tenorDays: tenor,
      feeStructure: product.feeStructure as CostOfCreditInput['feeStructure'],
    };

    const costResult = calculateCostOfCredit(costInput);

    // Set offer expiry based on product type
    const expiryHours = product.type === 'overdraft' ? 0.25 : 24; // 15 min for overdraft, 24h otherwise
    const offerExpiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    const startDate = new Date();
    const maturityDate = new Date(startDate.getTime() + tenor * 24 * 60 * 60 * 1000);
    const gracePeriodDays = product.gracePeriodDays || 0;
    const firstPaymentDate = new Date(startDate.getTime() + (gracePeriodDays + 30) * 24 * 60 * 60 * 1000);

    const offerDetails = {
      approvedAmount,
      interestRate: product.interestRate ? String(product.interestRate) : '0',
      interestRateModel: product.interestRateModel,
      totalInterest: costResult.totalInterest,
      totalFees: costResult.totalFees,
      feeBreakdown: costResult.feeBreakdown,
      totalCostCredit: costResult.totalCostCredit,
      repaymentMethod: product.repaymentMethod,
      tenorDays: tenor,
      startDate: startDate.toISOString(),
      maturityDate: maturityDate.toISOString(),
      firstPaymentDate: firstPaymentDate.toISOString(),
      currency: lr.currency,
    };

    return this.loanRequestService.transitionStatus(tenantId, loanRequestId, LoanRequestStatus.offer_sent, {
      offerDetails: offerDetails as unknown as Prisma.InputJsonValue,
      offerExpiresAt,
    });
  }

  async acceptOffer(tenantId: string, loanRequestId: string) {
    const lr = await this.loanRequestService.findById(tenantId, loanRequestId);

    if (lr.status !== LoanRequestStatus.offer_sent) {
      throw new ValidationError('Loan request must have an active offer');
    }

    if (lr.offerExpiresAt && lr.offerExpiresAt < new Date()) {
      await this.loanRequestService.transitionStatus(tenantId, loanRequestId, LoanRequestStatus.expired);
      throw new ValidationError('Offer has expired');
    }

    return this.loanRequestService.transitionStatus(tenantId, loanRequestId, LoanRequestStatus.accepted, {
      acceptedAt: new Date(),
    });
  }

  async declineOffer(tenantId: string, loanRequestId: string) {
    return this.loanRequestService.transitionStatus(tenantId, loanRequestId, LoanRequestStatus.declined);
  }
}
