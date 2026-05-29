import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../roles.guard';

// ---------------------------------------------------------------------------
// Helpers to build mock NestJS execution contexts
// ---------------------------------------------------------------------------

function makeHttpContext(user?: Record<string, any>): ExecutionContext {
  const request: Record<string, any> = { user };

  return {
    getType: () => 'http',
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function makeGqlContext(
  user?: Record<string, any>,
  handlerName = 'someResolver',
): ExecutionContext {
  const request: Record<string, any> = { user };

  // GraphQL resolver args: [root, args, context, info].
  // RolesGuard uses GqlExecutionContext.create(context).getContext().req
  // and context.getHandler().name for the audit log.
  const handlerFn = function someResolver() {};
  Object.defineProperty(handlerFn, 'name', { value: handlerName });
  return {
    getType: () => 'graphql',
    getHandler: () => handlerFn,
    getClass: () => ({}),
    getArgs: () => [{}, {}, { req: request }, {}],
    getArgByIndex: (index: number) => [{}, {}, { req: request }, {}][index],
  } as unknown as ExecutionContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RolesGuard', () => {
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
  });

  // -------------------------------------------------------------------------
  // Shared logic tests (using HTTP context)
  // -------------------------------------------------------------------------

  it('allows access when @Public() is set', () => {
    jest.spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(true); // isPublic
    const guard = new RolesGuard(reflector);
    const ctx = makeHttpContext();

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows access when no permissions are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false)  // isPublic
      .mockReturnValueOnce(null);  // requiredPermissions
    const guard = new RolesGuard(reflector);
    const ctx = makeHttpContext({ permissions: [] });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws ForbiddenException when no user is present', () => {
    jest.spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false)           // isPublic
      .mockReturnValueOnce(['write:loans']); // requiredPermissions
    const guard = new RolesGuard(reflector);
    const ctx = makeHttpContext(undefined);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('allows platform admin regardless of permissions', () => {
    jest.spyOn(reflector, 'getAllAndOverride')
      .mockReturnValueOnce(false)              // isPublic
      .mockReturnValueOnce(['super:secret']);   // requiredPermissions
    const guard = new RolesGuard(reflector);
    const ctx = makeHttpContext({
      isPlatformAdmin: true,
      permissions: [],
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  // -------------------------------------------------------------------------
  // HTTP context
  // -------------------------------------------------------------------------

  describe('HTTP context', () => {
    it('allows when user has required permissions', () => {
      jest.spyOn(reflector, 'getAllAndOverride')
        .mockReturnValueOnce(false)              // isPublic
        .mockReturnValueOnce(['read:loans']);     // requiredPermissions
      const guard = new RolesGuard(reflector);
      const ctx = makeHttpContext({
        isPlatformAdmin: false,
        permissions: ['read:loans', 'write:loans'],
      });

      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('throws ForbiddenException when user lacks permissions', () => {
      jest.spyOn(reflector, 'getAllAndOverride')
        .mockReturnValueOnce(false)              // isPublic
        .mockReturnValueOnce(['write:loans']);    // requiredPermissions
      const guard = new RolesGuard(reflector);
      const ctx = makeHttpContext({
        isPlatformAdmin: false,
        permissions: ['read:loans'],
      });

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });

  // -------------------------------------------------------------------------
  // GraphQL context
  // -------------------------------------------------------------------------

  describe('GraphQL context', () => {
    it('allows when user has required permissions', () => {
      jest.spyOn(reflector, 'getAllAndOverride')
        .mockReturnValueOnce(false)              // isPublic
        .mockReturnValueOnce(['read:loans']);     // requiredPermissions
      const guard = new RolesGuard(reflector);
      const ctx = makeGqlContext({
        isPlatformAdmin: false,
        permissions: ['read:loans', 'write:loans'],
      });

      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('throws ForbiddenException when user lacks permissions', () => {
      jest.spyOn(reflector, 'getAllAndOverride')
        .mockReturnValueOnce(false)              // isPublic
        .mockReturnValueOnce(['write:loans']);    // requiredPermissions
      const guard = new RolesGuard(reflector);
      const ctx = makeGqlContext({
        isPlatformAdmin: false,
        permissions: ['read:loans'],
      });

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when no user in GraphQL context', () => {
      jest.spyOn(reflector, 'getAllAndOverride')
        .mockReturnValueOnce(false)              // isPublic
        .mockReturnValueOnce(['read:loans']);     // requiredPermissions
      const guard = new RolesGuard(reflector);
      const ctx = makeGqlContext(undefined);

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('allows platform admin in GraphQL context', () => {
      jest.spyOn(reflector, 'getAllAndOverride')
        .mockReturnValueOnce(false)              // isPublic
        .mockReturnValueOnce(['super:secret']);   // requiredPermissions
      const guard = new RolesGuard(reflector);
      const ctx = makeGqlContext({
        isPlatformAdmin: true,
        permissions: [],
      });

      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // BA-C-1: AuthFailureLoggerService wiring
  // -------------------------------------------------------------------------

  describe('audit logging (BA-C-1)', () => {
    it('calls AuthFailureLoggerService on permission denial', () => {
      jest.spyOn(reflector, 'getAllAndOverride')
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(['write:loans', 'admin:secret']);

      const logSpy = jest.fn().mockResolvedValue(undefined);
      const logger = { logMutationAccessDenied: logSpy } as any;
      const guard = new RolesGuard(reflector, logger);

      const user = {
        userId: 'user-1',
        tenantId: 'tenant-1',
        role: 'sp_operator',
        permissions: ['read:loans'],
        isPlatformAdmin: false,
      };
      const ctx = makeGqlContext(user);

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
      // Logger receives the user + handler name + the full required-perm
      // array so auditors see exactly which permissions were missing.
      expect(logSpy).toHaveBeenCalledWith(
        user,
        expect.any(String),
        ['write:loans', 'admin:secret'],
      );
    });

    it('does NOT call the logger on successful permission check', () => {
      jest.spyOn(reflector, 'getAllAndOverride')
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(['read:loans']);

      const logSpy = jest.fn().mockResolvedValue(undefined);
      const logger = { logMutationAccessDenied: logSpy } as any;
      const guard = new RolesGuard(reflector, logger);

      const ctx = makeGqlContext({
        userId: 'user-1',
        tenantId: 'tenant-1',
        role: 'sp_operator',
        permissions: ['read:loans'],
        isPlatformAdmin: false,
      });

      expect(guard.canActivate(ctx)).toBe(true);
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('still throws Forbidden when the logger throws (fire-and-forget)', () => {
      jest.spyOn(reflector, 'getAllAndOverride')
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(['write:loans']);

      // Logger rejects synchronously — guard must still throw
      // ForbiddenException without bubbling the logger's failure.
      const logger = {
        logMutationAccessDenied: jest.fn().mockRejectedValue(new Error('audit down')),
      } as any;
      const guard = new RolesGuard(reflector, logger);
      const ctx = makeGqlContext({
        userId: 'user-1',
        tenantId: 'tenant-1',
        role: 'sp_operator',
        permissions: [],
        isPlatformAdmin: false,
      });

      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('falls back gracefully when the logger is not injected', () => {
      jest.spyOn(reflector, 'getAllAndOverride')
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(['write:loans']);
      const guard = new RolesGuard(reflector); // no logger
      const ctx = makeGqlContext({
        userId: 'user-1',
        tenantId: 'tenant-1',
        role: 'sp_operator',
        permissions: [],
        isPlatformAdmin: false,
      });
      expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    });
  });
});
