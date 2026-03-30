import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private cache = new Map<string, { response: any; timestamp: number }>();
  private readonly TTL = 24 * 60 * 60 * 1000; // 24 hours

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const key = req.headers['x-idempotency-key'];

    if (!key || req.method === 'GET') {
      return next.handle();
    }

    // Return cached response if still within TTL
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.TTL) {
      return of(cached.response);
    }

    return next.handle().pipe(
      tap((response) => {
        this.cache.set(key, { response, timestamp: Date.now() });
        // Cleanup old entries periodically when cache grows large
        if (this.cache.size > 10000) {
          this.purgeExpired();
        }
      }),
    );
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp >= this.TTL) {
        this.cache.delete(key);
      }
    }
  }
}
