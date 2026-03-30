/**
 * E2E integration tests — Rate limiting components
 *
 * Validates: RateLimitHeadersInterceptor header emission.
 */
import { of } from 'rxjs';
import { RateLimitHeadersInterceptor } from '@lons/common';

describe('RateLimitHeadersInterceptor — response headers', () => {
  let interceptor: RateLimitHeadersInterceptor;

  beforeEach(() => {
    interceptor = new RateLimitHeadersInterceptor();
  });

  it('sets X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset headers', (done) => {
    const headers: Record<string, string | number> = {};

    const mockContext: any = {
      getType: () => 'http',
      switchToHttp: () => ({
        getResponse: () => ({
          setHeader: (name: string, value: string | number) => {
            headers[name] = value;
          },
          getHeader: (_name: string) => undefined,
        }),
      }),
    };
    const next: any = { handle: () => of('response') };

    interceptor.intercept(mockContext, next).subscribe(() => {
      expect(headers).toHaveProperty('X-RateLimit-Limit');
      expect(headers).toHaveProperty('X-RateLimit-Remaining');
      expect(headers).toHaveProperty('X-RateLimit-Reset');
      expect(Number(headers['X-RateLimit-Limit'])).toBeGreaterThan(0);
      done();
    });
  });

  it('does not overwrite headers already set by a prior guard', (done) => {
    const headers: Record<string, string | number> = { 'X-RateLimit-Limit': 50 };

    const mockContext: any = {
      getType: () => 'http',
      switchToHttp: () => ({
        getResponse: () => ({
          setHeader: (name: string, value: string | number) => {
            headers[name] = value;
          },
          getHeader: (name: string) => headers[name],
        }),
      }),
    };
    const next: any = { handle: () => of('response') };

    interceptor.intercept(mockContext, next).subscribe(() => {
      // Should still be 50 (not overwritten with default 1000)
      expect(headers['X-RateLimit-Limit']).toBe(50);
      done();
    });
  });

  it('skips header injection for non-HTTP contexts (e.g. GraphQL)', (done) => {
    const headers: Record<string, string | number> = {};

    const mockContext: any = {
      getType: () => 'graphql',
    };
    const next: any = { handle: () => of('response') };

    interceptor.intercept(mockContext, next).subscribe(() => {
      expect(Object.keys(headers)).toHaveLength(0);
      done();
    });
  });
});
