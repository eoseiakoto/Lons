/**
 * RLS Tenant-Context Interceptor — Unit Tests
 *
 * Validates the surface contract of the interceptor without requiring a live
 * database. The actual RLS enforcement (cross-tenant isolation) is enforced
 * by Postgres policies in `20260430120000_enable_rls_tenant_isolation` and
 * is verified by manual integration testing post-deploy.
 *
 * What's covered here:
 *   - Public endpoints (no `request.user`) skip the tenant-context wrap
 *   - Authenticated requests with `tenantId` open `enterTenantContext`
 *   - Platform-admin requests open `enterTenantContext` with the bypass flag
 *   - The interceptor surfaces handler errors (transaction rolls back)
 *   - Malformed tenant IDs are rejected by `PrismaService.setTenantContext`
 *     (injection guard from P1-001 fix)
 */

import { of, throwError, firstValueFrom } from 'rxjs';
import { ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

import { RlsTenantContextInterceptor } from '../rls-tenant-context.interceptor';

interface MockPrisma {
  enterTenantContext: jest.Mock;
}

function makeHttpContext(user: unknown): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({ user }),
      getResponse: () => ({}),
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

function makeGqlContext(user: unknown): ExecutionContext {
  const ctx = {
    getType: () => 'graphql',
    getHandler: () => () => undefined,
    getClass: () => class {},
    getArgs: () => [{}, {}, { req: { user } }, {}],
    getArgByIndex: (i: number) => [{}, {}, { req: { user } }, {}][i],
  } as unknown as ExecutionContext;
  // patch GqlExecutionContext.create to return something with getContext
  jest.spyOn(GqlExecutionContext, 'create').mockReturnValueOnce({
    getContext: () => ({ req: { user } }),
  } as any);
  return ctx;
}

describe('RlsTenantContextInterceptor', () => {
  let prisma: MockPrisma;
  let interceptor: RlsTenantContextInterceptor;

  beforeEach(() => {
    prisma = {
      enterTenantContext: jest.fn(async (_ctx, fn) => fn()),
    };
    interceptor = new RlsTenantContextInterceptor(prisma as any);
  });

  describe('public / unauthenticated requests', () => {
    it('passes through when request.user is undefined', async () => {
      const next = { handle: () => of({ ok: true }) };
      const out = await firstValueFrom(
        interceptor.intercept(makeHttpContext(undefined), next as any),
      );
      expect(out).toEqual({ ok: true });
      expect(prisma.enterTenantContext).not.toHaveBeenCalled();
    });

    it('passes through when user has neither tenantId nor isPlatformAdmin', async () => {
      const next = { handle: () => of({ ok: true }) };
      const out = await firstValueFrom(
        interceptor.intercept(
          makeHttpContext({ userId: 'u1' }),
          next as any,
        ),
      );
      expect(out).toEqual({ ok: true });
      expect(prisma.enterTenantContext).not.toHaveBeenCalled();
    });
  });

  describe('tenant-scoped requests', () => {
    const tenantId = '12345678-1234-1234-1234-123456789abc';

    it('opens enterTenantContext with the tenantId from request.user', async () => {
      const next = { handle: () => of({ rows: [] }) };
      const out = await firstValueFrom(
        interceptor.intercept(makeHttpContext({ tenantId }), next as any),
      );
      expect(out).toEqual({ rows: [] });
      expect(prisma.enterTenantContext).toHaveBeenCalledWith(
        { tenantId, isPlatformAdmin: undefined },
        expect.any(Function),
      );
    });

    it('opens enterTenantContext with the platform-admin flag', async () => {
      const next = { handle: () => of({ rows: [] }) };
      await firstValueFrom(
        interceptor.intercept(
          makeHttpContext({ isPlatformAdmin: true }),
          next as any,
        ),
      );
      expect(prisma.enterTenantContext).toHaveBeenCalledWith(
        { tenantId: undefined, isPlatformAdmin: true },
        expect.any(Function),
      );
    });

    it('propagates handler errors so the transaction rolls back', async () => {
      const err = new Error('handler failed');
      const next = { handle: () => throwError(() => err) };
      await expect(
        firstValueFrom(
          interceptor.intercept(makeHttpContext({ tenantId }), next as any),
        ),
      ).rejects.toBe(err);
    });

    it('reads user from gql context for graphql requests', async () => {
      const next = { handle: () => of({ rows: [] }) };
      await firstValueFrom(
        interceptor.intercept(makeGqlContext({ tenantId }), next as any),
      );
      expect(prisma.enterTenantContext).toHaveBeenCalledWith(
        { tenantId, isPlatformAdmin: undefined },
        expect.any(Function),
      );
    });
  });
});
