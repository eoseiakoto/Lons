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

function makeGqlContext(user?: Record<string, any>): ExecutionContext {
  const request: Record<string, any> = { user };

  // GraphQL resolver args: [root, args, context, info]
  // RolesGuard uses GqlExecutionContext.create(context).getContext().req
  return {
    getType: () => 'graphql',
    getHandler: () => ({}),
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
});
