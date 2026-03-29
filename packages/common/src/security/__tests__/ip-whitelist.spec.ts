import { ExecutionContext } from '@nestjs/common';
import { IpWhitelistGuard } from '../ip-whitelist.guard';

function makeContext(ip: string, tenantSettings?: any, xForwardedFor?: string): ExecutionContext {
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
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('IpWhitelistGuard', () => {
  let guard: IpWhitelistGuard;

  beforeEach(() => {
    guard = new IpWhitelistGuard();
  });

  it('allows all traffic when no tenant settings are configured', () => {
    const ctx = makeContext('1.2.3.4');
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows all traffic when tenantSettings has no ipWhitelist', () => {
    const ctx = makeContext('1.2.3.4', { someOtherSetting: true });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows all traffic when ipWhitelist is an empty array', () => {
    const ctx = makeContext('1.2.3.4', { ipWhitelist: [] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows a request from an IP in the whitelist', () => {
    const ctx = makeContext('192.168.1.10', { ipWhitelist: ['192.168.1.10', '10.0.0.1'] });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('blocks a request from an IP not in the whitelist', () => {
    const ctx = makeContext('99.99.99.99', { ipWhitelist: ['192.168.1.10', '10.0.0.1'] });
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('uses the first IP from X-Forwarded-For when present', () => {
    const ctx = makeContext(
      '127.0.0.1',
      { ipWhitelist: ['203.0.113.5'] },
      '203.0.113.5, 10.0.0.1',
    );
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('blocks when X-Forwarded-For IP is not whitelisted', () => {
    const ctx = makeContext(
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
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(ctx)).toBe(true);
  });
});
