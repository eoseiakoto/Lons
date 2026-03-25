import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma, LoanRequestStatus, ContractStatus } from '@lons/database';
import { EventBusService, NotFoundError, ValidationError } from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { LoanRequestService } from '../loan-request/loan-request.service';
import { ContractNumberGenerator } from './contract-number.generator';

@Injectable()
export class ContractService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    private loanRequestService: LoanRequestService,
    private contractNumberGenerator: ContractNumberGenerator,
  ) {}

  async createFromAcceptedRequest(tenantId: string, loanRequestId: string) {
    const lr = await this.loanRequestService.findById(tenantId, loanRequestId);

    if (lr.status !== LoanRequestStatus.accepted) {
      throw new ValidationError('Loan request must be accepted to create contract');
    }

    const product = lr.product;
    const offerDetails = lr.offerDetails as Record<string, unknown> | null;
    if (!offerDetails) throw new ValidationError('No offer details found');

    const contractNumber = await this.contractNumberGenerator.generate(tenantId);
    const principalAmount = Number(lr.approvedAmount);
    const interestRate = Number(offerDetails.interestRate || product.interestRate || 0);
    const tenor = lr.approvedTenor || product.maxTenorDays || 30;
    const totalInterest = Number(offerDetails.totalInterest || 0);
    const totalFees = Number(offerDetails.totalFees || 0);
    const totalCostCredit = Number(offerDetails.totalCostCredit || principalAmount + totalInterest + totalFees);

    const startDate = new Date();
    const maturityDate = new Date(startDate.getTime() + tenor * 24 * 60 * 60 * 1000);
    const gracePeriodDays = product.gracePeriodDays || 0;
    const firstPaymentDate = new Date(startDate.getTime() + (gracePeriodDays + 30) * 24 * 60 * 60 * 1000);

    const contract = await this.prisma.contract.create({
      data: {
        tenantId,
        contractNumber,
        principalAmount,
        interestRate,
        interestAmount: totalInterest,
        totalFees,
        totalCostCredit,
        currency: lr.currency,
        tenorDays: tenor,
        repaymentMethod: product.repaymentMethod,
        startDate,
        maturityDate,
        firstPaymentDate,
        outstandingPrincipal: principalAmount,
        outstandingInterest: totalInterest,
        outstandingFees: totalFees,
        outstandingPenalties: 0,
        totalOutstanding: totalCostCredit,
        totalPaid: 0,
        daysPastDue: 0,
        status: ContractStatus.active,
        classification: 'performing',
        restructured: false,
        restructureCount: 0,
        termsSnapshot: offerDetails as Prisma.InputJsonValue,
        productVersion: lr.productVersion,
        customer: { connect: { id: lr.customerId } },
        product: { connect: { id: lr.productId } },
        lender: { connect: { id: product.lenderId! } },
        loanRequestId: lr.id,
      },
    });

    // Update loan request
    await this.loanRequestService.transitionStatus(tenantId, loanRequestId, LoanRequestStatus.contract_created, {
      contract: { connect: { id: contract.id } },
    });

    this.eventBus.emitAndBuild(EventType.CONTRACT_CREATED, tenantId, {
      contractId: contract.id,
      contractNumber,
      customerId: lr.customerId,
      productId: lr.productId,
      principalAmount: String(principalAmount),
      currency: lr.currency,
    });

    return contract;
  }

  async findById(tenantId: string, id: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id, tenantId },
      include: { customer: true, product: true, lender: true, repaymentSchedule: true },
    });
    if (!contract) throw new NotFoundError('Contract', id);
    return contract;
  }

  async findMany(tenantId: string, filters?: {
    customerId?: string;
    productId?: string;
    status?: string;
  }, take: number = 20, cursor?: string) {
    const where: Prisma.ContractWhereInput = { tenantId };
    if (filters?.customerId) where.customerId = filters.customerId;
    if (filters?.productId) where.productId = filters.productId;
    if (filters?.status) where.status = filters.status as ContractStatus;

    const items = await this.prisma.contract.findMany({
      where,
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: { customer: true, product: true },
    });

    return { items: items.slice(0, take), hasMore: items.length > take };
  }
}
