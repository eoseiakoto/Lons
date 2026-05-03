import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '../auth.guard';

// ---------------------------------------------------------------------------
// Mock JwtService
// ---------------------------------------------------------------------------

function createMockJwtService(overrides: Partial<{ verifyToken: jest.Mock }> = {}) {
  return {
    verifyToken: overrides.verifyToken ?? jest.fn().mockResolvedValue({
      sub: 'user-1',
      tenantId: 'tenant-1',
      role: 'admin',
      permissions: ['read', 'write'],
      type: 'access',
    }),
  };
}

// ---------------------------------------------------------------------------
// Helpers to build mock NestJS execution contexts
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

  // GraphQL resolver args: [root, args, context, info]
  // AuthGuard uses GqlExecutionContext.create(context).getContext().req
  const context = {
    getType: () => 'graphql',
    getHandler: () => ({}),
    getClass: () => ({}),
    getArgs: () => [{}, {}, { req: request }, {}],
    // GqlExecutionContext.create() calls context.getArgByIndex()
    getArgByIndex: (index: number) => [{}, {}, { req: request }, {}][index],
  } as unknown as ExecutionContext;

  return { context, request };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthGuard', () => {
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
  });

  // -------------------------------------------------------------------------
  // Public routes
  // -------------------------------------------------------------------------

  describe('public routes', () => {
    it('allows access when @Public() is set (HTTP)', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
      const jwtService = createMockJwtService();
      const guard = new AuthGuard(reflector, jwtService as any);
      const { context } = makeHttpContext();

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(jwtService.verifyToken).not.toHaveBeenCalled();
    });

    it('allows access when @Public() is set (GraphQL)', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
      const jwtService = createMockJwtService();
      const guard = new AuthGuard(reflector, jwtService as any);
      const { context } = makeGqlContext();

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(jwtService.verifyToken).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // HTTP context
  // -------------------------------------------------------------------------

  describe('HTTP context', () => {
    it('throws UnauthorizedException when no token is provided', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      const guard = new AuthGuard(reflector, createMockJwtService() as any);
      const { context } = makeHttpContext({});

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('validates token and attaches user to request', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      const guard = new AuthGuard(reflector, createMockJwtService() as any);
      const { context, request } = makeHttpContext({ authorization: 'Bearer valid-token' });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.user).toBeDefined();
      expect(request.user.userId).toBe('user-1');
      expect(request.user.tenantId).toBe('tenant-1');
    });

    it('throws when token type is not access', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      const jwtService = createMockJwtService({
        verifyToken: jest.fn().mockResolvedValue({ sub: 'u1', type: 'refresh' }),
      });
      const guard = new AuthGuard(reflector, jwtService as any);
      const { context } = makeHttpContext({ authorization: 'Bearer refresh-token' });

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });
  });

  // -------------------------------------------------------------------------
  // GraphQL context
  // -------------------------------------------------------------------------

  describe('GraphQL context', () => {
    it('throws UnauthorizedException when no token is provided', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      const guard = new AuthGuard(reflector, createMockJwtService() as any);
      const { context } = makeGqlContext({});

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });

    it('validates token and attaches user to request via GraphQL context', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      const guard = new AuthGuard(reflector, createMockJwtService() as any);
      const { context, request } = makeGqlContext({ authorization: 'Bearer valid-token' });

      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.user).toBeDefined();
      expect(request.user.userId).toBe('user-1');
      expect(request.user.tenantId).toBe('tenant-1');
      expect(request.user.role).toBe('admin');
    });

    it('throws when token verification fails in GraphQL context', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      const jwtService = createMockJwtService({
        verifyToken: jest.fn().mockRejectedValue(new Error('Token expired')),
      });
      const guard = new AuthGuard(reflector, jwtService as any);
      const { context } = makeGqlContext({ authorization: 'Bearer expired-token' });

      await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    });
  });
});
