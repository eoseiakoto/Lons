import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import { DEFAULTS } from '@lons/shared-types';

import { JwtService } from './jwt.service';
import { PasswordService } from './password.service';
import { IAuthenticatedUser } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private passwordService: PasswordService,
  ) {}

  async loginTenantUser(
    tenantId: string,
    email: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: IAuthenticatedUser }> {
    const user = await this.prisma.user.findFirst({
      where: { tenantId, email, deletedAt: null },
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
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });

    const permissions = (user.role.permissions as string[]) || [];

    const accessToken = this.jwtService.signAccessToken({
      sub: user.id,
      tenantId,
      role: user.role.name,
      permissions,
    });

    const refreshToken = this.jwtService.signRefreshToken({
      sub: user.id,
      tenantId,
    });

    return {
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

  async loginPlatformUser(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; refreshToken: string; user: IAuthenticatedUser }> {
    const user = await this.prisma.platformUser.findUnique({
      where: { email },
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

    const accessToken = this.jwtService.signAccessToken({
      sub: user.id,
      tenantId: 'platform',
      role: user.role,
      permissions: ['*'],
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
        }),
        refreshToken: this.jwtService.signRefreshToken({
          sub: user.id,
          tenantId: 'platform',
        }),
      };
    }

    const user = await this.prisma.user.findUnique({
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
      }),
      refreshToken: this.jwtService.signRefreshToken({
        sub: user.id,
        tenantId: payload.tenantId,
      }),
    };
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
