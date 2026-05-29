import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

/**
 * RateLimitHeadersInterceptor
 *
 * Adds standard rate-limit headers to every HTTP response so that API clients
 * can implement client-side back-off without waiting for a 429.
 *
 * Headers emitted:
 *   X-RateLimit-Limit     – maximum requests allowed in the current window
 *   X-RateLimit-Remaining – requests still available in the current window
 *   X-RateLimit-Reset     – Unix timestamp (seconds) when the window resets
 *
 * When the ThrottlerGuard runs before this interceptor it may already have set
 * these headers with accurate values (e.g. via a custom header-writing guard).
 * In that case this interceptor skips the defaults to avoid overwriting them.
 *
 * Register globally in AppModule:
 *
 *   { provide: APP_INTERCEPTOR, useClass: RateLimitHeadersInterceptor }
 */
@Injectable()
export class RateLimitHeadersInterceptor implements NestInterceptor {
  /**
   * F-ABC-3 / F-ABC-4: fallback limit shown ONLY when the throttler
   * guard hasn't stamped `req._rateLimitConfig` (e.g. excluded
   * routes like /health, or test environments without the guard
   * wired). Aligned with RATE_LIMIT_TIERS.starter — previously
   * defaulted to 1000 which gave every client misleadingly high
   * limits in the headers.
   */
  private readonly fallbackLimit = 100;

  /** Default window size in seconds. */
  private readonly defaultWindowSeconds = 60;

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      tap(() => {
        // Only add headers for HTTP contexts (not GraphQL / WS).
        if (context.getType() !== 'http') {
          return;
        }

        const http = context.switchToHttp();
        const res = http.getResponse<{
          setHeader?: (name: string, value: string | number) => void;
          getHeader?: (name: string) => string | number | undefined;
        }>();
        const req = http.getRequest<Record<string, unknown> | undefined>();

        if (!res || typeof res.setHeader !== 'function') {
          return;
        }

        // Don't overwrite headers already written by an upstream
        // middleware (e.g. a custom header-writing guard).
        const alreadySet =
          typeof res.getHeader === 'function' &&
          !!res.getHeader('X-RateLimit-Limit');
        if (alreadySet) return;

        // F-ABC-3: prefer the per-tenant values stamped by
        // TenantThrottlerGuard.handleRequest. The guard publishes
        // the resolved (limit, remaining, resetAt) on the request
        // object after the throttler check. Fall back to the
        // static starter-tier values only when the guard hasn't
        // run for this route.
        const resolved = req?._rateLimitConfig as
          | { limit: number; remaining: number; resetAt: number }
          | undefined;

        if (resolved) {
          res.setHeader('X-RateLimit-Limit', resolved.limit);
          res.setHeader('X-RateLimit-Remaining', Math.max(0, resolved.remaining));
          res.setHeader('X-RateLimit-Reset', resolved.resetAt);
          return;
        }

        const resetAt = Math.floor(Date.now() / 1_000) + this.defaultWindowSeconds;
        res.setHeader('X-RateLimit-Limit', this.fallbackLimit);
        res.setHeader('X-RateLimit-Remaining', this.fallbackLimit - 1);
        res.setHeader('X-RateLimit-Reset', resetAt);
      }),
    );
  }
}
