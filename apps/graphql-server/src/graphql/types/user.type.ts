import { ObjectType, Field, ID, registerEnumType, Int } from '@nestjs/graphql';
import { PageInfo } from './page-info.type';
import { RoleType } from './role.type';

/**
 * S19-STAB-5 — GraphQL enum mirroring the literal-string union
 * `MfaComplianceStatus` from @lons/shared-types. NestJS code-first
 * schemas can't lift a TS string union directly, so we wrap it.
 * Keep values in sync with `MfaComplianceStatus` in shared-types.
 */
export enum MfaComplianceStatusEnum {
  NOT_REQUIRED = 'not_required',
  ENROLLED = 'enrolled',
  PENDING = 'pending',
  OVERDUE = 'overdue',
}

registerEnumType(MfaComplianceStatusEnum, {
  name: 'MfaComplianceStatus',
  description: 'MFA enforcement status for the user under their tenant tier policy',
});

/**
 * S19-STAB-5 — detail wrapper exposed on `UserType.mfaCompliance`.
 *
 * The admin-portal users list reads `status` to render the badge;
 * the per-user detail screen reads `graceDaysRemaining` + `graceEndsAt`
 * to render the countdown copy.
 */
@ObjectType()
export class MfaComplianceType {
  @Field(() => MfaComplianceStatusEnum)
  status!: MfaComplianceStatusEnum;

  /**
   * Positive for `pending` (days left), negative for `overdue`
   * (days past), null for `not_required` / `enrolled`.
   */
  @Field(() => Int, { nullable: true })
  graceDaysRemaining?: number | null;

  /**
   * ISO timestamp. Null for `not_required` / `enrolled`.
   *
   * Explicit `() => String` is required because the property type
   * is a `string | null` UNION — TS's emitDecoratorMetadata erases
   * unions to `Object`, which @nestjs/graphql can't map to a scalar.
   * The plain `@Field({ nullable: true })` form crashed schema
   * generation with UndefinedTypeError. See DEV-PROMPT-GRAPHQL-MFA-TYPE-FIX.
   */
  @Field(() => String, { nullable: true })
  graceEndsAt?: string | null;
}

@ObjectType()
export class UserType {
  @Field(() => ID)
  id!: string;

  @Field()
  email!: string;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  phone?: string;

  @Field(() => RoleType)
  role!: RoleType;

  @Field()
  mfaEnabled!: boolean;

  @Field()
  status!: string;

  @Field({ nullable: true })
  lastLoginAt?: Date;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;

  /**
   * S19-STAB-5 — populated by a ResolveField on UserResolver. The
   * field is nullable here because the resolver is async; queries
   * that don't ask for it never trigger the lookup.
   */
  @Field(() => MfaComplianceType, { nullable: true })
  mfaCompliance?: MfaComplianceType;
}

@ObjectType()
export class UserEdge {
  @Field(() => UserType)
  node!: UserType;

  @Field()
  cursor!: string;
}

@ObjectType()
export class UserConnection {
  @Field(() => [UserEdge])
  edges!: UserEdge[];

  @Field(() => PageInfo)
  pageInfo!: PageInfo;

  @Field()
  totalCount!: number;
}
