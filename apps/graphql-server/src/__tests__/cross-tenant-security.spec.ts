import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@lons/entity-service';

// ---------------------------------------------------------------------------
// Mock JwtService
// ---------------------------------------------------------------------------

function createMockJwtService(overrides: Partial<{ verifyToken: jest.Mock }> = {}) {
  return {
    verifyToken: overrides.verifyToken ?? jest.fn().mockResolvedValue({
      sub: 'user-1',
      tenantId: 'tenant-own',
      role: 'admin',
      permissions: ['read:loans', 'write:loans'],
      type: 'access',
    }),
  };
}

// ---------------------------------------------------------------------------
// Helper to build mock execution contexts
// ---------------------------------------------------------------------------

function makeHttpContext(headers: Record<string, string> = {}): {
  context: ExecutionContext;
  request: Record<string, any>;
} {
  const request: Record<string, any> = { headers };

  const context = {
    getType: () => 'http',
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;

  return { context, request };
}

function makeGqlContext(headers: Record<string, string> = {}): {
  context: ExecutionContext;
  request: Record<string, any>;
} {
  const request: Record<string, any> = { headers };

  const context = {
    getType: () => 'graphql',
    getHandler: () => ({}),
    getClass: () => ({}),
    getArgs: () => [{}, {}, { req: request }, {}],
    getArgByIndex: (index: number) => [{}, {}, { req: request }, {}][index],
  } as unknown as ExecutionContext;

  return { context, request };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Cross-Tenant Security', () => {
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false); // not public
  });

  // ─── Test 1: Non-PLATFORM_ADMIN with X-Tenant-Context → 403 ───────

  it('should reject non-platform-admin user attempting to use X-Tenant-Context', async () => {
    const jwtService = createMockJwtService({
      verifyToken: jest.fn().mockResolvedValue({
        sub: 'user-regular',
        tenantId: 'tenant-own',
        role: 'admin',
        permissions: ['read:loans'],
        type: 'access',
      }),
    });

    const guard = new AuthGuard(reflector, jwtService as any);
    const { context } = makeGqlContext({
      authorization: 'Bearer valid-token',
      'x-tenant-context': 'tenant-other-123e4567-e89b-12d3-a456-426614174000',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should reject non-platform-admin even in HTTP context with X-Tenant-Context', async () => {
    const jwtService = createMockJwtService({
      verifyToken: jest.fn().mockResolvedValue({
        sub: 'user-tenant-admin',
        tenantId: 'tenant-own',
        role: 'tenant_admin',
        permissions: ['read:loans', 'write:loans'],
        type: 'access',
      }),
    });

    const guard = new AuthGuard(reflector, jwtService as any);
    const { context } = makeHttpContext({
      authorization: 'Bearer valid-token',
      'x-tenant-context': '12345678-1234-1234-1234-123456789abc',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  // ─── Test 2: PLATFORM_ADMIN with valid tenant ID → data returned ───

  it('should allow platform_admin to use X-Tenant-Context and set effective tenant', async () => {
    const targetTenantId = '12345678-1234-1234-1234-123456789abc';
    const jwtService = createMockJwtService({
      verifyToken: jest.fn().mockResolvedValue({
        sub: 'platform-admin-user',
        tenantId: 'platform',
        role: 'platform_admin',
        permissions: [],
        type: 'access',
      }),
    });

    const guard = new AuthGuard(reflector, jwtService as any);
    const { context, request } = makeGqlContext({
      authorization: 'Bearer platform-admin-token',
      'x-tenant-context': targetTenantId,
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user).toBeDefined();
    expect(request.user.tenantId).toBe(targetTenantId);
    expect(request.user.isPlatformAdmin).toBe(true);
    expect(request.user.tenantOverride).toBe(targetTenantId);
  });

  it('should allow platform_support role to use X-Tenant-Context', async () => {
    const targetTenantId = 'abcdef12-3456-7890-abcd-ef1234567890';
    const jwtService = createMockJwtService({
      verifyToken: jest.fn().mockResolvedValue({
        sub: 'support-user',
        tenantId: 'platform',
        role: 'platform_support',
        permissions: [],
        type: 'access',
      }),
    });

    const guard = new AuthGuard(reflector, jwtService as any);
    const { context, request } = makeGqlContext({
      authorization: 'Bearer support-token',
      'x-tenant-context': targetTenantId,
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user.tenantId).toBe(targetTenantId);
    expect(request.user.isPlatformAdmin).toBe(true);
  });

  // ─── Test 3: PLATFORM_ADMIN with invalid tenant ID format → error ──

  it('should reject platform_admin when X-Tenant-Context has invalid UUID format', async () => {
    const jwtService = createMockJwtService({
      verifyToken: jest.fn().mockResolvedValue({
        sub: 'platform-admin-user',
        tenantId: 'platform',
        role: 'platform_admin',
        permissions: [],
        type: 'access',
      }),
    });

    const guard = new AuthGuard(reflector, jwtService as any);
    const { context } = makeGqlContext({
      authorization: 'Bearer platform-admin-token',
      'x-tenant-context': 'not-a-valid-uuid',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  // ─── Test 4: Verify audit-relevant fields set for cross-tenant queries ─

  it('should set tenantOverride field on user object for audit trail', async () => {
    const targetTenantId = '99999999-0000-1111-2222-333333333333';
    const jwtService = createMockJwtService({
      verifyToken: jest.fn().mockResolvedValue({
        sub: 'admin-for-audit',
        tenantId: 'platform',
        role: 'platform_admin',
        permissions: [],
        type: 'access',
      }),
    });

    const guard = new AuthGuard(reflector, jwtService as any);
    const { context, request } = makeGqlContext({
      authorization: 'Bearer admin-token',
      'x-tenant-context': targetTenantId,
    });

    await guard.canActivate(context);

    // The tenantOverride field enables audit logging of cross-tenant access
    expect(request.user.tenantOverride).toBe(targetTenantId);
    expect(request.user.userId).toBe('admin-for-audit');
    expect(request.user.role).toBe('platform_admin');
    // The original tenantId is overridden to the target
    expect(request.user.tenantId).toBe(targetTenantId);
  });

  it('should NOT set tenantOverride when no X-Tenant-Context header is present', async () => {
    const jwtService = createMockJwtService({
      verifyToken: jest.fn().mockResolvedValue({
        sub: 'admin-no-override',
        tenantId: 'platform',
        role: 'platform_admin',
        permissions: [],
        type: 'access',
      }),
    });

    const guard = new AuthGuard(reflector, jwtService as any);
    const { context, request } = makeGqlContext({
      authorization: 'Bearer admin-token',
    });

    await guard.canActivate(context);

    expect(request.user.tenantId).toBe('platform');
    expect(request.user.tenantOverride).toBeUndefined();
  });
});
