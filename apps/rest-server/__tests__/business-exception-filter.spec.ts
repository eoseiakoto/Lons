import { HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';
import { BusinessExceptionFilter } from '../src/filters/business-exception.filter';

function buildHost(headers: Record<string, string> = {}): ArgumentsHost {
  const mockJson = jest.fn();
  const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
  const mockResponse = { status: mockStatus };
  const mockRequest = { headers };

  return {
    switchToHttp: () => ({
      getResponse: () => mockResponse,
      getRequest: () => mockRequest,
    }),
  } as unknown as ArgumentsHost;
}

function getResponseArgs(host: ArgumentsHost): { status: number; body: any } {
  const ctx = host.switchToHttp();
  const response = ctx.getResponse() as any;
  const statusCall = response.status.mock.calls[0][0];
  const jsonCall = response.status().json.mock.calls[0][0];
  return { status: statusCall, body: jsonCall };
}

describe('BusinessExceptionFilter', () => {
  let filter: BusinessExceptionFilter;

  beforeEach(() => {
    filter = new BusinessExceptionFilter();
  });

  describe('HttpException handling', () => {
    it('handles a 404 HttpException with string response', () => {
      const host = buildHost();
      filter.catch(new HttpException('Not found', HttpStatus.NOT_FOUND), host);
      const { status, body } = getResponseArgs(host);

      expect(status).toBe(404);
      expect(body.data).toBeNull();
      expect(body.errors).toHaveLength(1);
      expect(body.errors[0].code).toBe('NOT_FOUND');
      expect(body.errors[0].message).toBe('Not found');
    });

    it('handles a 400 HttpException with object response', () => {
      const host = buildHost();
      const exception = new HttpException(
        { message: 'Validation failed', code: 'VALIDATION_ERROR', details: { field: 'amount' } },
        HttpStatus.BAD_REQUEST,
      );
      filter.catch(exception, host);
      const { status, body } = getResponseArgs(host);

      expect(status).toBe(400);
      expect(body.errors[0].code).toBe('BAD_REQUEST');
      expect(body.errors[0].message).toBe('Validation failed');
    });

    it('handles a 401 Unauthorized exception', () => {
      const host = buildHost();
      filter.catch(new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED), host);
      const { status, body } = getResponseArgs(host);

      expect(status).toBe(401);
      expect(body.errors[0].code).toBe('UNAUTHORIZED');
    });

    it('handles a 403 Forbidden exception', () => {
      const host = buildHost();
      filter.catch(new HttpException('Forbidden', HttpStatus.FORBIDDEN), host);
      const { status, body } = getResponseArgs(host);

      expect(status).toBe(403);
      expect(body.errors[0].code).toBe('FORBIDDEN');
    });

    it('handles a 409 Conflict exception', () => {
      const host = buildHost();
      filter.catch(new HttpException('Conflict', HttpStatus.CONFLICT), host);
      const { status, body } = getResponseArgs(host);

      expect(status).toBe(409);
      expect(body.errors[0].code).toBe('CONFLICT');
    });

    it('handles a 422 Unprocessable Entity exception', () => {
      const host = buildHost();
      filter.catch(new HttpException('Unprocessable', HttpStatus.UNPROCESSABLE_ENTITY), host);
      const { status, body } = getResponseArgs(host);

      expect(status).toBe(422);
      expect(body.errors[0].code).toBe('UNPROCESSABLE_ENTITY');
    });

    it('handles a 429 Too Many Requests exception', () => {
      const host = buildHost();
      filter.catch(new HttpException('Rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS), host);
      const { status, body } = getResponseArgs(host);

      expect(status).toBe(429);
      expect(body.errors[0].code).toBe('RATE_LIMIT_EXCEEDED');
    });
  });

  describe('Domain error handling', () => {
    it('maps NOT_FOUND domain error to 404', () => {
      const host = buildHost();
      filter.catch({ code: 'NOT_FOUND', message: 'Customer not found' }, host);
      const { status, body } = getResponseArgs(host);

      expect(status).toBe(404);
      expect(body.errors[0].code).toBe('NOT_FOUND');
      expect(body.errors[0].message).toBe('Customer not found');
    });

    it('maps INSUFFICIENT_CREDIT_LIMIT domain error to 422', () => {
      const host = buildHost();
      filter.catch(
        { code: 'INSUFFICIENT_CREDIT_LIMIT', message: 'Credit limit exceeded', details: { limit: '5000.00' } },
        host,
      );
      const { status, body } = getResponseArgs(host);

      expect(status).toBe(422);
      expect(body.errors[0].code).toBe('INSUFFICIENT_CREDIT_LIMIT');
      expect(body.errors[0].details).toEqual({ limit: '5000.00' });
    });

    it('maps CONFLICT domain error to 409', () => {
      const host = buildHost();
      filter.catch({ code: 'CONFLICT', message: 'Duplicate idempotency key' }, host);
      const { status, body } = getResponseArgs(host);

      expect(status).toBe(409);
    });

    it('maps unknown domain error to 500', () => {
      const host = buildHost();
      filter.catch({ code: 'UNKNOWN_DOMAIN_ERROR', message: 'Something went wrong' }, host);
      const { status, body } = getResponseArgs(host);

      expect(status).toBe(500);
      expect(body.errors[0].code).toBe('UNKNOWN_DOMAIN_ERROR');
    });
  });

  describe('Unknown/unexpected error handling', () => {
    it('returns 500 for unknown errors', () => {
      const host = buildHost();
      filter.catch(new Error('Unexpected failure'), host);
      const { status, body } = getResponseArgs(host);

      expect(status).toBe(500);
      expect(body.errors[0].code).toBe('INTERNAL_ERROR');
      expect(body.data).toBeNull();
    });

    it('returns 500 for null errors gracefully', () => {
      const host = buildHost();
      filter.catch(null, host);
      const { status, body } = getResponseArgs(host);

      expect(status).toBe(500);
      expect(body.errors[0].code).toBe('INTERNAL_ERROR');
    });
  });

  describe('Response envelope structure', () => {
    it('always includes data, errors, and meta fields', () => {
      const host = buildHost();
      filter.catch(new HttpException('Not found', HttpStatus.NOT_FOUND), host);
      const { body } = getResponseArgs(host);

      expect(body).toHaveProperty('data');
      expect(body).toHaveProperty('errors');
      expect(body).toHaveProperty('meta');
      expect(body.meta).toHaveProperty('requestId');
      expect(body.meta).toHaveProperty('timestamp');
    });

    it('populates requestId from x-correlation-id header', () => {
      const host = buildHost({ 'x-correlation-id': 'corr-456' });
      filter.catch(new HttpException('Error', HttpStatus.BAD_REQUEST), host);
      const { body } = getResponseArgs(host);

      expect(body.meta.requestId).toBe('corr-456');
    });

    it('falls back to x-request-id header when x-correlation-id is absent', () => {
      const host = buildHost({ 'x-request-id': 'req-789' });
      filter.catch(new HttpException('Error', HttpStatus.BAD_REQUEST), host);
      const { body } = getResponseArgs(host);

      expect(body.meta.requestId).toBe('req-789');
    });

    it('uses empty string when no request id headers are present', () => {
      const host = buildHost({});
      filter.catch(new HttpException('Error', HttpStatus.BAD_REQUEST), host);
      const { body } = getResponseArgs(host);

      expect(body.meta.requestId).toBe('');
    });

    it('meta.timestamp is a valid ISO 8601 string', () => {
      const host = buildHost();
      filter.catch(new HttpException('Error', HttpStatus.BAD_REQUEST), host);
      const { body } = getResponseArgs(host);

      expect(new Date(body.meta.timestamp).toISOString()).toBe(body.meta.timestamp);
    });
  });
});
