import { Resolver, Mutation, Args } from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import {
  AuthService,
  MfaService,
  TenantService,
  CurrentUser,
  IAuthenticatedUser,
  Public,
  MfaEnrollmentRequiredException,
} from '@lons/entity-service';
import { PrismaService } from '@lons/database';
import { AuditAction, AuditActionType, AuditResourceType } from '@lons/common';

import { AuthResponse, LoginResponse, MfaEnrollmentPayload } from '../types/auth.type';

@Resolver()
export class AuthResolver {
  constructor(
    private authService: AuthService,
    private tenantService: TenantService,
    private mfaService: MfaService,
    private prisma: PrismaService,
  ) {}

  // ── Login ───────────────────────────────────────────────────────────

  @Mutation(() => LoginResponse)
  @AuditAction(AuditActionType.LOGIN, AuditResourceType.USER)
  @Public()
  async loginTenantUser(
    @Args('tenantId') tenantId: string,
    @Args('email') email: string,
    @Args('password') password: string,
  ): Promise<LoginResponse> {
    try {
      const result = await this.authService.loginTenantUser(tenantId, email, password);
      return this.toLoginResponse(result);
    } catch (err) {
      // S19-STAB-5: overdue users get a structured response instead of
      // a generic Unauthorized. Client routes the response into the
      // enrolment flow rather than surfacing it as a credentials error.
      if (err instanceof MfaEnrollmentRequiredException) {
        return { requiresMfa: false, requiresMfaEnrollment: true };
      }
      throw err;
    }
  }

  @Mutation(() => LoginResponse)
  @AuditAction(AuditActionType.LOGIN, AuditResourceType.USER)
  @Public()
  async loginBySlug(
    @Args('slug') slug: string,
    @Args('email') email: string,
    @Args('password') password: string,
  ): Promise<LoginResponse> {
    const tenant = await this.tenantService.findBySlug(slug);
    try {
      const result = await this.authService.loginTenantUser(tenant.id, email, password);
      return this.toLoginResponse(result);
    } catch (err) {
      if (err instanceof MfaEnrollmentRequiredException) {
        return { requiresMfa: false, requiresMfaEnrollment: true };
      }
      throw err;
    }
  }

  @Mutation(() => LoginResponse)
  @AuditAction(AuditActionType.LOGIN, AuditResourceType.USER)
  @Public()
  async loginPlatformUser(
    @Args('email') email: string,
    @Args('password') password: string,
  ): Promise<LoginResponse> {
    const result = await this.authService.loginPlatformUser(email, password);
    return this.toLoginResponse(result);
  }

  @Mutation(() => AuthResponse)
  @Public()
  async refreshToken(
    @Args('refreshToken') refreshToken: string,
  ): Promise<AuthResponse> {
    const result = await this.authService.refreshTokens(refreshToken);
    return { accessToken: result.accessToken, refreshToken: result.refreshToken };
  }

  // ── Password ────────────────────────────────────────────────────────

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

  // ── Sprint 15 (S15-6) — MFA ──────────────────────────────────────────

  /**
   * Exchange a short-lived MFA token + the user's TOTP/backup code for a
   * full access+refresh pair. Public because the user is mid-login; the
   * MFA token is the only credential they hold at this point.
   */
  @Mutation(() => AuthResponse)
  @AuditAction(AuditActionType.LOGIN, AuditResourceType.USER)
  @Public()
  // FIX-5: 5 attempts per 5 minutes per IP. Defence-in-depth alongside
  // the per-token Redis counter inside AuthService.verifyMfaAndLogin —
  // the @Throttle catches single-IP brute force; the Redis counter
  // catches distributed attacks that rotate IPs to hammer one token.
  @Throttle({ default: { ttl: 300_000, limit: 5 } })
  async verifyMfa(
    @Args('mfaToken') mfaToken: string,
    @Args('code') code: string,
  ): Promise<AuthResponse> {
    const result = await this.authService.verifyMfaAndLogin(mfaToken, code);
    return { accessToken: result.accessToken, refreshToken: result.refreshToken };
  }

  /**
   * Step 1 of MFA enrollment — generate a secret + 10 backup codes,
   * return the otpauth:// URI for the client to render as a QR. MFA
   * stays disabled until `confirmMfaEnrollment` succeeds.
   *
   * FIX-14: re-authentication required. An attacker with a stolen
   * session token would otherwise be able to enrol their own
   * authenticator and lock out the real user. Password is verified
   * against the stored hash on every call.
   */
  @Mutation(() => MfaEnrollmentPayload)
  @AuditAction('initiate.mfaEnrollment', 'user')
  async initiateMfaEnrollment(
    @CurrentUser() user: IAuthenticatedUser,
    @Args('password') password: string,
  ): Promise<MfaEnrollmentPayload> {
    await this.authService.verifyPassword(
      user.userId,
      user.tenantId,
      password,
      user.isPlatformAdmin,
    );
    const userType = user.isPlatformAdmin ? 'platform_user' : 'user';
    const email = user.isPlatformAdmin
      ? (await this.prisma.platformUser.findUniqueOrThrow({ where: { id: user.userId } })).email
      : (await this.prisma.user.findUniqueOrThrow({ where: { id: user.userId } })).email;
    return this.mfaService.initiateEnrollment(userType, user.userId, email);
  }

  /**
   * Step 2 of MFA enrollment — confirm the user's authenticator is
   * working by submitting the first TOTP code. On success, MFA becomes
   * required on the next login.
   */
  @Mutation(() => Boolean)
  @AuditAction('confirm.mfaEnrollment', 'user')
  async confirmMfaEnrollment(
    @CurrentUser() user: IAuthenticatedUser,
    @Args('code') code: string,
  ): Promise<boolean> {
    const userType = user.isPlatformAdmin ? 'platform_user' : 'user';
    return this.mfaService.confirmEnrollment(userType, user.userId, code);
  }

  /**
   * Disable MFA. FIX-14: requires password re-authentication. Without
   * this, a stolen session token can clear MFA in one call. The
   * password check raises the bar to "attacker holds session AND
   * knows the password" — at which point the user has bigger problems
   * than MFA being toggled.
   */
  @Mutation(() => Boolean)
  @AuditAction('disable.mfa', 'user')
  async disableMfa(
    @CurrentUser() user: IAuthenticatedUser,
    @Args('password') password: string,
  ): Promise<boolean> {
    await this.authService.verifyPassword(
      user.userId,
      user.tenantId,
      password,
      user.isPlatformAdmin,
    );
    const userType = user.isPlatformAdmin ? 'platform_user' : 'user';
    await this.mfaService.disableMfa(userType, user.userId);
    return true;
  }

  /**
   * Regenerate the 10 backup codes (e.g. after exhausting them).
   *
   * S16-FIX-5: now requires password re-authentication. Without this,
   * a stolen session token could regenerate codes — invalidating the
   * real user's codes and handing the attacker a new set in one call.
   * Same pattern as `disableMfa` and `initiateMfaEnrollment`.
   */
  @Mutation(() => [String])
  @AuditAction('regenerate.mfaBackupCodes', 'user')
  async regenerateMfaBackupCodes(
    @CurrentUser() user: IAuthenticatedUser,
    @Args('password') password: string,
  ): Promise<string[]> {
    await this.authService.verifyPassword(
      user.userId,
      user.tenantId,
      password,
      user.isPlatformAdmin,
    );
    const userType = user.isPlatformAdmin ? 'platform_user' : 'user';
    return this.mfaService.regenerateBackupCodes(userType, user.userId);
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  private toLoginResponse(
    result:
      | {
          requiresMfa: false;
          accessToken: string;
          refreshToken: string;
          mfaGraceDaysRemaining?: number;
        }
      | { requiresMfa: true; mfaToken: string },
  ): LoginResponse {
    if (result.requiresMfa) {
      return { requiresMfa: true, mfaToken: result.mfaToken };
    }
    return {
      requiresMfa: false,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      // S19-STAB-5: pass through the grace-window countdown so the
      // client can render a persistent banner. Undefined on a
      // not-required / enrolled login (no banner needed).
      mfaGraceDaysRemaining: result.mfaGraceDaysRemaining,
    };
  }
}
