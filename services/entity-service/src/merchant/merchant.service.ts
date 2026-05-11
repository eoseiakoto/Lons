import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, Prisma, MerchantStatus, SettlementType } from '@lons/database';
import {
  NotFoundError,
  ValidationError,
  encodeCursor,
  decodeCursor,
  isPositive,
  compare,
} from '@lons/common';

import { QuotaEnforcementService } from '../plan-tier/quota-enforcement.service';

/**
 * Merchant CRUD service (Sprint 11 Track B / B3).
 *
 * Merchants are SP-onboarded entities — only users with SP-admin roles
 * can create them, and a merchant always belongs to exactly one SP
 * (`tenantId`). Standard CRUD shape mirrors `customer.service.ts` and
 * `product.service.ts`. Status lifecycle:
 *
 *     pending → active   (activate, sets onboardedAt)
 *     active  → suspended (suspend with reason)
 *     suspended → active  (re-activate)
 *     any     → deactivated (soft delete)
 *
 * Discount rate must be in [0, 1) — values >= 1 would mean the merchant
 * receives nothing or owes the platform, which is never the intent.
 */
@Injectable()
export class MerchantService {
  private readonly logger = new Logger('MerchantService');

  constructor(
    private readonly prisma: PrismaService,
    // Sprint 14 (S14-10): BNPL merchant quota enforcement.
    private readonly quotaEnforcementService: QuotaEnforcementService,
  ) {}

  async create(
    tenantId: string,
    data: {
      name: string;
      code: string;
      contactEmail?: string;
      contactPhone?: string;
      settlementType?: SettlementType;
      /** Decimal string in [0, 1). 0.025 = 2.5%. */
      discountRate: string;
      walletId?: string;
      walletProvider?: string;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    if (!data.name?.trim()) throw new ValidationError('Merchant name is required');
    if (!data.code?.trim()) throw new ValidationError('Merchant code is required');
    // S14-10: merchants are a BNPL-only entity. The plan caps both
    // (a) availability of BNPL products and (b) the merchant headcount.
    await this.quotaEnforcementService.checkEntityLimit(tenantId, 'merchants');
    this.assertValidDiscountRate(data.discountRate);

    const existing = await this.prisma.merchant.findFirst({
      where: { tenantId, code: data.code, deletedAt: null },
    });
    if (existing) {
      throw new ValidationError(`Merchant code "${data.code}" already exists in this tenant`);
    }

    return this.prisma.merchant.create({
      data: {
        tenantId,
        name: data.name,
        code: data.code,
        status: MerchantStatus.pending,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        settlementType: data.settlementType ?? SettlementType.T_PLUS_1,
        discountRate: data.discountRate,
        walletId: data.walletId,
        walletProvider: data.walletProvider,
        metadata: data.metadata ?? undefined,
      },
    });
  }

  async findById(tenantId: string, merchantId: string) {
    const merchant = await this.prisma.merchant.findFirst({
      where: { id: merchantId, tenantId, deletedAt: null },
    });
    if (!merchant) throw new NotFoundError('Merchant', merchantId);
    return merchant;
  }

  async findByCode(tenantId: string, code: string) {
    return this.prisma.merchant.findFirst({
      where: { tenantId, code, deletedAt: null },
    });
  }

  /** Cursor-paginated list. Filters on status are optional. */
  async list(
    tenantId: string,
    filters: { status?: MerchantStatus; settlementType?: SettlementType } = {},
    take = 20,
    cursor?: string,
  ) {
    const where: Prisma.MerchantWhereInput = { tenantId, deletedAt: null };
    if (filters.status) where.status = filters.status;
    if (filters.settlementType) where.settlementType = filters.settlementType;

    // FIX 11: include totalCount alongside the page so pagination UIs
    // can render "of N" without a second query from the resolver.
    const [items, totalCount] = await Promise.all([
      this.prisma.merchant.findMany({
        where,
        take: take + 1,
        ...(cursor ? { cursor: { id: decodeCursor(cursor) }, skip: 1 } : {}),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.merchant.count({ where }),
    ]);
    const hasMore = items.length > take;
    const sliced = items.slice(0, take);
    return {
      items: sliced,
      totalCount,
      nextCursor: hasMore ? encodeCursor(sliced[sliced.length - 1].id) : null,
    };
  }

  async update(
    tenantId: string,
    merchantId: string,
    data: {
      name?: string;
      contactEmail?: string;
      contactPhone?: string;
      settlementType?: SettlementType;
      discountRate?: string;
      walletId?: string;
      walletProvider?: string;
      metadata?: Prisma.InputJsonValue;
    },
  ) {
    const existing = await this.findById(tenantId, merchantId);
    if (data.discountRate !== undefined) this.assertValidDiscountRate(data.discountRate);

    return this.prisma.merchant.update({
      where: { id: existing.id },
      data: {
        name: data.name ?? undefined,
        contactEmail: data.contactEmail ?? undefined,
        contactPhone: data.contactPhone ?? undefined,
        settlementType: data.settlementType ?? undefined,
        discountRate: data.discountRate ?? undefined,
        walletId: data.walletId ?? undefined,
        walletProvider: data.walletProvider ?? undefined,
        metadata: data.metadata ?? undefined,
      },
    });
  }

  /** pending → active. Sets `onboardedAt`. */
  async activate(tenantId: string, merchantId: string) {
    const merchant = await this.findById(tenantId, merchantId);
    if (merchant.status === MerchantStatus.active) return merchant;
    if (merchant.status !== MerchantStatus.pending) {
      throw new ValidationError(
        `Cannot activate merchant from status ${merchant.status} (only pending is allowed)`,
      );
    }
    return this.prisma.merchant.update({
      where: { id: merchant.id },
      data: { status: MerchantStatus.active, onboardedAt: new Date() },
    });
  }

  /** active → suspended (with reason in metadata for audit). */
  async suspend(tenantId: string, merchantId: string, reason: string) {
    const merchant = await this.findById(tenantId, merchantId);
    if (merchant.status !== MerchantStatus.active) {
      throw new ValidationError(
        `Cannot suspend merchant from status ${merchant.status} (only active is allowed)`,
      );
    }
    const metadata = (merchant.metadata as Record<string, unknown> | null) ?? {};
    return this.prisma.merchant.update({
      where: { id: merchant.id },
      data: {
        status: MerchantStatus.suspended,
        metadata: { ...metadata, suspensionReason: reason, suspendedAt: new Date().toISOString() },
      },
    });
  }

  /** suspended → active. */
  async reactivate(tenantId: string, merchantId: string) {
    const merchant = await this.findById(tenantId, merchantId);
    if (merchant.status !== MerchantStatus.suspended) {
      throw new ValidationError(
        `Cannot reactivate merchant from status ${merchant.status} (only suspended is allowed)`,
      );
    }
    return this.prisma.merchant.update({
      where: { id: merchant.id },
      data: { status: MerchantStatus.active },
    });
  }

  /**
   * Soft delete. Sets `deletedAt` and status `deactivated`.
   * FIX 22: refuse if the merchant still has in-flight transactions —
   * orphaning live BNPL transactions has no good UX (we'd still need
   * to settle and message the merchant). Operators should suspend
   * first, resolve the in-flight transactions, then deactivate.
   */
  async deactivate(tenantId: string, merchantId: string) {
    const merchant = await this.findById(tenantId, merchantId);

    const activeCount = await this.prisma.bnplTransaction.count({
      where: {
        tenantId,
        merchantId,
        status: { in: ['approved', 'active', 'accelerated'] },
        deletedAt: null,
      },
    });
    if (activeCount > 0) {
      throw new ValidationError(
        `Cannot deactivate merchant ${merchant.code}: ${activeCount} active BNPL transaction(s) remain. Suspend instead, or resolve transactions first.`,
      );
    }

    return this.prisma.merchant.update({
      where: { id: merchant.id },
      data: { status: MerchantStatus.deactivated, deletedAt: new Date() },
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // Internals
  // ───────────────────────────────────────────────────────────────────────

  /** Discount rate must parse cleanly and live in [0, 1). */
  private assertValidDiscountRate(rate: string): void {
    if (rate === undefined || rate === null || rate === '') {
      throw new ValidationError('discountRate is required');
    }
    if (!isPositive(rate) && rate !== '0' && rate !== '0.0' && rate !== '0.00' && rate !== '0.0000') {
      // Allow exact zero (some merchants run at 0% discount); reject negatives.
      const isExactZero = !Number.isNaN(Number(rate)) && Number(rate) === 0;
      if (!isExactZero) {
        throw new ValidationError(`discountRate must be non-negative (got ${rate})`);
      }
    }
    if (compare(rate, '1') >= 0) {
      throw new ValidationError(
        `discountRate must be < 1 (got ${rate}) — use a fractional rate like "0.025" for 2.5%`,
      );
    }
  }
}
