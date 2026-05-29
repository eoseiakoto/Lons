import {
  Resolver,
  Query,
  Mutation,
  Args,
  ID,
  Int,
  InputType,
  ObjectType,
  Field,
  registerEnumType,
} from '@nestjs/graphql';
import { IsString, IsEnum, IsOptional, Matches } from 'class-validator';

import { Prisma, PrismaService } from '@lons/database';
import { WriteOffService } from '@lons/recovery-service';
import { CurrentTenant, CurrentUser, Roles, IAuthenticatedUser } from '@lons/entity-service';
import { AuditAction, AuditActionType, AuditResourceType } from '@lons/common';

/**
 * S19-8 — write-off approval GraphQL surface.
 *
 * Two enums + four mutations + one query:
 *   - requestWriteOff       (L1 officer)
 *   - approveWriteOff       (L2 manager / L3 director)
 *   - rejectWriteOff        (same — separate mutation for resolver-
 *                            level permission gating per level)
 *   - writeOffApprovals     (list pending + decided rows for a case)
 *
 * Permission gates per S19-1 role matrix:
 *   - L1 recommend            → collections:write_off_recommend
 *   - L2 manager decide       → collections:write_off_approve
 *   - L3 director decide      → collections:write_off_final  (or tenant:admin)
 *   - read                    → collections:read
 */

export enum WriteOffApprovalLevelEnum {
  L1_OFFICER = 'l1_officer',
  L2_MANAGER = 'l2_manager',
  L3_DIRECTOR = 'l3_director',
}
registerEnumType(WriteOffApprovalLevelEnum, { name: 'WriteOffApprovalLevel' });

export enum WriteOffApprovalDecisionEnum {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}
registerEnumType(WriteOffApprovalDecisionEnum, { name: 'WriteOffApprovalDecision' });

@ObjectType()
export class WriteOffApprovalType {
  @Field(() => ID) id!: string;
  @Field(() => ID) caseId!: string;
  @Field(() => WriteOffApprovalLevelEnum) level!: WriteOffApprovalLevelEnum;
  @Field(() => WriteOffApprovalDecisionEnum) decision!: WriteOffApprovalDecisionEnum;
  @Field() amount!: string;
  @Field() currency!: string;
  @Field({ nullable: true }) reason?: string;
  @Field(() => ID, { nullable: true }) actorId?: string;
  @Field({ nullable: true }) decidedAt?: Date;
  @Field() createdAt!: Date;
  @Field() updatedAt!: Date;
}

@InputType()
export class RequestWriteOffInput {
  @Field(() => ID)
  @IsString()
  caseId!: string;

  @Field()
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/, { message: 'amount must be a decimal string up to 4 decimal places' })
  amount!: string;

  @Field()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency!: string;

  @Field()
  @IsString()
  reason!: string;
}

@InputType()
export class DecideWriteOffInput {
  @Field(() => ID)
  @IsString()
  caseId!: string;

  @Field(() => WriteOffApprovalLevelEnum)
  @IsEnum(WriteOffApprovalLevelEnum)
  level!: WriteOffApprovalLevelEnum;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  reason?: string;
}

@Resolver(() => WriteOffApprovalType)
export class WriteOffResolver {
  constructor(
    private readonly writeOffService: WriteOffService,
    private readonly prisma: PrismaService,
  ) {}

  @Query(() => [WriteOffApprovalType])
  @Roles('collections:read')
  async writeOffApprovals(
    @CurrentTenant() tenantId: string,
    @Args('caseId', { type: () => ID }) caseId: string,
  ): Promise<WriteOffApprovalType[]> {
    const rows = await this.prisma.writeOffApproval.findMany({
      where: { caseId, tenantId },
      orderBy: { level: 'asc' },
    });
    return rows.map(this.toGraphql);
  }

  @Mutation(() => WriteOffApprovalType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
  @Roles('collections:write_off_recommend')
  async requestWriteOff(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('input') input: RequestWriteOffInput,
  ): Promise<WriteOffApprovalType> {
    const result = await this.writeOffService.requestWriteOff(
      tenantId,
      input.caseId,
      new Prisma.Decimal(input.amount),
      input.currency,
      input.reason,
      user.userId,
    );
    return this.toGraphql(result);
  }

  @Mutation(() => WriteOffApprovalType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
  // collections:write_off_approve covers L2 (manager). L3 requires
  // collections:write_off_final OR tenant:admin — enforced in the
  // service body by re-checking the caller's permissions list, since
  // @Roles can't express "either of these two perms".
  @Roles('collections:write_off_approve')
  async approveWriteOff(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('input') input: DecideWriteOffInput,
  ): Promise<WriteOffApprovalType> {
    if (input.level === WriteOffApprovalLevelEnum.L3_DIRECTOR) {
      this.assertL3Permission(user);
    }
    const result = await this.writeOffService.decideWriteOff(
      tenantId,
      input.caseId,
      input.level,
      'approved',
      user.userId,
      input.reason,
    );
    return this.toGraphql(result);
  }

  @Mutation(() => WriteOffApprovalType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
  @Roles('collections:write_off_approve')
  async rejectWriteOff(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('input') input: DecideWriteOffInput,
  ): Promise<WriteOffApprovalType> {
    if (input.level === WriteOffApprovalLevelEnum.L3_DIRECTOR) {
      this.assertL3Permission(user);
    }
    const result = await this.writeOffService.decideWriteOff(
      tenantId,
      input.caseId,
      input.level,
      'rejected',
      user.userId,
      input.reason,
    );
    return this.toGraphql(result);
  }

  private assertL3Permission(user: IAuthenticatedUser): void {
    const perms = user.permissions ?? [];
    if (!perms.includes('collections:write_off_final') && !perms.includes('tenant:admin') && !perms.includes('*')) {
      throw new Error('L3 director approval requires collections:write_off_final or tenant:admin permission');
    }
  }

  private toGraphql = (row: any): WriteOffApprovalType => ({
    id: row.id,
    caseId: row.caseId,
    level: row.level,
    decision: row.decision,
    amount: row.amount.toString(),
    currency: row.currency,
    reason: row.reason ?? undefined,
    actorId: row.actorId ?? undefined,
    decidedAt: row.decidedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
