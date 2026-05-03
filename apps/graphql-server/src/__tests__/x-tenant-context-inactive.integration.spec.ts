import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@lons/entity-service';

// ---------------------------------------------------------------------------
// Mock JwtService
// ---------------------------------------------------------------------------

function createMockJwtService(overrides: Partial<{ verifyToken: jest.Mock }> = {}) {
  return {
    verifyToken: overrides.verifyToken ?? jest.fn().mockResolvedValue({
      sub: 'platform-admin-user',
      tenantId: 'platform',
      role: 'platform_admin',
      permissions: [],
      type: 'access',
    }),
  };
}

// ---------------------------------------------------------------------------
// Mock PrismaService — returns tenant lookup results
// ---------------------------------------------------------------------------

function createMockPrisma(tenants: Record<string, { status: string }>) {
  return {
    tenant: {
      findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
        const tenant = tenants[where.id];
        return Promise.resolve(tenant ?? null);
      }),
    },
    auditLog: {
      create: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
    },
  };
}

// ---------------------------------------------------------------------------
// Helper to build mock GQL execution context
// ---------------------------------------------------------------------------

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
// Constants
// ---------------------------------------------------------------------------

const ACTIVE_TENANT_ID = 'aaaaaaaa-1111-2222-3333-aaaaaaaaaaaa';
const INACTIVE_TENANT_ID = 'bbbbbbbb-1111-2222-3333-bbbbbbbbbbbb';

// ---------------------------------------------------------------------------
// Tests — X-Tenant-Context with inactive tenant (integration)
// ---------------------------------------------------------------------------

describe('X-Tenant-Context with inactive tenant (integration)', () => {
  let reflector: Reflector;
  let jwtService: ReturnType<typeof createMockJwtService>;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    jwtService = createMockJwtService();
    prisma = createMockPrisma({
      [ACTIVE_TENANT_ID]: { status: 'active' },
      [INACTIVE_TENANT_ID]: { status: 'suspended' },
    });
  });

  it('should return a meaningful error when X-Tenant-Context targets an inactive tenant', async () => {
    const guard = new AuthGuard(reflector, jwtService as any, prisma as any);
    const { context } = makeGqlContext({
      authorization: 'Bearer platform-admin-token',
      'x-tenant-context': INACTIVE_TENANT_ID,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(context)).rejects.toThrow(/inactive/i);

    // Must NOT be a 500 or a generic auth error
    try {
      await guard.canActivate(context);
    } catch (err: any) {
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.message).toMatch(/inactive/i);
      // Verify it's NOT an UnauthorizedException (generic catch-all)
      expect(err).not.toBeInstanceOf(UnauthorizedException);
    }
  });

  it('should return a meaningful error for a non-existent tenant ID', async () => {
    const nonExistentId = '99999999-0000-0000-0000-999999999999';
    const guard = new AuthGuard(reflector, jwtService as any, prisma as any);
    const { context } = makeGqlContext({
      authorization: 'Bearer platform-admin-token',
      'x-tenant-context': nonExistentId,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(context)).rejects.toThrow(/does not exist/i);
  });

  it('should NOT create an audit log entry for rejected inactive tenant access', async () => {
    // The guard throws ForbiddenException before the handler runs.
    // The audit interceptor (audit-event.interceptor.ts) only logs on
    // successful handler resolution (uses tap() after next.handle()).
    // Therefore, no audit entry should be created.
    const guard = new AuthGuard(reflector, jwtService as any, prisma as any);
    const { context } = makeGqlContext({
      authorization: 'Bearer platform-admin-token',
      'x-tenant-context': INACTIVE_TENANT_ID,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);

    // Verify audit log was never written to
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('should continue working normally after an inactive tenant rejection', async () => {
    const guard = new AuthGuard(reflector, jwtService as any, prisma as any);

    // Request 1: targets inactive tenant — should fail
    const { context: ctx1 } = makeGqlContext({
      authorization: 'Bearer platform-admin-token',
      'x-tenant-context': INACTIVE_TENANT_ID,
    });

    await expect(guard.canActivate(ctx1)).rejects.toThrow(ForbiddenException);

    // Request 2: targets active tenant — should succeed
    const { context: ctx2, request: req2 } = makeGqlContext({
      authorization: 'Bearer platform-admin-token',
      'x-tenant-context': ACTIVE_TENANT_ID,
    });

    const result = await guard.canActivate(ctx2);

    expect(result).toBe(true);
    expect(req2.user.tenantId).toBe(ACTIVE_TENANT_ID);
    expect(req2.user.isPlatformAdmin).toBe(true);
  });

  it('should reject tenants with provisioning status', async () => {
    const provisioningId = 'cccccccc-1111-2222-3333-cccccccccccc';
    const prismaWithProvisioning = createMockPrisma({
      [provisioningId]: { status: 'provisioning' },
    });

    const guard = new AuthGuard(reflector, jwtService as any, prismaWithProvisioning as any);
    const { context } = makeGqlContext({
      authorization: 'Bearer platform-admin-token',
      'x-tenant-context': provisioningId,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(context)).rejects.toThrow(/inactive/i);
  });

  it('should reject tenants with decommissioned status', async () => {
    const decommissionedId = 'dddddddd-1111-2222-3333-dddddddddddd';
    const prismaWithDecommissioned = createMockPrisma({
      [decommissionedId]: { status: 'decommissioned' },
    });

    const guard = new AuthGuard(reflector, jwtService as any, prismaWithDecommissioned as any);
    const { context } = makeGqlContext({
      authorization: 'Bearer platform-admin-token',
      'x-tenant-context': decommissionedId,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(context)).rejects.toThrow(/inactive/i);
  });
});
