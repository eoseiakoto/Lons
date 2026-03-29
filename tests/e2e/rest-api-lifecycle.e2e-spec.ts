/**
 * E2E integration tests — REST API lifecycle components
 *
 * Validates: BusinessExceptionFilter structured error response,
 * IdempotencyInterceptor cache-hit behaviour, PaginationQueryDto validation,
 * and ResponseEnvelopeInterceptor envelope format.
 */
import { HttpException, HttpStatus } from '@nestjs/common';
import { of } from 'rxjs';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

import { BusinessExceptionFilter } from '../../apps/rest-server/src/filters/business-exception.filter';
import { IdempotencyInterceptor } from '../../apps/rest-server/src/interceptors/idempotency.interceptor';
import { ResponseEnvelopeInterceptor } from '../../apps/rest-server/src/interceptors/response-envelope.interceptor';
import { PaginationQueryDto } from '../../apps/rest-server/src/dto/pagination.dto';

// ─── BusinessExceptionFilter ─────────────────────────────────────────────────

function buildHostMock(overrides: { method?: string; headers?: Record<string, string> } = {}) {
  const responseData: { status?: number; body?: any } = {};
  const request = {
    headers: { 'x-correlation-id': 'corr-123', ...overrides.headers },
    method: overrides.method ?? 'GET',
  };
  const response = {
    status: (code: number) => {
      responseData.status = code;
      return { json: (body: any) => { responseData.body = body; } };
    },
  };

  const host: any = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  };

  return { host, responseData };
}

describe('BusinessExceptionFilter — structured error responses', () => {
  let filter: BusinessExceptionFilter;

  beforeEach(() => {
    filter = new BusinessExceptionFilter();
  });

  it('maps HttpException 404 to NOT_FOUND code', () => {
    const { host, responseData } = buildHostMock();
    const exception = new HttpException('Resource not found', HttpStatus.NOT_FOUND);

    filter.catch(exception, host);

    expect(responseData.status).toBe(404);
    expect(responseData.body.errors[0].code).toBe('NOT_FOUND');
    expect(responseData.body.data).toBeNull();
  });

  it('maps HttpException 400 to BAD_REQUEST code', () => {
    const { host, responseData } = buildHostMock();
    const exception = new HttpException('Bad input', HttpStatus.BAD_REQUEST);

    filter.catch(exception, host);

    expect(responseData.status).toBe(400);
    expect(responseData.body.errors[0].code).toBe('BAD_REQUEST');
  });

  it('maps HttpException 429 to RATE_LIMIT_EXCEEDED code', () => {
    const { host, responseData } = buildHostMock();
    const exception = new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);

    filter.catch(exception, host);

    expect(responseData.status).toBe(429);
    expect(responseData.body.errors[0].code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('response body includes meta with requestId and timestamp', () => {
    const { host, responseData } = buildHostMock();
    const exception = new HttpException('Not found', 404);

    filter.catch(exception, host);

    expect(responseData.body.meta).toMatchObject({
      requestId: expect.any(String),
      timestamp: expect.any(String),
    });
  });

  it('handles non-HttpException domain errors with custom code', () => {
    const { host, responseData } = buildHostMock();
    const domainError = { code: 'NOT_FOUND', message: 'Customer not found' };

    filter.catch(domainError, host);

    expect(responseData.status).toBe(404);
    expect(responseData.body.errors[0].code).toBe('NOT_FOUND');
  });
});

// ─── IdempotencyInterceptor ───────────────────────────────────────────────────

describe('IdempotencyInterceptor — cache hit behaviour', () => {
  let interceptor: IdempotencyInterceptor;

  beforeEach(() => {
    interceptor = new IdempotencyInterceptor();
  });

  it('returns cached response on second call with same idempotency key', (done) => {
    const key = 'idem-key-abc';
    let callCount = 0;

    const mockContext: any = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', headers: { 'x-idempotency-key': key } }),
      }),
    };

    const next1: any = { handle: () => of({ id: 'loan-req-1', callCount: ++callCount }) };
    const next2: any = { handle: () => of({ id: 'loan-req-2', callCount: ++callCount }) };

    interceptor.intercept(mockContext, next1).subscribe((res1) => {
      interceptor.intercept(mockContext, next2).subscribe((res2) => {
        // Second call should return the cached response (callCount 1, not 2)
        expect(res2).toEqual(res1);
        expect(callCount).toBe(1); // next2.handle() was never invoked
        done();
      });
    });
  });

  it('passes through GET requests regardless of idempotency key', (done) => {
    let handlerCalled = 0;

    const mockContext: any = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          headers: { 'x-idempotency-key': 'should-be-ignored' },
        }),
      }),
    };

    const next: any = { handle: () => { handlerCalled++; return of({ data: 'response' }); } };

    interceptor.intercept(mockContext, next).subscribe(() => {
      interceptor.intercept(mockContext, next).subscribe(() => {
        expect(handlerCalled).toBe(2);
        done();
      });
    });
  });

  it('passes through when no idempotency key is present', (done) => {
    const mockContext: any = {
      switchToHttp: () => ({
        getRequest: () => ({ method: 'POST', headers: {} }),
      }),
    };
    const next: any = { handle: () => of({ result: 'ok' }) };

    interceptor.intercept(mockContext, next).subscribe((res) => {
      expect(res).toEqual({ result: 'ok' });
      done();
    });
  });
});

// ─── PaginationQueryDto ───────────────────────────────────────────────────────

describe('PaginationQueryDto — validation', () => {
  it('accepts valid first value within 1–100 range', async () => {
    const dto = plainToInstance(PaginationQueryDto, { first: '20' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects first=0 (below minimum)', async () => {
    const dto = plainToInstance(PaginationQueryDto, { first: '0' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('first');
  });

  it('rejects first=101 (above maximum)', async () => {
    const dto = plainToInstance(PaginationQueryDto, { first: '101' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts optional after cursor', async () => {
    const dto = plainToInstance(PaginationQueryDto, { after: 'eyJpZCI6IjEyMyJ9' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('defaults first to 20 when not provided', () => {
    const dto = new PaginationQueryDto();
    expect(dto.first).toBe(20);
  });
});

// ─── ResponseEnvelopeInterceptor ─────────────────────────────────────────────

describe('ResponseEnvelopeInterceptor — envelope format', () => {
  it('wraps response data in { data, meta, errors } envelope', (done) => {
    const interceptor = new ResponseEnvelopeInterceptor();

    const mockContext: any = {};
    const next: any = { handle: () => of({ id: 'loan-123', status: 'ACTIVE' }) };

    interceptor.intercept(mockContext, next).subscribe((envelope) => {
      expect(envelope).toHaveProperty('data');
      expect(envelope).toHaveProperty('meta');
      expect(envelope).toHaveProperty('errors');
      expect(envelope.data).toEqual({ id: 'loan-123', status: 'ACTIVE' });
      expect(envelope.errors).toBeNull();
      done();
    });
  });

  it('meta contains requestId (UUID) and ISO timestamp', (done) => {
    const interceptor = new ResponseEnvelopeInterceptor();
    const mockContext: any = {};
    const next: any = { handle: () => of({}) };

    interceptor.intercept(mockContext, next).subscribe((envelope) => {
      expect(envelope.meta.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(new Date(envelope.meta.timestamp).toISOString()).toBe(envelope.meta.timestamp);
      done();
    });
  });
});
