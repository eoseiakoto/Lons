import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma, LoanRequestStatus, ContractStatus } from '@lons/database';
import { EventBusService } from '@lons/common';
import { NotFoundError, ValidationError } from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { isValidTransition } from './loan-request-state-machine';

@Injectable()
export class LoanRequestService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
  ) {}

  async create(tenantId: string, input: {
    customerId: string;
    productId: string;
    requestedAmount: number;
    requestedTenor?: number;
    currency: string;
    channel?: string;
    idempotencyKey?: string;
  }) {
    // Idempotency check
    if (input.idempotencyKey) {
      const existing = await this.prisma.loanRequest.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) return existing;
    }

    const loanRequest = await this.prisma.loanRequest.create({
      data: {
        tenantId,
        idempotencyKey: input.idempotencyKey,
        requestedAmount: input.requestedAmount,
        requestedTenor: input.requestedTenor,
        currency: input.currency,
        channel: input.channel,
        status: LoanRequestStatus.received,
        customer: { connect: { id: input.customerId } },
        product: { connect: { id: input.productId } },
      },
      include: { customer: true, product: true },
    });

    this.eventBus.emitAndBuild(
      EventType.LOAN_REQUEST_CREATED,
      tenantId,
      {
        loanRequestId: loanRequest.id,
        customerId: input.customerId,
        productId: input.productId,
        amount: input.requestedAmount.toString(),
        currency: input.currency,
      },
    );

    return loanRequest;
  }

  async findById(tenantId: string, id: string) {
    const lr = await this.prisma.loanRequest.findFirst({
      where: { id, tenantId },
      include: { customer: true, product: true, scoringResult: true },
    });
    if (!lr) throw new NotFoundError('LoanRequest', id);
    return lr;
  }

  async findMany(tenantId: string, filters?: {
    customerId?: string;
    productId?: string;
    status?: string;
  }, take: number = 20, cursor?: string) {
    const where: Prisma.LoanRequestWhereInput = { tenantId };
    if (filters?.customerId) where.customerId = filters.customerId;
    if (filters?.productId) where.productId = filters.productId;
    if (filters?.status) where.status = filters.status as LoanRequestStatus;

    const items = await this.prisma.loanRequest.findMany({
      where,
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: { customer: true, product: true },
    });

    return { items: items.slice(0, take), hasMore: items.length > take };
  }

  async transitionStatus(tenantId: string, id: string, newStatus: LoanRequestStatus, updateData?: Prisma.LoanRequestUpdateInput) {
    const lr = await this.findById(tenantId, id);
    const currentStatus = lr.status;

    if (!isValidTransition(currentStatus, newStatus)) {
      throw new ValidationError(
        `Invalid status transition from ${currentStatus} to ${newStatus}`,
        { currentStatus, newStatus },
      );
    }

    const updated = await this.prisma.loanRequest.update({
      where: { id },
      data: {
        status: newStatus,
        ...updateData,
      },
      include: { customer: true, product: true, scoringResult: true },
    });

    this.eventBus.emitAndBuild(
      EventType.LOAN_REQUEST_STATUS_CHANGED,
      tenantId,
      {
        loanRequestId: id,
        previousStatus: currentStatus,
        newStatus,
      },
    );

    return updated;
  }

  async validateRequest(tenantId: string, id: string) {
    const lr = await this.findById(tenantId, id);
    const rejectionReasons: { code: string; message: string }[] = [];

    // 1. Customer active
    const customer = await this.prisma.customer.findFirst({
      where: { id: lr.customerId, tenantId, deletedAt: null },
    });
    if (!customer || customer.status !== 'active') {
      rejectionReasons.push({ code: 'CUSTOMER_INACTIVE', message: 'Customer is not active' });
    }
    if (customer?.status === 'blacklisted') {
      rejectionReasons.push({ code: 'CUSTOMER_BLACKLISTED', message: 'Customer is blacklisted' });
    }

    // 2. Product active
    const product = await this.prisma.product.findFirst({
      where: { id: lr.productId, tenantId, deletedAt: null },
    });
    if (!product || product.status !== 'active') {
      rejectionReasons.push({ code: 'PRODUCT_INACTIVE', message: 'Product is not active' });
    }

    // 3. Subscription exists
    if (product) {
      const subscription = await this.prisma.subscription.findFirst({
        where: { tenantId, customerId: lr.customerId, productId: lr.productId, status: 'active' },
      });
      if (!subscription) {
        rejectionReasons.push({ code: 'NO_SUBSCRIPTION', message: 'No active subscription for this product' });
      }
    }

    // 4. Amount in bounds
    if (product) {
      const requestedAmount = Number(lr.requestedAmount);
      if (product.minAmount && requestedAmount < Number(product.minAmount)) {
        rejectionReasons.push({ code: 'AMOUNT_BELOW_MINIMUM', message: `Amount below minimum ${product.minAmount}` });
      }
      if (product.maxAmount && requestedAmount > Number(product.maxAmount)) {
        rejectionReasons.push({ code: 'AMOUNT_ABOVE_MAXIMUM', message: `Amount above maximum ${product.maxAmount}` });
      }
    }

    // 5. Max active loans check
    if (product) {
      const activeContractCount = await this.prisma.contract.count({
        where: {
          tenantId,
          customerId: lr.customerId,
          productId: lr.productId,
          status: { in: ['active', 'performing', 'due', 'overdue', 'delinquent'] },
        },
      });
      if (activeContractCount >= product.maxActiveLoans) {
        rejectionReasons.push({ code: 'MAX_ACTIVE_LOANS_EXCEEDED', message: `Maximum active loans (${product.maxActiveLoans}) reached` });
      }
    }

    if (rejectionReasons.length > 0) {
      return this.transitionStatus(tenantId, id, LoanRequestStatus.rejected, {
        rejectionReasons: rejectionReasons as unknown as Prisma.InputJsonValue,
      });
    }

    return this.transitionStatus(tenantId, id, LoanRequestStatus.validated, {
      productVersion: product?.version,
    });
  }
}
