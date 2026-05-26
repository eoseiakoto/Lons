import { Inject, Injectable, UnauthorizedException, NotFoundException, Optional } from '@nestjs/common';
import type Redis from 'ioredis';
import { PrismaService } from '@lons/database';
import { DEFAULTS } from '@lons/shared-types';
import { REDIS_CLIENT, computeSearchableHash } from '@lons/common';

import { JwtService } from './jwt.service';
import { PasswordService } from './password.service';
import { MfaService } from './mfa.service';
import {
  MfaComplianceService,
  MfaEnrollmentRequiredException,
} from './mfa-compliance.service';
import { PlanTierLiteral } from '@lons/shared-types';
import { IAuthenticatedUser } from './interfaces/jwt-payload.interface';

/**
 * Sprint 15 (S15-6) — login returns either a full token pair or, when
 * MFA is enabled on the account, a short-lived MFA token that the
 * client exchanges for a full pair via `verifyMfa`.
 */
export type LoginResult =
  | {
      requiresMfa: false;
      accessToken: string;
      refreshToken: string;
      user: IAuthenticatedUser;
      /**
       * S19-STAB-5: present when the user is in the MFA grace window
       * (compliance status = 'pending'). The UI surfaces a persistent
       * banner counting down to the deadline. Absent when MFA is
       * enrolled or not required.
       */
      mfaGraceDaysRemaining?: number;
    }
  | { requiresMfa: true; mfaToken: string };

/** FIX-5: tunable per-token MFA attempt limits (exported for tests). */
export const MfaAttemptLimits = {
  MAX_ATTEMPTS: 5,
  WINDOW_SECONDS: 300,
} as const;

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private passwordService: PasswordService,
    // Optional so existing tests that wire `AuthService` without MFA
    // still construct cleanly. Production wiring always injects.
    @Optional() private mfaService?: MfaService,
    // S19-STAB-5: optional so tests can construct AuthService without
    // the compliance service. When absent, login behaves as if MFA
    // enforcement is disabled — useful for unit tests that don't
    // care about tier policy.
    @Optional() private mfaCompliance?: MfaComplianceService,
    // FIX-5: optional Redis client for MFA per-token attempt limiting.
    // Falls back to "no rate limit" when unavailable (still rate-limited
    // at the HTTP layer by the @Throttle on the resolver). Tests can
    // construct AuthService without Redis.
    @Optional() @Inject(REDIS_CLIENT) private redis?: Redis,
  ) {}

  /**
   * FIX-14: verify a user's password — used to gate re-authentication-
   * sensitive operations (MFA enroll, MFA disable). Throws
   * UnauthorizedException on mismatch.
   */
  async verifyPassword(
    userId: string,
    tenantId: string,
    password: string,
    isPlatformAdmin: boolean,
  ): Promise<void> {
    if (isPlatformAdmin) {
      const user = await this.prisma.platformUser.findUnique({
        where: { id: userId },
      });
      if (!user || user.deletedAt) {
        throw new UnauthorizedException('User not found');
      }
      const ok = await this.passwordService.verify(user.passwordHash, password);
      if (!ok) throw new UnauthorizedException('Invalid password');
      return;
    }
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
    });
    if (!user) throw new UnauthorizedException('User not found');
    const ok = await this.passwordService.verify(user.passwordHash, password);
    if (!ok) throw new UnauthorizedException('Invalid password');
  }

  async loginTenantUser(
    tenantId: string,
    email: string,
    password: string,
  ): Promise<LoginResult> {
    // S13B-2: `email` is encrypted at rest. Equality lookups are routed
    // through `emailHash` (SHA-256 of normalised lowercase). The encrypted
    // `email` column itself is decrypted by the field-encryption middleware
    // when the row is returned, so downstream code still sees plaintext.
    //
    // S19-STAB-1: The `users` table is tenant-scoped and now carries a
    // tenant_isolation RLS policy. The application connects as `lons_app`
    // (non-owner), so RLS enforces — a naked `prisma.user.findFirst`
    // with no tenant context set returns zero rows and we'd report
    // "Invalid credentials" for every valid login. Wrap the lookup +
    // subsequent writes in `enterTenantContext({ tenantId })`. The
    // tenant id came from the AuthResolver's `findBySlug` step before
    // this method was called, so passing it here is safe.
    const emailHash = computeSearchableHash(email);
    return this.prisma.enterTenantContext({ tenantId }, async () => {
      // Use `scoped()` to get the in-context transaction client. The
      // RLS middleware's SET LOCAL only takes effect on the tx
      // connection, not on the pooled singleton — calls through
      // `this.prisma.user.*` would run on a fresh pooled connection
      // with no session vars set and RLS would return zero rows.
      const tx = this.prisma.scoped();
      const user = await tx.user.findFirst({
        where: { tenantId, emailHash, deletedAt: null },
        include: { role: true },
      });

      if (!user) {
        throw new UnauthorizedException('Invalid credentials');
      }

      // Check lockout
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        const remainingMinutes = Math.ceil(
          (user.lockedUntil.getTime() - Date.now()) / 60000,
        );
        throw new UnauthorizedException(
          `Account locked. Try again in ${remainingMinutes} minutes`,
        );
      }

      if (user.status !== 'active') {
        throw new UnauthorizedException('Account is not active');
      }

      const isValid = await this.passwordService.verify(user.passwordHash, password);
      if (!isValid) {
        await this.recordFailedLogin(user.id);
        throw new UnauthorizedException('Invalid credentials');
      }

      // Reset failed login count on success
      await tx.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
        },
      });

      // S19-STAB-5: compute MFA compliance against tenant tier policy.
      // Done AFTER the password verify so that the response doesn't
      // leak "this email exists but must enrol MFA" before the caller
      // has proven they own the account. Tenant rows live in the
      // platform schema and aren't RLS-scoped, so a direct lookup off
      // the singleton (outside the scoped tx) is fine.
      let mfaGraceDaysRemaining: number | undefined;
      if (this.mfaCompliance) {
        const tenant = await this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: {
            planTier: true,
            planTierChangedAt: true,
            createdAt: true,
          },
        });
        if (tenant) {
          const compliance = this.mfaCompliance.computeStatus({
            planTier: tenant.planTier as PlanTierLiteral,
            tenantPlanTierChangedAt: tenant.planTierChangedAt,
            tenantCreatedAt: tenant.createdAt,
            roleName: user.role.name,
            userMfaEnabled: user.mfaEnabled,
            userCreatedAt: user.createdAt,
            userMfaDisabledAt: user.mfaDisabledAt,
          });
          if (compliance.status === 'overdue') {
            // Grace window has expired — hard block. The resolver
            // catches this and surfaces `requiresMfaEnrollment: true`
            // so the client can drop the user into the enrolment
            // flow instead of issuing an error toast.
            throw new MfaEnrollmentRequiredException(
              Math.abs(compliance.graceDaysRemaining ?? 0),
            );
          }
          if (compliance.status === 'pending') {
            // Soft nudge — tokens still issued, but the response
            // carries the countdown so the UI can render a
            // persistent banner.
            mfaGraceDaysRemaining = compliance.graceDaysRemaining ?? undefined;
          }
        }
      }

      // S15-6: if MFA is enabled, return a short-lived MFA token instead
      // of full credentials. The client surfaces an MFA challenge and
      // calls `verifyMfa` to redeem.
      if (user.mfaEnabled) {
        const mfaToken = this.jwtService.signMfaToken({
          sub: user.id,
          tenantId,
          userType: 'user',
        });
        return { requiresMfa: true, mfaToken };
      }

      const tokens = this.issueTenantTokens(user, tenantId);
      if (mfaGraceDaysRemaining !== undefined) {
        return { ...tokens, mfaGraceDaysRemaining };
      }
      return tokens;
    });
  }

  /**
   * Sprint 15 (S15-6) — exchange a valid MFA token + TOTP/backup code for
   * a full access + refresh pair. The MFA token is single-use in the
   * sense that the code is one-time; the token itself stays valid until
   * its 5-minute expiry to allow for retries.
   */
  async verifyMfaAndLogin(
    mfaToken: string,
    code: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: IAuthenticatedUser }> {
    if (!this.mfaService) {
      throw new UnauthorizedException('MFA service not available');
    }
    let payload;
    try {
      payload = this.jwtService.verifyToken(mfaToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA token');
    }
    if (payload.type !== 'mfa' || payload.purpose !== 'mfa_verification') {
      throw new UnauthorizedException('Token is not an MFA challenge');
    }

    // FIX-5: per-token attempt limit. Defence-in-depth against an
    // attacker who can rotate IPs to bypass the @Throttle on the
    // resolver — the counter is keyed on the user-bound MFA token, not
    // the network address. 5 attempts per 5-minute token window.
    const attemptsKey = `mfa:attempts:${payload.sub}:${payload.iat ?? 0}`;
    if (this.redis) {
      try {
        const attempts = await this.redis.incr(attemptsKey);
        if (attempts === 1) {
          // Match the token's 5-minute window. The key auto-expires;
          // a new login flow gets a fresh `iat` and therefore a fresh
          // counter key.
          await this.redis.expire(attemptsKey, 300);
        }
        if (attempts > MfaAttemptLimits.MAX_ATTEMPTS) {
          throw new UnauthorizedException(
            'Too many MFA attempts. Please log in again.',
          );
        }
      } catch (err) {
        // If Redis errors AND it wasn't the over-limit throw above,
        // fail open at the per-token layer — the resolver-level
        // @Throttle still provides IP-bound protection.
        if (err instanceof UnauthorizedException) throw err;
      }
    }

    const userType = payload.userType ?? 'user';
    const ok = await this.mfaService.verifyCode(userType, payload.sub, code);
    if (!ok) {
      throw new UnauthorizedException('Invalid MFA code');
    }

    // Success: clear the attempt counter so the token can't be reused
    // to "warm up" future attempts. (Re-using the same MFA token would
    // require it to still be valid, but freeing the counter is the
    // belt-and-braces hygiene.)
    if (this.redis) {
      try {
        await this.redis.del(attemptsKey);
      } catch {
        /* best-effort */
      }
    }

    if (userType === 'platform_user') {
      const platformUser = await this.prisma.platformUser.findUnique({
        where: { id: payload.sub },
      });
      if (!platformUser || platformUser.status !== 'active') {
        throw new UnauthorizedException('User not found or inactive');
      }
      return this.issuePlatformTokens(platformUser);
    }

    // S19-STAB-1: `users` is RLS-protected; this method is called from
    // the public verifyMfa mutation (no interceptor wrap), so we must
    // enter tenant context ourselves before the lookup. Use scoped()
    // to access the in-context tx client (the singleton's pooled
    // connection wouldn't have the SET LOCAL session vars).
    return this.prisma.enterTenantContext({ tenantId: payload.tenantId }, async () => {
      const tx = this.prisma.scoped();
      const user = await tx.user.findUnique({
        where: { id: payload.sub },
        include: { role: true },
      });
      if (!user || user.status !== 'active' || user.deletedAt) {
        throw new UnauthorizedException('User not found or inactive');
      }
      return this.issueTenantTokens(user, payload.tenantId);
    });
  }

  private issueTenantTokens(
    user: {
      id: string;
      email: string;
      name: string | null;
      role: { name: string; permissions: unknown };
    },
    tenantId: string,
  ): {
    requiresMfa: false;
    accessToken: string;
    refreshToken: string;
    user: IAuthenticatedUser;
  } {
    const permissions = (user.role.permissions as string[]) || [];
    const accessToken = this.jwtService.signAccessToken({
      sub: user.id,
      tenantId,
      role: user.role.name,
      permissions,
      email: user.email,
      name: user.name ?? undefined,
    });
    const refreshToken = this.jwtService.signRefreshToken({
      sub: user.id,
      tenantId,
    });
    return {
      requiresMfa: false,
      accessToken,
      refreshToken,
      user: {
        userId: user.id,
        tenantId,
        role: user.role.name,
        permissions,
        isPlatformAdmin: false,
      },
    };
  }

  private issuePlatformTokens(user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
  }): { accessToken: string; refreshToken: string; user: IAuthenticatedUser } {
    const accessToken = this.jwtService.signAccessToken({
      sub: user.id,
      tenantId: 'platform',
      role: user.role,
      permissions: ['*'],
      email: user.email,
      name: user.name ?? undefined,
    });
    const refreshToken = this.jwtService.signRefreshToken({
      sub: user.id,
      tenantId: 'platform',
    });
    return {
      accessToken,
      refreshToken,
      user: {
        userId: user.id,
        tenantId: 'platform',
        role: user.role,
        permissions: ['*'],
        isPlatformAdmin: true,
      },
    };
  }

  async loginPlatformUser(
    email: string,
    password: string,
  ): Promise<LoginResult> {
    // S13B-2: PlatformUser.email is encrypted at rest. Equality lookup
    // routed through `emailHash`. The middleware still decrypts the
    // `email` column when the row is returned.
    const emailHash = computeSearchableHash(email);
    const user = await this.prisma.platformUser.findFirst({
      where: { emailHash },
    });

    if (!user || user.deletedAt) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Account locked');
    }

    if (user.status !== 'active') {
      throw new UnauthorizedException('Account is not active');
    }

    const isValid = await this.passwordService.verify(user.passwordHash, password);
    if (!isValid) {
      await this.recordFailedPlatformLogin(user.id);
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.platformUser.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    // S15-6: MFA challenge if enabled.
    if (user.mfaEnabled) {
      const mfaToken = this.jwtService.signMfaToken({
        sub: user.id,
        tenantId: 'platform',
        userType: 'platform_user',
      });
      return { requiresMfa: true, mfaToken };
    }

    return { requiresMfa: false, ...this.issuePlatformTokens(user) };
  }

  async refreshTokens(
    refreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = this.jwtService.verifyToken(refreshToken);

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    if (payload.tenantId === 'platform') {
      const user = await this.prisma.platformUser.findUnique({
        where: { id: payload.sub },
      });
      if (!user || user.status !== 'active') {
        throw new UnauthorizedException('User not found or inactive');
      }
      return {
        accessToken: this.jwtService.signAccessToken({
          sub: user.id,
          tenantId: 'platform',
          role: user.role,
          permissions: ['*'],
          email: user.email,
          name: user.name ?? undefined,
        }),
        refreshToken: this.jwtService.signRefreshToken({
          sub: user.id,
          tenantId: 'platform',
        }),
      };
    }

    // S19-STAB-1: `refreshTokens` is a public mutation (no
    // interceptor wrap). Enter tenant context for the user lookup so
    // RLS admits the row. Use scoped() to access the in-context tx
    // client — the pooled singleton would miss the SET LOCAL.
    return this.prisma.enterTenantContext({ tenantId: payload.tenantId }, async () => {
      const tx = this.prisma.scoped();
      const user = await tx.user.findUnique({
        where: { id: payload.sub },
        include: { role: true },
      });

      if (!user || user.status !== 'active' || user.deletedAt) {
        throw new UnauthorizedException('User not found or inactive');
      }

      const permissions = (user.role.permissions as string[]) || [];

      return {
        accessToken: this.jwtService.signAccessToken({
          sub: user.id,
          tenantId: payload.tenantId,
          role: user.role.name,
          permissions,
          email: user.email,
          name: user.name ?? undefined,
        }),
        refreshToken: this.jwtService.signRefreshToken({
          sub: user.id,
          tenantId: payload.tenantId,
        }),
      };
    });
  }

  async changePassword(
    tenantId: string,
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');

    const valid = await this.passwordService.verify(user.passwordHash, currentPassword);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    this.passwordService.validateStrength(newPassword);
    const newHash = await this.passwordService.hash(newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash, updatedAt: new Date() },
    });
  }

  async changePlatformPassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.platformUser.findFirst({
      where: { id: userId, deletedAt: null },
    });
    if (!user) throw new NotFoundException('User not found');

    const valid = await this.passwordService.verify(user.passwordHash, currentPassword);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    this.passwordService.validateStrength(newPassword);
    const newHash = await this.passwordService.hash(newPassword);
    await this.prisma.platformUser.update({
      where: { id: userId },
      data: { passwordHash: newHash, updatedAt: new Date() },
    });
  }

  private async recordFailedLogin(userId: string): Promise<void> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
    });

    if (user.failedLoginCount >= DEFAULTS.MAX_FAILED_LOGIN_ATTEMPTS) {
      const lockUntil = new Date(
        Date.now() + DEFAULTS.LOCKOUT_DURATION_MINUTES * 60 * 1000,
      );
      await this.prisma.user.update({
        where: { id: userId },
        data: { lockedUntil: lockUntil },
      });
    }
  }

  private async recordFailedPlatformLogin(userId: string): Promise<void> {
    const user = await this.prisma.platformUser.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
    });

    if (user.failedLoginCount >= DEFAULTS.MAX_FAILED_LOGIN_ATTEMPTS) {
      const lockUntil = new Date(
        Date.now() + DEFAULTS.LOCKOUT_DURATION_MINUTES * 60 * 1000,
      );
      await this.prisma.platformUser.update({
        where: { id: userId },
        data: { lockedUntil: lockUntil },
      });
    }
  }
}
