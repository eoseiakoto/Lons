/**
 * E2E integration tests — Observability stack
 *
 * Validates: MetricsService counters and histograms, LoggerService
 * instantiation, AsyncLocalStorage correlation ID propagation, and
 * createSlowQueryMiddleware slow-query detection.
 */
import * as promClient from 'prom-client';
import {
  MetricsService,
  LoggerService,
  requestContext,
  getCorrelationId,
  getTenantId,
  createSlowQueryMiddleware,
} from '@lons/common';

// Use a fresh prom-client registry per file to avoid metric collision
// with other test suites or the global MetricsService constructor.
beforeAll(() => {
  // Reset the default registry so counters/histograms don't collide
  // across test runs when using ts-jest in the same process.
  promClient.register.clear();
});

describe('MetricsService — counters and histograms', () => {
  let metrics: MetricsService;

  beforeEach(() => {
    promClient.register.clear();
    metrics = new MetricsService();
  });

  it('incrementHttpRequests does not throw', () => {
    expect(() =>
      metrics.incrementHttpRequests('POST', '/v1/loan-requests', 201),
    ).not.toThrow();
  });

  it('observeHttpDuration does not throw', () => {
    expect(() =>
      metrics.observeHttpDuration('GET', '/v1/customers', 0.042),
    ).not.toThrow();
  });

  it('registry exposes http_requests_total metric', async () => {
    metrics.incrementHttpRequests('GET', '/health', 200);
    const text = await metrics.getRegistry().metrics();
    expect(text).toContain('http_requests_total');
  });

  it('registry exposes http_request_duration_seconds metric', async () => {
    metrics.observeHttpDuration('POST', '/v1/repayments', 0.1);
    const text = await metrics.getRegistry().metrics();
    expect(text).toContain('http_request_duration_seconds');
  });

  it('observePrismaQuery records without throwing', () => {
    expect(() =>
      metrics.observePrismaQuery('Customer', 'findMany', 0.005),
    ).not.toThrow();
  });
});

describe('LoggerService — instantiation and log calls', () => {
  it('can be instantiated without arguments', () => {
    expect(() => new LoggerService()).not.toThrow();
  });

  it('can be instantiated with a service name', () => {
    expect(() => new LoggerService('test-service')).not.toThrow();
  });

  it('log() call does not throw', () => {
    const logger = new LoggerService('test');
    expect(() => logger.log('test message', 'TestContext')).not.toThrow();
  });

  it('warn() call does not throw', () => {
    const logger = new LoggerService('test');
    expect(() => logger.warn('test warning')).not.toThrow();
  });

  it('error() call does not throw', () => {
    const logger = new LoggerService('test');
    expect(() => logger.error('test error', 'stack trace here')).not.toThrow();
  });
});

describe('requestContext — AsyncLocalStorage correlation ID propagation', () => {
  it('getCorrelationId returns undefined outside a context', () => {
    expect(getCorrelationId()).toBeUndefined();
  });

  it('getCorrelationId returns the stored ID inside a run() call', async () => {
    const correlationId = 'req-abc-123';

    await requestContext.run({ correlationId }, async () => {
      expect(getCorrelationId()).toBe(correlationId);
    });
  });

  it('getTenantId returns the stored tenant ID inside a run() call', async () => {
    const tenantId = 'tenant-xyz';

    await requestContext.run({ correlationId: 'cid', tenantId }, async () => {
      expect(getTenantId()).toBe(tenantId);
    });
  });

  it('context does not leak across independent run() calls', async () => {
    const results: Array<string | undefined> = [];

    await Promise.all([
      requestContext.run({ correlationId: 'cid-1' }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        results.push(getCorrelationId());
      }),
      requestContext.run({ correlationId: 'cid-2' }, async () => {
        await new Promise((r) => setTimeout(r, 2));
        results.push(getCorrelationId());
      }),
    ]);

    expect(results).toContain('cid-1');
    expect(results).toContain('cid-2');
  });
});

describe('createSlowQueryMiddleware — slow query detection', () => {
  it('calls next and returns the result', async () => {
    const logger = { warn: jest.fn() };
    const middleware = createSlowQueryMiddleware(logger);

    const params = { model: 'Customer', action: 'findMany' };
    const next = jest.fn().mockResolvedValue([{ id: '1' }]);

    const result = await middleware(params, next);

    expect(next).toHaveBeenCalledWith(params);
    expect(result).toEqual([{ id: '1' }]);
  });

  it('warns when query exceeds threshold', async () => {
    process.env.SLOW_QUERY_THRESHOLD_MS = '1';
    const logger = { warn: jest.fn() };
    const middleware = createSlowQueryMiddleware(logger);

    const params = { model: 'Contract', action: 'findUnique' };
    const next = jest.fn().mockImplementation(
      () => new Promise((r) => setTimeout(() => r(null), 20)),
    );

    await middleware(params, next);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Slow'),
      expect.objectContaining({ model: 'Contract', operation: 'findUnique' }),
    );

    delete process.env.SLOW_QUERY_THRESHOLD_MS;
  });

  it('calls metrics.observePrismaQuery when metrics are provided', async () => {
    const logger = { warn: jest.fn() };
    const metrics = { observePrismaQuery: jest.fn() };
    const middleware = createSlowQueryMiddleware(logger, metrics);

    const params = { model: 'LoanRequest', action: 'create' };
    const next = jest.fn().mockResolvedValue({ id: 'new' });

    await middleware(params, next);

    expect(metrics.observePrismaQuery).toHaveBeenCalledWith(
      'LoanRequest',
      'create',
      expect.any(Number),
    );
  });
});
