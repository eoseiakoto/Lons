import { ExecutionContext } from '@nestjs/common';
import { SubscriptionAuthGuard } from '../subscription-auth.guard';

function makeContext(connectionParams: Record<string, any>): ExecutionContext {
  const client = { connectionParams };
  return {
    switchToWs: () => ({
      getClient: () => client,
    }),
  } as unknown as ExecutionContext;
}

describe('SubscriptionAuthGuard', () => {
  let guard: SubscriptionAuthGuard;

  beforeEach(() => {
    guard = new SubscriptionAuthGuard({
      verifyToken: () => ({ sub: 'test', tenantId: 't1', role: 'admin', permissions: [] }),
    } as any);
  });

  it('returns true when authToken is present', () => {
    const ctx = makeContext({ authToken: 'Bearer eyJhbGciOiJSUzI1NiJ9.test' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('returns true when Authorization header is present', () => {
    const ctx = makeContext({ Authorization: 'Bearer token' });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('returns false when no token is provided', () => {
    const ctx = makeContext({});
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('returns false when connectionParams is missing entirely', () => {
    const client = {};
    const ctx = {
      switchToWs: () => ({ getClient: () => client }),
    } as unknown as ExecutionContext;
    expect(guard.canActivate(ctx)).toBe(false);
  });
});
