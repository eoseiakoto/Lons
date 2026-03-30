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
  /** Default limit shown in headers when no accurate value is available. */
  private readonly defaultLimit = 1_000;

  /** Default window size in seconds. */
  private readonly defaultWindowSeconds = 60;

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      tap(() => {
        // Only add headers for HTTP contexts (not GraphQL / WS).
        if (context.getType() !== 'http') {
          return;
        }

        const res = context.switchToHttp().getResponse<{
          setHeader?: (name: string, value: string | number) => void;
          getHeader?: (name: string) => string | number | undefined;
        }>();

        if (!res || typeof res.setHeader !== 'function') {
          return;
        }

        // Do not overwrite headers already written by the ThrottlerGuard or a
        // more specific middleware.
        const alreadySet =
          typeof res.getHeader === 'function' &&
          !!res.getHeader('X-RateLimit-Limit');

        if (!alreadySet) {
          const resetAt =
            Math.floor(Date.now() / 1_000) + this.defaultWindowSeconds;

          res.setHeader('X-RateLimit-Limit', this.defaultLimit);
          res.setHeader('X-RateLimit-Remaining', this.defaultLimit - 1);
          res.setHeader('X-RateLimit-Reset', resetAt);
        }
      }),
    );
  }
}
