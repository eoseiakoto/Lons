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
import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsDateString,
  Matches,
} from 'class-validator';
import { Prisma } from '@lons/database';

import {
  CollectionsCaseService,
  CollectionsStateMachine,
} from '@lons/recovery-service';
import {
  CurrentTenant,
  CurrentUser,
  Roles,
  IAuthenticatedUser,
} from '@lons/entity-service';
import { AuditAction, AuditActionType, AuditResourceType } from '@lons/common';

/**
 * S19-5 — GraphQL surface for the new collections workflow.
 *
 * Distinct from the legacy CollectionsResolver (which deals with the
 * append-only CollectionsAction log). The new flow is case-centric:
 * each contract enters a stateful case that progresses through the
 * workflow defined by CollectionsStateMachine.
 *
 * Permissions follow the SP Collections / SP Collections Manager
 * matrix seeded in S19-1:
 *   - collections:read       — list + get (officer + manager + analyst + auditor)
 *   - collections:create     — open a case manually
 *   - collections:transition — move between states (close, escalate)
 *   - collections:assign     — reassign cases between officers
 *   - collections:ptp        — record promise-to-pay
 *   - collections:update     — record contact attempts
 *   - tenant:update          — write CollectionsWorkflowConfig
 */

// ── Enum registration ────────────────────────────────────────────────
//
// GraphQL needs the literal-string enum exported as a real TS enum
// for the schema. Keep these values verbatim aligned with the
// Prisma CollectionsStatus enum.
export enum CollectionsStatusEnum {
  NEW = 'new',
  CONTACTED = 'contacted',
  PROMISE_TO_PAY = 'promise_to_pay',
  BROKEN_PTP = 'broken_ptp',
  ESCALATED = 'escalated',
  LEGAL = 'legal',
  WRITE_OFF_PENDING = 'write_off_pending',
  WRITTEN_OFF = 'written_off',
  RECOVERED = 'recovered',
  CLOSED = 'closed',
}
registerEnumType(CollectionsStatusEnum, { name: 'CollectionsStatus' });

// ── Object types ─────────────────────────────────────────────────────

@ObjectType()
export class CollectionsCaseTransitionType {
  @Field(() => ID) id!: string;
  @Field(() => CollectionsStatusEnum) fromStatus!: CollectionsStatusEnum;
  @Field(() => CollectionsStatusEnum) toStatus!: CollectionsStatusEnum;
  @Field({ nullable: true }) reason?: string;
  @Field(() => ID) actorId!: string;
  @Field() actorType!: string;
  @Field() createdAt!: Date;
}

@ObjectType()
export class CollectionsCaseType {
  @Field(() => ID) id!: string;
  @Field(() => ID) contractId!: string;
  @Field(() => ID) customerId!: string;
  @Field(() => CollectionsStatusEnum) status!: CollectionsStatusEnum;
  @Field(() => CollectionsStatusEnum, { nullable: true })
  previousStatus?: CollectionsStatusEnum;
  @Field(() => ID, { nullable: true }) assignedToId?: string;
  @Field(() => Int) priority!: number;
  /** Money as string per CLAUDE.md money rule */
  @Field() outstandingAmount!: string;
  @Field() currentOutstanding!: string;
  @Field() currency!: string;
  @Field(() => Int) dpdAtEntry!: number;
  @Field(() => Int) currentDpd!: number;
  @Field({ nullable: true }) ptpDate?: Date;
  @Field({ nullable: true }) ptpAmount?: string;
  @Field(() => Int, { nullable: true }) ptpGraceDays?: number;
  @Field(() => Int) escalationLevel!: number;
  @Field({ nullable: true }) statusReason?: string;
  @Field({ nullable: true }) writeOffApprovalStatus?: string;
  @Field({ nullable: true }) writeOffAmount?: string;
  @Field({ nullable: true }) lastContactAt?: Date;
  @Field({ nullable: true }) nextActionDate?: Date;
  @Field(() => Int) contactAttempts!: number;
  @Field({ nullable: true }) closedAt?: Date;
  @Field({ nullable: true }) closedReason?: string;
  @Field() createdAt!: Date;
  @Field() updatedAt!: Date;
  /** Populated only by `collectionsCase(id)` — the list query omits transitions to keep payloads light. */
  @Field(() => [CollectionsCaseTransitionType], { nullable: true })
  transitions?: CollectionsCaseTransitionType[];
}

@ObjectType()
export class CollectionsCaseListResult {
  @Field(() => [CollectionsCaseType]) items!: CollectionsCaseType[];
  @Field() hasMore!: boolean;
}

@ObjectType()
export class CollectionsWorkflowConfigType {
  @Field(() => ID) id!: string;
  /** Stored as JSON in the DB; surfaced as a JSON string for the client to parse. */
  @Field() transitionsJson!: string;
  @Field({ nullable: true }) autoEscalationJson?: string;
  @Field(() => Int) ptpGraceDays!: number;
  @Field(() => Int) autoCaseCreationDpd!: number;
  @Field(() => Int) maxContactAttempts!: number;
  @Field() createdAt!: Date;
  @Field() updatedAt!: Date;
}

// ── Input types ──────────────────────────────────────────────────────

@InputType()
export class CreateCollectionsCaseInput {
  @Field(() => ID)
  @IsString()
  contractId!: string;

  @Field(() => ID)
  @IsString()
  customerId!: string;

  // Money as STRING per CLAUDE.md. Validate it parses as a positive decimal.
  @Field()
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/, { message: 'outstandingAmount must be a decimal string with up to 4 decimal places' })
  outstandingAmount!: string;

  @Field()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency!: string;

  @Field(() => Int)
  @IsInt()
  @Min(0)
  currentDpd!: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  priority?: number;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsString()
  assignedToId?: string;
}

@InputType()
export class CollectionsCaseFiltersInput {
  @Field(() => CollectionsStatusEnum, { nullable: true })
  @IsOptional()
  @IsEnum(CollectionsStatusEnum)
  status?: CollectionsStatusEnum;

  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsString()
  assignedToId?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  minDpd?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxDpd?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  priority?: number;
}

@InputType()
export class PtpInput {
  @Field()
  @IsDateString()
  ptpDate!: string;

  @Field()
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/, { message: 'ptpAmount must be a decimal string' })
  ptpAmount!: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  graceDays?: number;
}

@InputType()
export class ContactAttemptInput {
  @Field()
  @IsString()
  contactMethod!: string;

  @Field()
  @IsString()
  notes!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  outcome?: string;
}

// ── Resolver ─────────────────────────────────────────────────────────

@Resolver(() => CollectionsCaseType)
export class CollectionsCaseResolver {
  constructor(
    private readonly caseService: CollectionsCaseService,
    private readonly stateMachine: CollectionsStateMachine,
  ) {}

  @Query(() => CollectionsCaseListResult)
  @Roles('collections:read')
  async collectionsCases(
    @CurrentTenant() tenantId: string,
    @Args('filters', { type: () => CollectionsCaseFiltersInput, nullable: true })
    filters?: CollectionsCaseFiltersInput,
    @Args('first', { type: () => Int, nullable: true, defaultValue: 20 }) first?: number,
    @Args('after', { nullable: true }) after?: string,
  ): Promise<CollectionsCaseListResult> {
    const result = await this.caseService.findMany(
      tenantId,
      filters ?? {},
      Math.min(first ?? 20, 100),
      after,
    );
    return {
      items: result.items.map(this.toGraphql),
      hasMore: result.hasMore,
    };
  }

  @Query(() => CollectionsCaseType)
  @Roles('collections:read')
  async collectionsCase(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<CollectionsCaseType> {
    const collectionsCase = await this.caseService.findById(tenantId, id);
    return this.toGraphql(collectionsCase);
  }

  @Query(() => CollectionsCaseType, { nullable: true })
  @Roles('collections:read')
  async collectionsCaseByContract(
    @CurrentTenant() tenantId: string,
    @Args('contractId', { type: () => ID }) contractId: string,
  ): Promise<CollectionsCaseType | null> {
    const result = await this.caseService.findByContract(tenantId, contractId);
    return result ? this.toGraphql(result) : null;
  }

  @Mutation(() => CollectionsCaseType)
  @AuditAction(AuditActionType.CREATE, AuditResourceType.CONTRACT)
  @Roles('collections:create')
  async createCollectionsCase(
    @CurrentTenant() tenantId: string,
    @Args('input') input: CreateCollectionsCaseInput,
  ): Promise<CollectionsCaseType> {
    const created = await this.caseService.createCase(tenantId, {
      contractId: input.contractId,
      customerId: input.customerId,
      outstandingAmount: new Prisma.Decimal(input.outstandingAmount),
      currency: input.currency,
      currentDpd: input.currentDpd,
      priority: input.priority,
      assignedToId: input.assignedToId,
    });
    return this.toGraphql(created);
  }

  @Mutation(() => CollectionsCaseType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
  @Roles('collections:transition')
  async transitionCollectionsCase(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('caseId', { type: () => ID }) caseId: string,
    @Args('toStatus', { type: () => CollectionsStatusEnum }) toStatus: CollectionsStatusEnum,
    @Args('reason', { nullable: true }) reason?: string,
  ): Promise<CollectionsCaseType> {
    const result = await this.stateMachine.transition(
      tenantId,
      caseId,
      toStatus,
      user.userId,
      'user',
      reason,
    );
    return this.toGraphql(result);
  }

  @Mutation(() => CollectionsCaseType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
  @Roles('collections:assign')
  async assignCollectionsCase(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('caseId', { type: () => ID }) caseId: string,
    @Args('assignToId', { type: () => ID }) assignToId: string,
  ): Promise<CollectionsCaseType> {
    const result = await this.caseService.assignCase(tenantId, caseId, assignToId, user.userId);
    return this.toGraphql(result);
  }

  @Mutation(() => CollectionsCaseType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
  @Roles('collections:ptp')
  async recordPromiseToPay(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('caseId', { type: () => ID }) caseId: string,
    @Args('input') input: PtpInput,
  ): Promise<CollectionsCaseType> {
    const result = await this.caseService.recordPtp(
      tenantId,
      caseId,
      new Date(input.ptpDate),
      new Prisma.Decimal(input.ptpAmount),
      user.userId,
      input.graceDays,
    );
    return this.toGraphql(result);
  }

  @Mutation(() => CollectionsCaseType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
  @Roles('collections:update')
  async recordContactAttempt(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('caseId', { type: () => ID }) caseId: string,
    @Args('input') input: ContactAttemptInput,
  ): Promise<CollectionsCaseType> {
    const result = await this.caseService.recordContact(
      tenantId,
      caseId,
      user.userId,
      input.contactMethod,
      input.notes,
    );
    return this.toGraphql(result);
  }

  @Mutation(() => CollectionsCaseType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.CONTRACT)
  @Roles('collections:transition')
  async closeCollectionsCase(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('caseId', { type: () => ID }) caseId: string,
    @Args('reason') reason: string,
  ): Promise<CollectionsCaseType> {
    const result = await this.caseService.closeCase(tenantId, caseId, user.userId, reason);
    return this.toGraphql(result);
  }

  // ── Helper ─────────────────────────────────────────────────────────

  /**
   * Convert Prisma row → GraphQL type. Decimal money → string per
   * CLAUDE.md. JSON metadata field is intentionally NOT surfaced (use
   * a dedicated resolver field later if a client needs it).
   */
  private toGraphql = (row: any): CollectionsCaseType => ({
    id: row.id,
    contractId: row.contractId,
    customerId: row.customerId,
    status: row.status,
    previousStatus: row.previousStatus ?? undefined,
    assignedToId: row.assignedToId ?? undefined,
    priority: row.priority,
    outstandingAmount: row.outstandingAmount.toString(),
    currentOutstanding: row.currentOutstanding.toString(),
    currency: row.currency,
    dpdAtEntry: row.dpdAtEntry,
    currentDpd: row.currentDpd,
    ptpDate: row.ptpDate ?? undefined,
    ptpAmount: row.ptpAmount?.toString(),
    ptpGraceDays: row.ptpGraceDays ?? undefined,
    escalationLevel: row.escalationLevel,
    statusReason: row.statusReason ?? undefined,
    writeOffApprovalStatus: row.writeOffApprovalStatus ?? undefined,
    writeOffAmount: row.writeOffAmount?.toString(),
    lastContactAt: row.lastContactAt ?? undefined,
    nextActionDate: row.nextActionDate ?? undefined,
    contactAttempts: row.contactAttempts,
    closedAt: row.closedAt ?? undefined,
    closedReason: row.closedReason ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    transitions: row.transitions?.map((t: any) => ({
      id: t.id,
      fromStatus: t.fromStatus,
      toStatus: t.toStatus,
      reason: t.reason ?? undefined,
      actorId: t.actorId,
      actorType: t.actorType,
      createdAt: t.createdAt,
    })),
  });
}
