import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { RateLimitHeadersInterceptor } from '../rate-limit-headers.interceptor';

// ---------------------------------------------------------------------------
// Helpers to build mock NestJS execution contexts
// ---------------------------------------------------------------------------

function buildHttpContext(
  overrides: {
    setHeader?: jest.Mock;
    getHeader?: jest.Mock;
    contextType?: string;
  } = {},
): ExecutionContext {
  const setHeader = overrides.setHeader ?? jest.fn();
  const getHeader = overrides.getHeader ?? jest.fn().mockReturnValue(undefined);

  const response = { setHeader, getHeader };

  return {
    getType: () => overrides.contextType ?? 'http',
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({}),
    }),
  } as unknown as ExecutionContext;
}

function buildCallHandler(value: unknown = {}): CallHandler {
  return { handle: () => of(value) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RateLimitHeadersInterceptor', () => {
  let interceptor: RateLimitHeadersInterceptor;

  beforeEach(() => {
    interceptor = new RateLimitHeadersInterceptor();
  });

  // F-ABC-3/-4: fallback limit (when the throttler guard hasn't
  // stamped req._rateLimitConfig) is now 100 to match
  // RATE_LIMIT_TIERS.starter — previously 1000, which gave every
  // client misleadingly high headers regardless of tier.
  it('sets X-RateLimit-Limit header on successful responses', (done) => {
    const setHeader = jest.fn();
    const ctx = buildHttpContext({ setHeader });

    interceptor.intercept(ctx, buildCallHandler()).subscribe({
      complete: () => {
        expect(setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
        done();
      },
    });
  });

  it('sets X-RateLimit-Remaining header', (done) => {
    const setHeader = jest.fn();
    const ctx = buildHttpContext({ setHeader });

    interceptor.intercept(ctx, buildCallHandler()).subscribe({
      complete: () => {
        expect(setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 99);
        done();
      },
    });
  });

  it('sets X-RateLimit-Reset to a Unix timestamp ~60 s in the future', (done) => {
    const setHeader = jest.fn();
    const ctx = buildHttpContext({ setHeader });
    const beforeCall = Math.floor(Date.now() / 1_000);

    interceptor.intercept(ctx, buildCallHandler()).subscribe({
      complete: () => {
        const resetCall = setHeader.mock.calls.find(
          ([name]) => name === 'X-RateLimit-Reset',
        );
        expect(resetCall).toBeDefined();
        const resetValue = resetCall![1] as number;
        expect(resetValue).toBeGreaterThanOrEqual(beforeCall + 59);
        expect(resetValue).toBeLessThanOrEqual(beforeCall + 61);
        done();
      },
    });
  });

  it('does NOT overwrite headers already set (e.g. by ThrottlerGuard)', (done) => {
    const setHeader = jest.fn();
    // getHeader returns a value, indicating headers are already present.
    const getHeader = jest.fn().mockReturnValue('500');
    const ctx = buildHttpContext({ setHeader, getHeader });

    interceptor.intercept(ctx, buildCallHandler()).subscribe({
      complete: () => {
        expect(setHeader).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('skips header injection for non-HTTP contexts (e.g. GraphQL)', (done) => {
    const setHeader = jest.fn();
    const ctx = buildHttpContext({ setHeader, contextType: 'graphql' });

    interceptor.intercept(ctx, buildCallHandler()).subscribe({
      complete: () => {
        expect(setHeader).not.toHaveBeenCalled();
        done();
      },
    });
  });

  it('passes the response value through unchanged', (done) => {
    const ctx = buildHttpContext();
    const payload = { id: 'loan-123', status: 'PENDING' };

    const emitted: unknown[] = [];
    interceptor.intercept(ctx, buildCallHandler(payload)).subscribe({
      next: (v) => emitted.push(v),
      complete: () => {
        expect(emitted).toHaveLength(1);
        expect(emitted[0]).toEqual(payload);
        done();
      },
    });
  });

  it('handles responses without a getHeader method gracefully', (done) => {
    const setHeader = jest.fn();
    const responseWithoutGetHeader = { setHeader };

    const ctx = {
      getType: () => 'http',
      switchToHttp: () => ({
        getResponse: () => responseWithoutGetHeader,
        getRequest: () => ({}),
      }),
    } as unknown as ExecutionContext;

    // Should not throw; should still set the headers (with the
    // F-ABC-4 starter-aligned fallback of 100, not the old 1000).
    interceptor.intercept(ctx, buildCallHandler()).subscribe({
      complete: () => {
        expect(setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
        done();
      },
    });
  });

  // F-ABC-3: when the throttler guard has stamped
  // req._rateLimitConfig with per-tenant values, the interceptor
  // must surface those instead of the static fallback.
  it('reads per-tenant limits from req._rateLimitConfig when present', (done) => {
    const setHeader = jest.fn();
    const ctx = {
      getType: () => 'http',
      switchToHttp: () => ({
        getResponse: () => ({ setHeader, getHeader: () => undefined }),
        getRequest: () => ({
          _rateLimitConfig: { limit: 500, remaining: 487, resetAt: 1_700_000_000 },
        }),
      }),
    } as unknown as ExecutionContext;

    interceptor.intercept(ctx, buildCallHandler()).subscribe({
      complete: () => {
        expect(setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 500);
        expect(setHeader).toHaveBeenCalledWith('X-RateLimit-Remaining', 487);
        expect(setHeader).toHaveBeenCalledWith('X-RateLimit-Reset', 1_700_000_000);
        done();
      },
    });
  });
});
