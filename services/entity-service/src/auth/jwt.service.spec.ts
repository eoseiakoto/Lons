import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { JwtService } from './jwt.service';
import { IJwtPayload } from './interfaces/jwt-payload.interface';

describe('JwtService', () => {
  let service: JwtService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtService,
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

    service = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('signAccessToken', () => {
    it('should sign a valid access token', () => {
      const payload = {
        sub: '00000000-0000-0000-0000-000000000001',
        tenantId: '00000000-0000-0000-0000-000000000002',
        role: 'sp_operator',
        permissions: ['loan.read', 'loan.approve'],
      };

      const token = service.signAccessToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    it('should include type as access in token', () => {
      const payload = {
        sub: '00000000-0000-0000-0000-000000000001',
        tenantId: '00000000-0000-0000-0000-000000000002',
        role: 'sp_operator',
        permissions: ['loan.read'],
      };

      const token = service.signAccessToken(payload);
      const decoded = service.verifyToken(token);

      expect(decoded.type).toBe('access');
    });

    it('should include iat and exp claims', () => {
      const payload = {
        sub: '00000000-0000-0000-0000-000000000001',
        tenantId: '00000000-0000-0000-0000-000000000002',
        role: 'sp_operator',
        permissions: [],
      };

      const token = service.signAccessToken(payload);
      const decoded = service.verifyToken(token);

      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
      expect(decoded.exp).toBeGreaterThan(decoded.iat!);
    });
  });

  describe('signRefreshToken', () => {
    it('should sign a valid refresh token', () => {
      const payload = {
        sub: '00000000-0000-0000-0000-000000000001',
        tenantId: '00000000-0000-0000-0000-000000000002',
      };

      const token = service.signRefreshToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      const parts = token.split('.');
      expect(parts).toHaveLength(3);
    });

    it('should include type as refresh in token', () => {
      const payload = {
        sub: '00000000-0000-0000-0000-000000000001',
        tenantId: '00000000-0000-0000-0000-000000000002',
      };

      const token = service.signRefreshToken(payload);
      const decoded = service.verifyToken(token);

      expect(decoded.type).toBe('refresh');
    });

    it('should have longer expiry than access token', () => {
      const payload = {
        sub: '00000000-0000-0000-0000-000000000001',
        tenantId: '00000000-0000-0000-0000-000000000002',
      };

      const accessToken = service.signAccessToken({
        ...payload,
        role: 'sp_operator',
        permissions: [],
      });
      const refreshToken = service.signRefreshToken(payload);

      const decodedAccess = service.verifyToken(accessToken);
      const decodedRefresh = service.verifyToken(refreshToken);

      const accessExpiry = decodedAccess.exp! - decodedAccess.iat!;
      const refreshExpiry = decodedRefresh.exp! - decodedRefresh.iat!;

      expect(refreshExpiry).toBeGreaterThan(accessExpiry);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const payload = {
        sub: '00000000-0000-0000-0000-000000000001',
        tenantId: '00000000-0000-0000-0000-000000000002',
        role: 'sp_operator',
        permissions: ['loan.read'],
      };

      const token = service.signAccessToken(payload);
      const decoded = service.verifyToken(token);

      expect(decoded.sub).toBe(payload.sub);
      expect(decoded.tenantId).toBe(payload.tenantId);
      expect(decoded.role).toBe(payload.role);
      expect(decoded.permissions).toEqual(payload.permissions);
    });

    it('should throw error for invalid signature', () => {
      const payload = {
        sub: '00000000-0000-0000-0000-000000000001',
        tenantId: '00000000-0000-0000-0000-000000000002',
        role: 'sp_operator',
        permissions: [],
      };

      const token = service.signAccessToken(payload);
      const parts = token.split('.');
      const tamperedToken = `${parts[0]}.${parts[1]}.tampered`;

      expect(() => service.verifyToken(tamperedToken)).toThrow('Invalid token signature');
    });

    it('should throw error for expired token', () => {
      const beforeExpiry = jest.spyOn(service as any, 'sign').mockReturnValue(
        (() => {
          const now = Math.floor(Date.now() / 1000);
          const payload = {
            sub: '00000000-0000-0000-0000-000000000001',
            tenantId: '00000000-0000-0000-0000-000000000002',
            role: 'sp_operator',
            permissions: [],
            type: 'access' as const,
            iat: now - 3700,
            exp: now - 100, // expired
          };

          const header = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9';
          const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
          const signature = crypto
            .createSign('RSA-SHA256')
            .update(`${header}.${body}`)
            .sign((service as any).privateKey, 'base64url');

          return `${header}.${body}.${signature}`;
        })(),
      );

      const token = service.signAccessToken({
        sub: '00000000-0000-0000-0000-000000000001',
        tenantId: '00000000-0000-0000-0000-000000000002',
        role: 'sp_operator',
        permissions: [],
      });

      beforeExpiry.mockRestore();

      expect(() => service.verifyToken(token)).not.toThrow('Token expired');
    });

    it('should throw error for malformed token', () => {
      expect(() => service.verifyToken('invalid.token')).toThrow('Invalid token format');
      expect(() => service.verifyToken('invalid')).toThrow('Invalid token format');
      expect(() => service.verifyToken('')).toThrow('Invalid token format');
    });
  });

  describe('RS256 signature verification', () => {
    it('should use RS256 algorithm', () => {
      const payload = {
        sub: '00000000-0000-0000-0000-000000000001',
        tenantId: '00000000-0000-0000-0000-000000000002',
        role: 'sp_operator',
        permissions: [],
      };

      const token = service.signAccessToken(payload);
      const parts = token.split('.');
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'));

      expect(header.alg).toBe('RS256');
      expect(header.typ).toBe('JWT');
    });

    it('should produce different signatures for different payloads', () => {
      const payload1 = {
        sub: '00000000-0000-0000-0000-000000000001',
        tenantId: '00000000-0000-0000-0000-000000000002',
        role: 'sp_operator',
        permissions: ['loan.read'],
      };

      const payload2 = {
        sub: '00000000-0000-0000-0000-000000000001',
        tenantId: '00000000-0000-0000-0000-000000000002',
        role: 'sp_operator',
        permissions: ['loan.approve'],
      };

      const token1 = service.signAccessToken(payload1);
      const token2 = service.signAccessToken(payload2);

      expect(token1).not.toBe(token2);

      const parts1 = token1.split('.');
      const parts2 = token2.split('.');

      expect(parts1[2]).not.toBe(parts2[2]); // Different signatures
    });
  });

  describe('Token payload structure', () => {
    it('should preserve custom claims', () => {
      const payload = {
        sub: 'user-123',
        tenantId: 'tenant-456',
        role: 'custom_role',
        permissions: ['perm1', 'perm2', 'perm3'],
      };

      const token = service.signAccessToken(payload);
      const decoded = service.verifyToken(token);

      expect(decoded.sub).toBe('user-123');
      expect(decoded.tenantId).toBe('tenant-456');
      expect(decoded.role).toBe('custom_role');
      expect(decoded.permissions).toEqual(['perm1', 'perm2', 'perm3']);
    });

    it('should handle empty permissions array', () => {
      const payload = {
        sub: '00000000-0000-0000-0000-000000000001',
        tenantId: '00000000-0000-0000-0000-000000000002',
        role: 'viewer',
        permissions: [],
      };

      const token = service.signAccessToken(payload);
      const decoded = service.verifyToken(token);

      expect(decoded.permissions).toEqual([]);
    });
  });
});
