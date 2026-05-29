import {
  Resolver,
  Query,
  Mutation,
  Args,
  ID,
  ObjectType,
  InputType,
  Field,
  registerEnumType,
} from '@nestjs/graphql';
import { IsString, IsBoolean, IsOptional, IsEnum, Matches } from 'class-validator';

import { Prisma, PrismaService } from '@lons/database';
import { parseRateTiers } from '@lons/repayment-service';
import { CurrentTenant, Roles } from '@lons/entity-service';
import { AuditAction, AuditActionType, AuditResourceType, ValidationError } from '@lons/common';

/**
 * S19-6 — admin surface for PenaltyConfig (per-product penalty
 * mode + rate tiers + cap). The scheduler reads these rows on each
 * accrual run; the resolver only manages CRUD.
 *
 * `rateTiers` is stored as JSON; we surface it both as a typed
 * GraphQL list of tiers (for the admin UI to render a tier editor)
 * AND as a JSON string round-trip for advanced operators who want
 * the raw shape. Validation happens via parseRateTiers from the
 * repayment-service module.
 */

export enum PenaltyModeEnum {
  SIMPLE = 'simple',
  COMPOUND = 'compound',
}
registerEnumType(PenaltyModeEnum, { name: 'PenaltyMode' });

@ObjectType()
export class PenaltyRateTierType {
  @Field(() => Number) fromDpd!: number;
  @Field(() => Number, { nullable: true }) toDpd?: number | null;
  @Field() dailyRateBps!: string;
}

@ObjectType()
export class PenaltyConfigType {
  @Field(() => ID) id!: string;
  @Field(() => ID) productId!: string;
  @Field(() => PenaltyModeEnum) mode!: PenaltyModeEnum;
  @Field(() => [PenaltyRateTierType]) rateTiers!: PenaltyRateTierType[];
  @Field({ nullable: true }) maxPenaltyPct?: string;
  @Field({ nullable: true }) compoundingFrequency?: string;
  @Field() isActive!: boolean;
  @Field() createdAt!: Date;
  @Field() updatedAt!: Date;
}

@InputType()
export class PenaltyRateTierInput {
  @Field(() => Number)
  fromDpd!: number;

  @Field(() => Number, { nullable: true })
  @IsOptional()
  toDpd?: number;

  @Field()
  @IsString()
  @Matches(/^\d+(\.\d+)?$/, { message: 'dailyRateBps must be a decimal string' })
  dailyRateBps!: string;
}

@InputType()
export class PenaltyConfigInput {
  @Field(() => ID)
  @IsString()
  productId!: string;

  @Field(() => PenaltyModeEnum)
  @IsEnum(PenaltyModeEnum)
  mode!: PenaltyModeEnum;

  @Field(() => [PenaltyRateTierInput])
  rateTiers!: PenaltyRateTierInput[];

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  maxPenaltyPct?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  compoundingFrequency?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@Resolver(() => PenaltyConfigType)
export class PenaltyConfigResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [PenaltyConfigType])
  @Roles('product:read')
  async penaltyConfigs(@CurrentTenant() tenantId: string): Promise<PenaltyConfigType[]> {
    const rows = await this.prisma.penaltyConfig.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(this.toGraphql);
  }

  @Query(() => PenaltyConfigType, { nullable: true })
  @Roles('product:read')
  async penaltyConfig(
    @CurrentTenant() tenantId: string,
    @Args('productId', { type: () => ID }) productId: string,
  ): Promise<PenaltyConfigType | null> {
    const row = await this.prisma.penaltyConfig.findUnique({
      where: { tenantId_productId: { tenantId, productId } },
    });
    return row ? this.toGraphql(row) : null;
  }

  @Mutation(() => PenaltyConfigType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.PRODUCT)
  @Roles('product:update')
  async upsertPenaltyConfig(
    @CurrentTenant() tenantId: string,
    @Args('input') input: PenaltyConfigInput,
  ): Promise<PenaltyConfigType> {
    // Re-validate via parseRateTiers so shape errors fail fast (the
    // input decorators only catch the obvious shape; this catches
    // toDpd as a string or other subtle drift).
    try {
      parseRateTiers(
        input.rateTiers.map((t) => ({
          fromDpd: t.fromDpd,
          toDpd: t.toDpd ?? null,
          dailyRateBps: t.dailyRateBps,
        })),
      );
    } catch (err) {
      throw new ValidationError((err as Error).message);
    }

    const data = {
      mode: input.mode,
      rateTiers: input.rateTiers.map((t) => ({
        fromDpd: t.fromDpd,
        toDpd: t.toDpd ?? null,
        dailyRateBps: t.dailyRateBps,
      })) as Prisma.InputJsonValue,
      maxPenaltyPct: input.maxPenaltyPct
        ? new Prisma.Decimal(input.maxPenaltyPct)
        : null,
      compoundingFrequency: input.compoundingFrequency ?? null,
      isActive: input.isActive ?? true,
    };

    const row = await this.prisma.penaltyConfig.upsert({
      where: { tenantId_productId: { tenantId, productId: input.productId } },
      update: data,
      create: { tenantId, productId: input.productId, ...data },
    });
    return this.toGraphql(row);
  }

  private toGraphql = (row: any): PenaltyConfigType => ({
    id: row.id,
    productId: row.productId,
    mode: row.mode,
    rateTiers: (row.rateTiers as any[]).map((t) => ({
      fromDpd: t.fromDpd,
      toDpd: t.toDpd,
      dailyRateBps: t.dailyRateBps,
    })),
    maxPenaltyPct: row.maxPenaltyPct?.toString(),
    compoundingFrequency: row.compoundingFrequency ?? undefined,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
