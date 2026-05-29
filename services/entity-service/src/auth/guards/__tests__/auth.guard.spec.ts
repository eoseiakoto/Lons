import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
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

  // -------------------------------------------------------------------------
  // MFA-lockout fix: enrollment-only scoped tokens
  // -------------------------------------------------------------------------

  describe('mfa_enrollment_only scope (MFA lockout fix)', () => {
    // Build a GraphQL context whose `getHandler()` returns a real
    // function with a name property — the guard reads
    // context.getHandler().name to check against the allow-list.
    function makeScopedCtx(handlerName: string, headers: Record<string, string> = {}) {
      const request: Record<string, any> = { headers };
      const handlerFn = function namedHandler() {};
      Object.defineProperty(handlerFn, 'name', { value: handlerName });
      const ctx = {
        getType: () => 'graphql',
        getHandler: () => handlerFn,
        getClass: () => ({}),
        getArgs: () => [{}, {}, { req: request }, {}],
        getArgByIndex: (index: number) => [{}, {}, { req: request }, {}][index],
      } as unknown as ExecutionContext;
      return { context: ctx, request };
    }

    const enrollmentScopedPayload = {
      sub: 'user-1',
      tenantId: 'tenant-1',
      role: 'SP Admin',
      permissions: [],
      type: 'access' as const,
      scope: 'mfa_enrollment_only' as const,
    };

    it('admits an enrollment-only token on the initiateMfaEnrollment handler', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      const jwtService = createMockJwtService({
        verifyToken: jest.fn().mockResolvedValue(enrollmentScopedPayload),
      });
      const guard = new AuthGuard(reflector, jwtService as any);
      const { context, request } = makeScopedCtx('initiateMfaEnrollment', {
        authorization: 'Bearer scoped-token',
      });
      await expect(guard.canActivate(context)).resolves.toBe(true);
      // Scope is carried through onto request.user so downstream
      // code (e.g. CurrentUser decorator) sees it.
      expect(request.user.scope).toBe('mfa_enrollment_only');
    });

    it('admits an enrollment-only token on the me query', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      const jwtService = createMockJwtService({
        verifyToken: jest.fn().mockResolvedValue(enrollmentScopedPayload),
      });
      const guard = new AuthGuard(reflector, jwtService as any);
      const { context } = makeScopedCtx('me', { authorization: 'Bearer scoped-token' });
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });

    it('REJECTS an enrollment-only token on any other handler', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      const jwtService = createMockJwtService({
        verifyToken: jest.fn().mockResolvedValue(enrollmentScopedPayload),
      });
      const guard = new AuthGuard(reflector, jwtService as any);
      const { context } = makeScopedCtx('createCollectionsCase', {
        authorization: 'Bearer scoped-token',
      });
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    });

    it('admits a full-scope token (no `scope` field) on any handler', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
      const jwtService = createMockJwtService(); // default = no scope
      const guard = new AuthGuard(reflector, jwtService as any);
      const { context } = makeScopedCtx('anyOtherHandler', {
        authorization: 'Bearer full-token',
      });
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });
});
