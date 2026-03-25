import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma } from '@lons/database';
import { NotFoundError, ValidationError } from '@lons/common';
import * as crypto from 'crypto';

// In-memory idempotency cache (use Redis in production)
const idempotencyCache = new Map<string, { result: any; expiresAt: number }>();

@Injectable()
export class ProductService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, data: {
    code: string;
    name: string;
    description?: string;
    type: 'overdraft' | 'micro_loan' | 'bnpl' | 'invoice_financing';
    lenderId?: string;
    currency: string;
    minAmount?: number;
    maxAmount?: number;
    minTenorDays?: number;
    maxTenorDays?: number;
    interestRateModel: 'flat' | 'reducing_balance' | 'tiered';
    interestRate?: number;
    rateTiers?: Prisma.InputJsonValue;
    feeStructure?: Prisma.InputJsonValue;
    repaymentMethod: 'lump_sum' | 'equal_installments' | 'reducing' | 'balloon' | 'auto_deduction';
    gracePeriodDays?: number;
    penaltyConfig?: Prisma.InputJsonValue;
    approvalWorkflow?: 'auto' | 'semi_auto' | 'single_level' | 'multi_level';
    eligibilityRules?: Prisma.InputJsonValue;
    revenueSharing?: Prisma.InputJsonValue;
    maxActiveLoans?: number;
    createdBy?: string;
  }, idempotencyKey?: string) {
    // Idempotency check
    if (idempotencyKey) {
      const cacheKey = crypto.createHash('sha256').update(`${tenantId}:${idempotencyKey}`).digest('hex');
      const cached = idempotencyCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.result;
      }
    }

    const result = await this.prisma.product.create({
      data: {
        tenantId,
        code: data.code,
        name: data.name,
        description: data.description,
        type: data.type,
        currency: data.currency,
        minAmount: data.minAmount,
        maxAmount: data.maxAmount,
        minTenorDays: data.minTenorDays,
        maxTenorDays: data.maxTenorDays,
        interestRateModel: data.interestRateModel,
        interestRate: data.interestRate,
        rateTiers: data.rateTiers ?? undefined,
        feeStructure: data.feeStructure ?? undefined,
        repaymentMethod: data.repaymentMethod,
        gracePeriodDays: data.gracePeriodDays,
        penaltyConfig: data.penaltyConfig ?? undefined,
        approvalWorkflow: data.approvalWorkflow,
        eligibilityRules: data.eligibilityRules ?? undefined,
        revenueSharing: data.revenueSharing ?? undefined,
        maxActiveLoans: data.maxActiveLoans,
        status: 'draft',
        ...(data.lenderId ? { lender: { connect: { id: data.lenderId } } } : {}),
        ...(data.createdBy ? { creator: { connect: { id: data.createdBy } } } : {}),
      },
      include: { lender: true },
    });

    // Cache result for idempotency (1 hour TTL)
    if (idempotencyKey) {
      const cacheKey = crypto.createHash('sha256').update(`${tenantId}:${idempotencyKey}`).digest('hex');
      idempotencyCache.set(cacheKey, { result, expiresAt: Date.now() + 3600_000 });
    }

    return result;
  }

  async findById(tenantId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { lender: true },
    });
    if (!product) throw new NotFoundError('Product', id);
    return product;
  }

  async findAll(tenantId: string, filters?: {
    type?: string;
    status?: string;
  }, take: number = 20, cursor?: string) {
    const where: Prisma.ProductWhereInput = { tenantId, deletedAt: null };
    if (filters?.type) where.type = filters.type as Prisma.EnumProductTypeFilter['equals'];
    if (filters?.status) where.status = filters.status as Prisma.EnumProductStatusFilter['equals'];

    const products = await this.prisma.product.findMany({
      where,
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: { lender: true },
    });
    return { items: products.slice(0, take), hasMore: products.length > take };
  }

  async update(tenantId: string, id: string, data: {
    name?: string;
    description?: string;
    minAmount?: number;
    maxAmount?: number;
    minTenorDays?: number;
    maxTenorDays?: number;
    interestRate?: number;
    rateTiers?: Prisma.InputJsonValue;
    feeStructure?: Prisma.InputJsonValue;
    gracePeriodDays?: number;
    penaltyConfig?: Prisma.InputJsonValue;
    approvalWorkflow?: 'auto' | 'semi_auto' | 'single_level' | 'multi_level';
    eligibilityRules?: Prisma.InputJsonValue;
    revenueSharing?: Prisma.InputJsonValue;
    maxActiveLoans?: number;
  }, userId?: string) {
    const product = await this.findById(tenantId, id);

    // Create a version snapshot before updating
    await this.prisma.productVersion.create({
      data: {
        tenantId,
        productId: id,
        version: product.version,
        snapshot: product as unknown as Prisma.InputJsonValue,
        changeSummary: 'Product updated',
        createdBy: userId,
      },
    });

    const updateData: Prisma.ProductUpdateInput = {
      version: product.version + 1,
    };
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.minAmount !== undefined) updateData.minAmount = data.minAmount;
    if (data.maxAmount !== undefined) updateData.maxAmount = data.maxAmount;
    if (data.minTenorDays !== undefined) updateData.minTenorDays = data.minTenorDays;
    if (data.maxTenorDays !== undefined) updateData.maxTenorDays = data.maxTenorDays;
    if (data.interestRate !== undefined) updateData.interestRate = data.interestRate;
    if (data.rateTiers !== undefined) updateData.rateTiers = data.rateTiers;
    if (data.feeStructure !== undefined) updateData.feeStructure = data.feeStructure;
    if (data.gracePeriodDays !== undefined) updateData.gracePeriodDays = data.gracePeriodDays;
    if (data.penaltyConfig !== undefined) updateData.penaltyConfig = data.penaltyConfig;
    if (data.approvalWorkflow !== undefined) updateData.approvalWorkflow = data.approvalWorkflow;
    if (data.eligibilityRules !== undefined) updateData.eligibilityRules = data.eligibilityRules;
    if (data.revenueSharing !== undefined) updateData.revenueSharing = data.revenueSharing;
    if (data.maxActiveLoans !== undefined) updateData.maxActiveLoans = data.maxActiveLoans;

    return this.prisma.product.update({
      where: { id },
      data: updateData,
      include: { lender: true },
    });
  }

  async activate(tenantId: string, id: string) {
    const product = await this.findById(tenantId, id);
    if (product.status !== 'draft' && product.status !== 'suspended') {
      throw new ValidationError(`Cannot activate product in ${product.status} status`);
    }
    if (!product.lenderId) {
      throw new ValidationError('Product must have a lender before activation');
    }

    return this.prisma.product.update({
      where: { id },
      data: { status: 'active', activatedAt: new Date() },
      include: { lender: true },
    });
  }

  async suspend(tenantId: string, id: string) {
    const product = await this.findById(tenantId, id);
    if (product.status !== 'active') {
      throw new ValidationError('Only active products can be suspended');
    }
    return this.prisma.product.update({
      where: { id },
      data: { status: 'suspended' },
      include: { lender: true },
    });
  }

  async discontinue(tenantId: string, id: string) {
    await this.findById(tenantId, id);
    return this.prisma.product.update({
      where: { id },
      data: { status: 'discontinued' },
      include: { lender: true },
    });
  }
}
