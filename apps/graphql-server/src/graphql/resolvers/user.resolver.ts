import { Resolver, Query, Mutation, Args, ID, InputType, Field } from '@nestjs/graphql';
import { UserService, PasswordService, CurrentTenant, CurrentUser, IAuthenticatedUser, Roles } from '@lons/entity-service';
import { encodeCursor, decodeCursor, AuditAction, AuditActionType, AuditResourceType } from '@lons/common';
import { IsOptional, IsString, IsEmail, Matches } from 'class-validator';

import { UserType, UserConnection } from '../types/user.type';
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

  @Mutation(() => UserType)
  @AuditAction(AuditActionType.DELETE, AuditResourceType.USER)
  @Roles('user:deactivate')
  async deactivateUser(
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<UserType> {
    return this.userService.deactivate(tenantId, id) as unknown as UserType;
  }
}
