import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

@Catch()
export class BusinessExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();
      if (typeof exResponse === 'string') {
        message = exResponse;
      } else if (typeof exResponse === 'object') {
        message = (exResponse as any).message || message;
        code = (exResponse as any).code || this.statusToCode(status);
        details = (exResponse as any).details;
      }
      code = this.statusToCode(status);
    } else if (exception?.code) {
      // Domain-specific errors
      code = exception.code;
      message = exception.message || message;
      status = this.codeToStatus(exception.code);
      details = exception.details;
    }

    response.status(status).json({
      data: null,
      errors: [{ code, message, details }],
      meta: {
        requestId:
          request.headers['x-correlation-id'] ||
          request.headers['x-request-id'] ||
          '',
        timestamp: new Date().toISOString(),
      },
    });
  }

  private statusToCode(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'RATE_LIMIT_EXCEEDED',
    };
    return map[status] || 'INTERNAL_ERROR';
  }

  private codeToStatus(code: string): number {
    const map: Record<string, number> = {
      NOT_FOUND: 404,
      UNAUTHORIZED: 401,
      FORBIDDEN: 403,
      CONFLICT: 409,
      VALIDATION_ERROR: 422,
      INSUFFICIENT_CREDIT_LIMIT: 422,
      RATE_LIMIT_EXCEEDED: 429,
    };
    return map[code] || 500;
  }
}
