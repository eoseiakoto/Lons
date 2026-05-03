import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma } from '@lons/database';
import { NotFoundError, ValidationError } from '@lons/common';
import * as crypto from 'crypto';

// In-memory idempotency cache (use Redis in production)
const idempotencyCache = new Map<string, { result: any; expiresAt: number }>();

@Injectable()
export class ProductService {
  constructor(private prisma: PrismaService) {}

  /**
   * Find or create the tenant's "Self-Funded" lender record.
   * Used when a product is created without an external lender.
   */
  private async getOrCreateSelfFundedLender(tenantId: string): Promise<string> {
    const existing = await this.prisma.lender.findFirst({
      where: {
        tenantId,
        name: 'Self-Funded',
        deletedAt: null,
      },
    });

    if (existing) return existing.id;

    // Create one — wrap in try/catch for race-condition safety
    try {
      const lender = await this.prisma.lender.create({
        data: {
          tenantId,
          name: 'Self-Funded',
          status: 'active',
        },
      });
      return lender.id;
    } catch (err: any) {
      // If another request created it concurrently, find and return it
      const retry = await this.prisma.lender.findFirst({
        where: { tenantId, name: 'Self-Funded', deletedAt: null },
      });
      if (retry) return retry.id;
      throw err;
    }
  }

  private static readonly TYPE_PREFIXES: Record<string, string> = {
    overdraft: 'OD',
    micro_loan: 'ML',
    bnpl: 'BNPL',
    invoice_financing: 'IF',
    // Also support uppercase frontend values
    OVERDRAFT: 'OD',
    MICRO_LOAN: 'ML',
    BNPL: 'BNPL',
    INVOICE_FACTORING: 'IF',
  };

  private getTypePrefix(type: string): string {
    return ProductService.TYPE_PREFIXES[type] || 'ML';
  }

  /**
   * Atomically determine the next product code sequence for a given type + currency.
   * Queries the database directly to find the highest existing sequence number,
   * avoiding stale-cache and pagination issues.
   */
  async getNextProductCode(tenantId: string, type: string, currency: string): Promise<string> {
    const prefix = this.getTypePrefix(type);
    const codePattern = `${prefix}-${currency}-%`;

    // Extract the trailing digits from matching codes and find the max
    const result = await this.prisma.$queryRaw<{ max_seq: number }[]>`
      SELECT COALESCE(MAX(
        CAST(SUBSTRING(code FROM '[0-9]+$') AS INTEGER)
      ), 0) AS max_seq
      FROM products
      WHERE tenant_id = ${tenantId}::uuid
        AND code LIKE ${codePattern}
    `;

    const nextSeq = (result[0]?.max_seq ?? 0) + 1;
    return `${prefix}-${currency}-${String(nextSeq).padStart(3, '0')}`;
  }

  async create(tenantId: string, data: {
    code?: string;
    name: string;
    description?: string;
    type: 'overdraft' | 'micro_loan' | 'bnpl' | 'invoice_financing';
    lenderId?: string;
    currency: string;
    /** Money/rates as Decimal strings — see MoneyString in @lons/shared-types. */
    minAmount?: string;
    maxAmount?: string;
    minTenorDays?: number;
    maxTenorDays?: number;
    interestRateModel: 'flat' | 'reducing_balance' | 'tiered';
    interestRate?: string;
    rateTiers?: Prisma.InputJsonValue;
    feeStructure?: Prisma.InputJsonValue;
    repaymentMethod: 'lump_sum' | 'equal_installments' | 'reducing' | 'balloon' | 'auto_deduction';
    gracePeriodDays?: number;
    penaltyConfig?: Prisma.InputJsonValue;
    approvalWorkflow?: 'auto' | 'semi_auto' | 'single_level' | 'multi_level';
    approvalThresholds?: Prisma.InputJsonValue;
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

    // Generate code server-side if not provided or placeholder
    let code = data.code;
    if (!code || code === '' || code.endsWith('-000')) {
      code = await this.getNextProductCode(tenantId, data.type, data.currency);
    }

    // If no lender provided, use the tenant's self-funded lender
    let lenderId = data.lenderId;
    if (!lenderId) {
      lenderId = await this.getOrCreateSelfFundedLender(tenantId);
    }

    // Retry with re-query on collision (handles race between getNextProductCode and insert)
    let result: any;
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        result = await this.prisma.product.create({
          data: {
            tenantId,
            code,
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
            approvalThresholds: data.approvalThresholds ?? undefined,
            eligibilityRules: data.eligibilityRules ?? undefined,
            revenueSharing: data.revenueSharing ?? undefined,
            maxActiveLoans: data.maxActiveLoans,
            status: 'draft',
            lender: { connect: { id: lenderId } },
            ...(data.createdBy ? { creator: { connect: { id: data.createdBy } } } : {}),
          },
          include: { lender: true },
        });
        break; // success
      } catch (err: any) {
        const isCodeCollision = err?.code === 'P2002' &&
          Array.isArray(err?.meta?.target) && err.meta.target.includes('code');
        if (!isCodeCollision || attempt === 9) throw err;
        // Re-query the DB for the actual next code instead of blindly incrementing
        code = await this.getNextProductCode(tenantId, data.type, data.currency);
      }
    }

    // Cache result for idempotency (1 hour TTL)
    if (idempotencyKey) {
      const cacheKey = crypto.createHash('sha256').update(`${tenantId}:${idempotencyKey}`).digest('hex');
      idempotencyCache.set(cacheKey, { result, expiresAt: Date.now() + 3600_000 });
    }

    return result;
  }

  async findById(tenantId: string | undefined, id: string) {
    const where: Prisma.ProductWhereInput = { id, deletedAt: null };
    if (tenantId) where.tenantId = tenantId;
    const product = await this.prisma.product.findFirst({
      where,
      include: { lender: true },
    });
    if (!product) throw new NotFoundError('Product', id);
    return product;
  }

  async findAll(tenantId: string | undefined, filters?: {
    type?: string;
    status?: string;
  }, take: number = 20, cursor?: string) {
    const where: Prisma.ProductWhereInput = { deletedAt: null };
    if (tenantId) where.tenantId = tenantId;
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
    /** Money/rates as Decimal strings — see MoneyString in @lons/shared-types. */
    minAmount?: string;
    maxAmount?: string;
    minTenorDays?: number;
    maxTenorDays?: number;
    interestRate?: string;
    rateTiers?: Prisma.InputJsonValue;
    feeStructure?: Prisma.InputJsonValue;
    gracePeriodDays?: number;
    penaltyConfig?: Prisma.InputJsonValue;
    approvalWorkflow?: 'auto' | 'semi_auto' | 'single_level' | 'multi_level';
    approvalThresholds?: Prisma.InputJsonValue;
    eligibilityRules?: Prisma.InputJsonValue;
    revenueSharing?: Prisma.InputJsonValue;
    maxActiveLoans?: number;
    lenderId?: string;
    notificationConfig?: Prisma.InputJsonValue;
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
    if (data.approvalThresholds !== undefined) updateData.approvalThresholds = data.approvalThresholds;
    if (data.eligibilityRules !== undefined) updateData.eligibilityRules = data.eligibilityRules;
    if (data.revenueSharing !== undefined) updateData.revenueSharing = data.revenueSharing;
    if (data.maxActiveLoans !== undefined) updateData.maxActiveLoans = data.maxActiveLoans;
    if (data.notificationConfig !== undefined) updateData.notificationConfig = data.notificationConfig;
    if (data.lenderId !== undefined) {
      if (data.lenderId) {
        updateData.lender = { connect: { id: data.lenderId } };
      } else {
        // Switching to self-funded: connect the tenant's self-funded lender
        const selfFundedId = await this.getOrCreateSelfFundedLender(tenantId);
        updateData.lender = { connect: { id: selfFundedId } };
      }
    }

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
