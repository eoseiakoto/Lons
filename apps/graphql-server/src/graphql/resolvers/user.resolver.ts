import { Resolver, Query, Mutation, Args, ID, InputType, Field, ResolveField, Parent } from '@nestjs/graphql';
import {
  UserService,
  PasswordService,
  MfaService,
  CurrentTenant,
  CurrentUser,
  IAuthenticatedUser,
  Roles,
  MfaComplianceService,
} from '@lons/entity-service';
import { PrismaService } from '@lons/database';
import {
  encodeCursor,
  decodeCursor,
  AuditAction,
  AuditActionType,
  AuditResourceType,
} from '@lons/common';
import { PlanTierLiteral } from '@lons/shared-types';
import { IsOptional, IsString, IsEmail, Matches } from 'class-validator';

import {
  UserType,
  UserConnection,
  MfaComplianceType,
  MfaComplianceStatusEnum,
} from '../types/user.type';
import { PaginationInput } from '../inputs/pagination.input';
import { CreateUserInput, UpdateUserInput } from '../inputs/create-user.input';

@InputType()
class UpdateMyProfileInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  name?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsEmail()
  email?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s\-()]{7,20}$/, { message: 'Invalid phone number format' })
  phone?: string;
}

@Resolver(() => UserType)
export class UserResolver {
  constructor(
    private userService: UserService,
    private passwordService: PasswordService,
    // MFA-lockout fix: admins reset a locked-out user's MFA via
    // this service (no password re-auth). The mfaService field is
    // declared before the optional ones so DI resolves it first.
    private mfaService: MfaService,
    // S19-STAB-5: optional so existing tests that wire UserResolver
    // without compliance still construct. Production wiring always
    // injects both. Named with a `Svc` suffix to avoid colliding with
    // the `mfaCompliance` ResolveField below.
    private mfaComplianceSvc?: MfaComplianceService,
    private prisma?: PrismaService,
  ) {}

  @Query(() => UserType)
  async me(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
  ): Promise<UserType> {
    return this.userService.findById(tenantId, user.userId) as unknown as UserType;
  }

  @Mutation(() => UserType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.USER)
  async updateMyProfile(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Args('input') input: UpdateMyProfileInput,
  ): Promise<UserType> {
    return this.userService.updateProfile(tenantId, user.userId, {
      name: input.name,
      email: input.email,
      phone: input.phone,
    }) as unknown as UserType;
  }

  @Query(() => UserConnection)
  @Roles('user:read')
  async users(
    @CurrentTenant() tenantId: string,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
  ): Promise<UserConnection> {
    const take = pagination?.first || 20;
    const cursor = pagination?.after ? decodeCursor(pagination.after) : undefined;
    const result = await this.userService.findAll(tenantId, take, cursor);
    const items = result.items;
    return {
      edges: items.map((u: any) => ({ node: u as UserType, cursor: encodeCursor(u.id) })),
      pageInfo: {
        hasNextPage: result.hasMore,
        hasPreviousPage: !!pagination?.after,
        startCursor: items.length > 0 ? encodeCursor(items[0].id) : undefined,
        endCursor: items.length > 0 ? encodeCursor(items[items.length - 1].id) : undefined,
      },
      totalCount: items.length,
    };
  }

  @Query(() => UserType)
  @Roles('user:read')
  async user(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<UserType> {
    return this.userService.findById(tenantId, id) as unknown as UserType;
  }

  @Mutation(() => UserType)
  @AuditAction(AuditActionType.CREATE, AuditResourceType.USER)
  @Roles('user:create')
  async createUser(
    @CurrentTenant() tenantId: string,
    @Args('input') input: CreateUserInput,
  ): Promise<UserType> {
    this.passwordService.validateStrength(input.password);
    const passwordHash = await this.passwordService.hash(input.password);
    return this.userService.create(tenantId, {
      email: input.email,
      passwordHash,
      name: input.name,
      roleId: input.roleId,
    }) as unknown as UserType;
  }

  @Mutation(() => UserType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.USER)
  @Roles('user:update')
  async updateUser(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateUserInput,
  ): Promise<UserType> {
    return this.userService.update(tenantId, id, {
      email: input.email,
      name: input.name,
      roleId: input.roleId,
    }) as unknown as UserType;
  }

  @Mutation(() => UserType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.USER)
  @Roles('user:update')
  async adminResetPassword(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
    @Args('newPassword') newPassword: string,
  ): Promise<UserType> {
    this.passwordService.validateStrength(newPassword);
    const passwordHash = await this.passwordService.hash(newPassword);
    return this.userService.resetPassword(tenantId, id, passwordHash) as unknown as UserType;
  }

  /**
   * MFA-lockout fix: admin recovery path for a user whose MFA is
   * unrecoverable (lost phone, device change, locked out by tier
   * enforcement). Same field-clearing semantics as `disableMfa` but
   * without requiring the target user's password.
   *
   * Permission gate: `user:update` (SP Admin tier). The audit trail
   * via @AuditAction captures (actor, target) so accountability is
   * preserved.
   *
   * Effect: mfaEnabled=false, mfaSecret/mfaBackupCodes cleared,
   * mfaDisabledAt = now → the compliance service starts a fresh
   * 7-day grace window so the user has runway to re-enrol before
   * the next login blocks again.
   */
  @Mutation(() => UserType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.USER)
  @Roles('user:update')
  async adminResetUserMfa(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<UserType> {
    // MFA-RLS fix (MfaService): pass tenantId so the service can
    // re-enter context for the RLS-scoped `users` update. Without
    // it, the singleton `this.prisma.user.update` inside the service
    // would target a connection without SET LOCAL → 0 rows affected
    // → "User not found" surfaced as a P2025 from the subsequent
    // userService.findById.
    await this.mfaService.adminResetMfa('user', id, tenantId);
    return this.userService.findById(tenantId, id) as unknown as UserType;
  }

  @Mutation(() => UserType)
  @AuditAction(AuditActionType.DELETE, AuditResourceType.USER)
  @Roles('user:deactivate')
  async deactivateUser(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<UserType> {
    return this.userService.deactivate(tenantId, id) as unknown as UserType;
  }

  /**
   * S19-STAB-5 — per-user MFA compliance status. Computed by the
   * stateless `MfaComplianceService` from
   *   - tenant.{planTier, planTierChangedAt, createdAt}
   *   - user.{role.name, mfaEnabled, createdAt, mfaDisabledAt}
   *
   * Resolves on-demand so listing users without selecting this field
   * costs no extra round-trips. The /settings/users page selects it
   * to render the column badges; other queries don't.
   *
   * Tenant rows live in the platform schema and aren't RLS-scoped, so
   * a direct singleton lookup is fine. The User row was already
   * loaded by the parent query, which (via UserService) ran inside
   * the RLS-scoped context.
   */
  @ResolveField(() => MfaComplianceType, { nullable: true })
  async mfaCompliance(
    @Parent() user: UserType & {
      tenantId?: string;
      mfaDisabledAt?: Date | null;
      role: { name: string };
    },
  ): Promise<MfaComplianceType | null> {
    if (!this.mfaComplianceSvc || !this.prisma) {
      return null;
    }
    // The parent user object came from UserService.findById / findAll,
    // which selects tenantId. If a downstream caller doesn't, bail
    // gracefully — null is a valid "couldn't compute" signal here.
    if (!user.tenantId) return null;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { planTier: true, planTierChangedAt: true, createdAt: true },
    });
    if (!tenant) return null;

    const result = this.mfaComplianceSvc.computeStatus({
      planTier: tenant.planTier as PlanTierLiteral,
      tenantPlanTierChangedAt: tenant.planTierChangedAt,
      tenantCreatedAt: tenant.createdAt,
      roleName: user.role.name,
      userMfaEnabled: user.mfaEnabled,
      userCreatedAt: user.createdAt,
      userMfaDisabledAt: user.mfaDisabledAt ?? null,
    });

    return {
      status: result.status as MfaComplianceStatusEnum,
      graceDaysRemaining: result.graceDaysRemaining,
      graceEndsAt: result.graceEndsAt,
    };
  }
}
