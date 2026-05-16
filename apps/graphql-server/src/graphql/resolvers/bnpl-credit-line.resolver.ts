import {
  Args,
  ID,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';

import { AuditAction, NotFoundError, RequiresPlan, compare } from '@lons/common';
import { PrismaService, BnplCreditLineStatus } from '@lons/database';
import {
  BnplCreditLineService,
  BnplCreditLineAdjustmentService,
  CurrentTenant,
  CurrentUser,
  IAuthenticatedUser,
  Roles,
} from '@lons/entity-service';

import {
  BnplCreditLineType,
  BnplCreditLineAdjustmentType,
  BnplCreditLineStatusGql,
} from '../types/bnpl-credit-line.type';
import {
  AdjustBnplCreditLimitInput,
  CreateBnplCreditLineInput,
  UpdateBnplCreditLineStatusInput,
} from '../inputs/bnpl-credit-line.input';

/**
 * Sprint 15 (S15-1, S15-2) — GraphQL surface for BNPL credit lines.
 *
 * Read queries are open to anyone with `bnpl_credit_line:read`; the
 * dangerous mutations (status changes, manual adjustments) require the
 * tighter `bnpl_credit_line:adjust` permission so a front-office user
 * with read access can't accidentally close a customer's line.
 */
@Resolver(() => BnplCreditLineType)
export class BnplCreditLineResolver {
  constructor(
    private readonly creditLineService: BnplCreditLineService,
    private readonly adjustmentService: BnplCreditLineAdjustmentService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Queries ─────────────────────────────────────────────────────────

  @Query(() => BnplCreditLineType, { nullable: true })
  @Roles('bnpl_credit_line:read')
  @RequiresPlan('growth')
  async bnplCreditLine(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<BnplCreditLineType | null> {
    const line = await this.creditLineService.findById(tenantId, id);
    return line as unknown as BnplCreditLineType | null;
  }

  @Query(() => [BnplCreditLineType])
  @Roles('bnpl_credit_line:read')
  @RequiresPlan('growth')
  async bnplCreditLinesByCustomer(
    @CurrentTenant() tenantId: string,
    @Args('customerId', { type: () => ID }) customerId: string,
  ): Promise<BnplCreditLineType[]> {
    const lines = await this.creditLineService.findByCustomerId(
      tenantId,
      customerId,
    );
    return lines as unknown as BnplCreditLineType[];
  }

  @Query(() => BnplCreditLineType, { nullable: true })
  @Roles('bnpl_credit_line:read')
  @RequiresPlan('growth')
  async bnplCreditLineBySubscription(
    @CurrentTenant() tenantId: string,
    @Args('subscriptionId', { type: () => ID }) subscriptionId: string,
  ): Promise<BnplCreditLineType | null> {
    const line = await this.creditLineService.findBySubscriptionId(
      tenantId,
      subscriptionId,
    );
    return line as unknown as BnplCreditLineType | null;
  }

  // ── Mutations ───────────────────────────────────────────────────────

  @Mutation(() => BnplCreditLineType)
  @Roles('bnpl_credit_line:create')
  @RequiresPlan('growth')
  @AuditAction('create.bnplCreditLine', 'bnpl_credit_line')
  async createBnplCreditLine(
    @CurrentTenant() tenantId: string,
    @Args('input') input: CreateBnplCreditLineInput,
  ): Promise<BnplCreditLineType> {
    const created = await this.creditLineService.create(tenantId, input);
    return created as unknown as BnplCreditLineType;
  }

  @Mutation(() => BnplCreditLineType)
  @Roles('bnpl_credit_line:adjust')
  @RequiresPlan('growth')
  @AuditAction('update.bnplCreditLineStatus', 'bnpl_credit_line')
  async updateBnplCreditLineStatus(
    @CurrentTenant() tenantId: string,
    @Args('input') input: UpdateBnplCreditLineStatusInput,
  ): Promise<BnplCreditLineType> {
    const updated = await this.creditLineService.updateStatus(
      tenantId,
      input.id,
      input.status as unknown as BnplCreditLineStatus,
      input.reason,
      input.idempotencyKey,
    );
    return updated as unknown as BnplCreditLineType;
  }

  /**
   * Manual operator adjustment — bypasses the cooldown enforced by the
   * automated trigger path. Records an immutable adjustment row.
   */
  @Mutation(() => BnplCreditLineAdjustmentType)
  @Roles('bnpl_credit_line:adjust')
  @RequiresPlan('growth')
  @AuditAction('adjust.bnplCreditLimit', 'bnpl_credit_line')
  async adjustBnplCreditLimit(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('input') input: AdjustBnplCreditLimitInput,
  ): Promise<BnplCreditLineAdjustmentType> {
    const line = await this.creditLineService.findById(
      tenantId,
      input.creditLineId,
    );
    if (!line) {
      throw new NotFoundError('BnplCreditLine', input.creditLineId);
    }
    // FIX-1: Decimal compare instead of lexicographic string `>` which
    // mis-ranks `"9" > "1000"` as true.
    const direction =
      compare(input.newLimit, String(line.approvedLimit)) > 0
        ? 'increase'
        : 'decrease';
    const adjustment = await this.adjustmentService.adjustCreditLimit(
      tenantId,
      input.creditLineId,
      input.newLimit,
      {
        adjustmentType: direction,
        reasonCode: input.reasonCode,
        reasonDetail: input.reasonDetail,
        triggeredBy: `operator:${user.userId}`,
        idempotencyKey: input.idempotencyKey,
      },
    );
    return adjustment as unknown as BnplCreditLineAdjustmentType;
  }

  // ── Field resolvers ─────────────────────────────────────────────────

  /** Adjustment audit trail (most-recent 50, newest first). */
  @ResolveField(() => [BnplCreditLineAdjustmentType])
  async adjustments(
    @Parent() line: BnplCreditLineType,
  ): Promise<BnplCreditLineAdjustmentType[]> {
    const rows = await this.prisma.bnplCreditLineAdjustment.findMany({
      where: { tenantId: line.tenantId, creditLineId: line.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return rows as unknown as BnplCreditLineAdjustmentType[];
  }

  // Suppress unused enum warning — the import below is referenced via
  // the schema registration of BnplCreditLineStatusGql.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private readonly _statusGql = BnplCreditLineStatusGql;
}
