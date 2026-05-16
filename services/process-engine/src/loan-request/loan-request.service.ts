import { Injectable, Optional } from '@nestjs/common';
import {
  PrismaService,
  Prisma,
  LoanRequestStatus,
  ProductType,
} from '@lons/database';
import { EventBusService, compare } from '@lons/common';
import { NotFoundError, ValidationError } from '@lons/common';
import { EventType } from '@lons/event-contracts';

import { isValidTransition } from './loan-request-state-machine';
import { MicroLoanOriginationService } from '../micro-loan/micro-loan-origination.service';

@Injectable()
export class LoanRequestService {
  constructor(
    private prisma: PrismaService,
    private eventBus: EventBusService,
    /**
     * Sprint 16 (S16-2) — optional injection so legacy tests that
     * construct LoanRequestService without the micro-loan module still
     * work. Production wiring always provides it via ProcessEngineModule.
     */
    @Optional()
    private microLoanOrigination?: MicroLoanOriginationService,
  ) {}

  async create(tenantId: string, input: {
    customerId: string;
    productId: string;
    /** Decimal string — see MoneyString in @lons/shared-types. */
    requestedAmount: string;
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

    // S16-2: micro-loan-specific pre-validation gate. Runs BEFORE
    // creating the LoanRequest row so the pipeline never enters an
    // invalid state. The service throws ValidationError with a
    // structured `code` that the GraphQL exception filter surfaces.
    if (this.microLoanOrigination) {
      const product = await this.prisma.product.findFirst({
        where: { id: input.productId, tenantId },
        select: { type: true },
      });
      if (product?.type === ProductType.micro_loan) {
        await this.microLoanOrigination.validateLoanRequest(tenantId, {
          customerId: input.customerId,
          productId: input.productId,
          requestedAmount: input.requestedAmount,
        });
      }
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
        amount: input.requestedAmount,
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

  async findAll(tenantId: string, filters?: {
    skip?: number;
    take?: number;
    customerId?: string;
    productId?: string;
    status?: string;
  }) {
    const where: Prisma.LoanRequestWhereInput = { tenantId };
    if (filters?.customerId) where.customerId = filters.customerId;
    if (filters?.productId) where.productId = filters.productId;
    if (filters?.status) where.status = filters.status as LoanRequestStatus;

    return this.prisma.loanRequest.findMany({
      where,
      skip: filters?.skip ?? 0,
      take: filters?.take ?? 20,
      orderBy: { createdAt: 'desc' },
      include: { customer: true, product: true },
    });
  }

  async count(tenantId: string, filters?: {
    customerId?: string;
    productId?: string;
    status?: string;
  }) {
    const where: Prisma.LoanRequestWhereInput = { tenantId };
    if (filters?.customerId) where.customerId = filters.customerId;
    if (filters?.productId) where.productId = filters.productId;
    if (filters?.status) where.status = filters.status as LoanRequestStatus;

    return this.prisma.loanRequest.count({ where });
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

    // 4. Amount in bounds — Decimal compare to avoid float precision drift.
    if (product) {
      const requestedAmount = String(lr.requestedAmount);
      if (product.minAmount && compare(requestedAmount, String(product.minAmount)) < 0) {
        rejectionReasons.push({ code: 'AMOUNT_BELOW_MINIMUM', message: `Amount below minimum ${product.minAmount}` });
      }
      if (product.maxAmount && compare(requestedAmount, String(product.maxAmount)) > 0) {
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
