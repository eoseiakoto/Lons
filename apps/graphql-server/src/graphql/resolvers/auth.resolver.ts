import { Resolver, Mutation, Args } from '@nestjs/graphql';
import { AuthService, TenantService, CurrentUser, IAuthenticatedUser } from '@lons/entity-service';
import { AuditAction, AuditActionType, AuditResourceType } from '@lons/common';

import { AuthResponse } from '../types/auth.type';
import { Public } from '@lons/entity-service';

@Resolver()
export class AuthResolver {
  constructor(
    private authService: AuthService,
    private tenantService: TenantService,
  ) {}

  @Mutation(() => AuthResponse)
  @AuditAction(AuditActionType.LOGIN, AuditResourceType.USER)
  @Public()
  async loginTenantUser(
    @Args('tenantId') tenantId: string,
    @Args('email') email: string,
    @Args('password') password: string,
  ): Promise<AuthResponse> {
    const result = await this.authService.loginTenantUser(tenantId, email, password);
    return { accessToken: result.accessToken, refreshToken: result.refreshToken };
  }

  @Mutation(() => AuthResponse)
  @AuditAction(AuditActionType.LOGIN, AuditResourceType.USER)
  @Public()
  async loginBySlug(
    @Args('slug') slug: string,
    @Args('email') email: string,
    @Args('password') password: string,
  ): Promise<AuthResponse> {
    const tenant = await this.tenantService.findBySlug(slug);
    const result = await this.authService.loginTenantUser(tenant.id, email, password);
    return { accessToken: result.accessToken, refreshToken: result.refreshToken };
  }

  @Mutation(() => AuthResponse)
  @AuditAction(AuditActionType.LOGIN, AuditResourceType.USER)
  @Public()
  async loginPlatformUser(
    @Args('email') email: string,
    @Args('password') password: string,
  ): Promise<AuthResponse> {
    const result = await this.authService.loginPlatformUser(email, password);
    return { accessToken: result.accessToken, refreshToken: result.refreshToken };
  }

  @Mutation(() => AuthResponse)
  @Public()
  async refreshToken(
    @Args('refreshToken') refreshToken: string,
  ): Promise<AuthResponse> {
    const result = await this.authService.refreshTokens(refreshToken);
    return { accessToken: result.accessToken, refreshToken: result.refreshToken };
  }

  @Mutation(() => Boolean)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.USER)
  async changePassword(
    @CurrentUser() user: IAuthenticatedUser,
    @Args('currentPassword') currentPassword: string,
    @Args('newPassword') newPassword: string,
  ): Promise<boolean> {
    await this.authService.changePassword(user.tenantId, user.userId, currentPassword, newPassword);
    return true;
  }
}
