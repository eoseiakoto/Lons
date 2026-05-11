import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';

import {
  AuditAction,
  AuditActionType,
  AuditResourceType,
  NotFoundError,
  RequiresPlan,
  ValidationError,
  encodeCursor,
} from '@lons/common';
import { PrismaService, BnplTransactionStatus } from '@lons/database';
import { CurrentTenant, CurrentUser, Roles, IAuthenticatedUser, MerchantService } from '@lons/entity-service';
import {
  BnplEligibilityService,
  BnplInstallmentService,
  BnplOriginationService,
  BnplRefundService,
} from '@lons/process-engine';

import {
  BnplEligibilityResultType,
  BnplPurchaseResultType,
  BnplRefundResultType,
  BnplTransactionConnection,
  BnplTransactionType,
  CancelBnplTransactionResultType,
  InstallmentPaymentResultType,
  InstallmentScheduleType,
  MerchantConnection,
  MerchantSettlementType,
  MerchantStatusGql,
  MerchantType,
  RefundTypeGql,
  SettlementTypeGql,
} from '../types/bnpl.type';
import {
  AdvancePaymentType,
  EarlySettlementType,
} from '../types/bnpl-early-settlement.type';
import {
  BnplTransactionFiltersInput,
  CreateMerchantInput,
  InitiateBnplPurchaseInput,
  InitiateRefundInput,
  MerchantFiltersInput,
  UpdateMerchantInput,
} from '../inputs/bnpl.input';
import {
  AdvancePaymentInput,
  EarlySettlementInput,
} from '../inputs/bnpl-early-settlement.input';

/**
 * BNPL GraphQL surface (Sprint 11 Track B / B10).
 *
 *   Queries:
 *     bnplTransaction(id) — single transaction with installments
 *     bnplTransactions(filters, first, after) — admin list
 *     installmentSchedule(transactionId) — full schedule
 *     merchant(id) / merchants(filters, first, after) — merchant lookup
 *     bnplEligibility(...) — checkout pre-qualification
 *
 *   Mutations:
 *     initiateBnplPurchase  — purchase origination
 *     cancelBnplTransaction — full cancellation pre-due (waives installments)
 *     processInstallmentPayment — manual payment recording
 *     initiateRefund        — full or partial
 *     createMerchant / updateMerchant / activateMerchant /
 *       suspendMerchant / reactivateMerchant / deactivateMerchant
 *
 * All mutations require `idempotencyKey` (origination/refund use it
 * directly via the service idempotency layer; the others accept it for
 * client-side replay safety even when the underlying service is already
 * idempotent on identifiers). Auth via `@Roles()` and `@AuditAction()`.
 */
@Resolver(() => BnplTransactionType)
export class BnplResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly origination: BnplOriginationService,
    private readonly eligibility: BnplEligibilityService,
    private readonly installment: BnplInstallmentService,
    private readonly refund: BnplRefundService,
    private readonly merchantService: MerchantService,
  ) {}

  // ────── Queries ────────────────────────────────────────────────────────

  @Query(() => BnplTransactionType, { nullable: true })
  @Roles('contract:read')
  async bnplTransaction(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<BnplTransactionType | null> {
    const tx = await this.prisma.bnplTransaction.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { installments: { orderBy: { installmentNumber: 'asc' } } },
    });
    return (tx as unknown as BnplTransactionType) ?? null;
  }

  @Query(() => BnplTransactionConnection)
  @Roles('contract:read')
  async bnplTransactions(
    @CurrentTenant() tenantId: string,
    @Args('first', { type: () => Int, nullable: true }) first?: number,
    @Args('after', { nullable: true }) after?: string,
    @Args('filters', { nullable: true }) filters?: BnplTransactionFiltersInput,
  ): Promise<BnplTransactionConnection> {
    const take = first ?? 20;
    // FIX 11: totalCount must be the total matching the filter, not just
    // the size of the page slice — the latter breaks pagination UI.
    const where = {
      tenantId,
      deletedAt: null,
      ...(filters?.customerId ? { customerId: filters.customerId } : {}),
      ...(filters?.merchantId ? { merchantId: filters.merchantId } : {}),
      ...(filters?.status
        ? { status: filters.status as BnplTransactionStatus }
        : {}),
    };
    const [items, totalCount] = await Promise.all([
      this.prisma.bnplTransaction.findMany({
        where,
        take: take + 1,
        ...(after ? { cursor: { id: after }, skip: 1 } : {}),
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.bnplTransaction.count({ where }),
    ]);
    const hasMore = items.length > take;
    const sliced = items.slice(0, take);
    return {
      edges: sliced.map((node) => ({
        node: node as unknown as BnplTransactionType,
        cursor: encodeCursor(node.id),
      })),
      pageInfo: {
        hasNextPage: hasMore,
        hasPreviousPage: !!after,
        startCursor: sliced.length > 0 ? encodeCursor(sliced[0].id) : undefined,
        endCursor: sliced.length > 0 ? encodeCursor(sliced[sliced.length - 1].id) : undefined,
      },
      totalCount,
    };
  }

  /**
   * FIX 18: convenience query that wraps `bnplTransactions` with a
   * required `merchantId` filter. Cleaner ergonomics for merchant
   * detail views and settlement reconciliation than the generic
   * `bnplTransactions(filters: { merchantId })` form.
   */
  @Query(() => BnplTransactionConnection)
  @Roles('contract:read')
  async merchantTransactions(
    @CurrentTenant() tenantId: string,
    @Args('merchantId', { type: () => ID }) merchantId: string,
    @Args('first', { type: () => Int, nullable: true }) first?: number,
    @Args('after', { nullable: true }) after?: string,
  ): Promise<BnplTransactionConnection> {
    return this.bnplTransactions(tenantId, first, after, { merchantId });
  }

  @Query(() => [InstallmentScheduleType])
  @Roles('contract:read')
  async installmentSchedule(
    @CurrentTenant() tenantId: string,
    @Args('transactionId', { type: () => ID }) transactionId: string,
  ): Promise<InstallmentScheduleType[]> {
    const tx = await this.prisma.bnplTransaction.findFirst({
      where: { id: transactionId, tenantId, deletedAt: null },
      select: { id: true },
    });
    if (!tx) throw new NotFoundError('BnplTransaction', transactionId);
    const rows = await this.prisma.installmentSchedule.findMany({
      where: { tenantId, transactionId },
      orderBy: { installmentNumber: 'asc' },
    });
    return rows as unknown as InstallmentScheduleType[];
  }

  @Query(() => MerchantType, { nullable: true })
  @Roles('contract:read')
  async merchant(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<MerchantType | null> {
    const m = await this.prisma.merchant.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    return (m as unknown as MerchantType) ?? null;
  }

  @Query(() => MerchantConnection)
  @Roles('contract:read')
  async merchants(
    @CurrentTenant() tenantId: string,
    @Args('first', { type: () => Int, nullable: true }) first?: number,
    @Args('after', { nullable: true }) after?: string,
    @Args('filters', { nullable: true }) filters?: MerchantFiltersInput,
  ): Promise<MerchantConnection> {
    const take = first ?? 20;
    const result = await this.merchantService.list(
      tenantId,
      {
        status: filters?.status as MerchantStatusGql | undefined,
        settlementType: filters?.settlementType as SettlementTypeGql | undefined,
      },
      take,
      after,
    );
    return {
      edges: result.items.map((m) => ({
        node: m as unknown as MerchantType,
        cursor: encodeCursor(m.id),
      })),
      pageInfo: {
        hasNextPage: result.nextCursor !== null,
        hasPreviousPage: !!after,
        startCursor: result.items.length > 0 ? encodeCursor(result.items[0].id) : undefined,
        endCursor: result.nextCursor ?? undefined,
      },
      totalCount: result.totalCount ?? result.items.length,
    };
  }

  /**
   * FIX 20: list of MerchantSettlement rows for a merchant. Drives the
   * "Settlement history" section of the admin merchant detail page.
   */
  @Query(() => [MerchantSettlementType])
  @Roles('contract:read')
  async merchantSettlements(
    @CurrentTenant() tenantId: string,
    @Args('merchantId', { type: () => ID }) merchantId: string,
    @Args('first', { type: () => Int, nullable: true }) first?: number,
  ): Promise<MerchantSettlementType[]> {
    const take = Math.min(first ?? 50, 200);
    const rows = await this.prisma.merchantSettlement.findMany({
      where: { tenantId, merchantId },
      orderBy: { createdAt: 'desc' },
      take,
    });
    return rows as unknown as MerchantSettlementType[];
  }

  @Query(() => BnplEligibilityResultType)
  @Roles('contract:read')
  async bnplEligibility(
    @CurrentTenant() tenantId: string,
    @Args('merchantCode') merchantCode: string,
    @Args('customerId', { type: () => ID }) customerId: string,
    @Args('amount') amount: string,
    @Args('currency') currency: string,
  ): Promise<BnplEligibilityResultType> {
    return this.eligibility.check(tenantId, {
      merchantCode,
      customerId,
      amount,
      currency,
    });
  }

  // ────── Mutations ──────────────────────────────────────────────────────

  // S14-10: BNPL is a growth-tier (or higher) product.
  @RequiresPlan('growth')
  @Mutation(() => BnplPurchaseResultType)
  @AuditAction(AuditActionType.CREATE, AuditResourceType.CONTRACT)
  @Roles('contract:create')
  async initiateBnplPurchase(
    @CurrentTenant() tenantId: string,
    @Args('input') input: InitiateBnplPurchaseInput,
  ): Promise<BnplPurchaseResultType> {
    return (await this.origination.initiate(tenantId, {
      merchantCode: input.merchantCode,
      customerId: input.customerId,
      purchaseAmount: input.purchaseAmount,
      currency: input.currency,
      numberOfInstallments: input.numberOfInstallments,
      purchaseRef: input.purchaseRef,
      merchantRef: input.merchantRef,
      items: input.items,
      idempotencyKey: input.idempotencyKey,
    })) as unknown as BnplPurchaseResultType;
  }

  // S14-10: BNPL is a growth-tier (or higher) product.
  @RequiresPlan('growth')
  @Mutation(() => CancelBnplTransactionResultType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
  @Roles('contract:update')
  async cancelBnplTransaction(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('transactionId', { type: () => ID }) transactionId: string,
    @Args('reason') reason: string,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<CancelBnplTransactionResultType> {
    // Cancellation is implemented as a full refund with reason — the
    // refund engine waives unpaid installments, reimburses paid ones,
    // and flips the transaction to `refunded`. The doc lists this as
    // `cancelBnplTransaction` so it stays a distinct mutation, but
    // semantically it's a full refund initiated by ops.
    // FIX 12: pass idempotencyKey through to the refund service.
    await this.refund.initiate(tenantId, {
      transactionId,
      amount: '0', // ignored by full-refund path
      type: 'full',
      reason,
      operatorId: user.userId,
      idempotencyKey,
    });
    return { transactionId, success: true };
  }

  // S14-10: BNPL is a growth-tier (or higher) product.
  @RequiresPlan('growth')
  @Mutation(() => InstallmentPaymentResultType)
  @AuditAction(AuditActionType.REPAYMENT, AuditResourceType.REPAYMENT)
  @Roles('repayment:create')
  async processInstallmentPayment(
    @CurrentTenant() tenantId: string,
    @Args('installmentId', { type: () => ID }) installmentId: string,
    @Args('amount') amount: string,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<InstallmentPaymentResultType> {
    // FIX 12 + FIX 16: pass the idempotency key into the service.
    return this.installment.processInstallmentPayment(
      tenantId,
      installmentId,
      amount,
      idempotencyKey,
    );
  }

  /**
   * FIX 13: convenience mutation for "make a payment" without picking
   * an installment. Server selects the earliest unpaid installment.
   */
  // S14-10: BNPL is a growth-tier (or higher) product.
  @RequiresPlan('growth')
  @Mutation(() => InstallmentPaymentResultType)
  @AuditAction(AuditActionType.REPAYMENT, AuditResourceType.REPAYMENT)
  @Roles('repayment:create')
  async payNextBnplInstallment(
    @CurrentTenant() tenantId: string,
    @Args('transactionId', { type: () => ID }) transactionId: string,
    @Args('amount') amount: string,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<InstallmentPaymentResultType> {
    const result = await this.installment.payNextDue(
      tenantId,
      transactionId,
      amount,
      idempotencyKey,
    );
    // The mutation result type doesn't include installmentId; callers
    // who need it should query `installmentSchedule` after the mutation.
    return {
      installmentPaidInFull: result.installmentPaidInFull,
      transactionCompleted: result.transactionCompleted,
      paidAmount: result.paidAmount,
    };
  }

  /**
   * Sprint 12 G3 — pay off all remaining unpaid installments early,
   * applying any configured early-settlement discount.
   */
  // S14-10: BNPL is a growth-tier (or higher) product.
  @RequiresPlan('growth')
  @Mutation(() => EarlySettlementType)
  @AuditAction(AuditActionType.REPAYMENT, AuditResourceType.REPAYMENT)
  @Roles('repayment:create')
  async earlySettleBnplTransaction(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('input') input: EarlySettlementInput,
  ): Promise<EarlySettlementType> {
    return this.installment.earlySettlement(tenantId, {
      transactionId: input.transactionId,
      idempotencyKey: input.idempotencyKey,
      operatorId: user.userId,
    });
  }

  /**
   * Sprint 12 G3 — pay one or more future installments ahead of their
   * due dates without settling the entire transaction.
   */
  // S14-10: BNPL is a growth-tier (or higher) product.
  @RequiresPlan('growth')
  @Mutation(() => AdvancePaymentType)
  @AuditAction(AuditActionType.REPAYMENT, AuditResourceType.REPAYMENT)
  @Roles('repayment:create')
  async advanceBnplPayment(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('input') input: AdvancePaymentInput,
  ): Promise<AdvancePaymentType> {
    return this.installment.advancePayment(tenantId, {
      transactionId: input.transactionId,
      installmentNumbers: input.installmentNumbers,
      idempotencyKey: input.idempotencyKey,
      operatorId: user.userId,
    });
  }

  // S14-10: BNPL is a growth-tier (or higher) product.
  @RequiresPlan('growth')
  @Mutation(() => BnplRefundResultType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
  @Roles('contract:update')
  async initiateBnplRefund(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('input') input: InitiateRefundInput,
  ): Promise<BnplRefundResultType> {
    // FIX 12: pass idempotencyKey from the GraphQL input through to the
    // refund service so client-side replays are deduplicated.
    return this.refund.initiate(tenantId, {
      transactionId: input.transactionId,
      amount: input.amount,
      type: input.type as RefundTypeGql,
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
      operatorId: user.userId,
    });
  }

  // ────── Merchant CRUD ──────────────────────────────────────────────────
  //
  // FIX 17: every mutation accepts an `idempotencyKey` arg. The key is
  // logged at debug level (helper below) for traceability; full
  // dedupe-via-table is a Sprint 12 follow-up alongside the ledger work.

  // S14-10: BNPL is a growth-tier (or higher) product.
  @RequiresPlan('growth')
  @Mutation(() => MerchantType)
  @AuditAction(AuditActionType.CREATE, AuditResourceType.LENDER)
  @Roles('product:create')
  async createMerchant(
    @CurrentTenant() tenantId: string,
    @Args('input') input: CreateMerchantInput,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<MerchantType> {
    this.logIdempotency('createMerchant', idempotencyKey);
    return (await this.merchantService.create(tenantId, {
      name: input.name,
      code: input.code,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      settlementType: input.settlementType as SettlementTypeGql | undefined,
      discountRate: input.discountRate,
      walletId: input.walletId,
      walletProvider: input.walletProvider,
    })) as unknown as MerchantType;
  }

  // S14-10: BNPL is a growth-tier (or higher) product.
  @RequiresPlan('growth')
  @Mutation(() => MerchantType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.LENDER)
  @Roles('product:update')
  async updateMerchant(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateMerchantInput,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<MerchantType> {
    this.logIdempotency('updateMerchant', idempotencyKey);
    return (await this.merchantService.update(tenantId, id, {
      name: input.name,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      settlementType: input.settlementType as SettlementTypeGql | undefined,
      discountRate: input.discountRate,
      walletId: input.walletId,
      walletProvider: input.walletProvider,
    })) as unknown as MerchantType;
  }

  // S14-10: BNPL is a growth-tier (or higher) product.
  @RequiresPlan('growth')
  @Mutation(() => MerchantType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.LENDER)
  @Roles('product:update')
  async activateMerchant(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<MerchantType> {
    this.logIdempotency('activateMerchant', idempotencyKey);
    return (await this.merchantService.activate(tenantId, id)) as unknown as MerchantType;
  }

  // S14-10: BNPL is a growth-tier (or higher) product.
  @RequiresPlan('growth')
  @Mutation(() => MerchantType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.LENDER)
  @Roles('product:update')
  async suspendMerchant(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
    @Args('reason') reason: string,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<MerchantType> {
    if (!reason?.trim()) {
      throw new ValidationError('Suspension reason is required');
    }
    this.logIdempotency('suspendMerchant', idempotencyKey);
    return (await this.merchantService.suspend(tenantId, id, reason)) as unknown as MerchantType;
  }

  // S14-10: BNPL is a growth-tier (or higher) product.
  @RequiresPlan('growth')
  @Mutation(() => MerchantType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.LENDER)
  @Roles('product:update')
  async reactivateMerchant(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<MerchantType> {
    this.logIdempotency('reactivateMerchant', idempotencyKey);
    return (await this.merchantService.reactivate(tenantId, id)) as unknown as MerchantType;
  }

  // S14-10: BNPL is a growth-tier (or higher) product.
  @RequiresPlan('growth')
  @Mutation(() => MerchantType)
  @AuditAction(AuditActionType.DELETE, AuditResourceType.LENDER)
  @Roles('product:delete')
  async deactivateMerchant(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<MerchantType> {
    this.logIdempotency('deactivateMerchant', idempotencyKey);
    return (await this.merchantService.deactivate(tenantId, id)) as unknown as MerchantType;
  }

  // ────── Internals ──────────────────────────────────────────────────────

  private logIdempotency(mutation: string, key: string): void {
    if (key) {
      // Debug-level only — ledger-backed dedupe lands in Sprint 12.
      // eslint-disable-next-line no-console
      console.debug(`[BnplResolver] ${mutation} idempotencyKey=${key}`);
    }
  }
}
