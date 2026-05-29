import { Resolver, Query, Mutation, Args, ID, InputType, Field } from '@nestjs/graphql';
import { ForbiddenException } from '@nestjs/common';
import { PlatformUserService, PasswordService, AuthService, MfaService, CurrentUser, IAuthenticatedUser } from '@lons/entity-service';
import { PrismaService } from '@lons/database';
import { encodeCursor, decodeCursor, AuditAction, AuditActionType, AuditResourceType } from '@lons/common';
import { IsOptional, IsString, IsEmail } from 'class-validator';

import { PlatformUserType, PlatformUserConnection } from '../types/platform-user.type';
import { PaginationInput } from '../inputs/pagination.input';
import { CreatePlatformUserInput } from '../inputs/create-platform-user.input';
import { UpdatePlatformUserInput } from '../inputs/update-platform-user.input';

@InputType()
class UpdatePlatformMyProfileInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  name?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsEmail()
  email?: string;
}

@Resolver(() => PlatformUserType)
export class PlatformUserResolver {
  constructor(
    private platformUserService: PlatformUserService,
    private passwordService: PasswordService,
    private authService: AuthService,
    // MFA-lockout fix: platform-admin cross-tenant MFA reset path
    // for support escalations where the SP Admin is themselves
    // locked out. PrismaService is needed to enter the target
    // tenant context before stamping the user's MFA columns
    // (User table is RLS-scoped).
    private mfaService: MfaService,
    private prisma: PrismaService,
  ) {}

  private requirePlatformAdmin(user: IAuthenticatedUser): void {
    if (!user.isPlatformAdmin || user.role !== 'platform_admin') {
      throw new ForbiddenException('Only platform admins can perform this action');
    }
  }

  private requirePlatformUser(user: IAuthenticatedUser): void {
    if (!user.isPlatformAdmin) {
      throw new ForbiddenException('Only platform users can access this resource');
    }
  }

  @Query(() => PlatformUserType)
  async platformMe(
    @CurrentUser() user: IAuthenticatedUser,
  ): Promise<PlatformUserType> {
    this.requirePlatformUser(user);
    return this.platformUserService.findById(user.userId) as unknown as PlatformUserType;
  }

  @Mutation(() => PlatformUserType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.PLATFORM_USER)
  async updatePlatformMyProfile(
    @CurrentUser() user: IAuthenticatedUser,
    @Args('input') input: UpdatePlatformMyProfileInput,
  ): Promise<PlatformUserType> {
    this.requirePlatformUser(user);
    const updateData: { name?: string; email?: string } = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.email !== undefined) updateData.email = input.email;
    return this.platformUserService.update(user.userId, updateData) as unknown as PlatformUserType;
  }

  @Mutation(() => Boolean)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.PLATFORM_USER)
  async changePlatformPassword(
    @CurrentUser() user: IAuthenticatedUser,
    @Args('currentPassword') currentPassword: string,
    @Args('newPassword') newPassword: string,
  ): Promise<boolean> {
    this.requirePlatformUser(user);
    await this.authService.changePlatformPassword(user.userId, currentPassword, newPassword);
    return true;
  }

  @Query(() => PlatformUserConnection)
  async platformUsers(
    @CurrentUser() user: IAuthenticatedUser,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
  ): Promise<PlatformUserConnection> {
    this.requirePlatformUser(user);
    const take = pagination?.first || 20;
    const cursor = pagination?.after ? decodeCursor(pagination.after) : undefined;
    const result = await this.platformUserService.findAll(take, cursor);
    const items = result.items;
    return {
      edges: items.map((u: any) => ({ node: u as PlatformUserType, cursor: encodeCursor(u.id) })),
      pageInfo: {
        hasNextPage: result.hasMore,
        hasPreviousPage: !!pagination?.after,
        startCursor: items.length > 0 ? encodeCursor(items[0].id) : undefined,
        endCursor: items.length > 0 ? encodeCursor(items[items.length - 1].id) : undefined,
      },
      totalCount: items.length,
    };
  }

  @Query(() => PlatformUserType)
  async platformUser(
    @CurrentUser() user: IAuthenticatedUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<PlatformUserType> {
    this.requirePlatformUser(user);
    return this.platformUserService.findById(id) as unknown as PlatformUserType;
  }

  @Mutation(() => PlatformUserType)
  @AuditAction(AuditActionType.CREATE, AuditResourceType.PLATFORM_USER)
  async createPlatformUser(
    @CurrentUser() user: IAuthenticatedUser,
    @Args('input') input: CreatePlatformUserInput,
  ): Promise<PlatformUserType> {
    this.requirePlatformAdmin(user);
    this.passwordService.validateStrength(input.password);
    const passwordHash = await this.passwordService.hash(input.password);
    return this.platformUserService.create({
      email: input.email,
      passwordHash,
      name: input.name,
      role: input.role as 'platform_admin' | 'platform_support',
    }) as unknown as PlatformUserType;
  }

  @Mutation(() => PlatformUserType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.PLATFORM_USER)
  async updatePlatformUser(
    @CurrentUser() user: IAuthenticatedUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdatePlatformUserInput,
  ): Promise<PlatformUserType> {
    this.requirePlatformAdmin(user);
    return this.platformUserService.update(id, {
      name: input.name,
      email: input.email,
      role: input.role as 'platform_admin' | 'platform_support' | undefined,
      status: input.status as 'active' | 'suspended' | undefined,
    }) as unknown as PlatformUserType;
  }

  @Mutation(() => PlatformUserType)
  @AuditAction(AuditActionType.DELETE, AuditResourceType.PLATFORM_USER)
  async deactivatePlatformUser(
    @CurrentUser() user: IAuthenticatedUser,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<PlatformUserType> {
    this.requirePlatformAdmin(user);
    return this.platformUserService.deactivate(id) as unknown as PlatformUserType;
  }

  @Mutation(() => PlatformUserType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.PLATFORM_USER)
  async resetPlatformUserPassword(
    @CurrentUser() user: IAuthenticatedUser,
    @Args('id', { type: () => ID }) id: string,
    @Args('newPassword') newPassword: string,
  ): Promise<PlatformUserType> {
    this.requirePlatformAdmin(user);
    this.passwordService.validateStrength(newPassword);
    const passwordHash = await this.passwordService.hash(newPassword);
    return this.platformUserService.resetPassword(id, passwordHash) as unknown as PlatformUserType;
  }

  /**
   * MFA-lockout fix: platform-admin cross-tenant MFA reset.
   *
   * Used when the SP Admin is themselves locked out and the
   * tenant has no other admin who can run `adminResetUserMfa` —
   * the platform support team can recover the user.
   *
   * Same field-clearing semantics as `adminResetMfa('user', ...)`,
   * but wrapped in `enterTenantContext(tenantId)` so the RLS
   * policy on the `users` table admits the write.
   *
   * Gated by `requirePlatformAdmin` (role check on the caller).
   * Audited via @AuditAction so the (actor, target tenant, target
   * user) tuple is retained.
   */
  @Mutation(() => Boolean)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.PLATFORM_USER)
  async platformResetUserMfa(
    @CurrentUser() user: IAuthenticatedUser,
    @Args('tenantId', { type: () => ID }) tenantId: string,
    @Args('userId', { type: () => ID }) userId: string,
  ): Promise<boolean> {
    this.requirePlatformAdmin(user);
    await this.prisma.enterTenantContext({ tenantId }, async () => {
      await this.mfaService.adminResetMfa('user', userId);
    });
    return true;
  }
}
