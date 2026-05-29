import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import * as crypto from 'crypto';

/**
 * S19-10: Every response carries an `X-API-Version` header so clients can
 * detect breaking-change boundaries without parsing the body. Bumped in
 * lockstep with the OpenAPI document's `version` (DocumentBuilder.setVersion).
 */
const API_VERSION = '1.0';

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // Set the header eagerly — it must land on every response (including
    // /health, which doesn't go through the body wrapper because some
    // handlers return primitive shapes the orchestrator inspects raw).
    const httpResponse = context.switchToHttp().getResponse();
    if (httpResponse && typeof httpResponse.setHeader === 'function') {
      httpResponse.setHeader('X-API-Version', API_VERSION);
    }
    return next.handle().pipe(
      map(data => ({
        data,
        meta: {
          requestId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
        errors: null,
      })),
    );
  }
}
