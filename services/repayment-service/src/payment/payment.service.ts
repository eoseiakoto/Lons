import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma, RepaymentStatus, RepaymentMethodType, ContractStatus } from '@lons/database';
import { EventBusService, NotFoundError, ValidationError, add, subtract, compare, bankersRound } from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { allocatePayment, OutstandingAmounts } from '../waterfall/waterfall-allocator';

@Injectable()
export class PaymentService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  async processPayment(tenantId: string, input: {
    contractId: string;
    amount: number;
    currency: string;
    method: string;
    source?: string;
    externalRef?: string;
  }) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: input.contractId, tenantId },
    });
    if (!contract) throw new NotFoundError('Contract', input.contractId);

    if (contract.status === 'settled' || contract.status === 'cancelled') {
      throw new ValidationError('Contract is already settled or cancelled');
    }

    const outstanding: OutstandingAmounts = {
      overduePenalties: String(contract.outstandingPenalties || 0),
      overdueInterest: '0.0000', // Simplified: treat all interest as current for Phase 2
      overduePrincipal: '0.0000',
      currentFees: String(contract.outstandingFees || 0),
      currentInterest: String(contract.outstandingInterest || 0),
      currentPrincipal: String(contract.outstandingPrincipal || 0),
    };

    const allocation = allocatePayment(String(input.amount), outstanding);

    const repayment = await this.prisma.repayment.create({
      data: {
        tenantId,
        amount: input.amount,
        currency: input.currency,
        method: input.method as RepaymentMethodType,
        source: input.source,
        externalRef: input.externalRef,
        allocatedPrincipal: Number(allocation.allocatedPrincipal),
        allocatedInterest: Number(allocation.allocatedInterest),
        allocatedFees: Number(allocation.allocatedFees),
        allocatedPenalties: Number(allocation.allocatedPenalties),
        status: RepaymentStatus.completed,
        completedAt: new Date(),
        contract: { connect: { id: input.contractId } },
        customer: { connect: { id: contract.customerId } },
      },
    });

    // Update contract outstanding amounts
    const newOutstandingPrincipal = bankersRound(subtract(String(contract.outstandingPrincipal || 0), allocation.allocatedPrincipal), 4);
    const newOutstandingInterest = bankersRound(subtract(String(contract.outstandingInterest || 0), allocation.allocatedInterest), 4);
    const newOutstandingFees = bankersRound(subtract(String(contract.outstandingFees || 0), allocation.allocatedFees), 4);
    const newOutstandingPenalties = bankersRound(subtract(String(contract.outstandingPenalties || 0), allocation.allocatedPenalties), 4);
    const newTotalOutstanding = add(add(newOutstandingPrincipal, newOutstandingInterest), add(newOutstandingFees, newOutstandingPenalties));
    const newTotalPaid = add(String(contract.totalPaid || 0), String(input.amount));

    const isSettled = compare(newTotalOutstanding, '0') <= 0;

    await this.prisma.contract.update({
      where: { id: input.contractId },
      data: {
        outstandingPrincipal: Number(newOutstandingPrincipal),
        outstandingInterest: Number(newOutstandingInterest),
        outstandingFees: Number(newOutstandingFees),
        outstandingPenalties: Number(newOutstandingPenalties),
        totalOutstanding: Number(newTotalOutstanding),
        totalPaid: Number(newTotalPaid),
        ...(isSettled ? { status: ContractStatus.settled, settledAt: new Date() } : {}),
      },
    });

    // Create ledger entry
    await this.prisma.ledgerEntry.create({
      data: {
        tenantId,
        entryType: 'repayment',
        debitCredit: 'credit',
        amount: input.amount,
        currency: input.currency,
        runningBalance: Number(newTotalOutstanding),
        effectiveDate: new Date(),
        valueDate: new Date(),
        description: `Repayment of ${input.amount} ${input.currency}`,
        referenceType: 'repayment',
        referenceId: repayment.id,
        contract: { connect: { id: input.contractId } },
      },
    });

    this.eventBus.emitAndBuild(EventType.REPAYMENT_RECEIVED, tenantId, {
      repaymentId: repayment.id,
      contractId: input.contractId,
      amount: String(input.amount),
      allocatedPrincipal: allocation.allocatedPrincipal,
      allocatedInterest: allocation.allocatedInterest,
      allocatedFees: allocation.allocatedFees,
      allocatedPenalties: allocation.allocatedPenalties,
    });

    return repayment;
  }

  async findAll(tenantId: string, filters?: {
    skip?: number;
    take?: number;
    contractId?: string;
  }) {
    const where: Prisma.RepaymentWhereInput = { tenantId };
    if (filters?.contractId) where.contractId = filters.contractId;

    return this.prisma.repayment.findMany({
      where,
      skip: filters?.skip ?? 0,
      take: filters?.take ?? 20,
      orderBy: { createdAt: 'desc' },
    });
  }

  async count(tenantId: string, filters?: {
    contractId?: string;
  }) {
    const where: Prisma.RepaymentWhereInput = { tenantId };
    if (filters?.contractId) where.contractId = filters.contractId;

    return this.prisma.repayment.count({ where });
  }

  async getRepayments(tenantId: string, contractId: string, take: number = 20, cursor?: string) {
    const items = await this.prisma.repayment.findMany({
      where: { tenantId, contractId },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });
    return { items: items.slice(0, take), hasMore: items.length > take };
  }

  async calculateEarlySettlement(tenantId: string, contractId: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, tenantId },
    });
    if (!contract) throw new NotFoundError('Contract', contractId);

    return {
      contractId,
      outstandingPrincipal: String(contract.outstandingPrincipal || 0),
      outstandingInterest: String(contract.outstandingInterest || 0),
      outstandingFees: String(contract.outstandingFees || 0),
      outstandingPenalties: String(contract.outstandingPenalties || 0),
      totalSettlementAmount: String(contract.totalOutstanding || 0),
      currency: contract.currency,
    };
  }
}
