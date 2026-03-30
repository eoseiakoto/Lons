import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const req = httpContext.getRequest<any>();
    const res = httpContext.getResponse<any>();

    const method: string = req.method ?? 'UNKNOWN';
    const route: string = (req.route?.path as string) ?? req.url ?? 'unknown';

    const timerEnd = this.metricsService.httpRequestDuration
      .labels({ method, route })
      .startTimer();

    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const status = String(res.statusCode ?? 200);
          timerEnd();
          this.metricsService.httpRequestsTotal.labels({ method, route, status }).inc();
        },
        error: (err: unknown) => {
          const status = (err as { status?: number })?.status ?? 500;
          const statusStr = String(status);
          const durationSecs = (Date.now() - startTime) / 1000;

          this.metricsService.httpRequestDuration
            .labels({ method, route })
            .observe(durationSecs);

          this.metricsService.httpRequestsTotal
            .labels({ method, route, status: statusStr })
            .inc();

          this.metricsService.httpRequestErrors
            .labels({ method, route, error_code: statusStr })
            .inc();
        },
      }),
    );
  }
}
