/**
 * REST E2E lifecycle tests.
 *
 * These tests use lightweight in-process mocks — no real HTTP server is spun
 * up — to verify the response envelope and error format produced by the
 * interceptors and filter collaborating together.
 */
import { of, throwError } from 'rxjs';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ResponseEnvelopeInterceptor } from '../src/interceptors/response-envelope.interceptor';
import { IdempotencyInterceptor } from '../src/interceptors/idempotency.interceptor';
import { BusinessExceptionFilter } from '../src/filters/business-exception.filter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildHttpHost(
  method: string,
  headers: Record<string, string> = {},
): { host: any; getJsonBody: () => any } {
  const mockJson = jest.fn();
  const mockStatus = jest.fn().mockReturnValue({ json: mockJson });
  const mockResponse = { status: mockStatus };
  const mockRequest = { method, headers };

  const host = {
    switchToHttp: () => ({
      getResponse: () => mockResponse,
      getRequest: () => mockRequest,
    }),
  };

  return {
    host,
    getJsonBody: () => mockStatus.mock.calls[0] && mockStatus().json.mock.calls[0]?.[0],
  };
}

function buildCallHandler(value: any) {
  return { handle: () => of(value) };
}

function buildErrorHandler(error: any) {
  return { handle: () => throwError(() => error) };
}

function buildExecContext(method: string, headers: Record<string, string> = {}): any {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, headers }),
    }),
  };
}

// ---------------------------------------------------------------------------
// Success path — ResponseEnvelopeInterceptor
// ---------------------------------------------------------------------------

describe('REST Lifecycle — Success envelope', () => {
  const interceptor = new ResponseEnvelopeInterceptor();

  it('GET /loan-requests returns envelope with data array', (done) => {
    const payload = [
      { id: 'lr-001', status: 'PENDING', amount: '5000.00', currency: 'GHS' },
      { id: 'lr-002', status: 'APPROVED', amount: '2500.00', currency: 'KES' },
    ];

    interceptor
      .intercept(buildExecContext('GET'), buildCallHandler(payload))
      .subscribe((result) => {
        expect(result.data).toEqual(payload);
        expect(result.errors).toBeNull();
        expect(result.meta.timestamp).toBeDefined();
        expect(result.meta.requestId).toBeDefined();
        done();
      });
  });

  it('POST /loan-requests returns envelope with created resource', (done) => {
    const created = { id: 'lr-003', status: 'PENDING', amount: '1000.00', currency: 'UGX' };

    interceptor
      .intercept(buildExecContext('POST'), buildCallHandler(created))
      .subscribe((result) => {
        expect(result.data).toEqual(created);
        expect(result.errors).toBeNull();
        done();
      });
  });

  it('envelope data can contain nested objects (contract with repayment schedule)', (done) => {
    const contract = {
      id: 'c-001',
      status: 'ACTIVE',
      disbursedAmount: '10000.00',
      currency: 'GHS',
      repaymentSchedule: [
        { dueDate: '2026-04-27', amount: '2500.00', status: 'PENDING' },
        { dueDate: '2026-05-27', amount: '2500.00', status: 'PENDING' },
      ],
    };

    interceptor
      .intercept(buildExecContext('GET'), buildCallHandler(contract))
      .subscribe((result) => {
        expect(result.data.repaymentSchedule).toHaveLength(2);
        done();
      });
  });
});

// ---------------------------------------------------------------------------
// Error path — BusinessExceptionFilter
// ---------------------------------------------------------------------------

describe('REST Lifecycle — Error envelope', () => {
  const filter = new BusinessExceptionFilter();

  it('404 on unknown loan request returns structured error', () => {
    const { host, getJsonBody } = buildHttpHost('GET', { 'x-request-id': 'req-404' });
    filter.catch(new HttpException('Loan request not found', HttpStatus.NOT_FOUND), host);

    const body = getJsonBody();
    expect(body.data).toBeNull();
    expect(body.errors[0].code).toBe('NOT_FOUND');
    expect(body.errors[0].message).toBe('Loan request not found');
    expect(body.meta.requestId).toBe('req-404');
  });

  it('422 on domain INSUFFICIENT_CREDIT_LIMIT returns details', () => {
    const { host, getJsonBody } = buildHttpHost('POST');
    filter.catch(
      { code: 'INSUFFICIENT_CREDIT_LIMIT', message: 'Requested amount exceeds credit limit', details: { requested: '50000.00', limit: '20000.00' } },
      host,
    );

    const body = getJsonBody();
    expect(body.errors[0].code).toBe('INSUFFICIENT_CREDIT_LIMIT');
    expect(body.errors[0].details.requested).toBe('50000.00');
  });

  it('409 on duplicate idempotency key returns conflict code', () => {
    const { host, getJsonBody } = buildHttpHost('POST', { 'x-idempotency-key': 'ik-dup' });
    filter.catch(new HttpException('Duplicate request', HttpStatus.CONFLICT), host);

    const body = getJsonBody();
    expect(body.errors[0].code).toBe('CONFLICT');
  });

  it('401 on missing auth returns unauthorized code', () => {
    const { host, getJsonBody } = buildHttpHost('GET');
    filter.catch(new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED), host);

    const body = getJsonBody();
    expect(body.errors[0].code).toBe('UNAUTHORIZED');
  });

  it('500 for unexpected service failure', () => {
    const { host, getJsonBody } = buildHttpHost('GET');
    filter.catch(new Error('DB connection lost'), host);

    const body = getJsonBody();
    expect(body.errors[0].code).toBe('INTERNAL_ERROR');
  });
});

// ---------------------------------------------------------------------------
// Idempotency — IdempotencyInterceptor
// ---------------------------------------------------------------------------

describe('REST Lifecycle — Idempotency', () => {
  let interceptor: IdempotencyInterceptor;

  beforeEach(() => {
    interceptor = new IdempotencyInterceptor();
  });

  it('returns cached response on second POST with same idempotency key', (done) => {
    const key = 'idem-key-001';
    const ctx = buildExecContext('POST', { 'x-idempotency-key': key });
    const firstPayload = { id: 'lr-111', status: 'PENDING' };
    const secondPayload = { id: 'lr-222', status: 'APPROVED' }; // should be ignored

    interceptor
      .intercept(ctx, buildCallHandler(firstPayload))
      .subscribe(() => {
        // Second call — the handler would return a different payload, but cache wins
        interceptor
          .intercept(ctx, buildCallHandler(secondPayload))
          .subscribe((result) => {
            expect(result).toEqual(firstPayload);
            done();
          });
      });
  });

  it('does NOT cache GET requests', (done) => {
    const ctx = buildExecContext('GET', { 'x-idempotency-key': 'idem-key-get' });
    const firstPayload = { id: 'lr-get-1' };
    const secondPayload = { id: 'lr-get-2' };

    interceptor.intercept(ctx, buildCallHandler(firstPayload)).subscribe(() => {
      interceptor.intercept(ctx, buildCallHandler(secondPayload)).subscribe((result) => {
        // GET is never cached — second call returns fresh handler result
        expect(result).toEqual(secondPayload);
        done();
      });
    });
  });

  it('processes requests without idempotency key normally', (done) => {
    const ctx = buildExecContext('POST', {}); // no x-idempotency-key
    const payload = { id: 'lr-no-key' };

    interceptor.intercept(ctx, buildCallHandler(payload)).subscribe((result) => {
      expect(result).toEqual(payload);
      done();
    });
  });

  it('different idempotency keys return independent responses', (done) => {
    const ctx1 = buildExecContext('POST', { 'x-idempotency-key': 'key-A' });
    const ctx2 = buildExecContext('POST', { 'x-idempotency-key': 'key-B' });
    const payloadA = { id: 'lr-A' };
    const payloadB = { id: 'lr-B' };

    interceptor.intercept(ctx1, buildCallHandler(payloadA)).subscribe(() => {
      interceptor.intercept(ctx2, buildCallHandler(payloadB)).subscribe((resultB) => {
        // key-B is a different key — should not get key-A's cached value
        expect(resultB).toEqual(payloadB);
        done();
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Money format guard — amounts must always be strings
// ---------------------------------------------------------------------------

describe('REST Lifecycle — Money format', () => {
  const interceptor = new ResponseEnvelopeInterceptor();

  it('preserves string-typed monetary amounts in the envelope', (done) => {
    const loanRequest = {
      id: 'lr-money-01',
      principalAmount: '15000.0000', // string — NOT a number
      currency: 'GHS',
      fees: [
        { type: 'ORIGINATION', amount: '300.0000', currency: 'GHS' },
      ],
    };

    interceptor
      .intercept(buildExecContext('GET'), buildCallHandler(loanRequest))
      .subscribe((result) => {
        expect(typeof result.data.principalAmount).toBe('string');
        expect(typeof result.data.fees[0].amount).toBe('string');
        done();
      });
  });
});
