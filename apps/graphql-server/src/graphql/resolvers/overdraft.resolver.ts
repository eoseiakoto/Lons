import { Resolver, Query, Mutation, Args, ID } from '@nestjs/graphql';
import { Inject, Logger, Optional } from '@nestjs/common';
import { encodeCursor, AuditAction, AuditActionType, AuditResourceType, NotFoundError, add } from '@lons/common';
import { PrismaService } from '@lons/database';
import { CurrentTenant, CurrentUser, Roles, IAuthenticatedUser } from '@lons/entity-service';
import {
  CreditLineService,
  RepaymentService,
  WALLET_DISBURSEMENT_ADAPTER,
  WALLET_COLLECTION_ADAPTER,
  type WalletCollectionAdapter,
} from '@lons/overdraft-service';
import { ScoringService } from '@lons/process-engine';
import type { MoneyString } from '@lons/shared-types';

import {
  CreditLineType,
  CreditLineConnection,
  CreditLineBalanceType,
  DrawdownConnection,
  ActivationResultType,
  DeactivationResultType,
  OverdraftRepaymentResultType,
} from '../types/credit-line.type';

/**
 * Fallback adapter used only when no real adapter is registered via DI.
 * Sprint 11 wires `MockWalletCollectionAdapter` from the overdraft service
 * by default (env `WALLET_ADAPTER_MODE=mock`), so this should never be
 * exercised in normal operation. Kept as a safety net so the resolver can
 * still respond with a clear error if the module wiring breaks.
 */
const NULL_COLLECTION_ADAPTER: WalletCollectionAdapter = {
  async collect() {
    return { success: false, reason: 'No wallet collection adapter registered' };
  },
};

/**
 * Sprint 10B Task 11: GraphQL surface for overdraft.
 *
 * Read queries:
 *   - `creditLine(customerId, productCode)` — single line by customer + product
 *   - `creditLineBalance(creditLineId)` — light snapshot for SP wallet apps
 *   - `drawdownHistory(creditLineId, first, after)` — paginated drawdowns
 *   - `creditLines(filters, first, after)` — admin list view
 *
 * Mutations (idempotency-key required):
 *   - `activateOverdraftSubscription` — onboard a customer onto an overdraft
 *     product. Internally invokes the credit-line service.
 *   - `deactivateOverdraftSubscription` — close a credit line (zero-balance).
 *   - `makeOverdraftRepayment` — manual repayment with waterfall allocation.
 *   - `freezeCreditLine` / `unfreezeCreditLine` — admin actions.
 *   - `adjustCreditLimit` — limit change with audit trail.
 *   - `waiveOverdraftPenalties` — operator waiver with reason.
 *
 * All money fields use `String` (Decimal) per Sprint 10A P0-001. All
 * resolvers are protected by AuthGuard + RolesGuard from the global wiring
 * in `AuthModule` (Sprint 10A P0-003).
 */
@Resolver(() => CreditLineType)
export class OverdraftResolver {
  private readonly collectionAdapter: WalletCollectionAdapter;
  private readonly logger = new Logger('OverdraftResolver');

  constructor(
    private readonly prisma: PrismaService,
    private readonly creditLineService: CreditLineService,
    private readonly repaymentService: RepaymentService,
    @Optional() private readonly scoringService?: ScoringService,
    @Optional() @Inject(WALLET_DISBURSEMENT_ADAPTER) _disburseAdapter?: unknown,
    @Optional() @Inject(WALLET_COLLECTION_ADAPTER) collectAdapter?: WalletCollectionAdapter,
  ) {
    this.collectionAdapter = collectAdapter ?? NULL_COLLECTION_ADAPTER;
  }

  // ────── Queries ────────────────────────────────────────────────────────

  @Query(() => CreditLineType, { nullable: true })
  @Roles('contract:read')
  async creditLine(
    @CurrentTenant() tenantId: string,
    @Args('customerId', { type: () => ID }) customerId: string,
    @Args('productCode') productCode: string,
  ): Promise<CreditLineType | null> {
    const product = await this.prisma.product.findFirst({
      where: { tenantId, code: productCode },
      select: { id: true },
    });
    if (!product) return null;
    const cl = await this.prisma.creditLine.findUnique({
      where: { tenantId_customerId_productId: { tenantId, customerId, productId: product.id } },
    });
    return cl as unknown as CreditLineType | null;
  }

  @Query(() => CreditLineBalanceType)
  @Roles('contract:read')
  async creditLineBalance(
    @CurrentTenant() tenantId: string,
    @Args('creditLineId', { type: () => ID }) creditLineId: string,
  ): Promise<CreditLineBalanceType> {
    const cl = await this.creditLineService.requireCreditLine(tenantId, creditLineId);
    const totalOwed = add(
      add(String(cl.outstandingAmount), String(cl.interestAccrued)),
      add(String(cl.feesOutstanding), String(cl.penaltiesAccrued)),
    );
    return {
      creditLineId,
      approvedLimit: String(cl.approvedLimit),
      availableBalance: String(cl.availableBalance),
      outstandingAmount: String(cl.outstandingAmount),
      interestAccrued: String(cl.interestAccrued),
      feesOutstanding: String(cl.feesOutstanding),
      penaltiesAccrued: String(cl.penaltiesAccrued),
      totalOwed,
    };
  }

  @Query(() => DrawdownConnection)
  @Roles('contract:read')
  async drawdownHistory(
    @CurrentTenant() tenantId: string,
    @Args('creditLineId', { type: () => ID }) creditLineId: string,
    @Args('first', { nullable: true }) first?: number,
    @Args('after', { nullable: true }) after?: string,
  ): Promise<DrawdownConnection> {
    const take = first ?? 20;
    const items = await this.prisma.drawdown.findMany({
      where: { tenantId, creditLineId },
      take: take + 1,
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });
    const hasMore = items.length > take;
    const sliced = items.slice(0, take);
    return {
      edges: sliced.map((d) => ({
        node: d as unknown as DrawdownConnection['edges'][number]['node'],
        cursor: encodeCursor(d.id),
      })),
      pageInfo: {
        hasNextPage: hasMore,
        hasPreviousPage: !!after,
        startCursor: sliced.length > 0 ? encodeCursor(sliced[0].id) : undefined,
        endCursor: sliced.length > 0 ? encodeCursor(sliced[sliced.length - 1].id) : undefined,
      },
      totalCount: sliced.length,
    };
  }

  @Query(() => CreditLineConnection)
  @Roles('contract:read')
  async creditLines(
    @CurrentTenant() tenantId: string,
    @Args('first', { nullable: true }) first?: number,
    @Args('after', { nullable: true }) after?: string,
    @Args('status', { nullable: true }) status?: string,
    @Args('customerId', { type: () => ID, nullable: true }) customerId?: string,
  ): Promise<CreditLineConnection> {
    const take = first ?? 20;
    const items = await this.prisma.creditLine.findMany({
      where: {
        tenantId,
        ...(status ? { status: status as any } : {}),
        ...(customerId ? { customerId } : {}),
      },
      take: take + 1,
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });
    const hasMore = items.length > take;
    const sliced = items.slice(0, take);
    return {
      edges: sliced.map((c) => ({
        node: c as unknown as CreditLineType,
        cursor: encodeCursor(c.id),
      })),
      pageInfo: {
        hasNextPage: hasMore,
        hasPreviousPage: !!after,
        startCursor: sliced.length > 0 ? encodeCursor(sliced[0].id) : undefined,
        endCursor: sliced.length > 0 ? encodeCursor(sliced[sliced.length - 1].id) : undefined,
      },
      totalCount: sliced.length,
    };
  }

  // ────── Mutations ──────────────────────────────────────────────────────

  @Mutation(() => ActivationResultType)
  @AuditAction(AuditActionType.CREATE, AuditResourceType.CONTRACT)
  @Roles('subscription:create')
  async activateOverdraftSubscription(
    @CurrentTenant() tenantId: string,
    @Args('customerId', { type: () => ID }) customerId: string,
    @Args('productCode') productCode: string,
    @Args('idempotencyKey') _idempotencyKey: string,
    @Args('recommendedLimit', { type: () => String, nullable: true }) recommendedLimit?: MoneyString,
  ): Promise<ActivationResultType> {
    // SPEC §5.1 steps 3-5: pre-qualification + scoring + approval. The
    // resolver-level flow:
    //   1. If operator supplies `recommendedLimit`, honour it (manual override
    //      from an admin approval workflow). Bypass scoring.
    //   2. Otherwise call the scoring engine and use its `recommendedLimit`.
    //   3. If scoring is unavailable (service not registered, scoring throws),
    //      degrade to `product.maxAmount` so activation isn't blocked on a
    //      transient downstream issue. The credit-line service still applies
    //      `product.minAmount`/`product.maxAmount` bounds (Sprint 10B F1).
    const product = await this.prisma.product.findFirstOrThrow({
      where: { tenantId, code: productCode },
      select: { id: true, maxAmount: true },
    });
    const fallbackLimit = String(product.maxAmount ?? '0');

    let limit: string;
    if (recommendedLimit) {
      limit = recommendedLimit;
    } else if (this.scoringService) {
      try {
        const result = await this.scoringService.scoreCustomer(
          tenantId,
          customerId,
          product.id,
          'application',
          fallbackLimit,
        );
        limit = String(result.recommendedLimit ?? fallbackLimit);
      } catch (err) {
        this.logger.warn(
          `Scoring service failed for customer ${customerId.slice(0, 8)}…: ${err instanceof Error ? err.message : err} — falling back to product.maxAmount`,
        );
        limit = fallbackLimit;
      }
    } else {
      limit = fallbackLimit;
    }

    // The credit-line service populates the wallet→customer mapping
    // itself (FIX 3 / Sprint 11 A10), so every activation path — not
    // just GraphQL — backfills the lookup table.
    return this.creditLineService.activateCreditLine(tenantId, {
      customerId,
      productCode,
      recommendedLimit: limit,
      triggeredBy: 'graphql:activateOverdraftSubscription',
    });
  }

  @Mutation(() => DeactivationResultType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
  @Roles('subscription:update')
  async deactivateOverdraftSubscription(
    @CurrentTenant() tenantId: string,
    @Args('creditLineId', { type: () => ID }) creditLineId: string,
    @Args('idempotencyKey') _idempotencyKey: string,
  ): Promise<DeactivationResultType> {
    await this.creditLineService.deactivateCreditLine(tenantId, creditLineId);
    return { creditLineId, success: true };
  }

  @Mutation(() => OverdraftRepaymentResultType)
  @AuditAction(AuditActionType.REPAYMENT, AuditResourceType.REPAYMENT)
  @Roles('repayment:create')
  async makeOverdraftRepayment(
    @CurrentTenant() tenantId: string,
    @Args('creditLineId', { type: () => ID }) creditLineId: string,
    @Args('amount') amount: MoneyString,
    @Args('idempotencyKey') _idempotencyKey: string,
  ): Promise<OverdraftRepaymentResultType> {
    const cl = await this.prisma.creditLine.findFirst({
      where: { id: creditLineId, tenantId },
      include: { customer: { select: { metadata: true } } },
    });
    if (!cl) throw new NotFoundError('CreditLine', creditLineId);
    const walletId = String(
      (cl.customer.metadata as Record<string, unknown> | null)?.walletId ?? '',
    );
    if (!walletId) {
      throw new Error('Customer has no walletId in metadata; cannot collect manual repayment');
    }
    const result = await this.repaymentService.processManualRepayment(
      tenantId,
      { creditLineId, amount, walletId },
      this.collectionAdapter,
    );
    return {
      creditLineId: result.creditLineId,
      totalCollected: result.totalAllocated,
      allocatedPenalties: result.allocatedPenalties,
      allocatedInterest: result.allocatedInterest,
      allocatedFees: result.allocatedFees,
      allocatedPrincipal: result.allocatedPrincipal,
    };
  }

  @Mutation(() => CreditLineType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
  @Roles('contract:update')
  async freezeCreditLine(
    @CurrentTenant() tenantId: string,
    @Args('creditLineId', { type: () => ID }) creditLineId: string,
    @Args('reason') reason: string,
    @Args('idempotencyKey') _idempotencyKey: string,
  ): Promise<CreditLineType> {
    return this.creditLineService.freeze(tenantId, creditLineId, reason) as unknown as Promise<CreditLineType>;
  }

  @Mutation(() => CreditLineType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
  @Roles('contract:update')
  async unfreezeCreditLine(
    @CurrentTenant() tenantId: string,
    @Args('creditLineId', { type: () => ID }) creditLineId: string,
    @Args('idempotencyKey') _idempotencyKey: string,
  ): Promise<CreditLineType> {
    return this.creditLineService.unfreeze(tenantId, creditLineId) as unknown as Promise<CreditLineType>;
  }

  @Mutation(() => CreditLineType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
  @Roles('contract:update')
  async adjustCreditLimit(
    @CurrentTenant() tenantId: string,
    @Args('creditLineId', { type: () => ID }) creditLineId: string,
    @Args('newLimit') newLimit: MoneyString,
    @Args('reasonCode') reasonCode: string,
    @Args('idempotencyKey') _idempotencyKey: string,
    @Args('reasonDetail', { nullable: true }) reasonDetail?: string,
  ): Promise<CreditLineType> {
    return this.creditLineService.adjustLimit(tenantId, creditLineId, {
      newLimit,
      reasonCode,
      reasonDetail,
      triggeredBy: 'graphql:adjustCreditLimit',
    }) as unknown as Promise<CreditLineType>;
  }

  @Mutation(() => CreditLineType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
  @Roles('contract:update')
  async waiveOverdraftPenalties(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('creditLineId', { type: () => ID }) creditLineId: string,
    @Args('amount') amount: MoneyString,
    @Args('reason') reason: string,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<CreditLineType> {
    return this.creditLineService.waivePenalties(tenantId, creditLineId, {
      amount,
      reason,
      operatorId: user.userId,
      idempotencyKey,
    }) as unknown as Promise<CreditLineType>;
  }
}
