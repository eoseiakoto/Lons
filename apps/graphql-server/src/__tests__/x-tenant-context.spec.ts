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
// Shared constants
// ---------------------------------------------------------------------------

const TENANT_B_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const NONEXISTENT_TENANT_ID = '00000000-0000-0000-0000-000000000000';
const PLATFORM_ADMIN_TOKEN_PAYLOAD = {
  sub: 'platform-admin-user',
  tenantId: 'platform',
  role: 'platform_admin',
  permissions: [],
  type: 'access',
};

// ---------------------------------------------------------------------------
// Tests — X-Tenant-Context Header Security
// ---------------------------------------------------------------------------

describe('X-Tenant-Context Header Security', () => {
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false); // not public
  });

  // ─── Test 1: Non-PLATFORM_ADMIN rejected when using X-Tenant-Context ──

  it('should reject non-PLATFORM_ADMIN user when X-Tenant-Context header is present', async () => {
    const jwtService = createMockJwtService({
      verifyToken: jest.fn().mockResolvedValue({
        sub: 'sp-admin-user',
        tenantId: 'tenant-own',
        role: 'admin',
        permissions: ['read:loans', 'write:loans'],
        type: 'access',
      }),
    });

    const guard = new AuthGuard(reflector, jwtService as any);
    const { context } = makeGqlContext({
      authorization: 'Bearer valid-token',
      'x-tenant-context': TENANT_B_ID,
    });

    // The guard throws UnauthorizedException for non-platform roles attempting
    // to use X-Tenant-Context. The inner exception message is
    // "Only platform admins can use X-Tenant-Context" but the catch-all block
    // re-throws it as "Invalid or expired token".
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  // ─── Test 2: PLATFORM_ADMIN with valid tenant ID succeeds ─────────────

  it('should allow PLATFORM_ADMIN with valid X-Tenant-Context and set effective tenantId', async () => {
    const jwtService = createMockJwtService({
      verifyToken: jest.fn().mockResolvedValue({ ...PLATFORM_ADMIN_TOKEN_PAYLOAD }),
    });

    const guard = new AuthGuard(reflector, jwtService as any);
    const { context, request } = makeGqlContext({
      authorization: 'Bearer platform-admin-token',
      'x-tenant-context': TENANT_B_ID,
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user).toBeDefined();
    expect(request.user.tenantId).toBe(TENANT_B_ID);
    expect(request.user.isPlatformAdmin).toBe(true);
  });

  // ─── Test 3: PLATFORM_ADMIN with non-existent tenant ID — guard passes ─
  //
  // The auth guard validates UUID format only. Tenant existence is checked
  // downstream at the resolver/service level, not in the guard.

  it('should pass guard for PLATFORM_ADMIN with valid-format-but-nonexistent tenant UUID', async () => {
    const jwtService = createMockJwtService({
      verifyToken: jest.fn().mockResolvedValue({ ...PLATFORM_ADMIN_TOKEN_PAYLOAD }),
    });

    const guard = new AuthGuard(reflector, jwtService as any);
    const { context, request } = makeGqlContext({
      authorization: 'Bearer platform-admin-token',
      'x-tenant-context': NONEXISTENT_TENANT_ID,
    });

    const result = await guard.canActivate(context);

    // Guard returns true — it only validates UUID format, not existence.
    // Tenant existence validation happens at the resolver/service level.
    expect(result).toBe(true);
    expect(request.user.tenantId).toBe(NONEXISTENT_TENANT_ID);
    expect(request.user.tenantOverride).toBe(NONEXISTENT_TENANT_ID);
  });

  // ─── Test 4: PLATFORM_ADMIN with invalid tenant ID format → error ─────

  it('should reject PLATFORM_ADMIN when X-Tenant-Context has invalid UUID format', async () => {
    // Note: empty string '' is treated as falsy by the guard, so it is
    // equivalent to not sending the header at all and is not tested here.
    const invalidFormats = [
      'not-a-uuid',
      '12345',
      'null',
      "'; DROP TABLE--",  // SQL injection attempt
    ];

    for (const invalidValue of invalidFormats) {
      const jwtService = createMockJwtService({
        verifyToken: jest.fn().mockResolvedValue({ ...PLATFORM_ADMIN_TOKEN_PAYLOAD }),
      });

      const guard = new AuthGuard(reflector, jwtService as any);
      const { context } = makeGqlContext({
        authorization: 'Bearer platform-admin-token',
        'x-tenant-context': invalidValue,
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    }
  });

  // ─── Test 5: Audit log entry fields set correctly for cross-tenant access ─

  it('should set all audit-relevant fields on request.user for cross-tenant access', async () => {
    const jwtService = createMockJwtService({
      verifyToken: jest.fn().mockResolvedValue({ ...PLATFORM_ADMIN_TOKEN_PAYLOAD }),
    });

    const guard = new AuthGuard(reflector, jwtService as any);
    const { context, request } = makeGqlContext({
      authorization: 'Bearer platform-admin-token',
      'x-tenant-context': TENANT_B_ID,
    });

    await guard.canActivate(context);

    // Verify all audit-critical fields
    expect(request.user).toEqual(
      expect.objectContaining({
        userId: 'platform-admin-user',         // from JWT sub
        tenantId: TENANT_B_ID,                 // overridden to target
        tenantOverride: TENANT_B_ID,           // set for audit trail
        isPlatformAdmin: true,
        role: 'platform_admin',
      }),
    );
  });

  // ─── Test 6: Session isolation — override doesn't leak across requests ─

  it('should not leak tenant override between separate requests', async () => {
    const jwtService = createMockJwtService({
      verifyToken: jest.fn().mockResolvedValue({ ...PLATFORM_ADMIN_TOKEN_PAYLOAD }),
    });

    // Request 1: WITH X-Tenant-Context header
    const guard1 = new AuthGuard(reflector, jwtService as any);
    const { context: ctx1, request: req1 } = makeGqlContext({
      authorization: 'Bearer platform-admin-token',
      'x-tenant-context': TENANT_B_ID,
    });

    await guard1.canActivate(ctx1);
    expect(req1.user.tenantId).toBe(TENANT_B_ID);
    expect(req1.user.tenantOverride).toBe(TENANT_B_ID);

    // Request 2: WITHOUT X-Tenant-Context header (new execution context)
    const guard2 = new AuthGuard(reflector, jwtService as any);
    const { context: ctx2, request: req2 } = makeGqlContext({
      authorization: 'Bearer platform-admin-token',
    });

    await guard2.canActivate(ctx2);
    expect(req2.user.tenantId).toBe('platform');       // admin's own tenant
    expect(req2.user.tenantOverride).toBeUndefined();   // no override leakage
  });

  // ─── Test 7: Invalid UUID format rejected — comprehensive ─────────────

  it('should reject all invalid UUID formats comprehensively', async () => {
    const invalidUuids = [
      'not-a-valid-uuid',
      '123',
      'abc-def-ghi',
      '../../../etc/passwd',  // path traversal attempt
    ];

    for (const invalidUuid of invalidUuids) {
      const jwtService = createMockJwtService({
        verifyToken: jest.fn().mockResolvedValue({ ...PLATFORM_ADMIN_TOKEN_PAYLOAD }),
      });

      const guard = new AuthGuard(reflector, jwtService as any);
      const { context } = makeHttpContext({
        authorization: 'Bearer platform-admin-token',
        'x-tenant-context': invalidUuid,
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException,
      );
    }
  });
});
