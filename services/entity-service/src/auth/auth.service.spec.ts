import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, PlatformUserRole, UserStatus } from '@lons/database';
import * as crypto from 'crypto';

import { AuthService } from './auth.service';
import { JwtService } from './jwt.service';
import { PasswordService } from './password.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let passwordService: PasswordService;

  const mockUserId = '00000000-0000-0000-0000-000000000001';
  const mockTenantId = '00000000-0000-0000-0000-000000000002';
  const mockRoleId = '00000000-0000-0000-0000-000000000003';
  const email = 'user@example.com';
  const password = 'TestPassword123!@#';
  const hashedPassword = '$2b$12$abcdefghijklmnopqrstuvwxyz'; // Mock hash

  const mockUser = {
    id: mockUserId,
    tenantId: mockTenantId,
    email,
    // S13B-2: emailHash drives login lookups now that email is encrypted at rest.
    emailHash: null,
    passwordHash: hashedPassword,
    name: 'Test User',
    phone: null,
    roleId: mockRoleId,
    mfaSecret: null,
    mfaEnabled: false,
    mfaBackupCodes: null,
    // S19-STAB-5: column added in 20260526300000_mfa_tier_enforcement.
    mfaDisabledAt: null,
    lastLoginAt: null,
    lockedUntil: null,
    failedLoginCount: 0,
    status: UserStatus.active,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    role: {
      id: mockRoleId,
      tenantId: mockTenantId,
      name: 'sp_operator',
      description: 'SP Operator',
      permissions: ['loan.read', 'loan.approve'],
      isSystem: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  const mockPlatformUser = {
    id: mockUserId,
    email,
    // S13B-2: emailHash for platform admin login lookups.
    emailHash: null,
    passwordHash: hashedPassword,
    name: 'Platform Admin',
    role: PlatformUserRole.platform_admin,
    mfaSecret: null,
    mfaEnabled: false,
    mfaBackupCodes: null,
    lastLoginAt: null,
    lockedUntil: null,
    failedLoginCount: 0,
    status: UserStatus.active,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        JwtService,
        PasswordService,
        {
          provide: PrismaService,
          useValue: (() => {
            // S19-STAB-1 + S19-STAB-5: AuthService now wraps tenant-
            // scoped lookups in `prisma.enterTenantContext(...)` and
            // accesses the in-context tx client via `prisma.scoped()`.
            // The mock has to thread those through to the underlying
            // jest.fn-stubbed model accessors so existing tests keep
            // their `mockResolvedValueOnce(mockUser)` semantics.
            const userMock = {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
            };
            const platformUserMock = {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
            };
            const refreshTokenMock = {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            };
            const tenantMock = {
              findUnique: jest.fn(),
            };
            const mock = {
              user: userMock,
              platformUser: platformUserMock,
              refreshToken: refreshTokenMock,
              tenant: tenantMock,
              $executeRawUnsafe: jest.fn(),
              // Passes through to the callback synchronously — no
              // session-var work in tests.
              enterTenantContext: jest.fn(async (_ctx: unknown, fn: () => any) => fn()),
              // `scoped()` returns the in-context client. For the
              // mock, that's the same shape as the singleton — so
              // we hand back an object exposing the same model
              // accessors. Tests that stub `prisma.user.findFirst`
              // continue to be hit because both paths point at the
              // same jest.fn objects.
              scoped: jest.fn(() => ({
                user: userMock,
                platformUser: platformUserMock,
                refreshToken: refreshTokenMock,
                tenant: tenantMock,
              })),
            };
            return mock;
          })(),
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config: Record<string, any> = {
                JWT_PRIVATE_KEY: '',
                JWT_PUBLIC_KEY: '',
                JWT_EXPIRY: 3600,
                REFRESH_TOKEN_EXPIRY: 604800,
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
    passwordService = module.get<PasswordService>(PasswordService);
  });

  describe('loginTenantUser', () => {
    it('should successfully login a tenant user', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(mockUser);
      jest.spyOn(passwordService, 'verify').mockResolvedValue(true);
      jest.spyOn(prisma.user, 'update').mockResolvedValue(mockUser);

      const result = await service.loginTenantUser(mockTenantId, email, password);

      // S15-6: LoginResult is a union. mfaEnabled=false on the mock so we
      // narrow to the full-token branch.
      if (result.requiresMfa) throw new Error('Expected non-MFA login');
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user).toEqual({
        userId: mockUserId,
        tenantId: mockTenantId,
        role: 'sp_operator',
        permissions: ['loan.read', 'loan.approve'],
        isPlatformAdmin: false,
      });
    });

    it('should throw UnauthorizedException if user not found', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);

      await expect(service.loginTenantUser(mockTenantId, email, password)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if password is invalid', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(mockUser);
      jest.spyOn(passwordService, 'verify').mockResolvedValue(false);
      jest.spyOn(prisma.user, 'update').mockResolvedValue({
        ...mockUser,
        failedLoginCount: 1,
      });

      await expect(service.loginTenantUser(mockTenantId, email, 'wrongpass')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should lock account after 5 failed attempts', async () => {
      const lockedUser = {
        ...mockUser,
        failedLoginCount: 4,
      };

      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(lockedUser);
      jest.spyOn(passwordService, 'verify').mockResolvedValue(false);
      const updateSpy = jest.spyOn(prisma.user, 'update');
      updateSpy.mockResolvedValue({
        ...lockedUser,
        failedLoginCount: 5,
      } as any);

      await expect(service.loginTenantUser(mockTenantId, email, 'wrongpass')).rejects.toThrow(
        UnauthorizedException,
      );

      expect(updateSpy).toHaveBeenCalledTimes(2);
      const secondCall = updateSpy.mock.calls[1];
      expect(secondCall[0].data.lockedUntil).toBeDefined();
    });

    it('should throw if account is locked', async () => {
      const lockedUser = {
        ...mockUser,
        lockedUntil: new Date(Date.now() + 30 * 60 * 1000),
      };

      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(lockedUser);

      await expect(service.loginTenantUser(mockTenantId, email, password)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reset failed login count on successful login', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue({
        ...mockUser,
        failedLoginCount: 2,
      });
      jest.spyOn(passwordService, 'verify').mockResolvedValue(true);
      const updateSpy = jest.spyOn(prisma.user, 'update').mockResolvedValue(mockUser);
      jest.spyOn((prisma as any).refreshToken, 'create').mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000004',
        userId: mockUserId,
        tokenHash: 'hash',
        revokedAt: null,
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      await service.loginTenantUser(mockTenantId, email, password);

      const updateCall = updateSpy.mock.calls[0];
      expect(updateCall[0].data.failedLoginCount).toBe(0);
      expect(updateCall[0].data.lockedUntil).toBeNull();
    });
  });

  describe('loginPlatformUser', () => {
    it('should successfully login a platform user', async () => {
      jest.spyOn(prisma.platformUser, 'findFirst').mockResolvedValue(mockPlatformUser);
      jest.spyOn(passwordService, 'verify').mockResolvedValue(true);
      jest.spyOn(prisma.platformUser, 'update').mockResolvedValue(mockPlatformUser);
      jest.spyOn((prisma as any).refreshToken, 'create').mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000004',
        userId: mockUserId,
        tokenHash: 'hash',
        revokedAt: null,
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      const result = await service.loginPlatformUser(email, password);

      // S15-6 narrowing — mock has mfaEnabled=false so this is the
      // non-MFA login branch.
      if (result.requiresMfa) throw new Error('Expected non-MFA login');
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.isPlatformAdmin).toBe(true);
      expect(result.user.tenantId).toBe('platform');
    });

    it('should throw if platform user not found', async () => {
      jest.spyOn(prisma.platformUser, 'findFirst').mockResolvedValue(null);

      await expect(service.loginPlatformUser(email, password)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('changePassword', () => {
    it('should change password when current password is correct and new password is strong', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(mockUser);
      jest.spyOn(passwordService, 'verify').mockResolvedValue(true);
      jest.spyOn(passwordService, 'validateStrength').mockImplementation(() => {});
      jest.spyOn(passwordService, 'hash').mockResolvedValue('new-hashed-password');
      jest.spyOn(prisma.user, 'update').mockResolvedValue({ ...mockUser, passwordHash: 'new-hashed-password' });

      await service.changePassword(mockTenantId, mockUserId, password, 'NewStr0ng!Pass#');

      expect(passwordService.validateStrength).toHaveBeenCalledWith('NewStr0ng!Pass#');
      expect(passwordService.hash).toHaveBeenCalledWith('NewStr0ng!Pass#');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: mockUserId },
        data: { passwordHash: 'new-hashed-password', updatedAt: expect.any(Date) },
      });
    });

    it('should throw NotFoundException if user not found', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);

      await expect(
        service.changePassword(mockTenantId, mockUserId, password, 'NewStr0ng!Pass#'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw UnauthorizedException if current password is wrong', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(mockUser);
      jest.spyOn(passwordService, 'verify').mockResolvedValue(false);

      await expect(
        service.changePassword(mockTenantId, mockUserId, 'wrong', 'NewStr0ng!Pass#'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject weak new passwords', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(mockUser);
      jest.spyOn(passwordService, 'verify').mockResolvedValue(true);
      // Use real validateStrength - it will throw for weak passwords
      jest.restoreAllMocks();
      // Re-mock only what we need
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(mockUser);
      jest.spyOn(passwordService, 'verify').mockResolvedValue(true);

      await expect(
        service.changePassword(mockTenantId, mockUserId, password, 'weak'),
      ).rejects.toThrow();
    });
  });

  // ─── Auth-RLS sweep regression tests ────────────────────────────
  //
  // Both methods run on the tenant-scoped `users` table. The fix is
  // "use the scoped tx client, not the bare singleton". These tests
  // pin the wiring so the regression cannot return silently.

  describe('Auth-RLS sweep: changePassword tenant context', () => {
    it('wraps the call in enterTenantContext with the right tenantId', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(mockUser);
      jest.spyOn(passwordService, 'verify').mockResolvedValue(true);
      jest.spyOn(passwordService, 'validateStrength').mockImplementation(() => {});
      jest.spyOn(passwordService, 'hash').mockResolvedValue('new-hashed-password');
      jest.spyOn(prisma.user, 'update').mockResolvedValue(mockUser);

      await service.changePassword(mockTenantId, mockUserId, password, 'NewStr0ng!Pass#');

      const enterCalls = (prisma as any).enterTenantContext.mock.calls;
      // At minimum the changePassword wrap. (loginTenantUser tests
      // run in separate `it` blocks with fresh modules → no
      // bleed-over.)
      expect(enterCalls.length).toBeGreaterThanOrEqual(1);
      expect(enterCalls[0][0]).toEqual({ tenantId: mockTenantId });
    });

    it('uses scoped() for both the findFirst and the update', async () => {
      jest.spyOn(prisma.user, 'findFirst').mockResolvedValue(mockUser);
      jest.spyOn(passwordService, 'verify').mockResolvedValue(true);
      jest.spyOn(passwordService, 'validateStrength').mockImplementation(() => {});
      jest.spyOn(passwordService, 'hash').mockResolvedValue('new-hashed-password');
      jest.spyOn(prisma.user, 'update').mockResolvedValue(mockUser);

      await service.changePassword(mockTenantId, mockUserId, password, 'NewStr0ng!Pass#');

      // scoped() must be called at least once — the fix caches the
      // result (`const tx = this.prisma.scoped()`) and reuses it
      // for both findFirst and update. If someone reverts to
      // `this.prisma.user.X` the count drops to 0 and this fails.
      expect((prisma as any).scoped.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Auth-RLS sweep: recordFailedLogin scoped tx', () => {
    /**
     * Strategy: re-construct AuthService with a prisma mock whose
     * SCOPED user.update is a *different* jest.fn than the singleton
     * user.update. After triggering a failed login, the scoped fn
     * should have been called and the singleton fn should NOT. That
     * proves recordFailedLogin runs on the tx client.
     */
    it('routes the failed login update through the scoped tx, not the singleton', async () => {
      const singletonUpdate = jest.fn().mockResolvedValue({
        ...mockUser,
        failedLoginCount: 1,
      });
      const scopedUpdate = jest.fn().mockResolvedValue({
        ...mockUser,
        failedLoginCount: 1,
      });
      const scopedFindFirst = jest.fn().mockResolvedValue(mockUser);

      const distinguishingPrisma: any = {
        user: {
          findFirst: jest.fn(),
          findUnique: jest.fn(),
          update: singletonUpdate, // bare singleton — must NOT be called
        },
        platformUser: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
        refreshToken: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
        tenant: { findUnique: jest.fn() },
        $executeRawUnsafe: jest.fn(),
        enterTenantContext: jest.fn(async (_ctx: unknown, fn: () => any) => fn()),
        scoped: jest.fn(() => ({
          // distinct mock so we can prove the call hit the tx path
          user: { findFirst: scopedFindFirst, update: scopedUpdate, findUnique: jest.fn() },
          platformUser: { findFirst: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
          refreshToken: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
          tenant: { findUnique: jest.fn() },
        })),
      };

      const isolated = new AuthService(
        distinguishingPrisma,
        jwtService,
        passwordService,
      );
      jest.spyOn(passwordService, 'verify').mockResolvedValue(false);

      await expect(
        isolated.loginTenantUser(mockTenantId, email, 'wrongpass'),
      ).rejects.toThrow(UnauthorizedException);

      // The failed-login counter increment must land on the scoped
      // tx (where SET LOCAL is active), not on the singleton.
      expect(scopedUpdate).toHaveBeenCalledTimes(1);
      expect(scopedUpdate.mock.calls[0][0].data).toEqual({
        failedLoginCount: { increment: 1 },
      });
      expect(singletonUpdate).not.toHaveBeenCalled();
    });

    it('lockout update also goes through the scoped tx', async () => {
      // 4 prior failures → this attempt pushes to 5 → lockout
      // should be stamped on the SAME scoped client.
      const scopedFindFirst = jest.fn().mockResolvedValue({
        ...mockUser,
        failedLoginCount: 4,
      });
      // First call (increment) returns failedLoginCount=5; second
      // call (lockedUntil stamp) returns whatever.
      const scopedUpdate = jest
        .fn()
        .mockResolvedValueOnce({ ...mockUser, failedLoginCount: 5 })
        .mockResolvedValueOnce({ ...mockUser, lockedUntil: new Date() });
      const singletonUpdate = jest.fn();

      const distinguishingPrisma: any = {
        user: {
          findFirst: jest.fn(),
          findUnique: jest.fn(),
          update: singletonUpdate,
        },
        platformUser: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
        refreshToken: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
        tenant: { findUnique: jest.fn() },
        $executeRawUnsafe: jest.fn(),
        enterTenantContext: jest.fn(async (_ctx: unknown, fn: () => any) => fn()),
        scoped: jest.fn(() => ({
          user: { findFirst: scopedFindFirst, update: scopedUpdate, findUnique: jest.fn() },
          platformUser: { findFirst: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
          refreshToken: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
          tenant: { findUnique: jest.fn() },
        })),
      };

      const isolated = new AuthService(
        distinguishingPrisma,
        jwtService,
        passwordService,
      );
      jest.spyOn(passwordService, 'verify').mockResolvedValue(false);

      await expect(
        isolated.loginTenantUser(mockTenantId, email, 'wrongpass'),
      ).rejects.toThrow(UnauthorizedException);

      // Both writes (increment + lockedUntil) on the scoped client.
      expect(scopedUpdate).toHaveBeenCalledTimes(2);
      expect(scopedUpdate.mock.calls[1][0].data.lockedUntil).toBeInstanceOf(Date);
      expect(singletonUpdate).not.toHaveBeenCalled();
    });
  });

  describe('refreshTokens', () => {
    it('should issue new tokens and rotate refresh token', async () => {
      const refreshToken = jwtService.signRefreshToken({
        sub: mockUserId,
        tenantId: mockTenantId,
      });

      jest.spyOn(jwtService, 'verifyToken').mockReturnValue({
        sub: mockUserId,
        tenantId: mockTenantId,
        role: '',
        permissions: [],
        type: 'refresh',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockUser);

      const result = await service.refreshTokens(refreshToken);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('should throw if refresh token is revoked', async () => {
      const refreshToken = jwtService.signRefreshToken({
        sub: mockUserId,
        tenantId: mockTenantId,
      });
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

      jest.spyOn(jwtService, 'verifyToken').mockReturnValue({
        sub: mockUserId,
        tenantId: mockTenantId,
        role: '',
        permissions: [],
        type: 'refresh',
      });

      jest.spyOn((prisma as any).refreshToken, 'findUnique').mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000004',
        userId: mockUserId,
        tokenHash,
        revokedAt: new Date(),
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw if refresh token is expired', async () => {
      const refreshToken = jwtService.signRefreshToken({
        sub: mockUserId,
        tenantId: mockTenantId,
      });
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

      jest.spyOn(jwtService, 'verifyToken').mockReturnValue({
        sub: mockUserId,
        tenantId: mockTenantId,
        role: '',
        permissions: [],
        type: 'refresh',
      });

      jest.spyOn((prisma as any).refreshToken, 'findUnique').mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000004',
        userId: mockUserId,
        tokenHash,
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000), // expired
        createdAt: new Date(),
      });

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw if token type is not refresh', async () => {
      const refreshToken = 'some.token.here';

      jest.spyOn(jwtService, 'verifyToken').mockReturnValue({
        sub: mockUserId,
        tenantId: mockTenantId,
        role: 'sp_operator',
        permissions: ['loan.read'],
        type: 'access',
      });

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException);
    });
  });
});
