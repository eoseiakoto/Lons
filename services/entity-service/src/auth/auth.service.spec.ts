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
    passwordHash: hashedPassword,
    name: 'Test User',
    roleId: mockRoleId,
    mfaSecret: null,
    mfaEnabled: false,
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
    passwordHash: hashedPassword,
    name: 'Platform Admin',
    role: PlatformUserRole.platform_admin,
    mfaSecret: null,
    mfaEnabled: false,
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
          useValue: {
            user: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            platformUser: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
            refreshToken: {
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            $executeRawUnsafe: jest.fn(),
          },
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
      jest.spyOn((prisma as any).refreshToken, 'create').mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000004',
        userId: mockUserId,
        tokenHash: 'hash',
        revokedAt: null,
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      const result = await service.loginTenantUser(mockTenantId, email, password);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user).toEqual({
        userId: mockUserId,
        tenantId: mockTenantId,
        role: 'sp_operator',
        permissions: ['loan.read', 'loan.approve'],
        isPlatformAdmin: false,
      });
      expect((prisma as any).refreshToken.create).toHaveBeenCalled();
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
      jest.spyOn(prisma.platformUser, 'findUnique').mockResolvedValue(mockPlatformUser);
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

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.isPlatformAdmin).toBe(true);
      expect(result.user.tenantId).toBe('platform');
    });

    it('should throw if platform user not found', async () => {
      jest.spyOn(prisma.platformUser, 'findUnique').mockResolvedValue(null);

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
        data: { passwordHash: 'new-hashed-password' },
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

  describe('refreshTokens', () => {
    it('should issue new tokens and rotate refresh token', async () => {
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
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      jest.spyOn((prisma as any).refreshToken, 'findUnique').mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000004',
        userId: mockUserId,
        tokenHash,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 3600 * 1000),
        createdAt: new Date(),
      });

      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(mockUser);
      jest.spyOn((prisma as any).refreshToken, 'update').mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000004',
        userId: mockUserId,
        tokenHash,
        revokedAt: new Date(),
        expiresAt: new Date(),
        createdAt: new Date(),
      });
      jest.spyOn((prisma as any).refreshToken, 'create').mockResolvedValue({
        id: '00000000-0000-0000-0000-000000000005',
        userId: mockUserId,
        tokenHash: 'newhash',
        revokedAt: null,
        expiresAt: new Date(),
        createdAt: new Date(),
      });

      const result = await service.refreshTokens(refreshToken);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect((prisma as any).refreshToken.update).toHaveBeenCalled();
      expect((prisma as any).refreshToken.create).toHaveBeenCalled();
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
