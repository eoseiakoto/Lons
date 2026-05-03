import { ExecutionContext } from '@nestjs/common';
import { IpWhitelistGuard } from '../ip-whitelist.guard';

// ---------------------------------------------------------------------------
// Helpers to build mock NestJS execution contexts
// ---------------------------------------------------------------------------

function makeHttpContext(ip: string, tenantSettings?: any, xForwardedFor?: string): ExecutionContext {
  const headers: Record<string, string> = {};
  if (xForwardedFor) {
    headers['x-forwarded-for'] = xForwardedFor;
  }

  const req = {
    ip,
    headers,
    user: tenantSettings ? { tenantSettings } : undefined,
  };

  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function makeGqlContext(ip: string, tenantSettings?: any, xForwardedFor?: string): ExecutionContext {
  const headers: Record<string, string> = {};
  if (xForwardedFor) {
    headers['x-forwarded-for'] = xForwardedFor;
  }

  const req = {
    ip,
    headers,
    user: tenantSettings ? { tenantSettings } : undefined,
  };

  // GraphQL resolver args: [root, args, context, info]
  const gqlArgs = [{}, {}, { req }, {}];

  return {
    getType: () => 'graphql',
    getArgs: () => gqlArgs,
  } as unknown as ExecutionContext;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IpWhitelistGuard', () => {
  let guard: IpWhitelistGuard;

  beforeEach(() => {
    guard = new IpWhitelistGuard();
  });

  // -------------------------------------------------------------------------
  // HTTP context tests
  // -------------------------------------------------------------------------

  describe('HTTP context', () => {
    it('allows all traffic when no tenant settings are configured', () => {
      const ctx = makeHttpContext('1.2.3.4');
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows all traffic when tenantSettings has no ipWhitelist', () => {
      const ctx = makeHttpContext('1.2.3.4', { someOtherSetting: true });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows all traffic when ipWhitelist is an empty array', () => {
      const ctx = makeHttpContext('1.2.3.4', { ipWhitelist: [] });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows a request from an IP in the whitelist', () => {
      const ctx = makeHttpContext('192.168.1.10', { ipWhitelist: ['192.168.1.10', '10.0.0.1'] });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('blocks a request from an IP not in the whitelist', () => {
      const ctx = makeHttpContext('99.99.99.99', { ipWhitelist: ['192.168.1.10', '10.0.0.1'] });
      expect(guard.canActivate(ctx)).toBe(false);
    });

    it('uses the first IP from X-Forwarded-For when present', () => {
      const ctx = makeHttpContext(
        '127.0.0.1',
        { ipWhitelist: ['203.0.113.5'] },
        '203.0.113.5, 10.0.0.1',
      );
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('blocks when X-Forwarded-For IP is not whitelisted', () => {
      const ctx = makeHttpContext(
        '127.0.0.1',
        { ipWhitelist: ['203.0.113.5'] },
        '8.8.8.8, 10.0.0.1',
      );
      expect(guard.canActivate(ctx)).toBe(false);
    });

    it('reads tenantSettings from req directly when not on req.user', () => {
      const req = {
        ip: '10.0.0.5',
        headers: {},
        tenantSettings: { ipWhitelist: ['10.0.0.5'] },
      };
      const ctx = {
        getType: () => 'http',
        switchToHttp: () => ({ getRequest: () => req }),
      } as unknown as ExecutionContext;

      expect(guard.canActivate(ctx)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // GraphQL context tests
  // -------------------------------------------------------------------------

  describe('GraphQL context', () => {
    it('allows all traffic when no tenant settings are configured', () => {
      const ctx = makeGqlContext('1.2.3.4');
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('allows a request from an IP in the whitelist', () => {
      const ctx = makeGqlContext('192.168.1.10', { ipWhitelist: ['192.168.1.10', '10.0.0.1'] });
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('blocks a request from an IP not in the whitelist', () => {
      const ctx = makeGqlContext('99.99.99.99', { ipWhitelist: ['192.168.1.10', '10.0.0.1'] });
      expect(guard.canActivate(ctx)).toBe(false);
    });

    it('uses the first IP from X-Forwarded-For when present', () => {
      const ctx = makeGqlContext(
        '127.0.0.1',
        { ipWhitelist: ['203.0.113.5'] },
        '203.0.113.5, 10.0.0.1',
      );
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('blocks when X-Forwarded-For IP is not whitelisted', () => {
      const ctx = makeGqlContext(
        '127.0.0.1',
        { ipWhitelist: ['203.0.113.5'] },
        '8.8.8.8, 10.0.0.1',
      );
      expect(guard.canActivate(ctx)).toBe(false);
    });

    it('handles missing req in GraphQL context gracefully', () => {
      const ctx = {
        getType: () => 'graphql',
        getArgs: () => [{}, {}, {}, {}], // context object has no req
      } as unknown as ExecutionContext;

      // No tenant settings → allow all
      expect(guard.canActivate(ctx)).toBe(true);
    });
  });
});
