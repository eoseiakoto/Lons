import * as promClient from 'prom-client';

// Reset the prom-client registry before each test to avoid duplicate metric errors
beforeEach(() => {
  promClient.register.clear();
});

afterEach(() => {
  promClient.register.clear();
});

// Import after registry is reset
let MetricsService: typeof import('../metrics.service').MetricsService;

beforeAll(async () => {
  ({ MetricsService } = await import('../metrics.service'));
});

describe('MetricsService', () => {
  let service: InstanceType<typeof MetricsService>;

  beforeEach(() => {
    promClient.register.clear();
    service = new MetricsService();
  });

  it('should be instantiated without errors', () => {
    expect(service).toBeDefined();
  });

  it('should expose httpRequestsTotal counter', () => {
    expect(service.httpRequestsTotal).toBeDefined();
  });

  it('should expose httpRequestDuration histogram', () => {
    expect(service.httpRequestDuration).toBeDefined();
  });

  it('should expose httpRequestErrors counter', () => {
    expect(service.httpRequestErrors).toBeDefined();
  });

  it('should expose loanApplicationsTotal counter', () => {
    expect(service.loanApplicationsTotal).toBeDefined();
  });

  it('should expose disbursementAmountTotal counter', () => {
    expect(service.disbursementAmountTotal).toBeDefined();
  });

  it('should expose repaymentAmountTotal counter', () => {
    expect(service.repaymentAmountTotal).toBeDefined();
  });

  it('should expose prismaQueryDuration histogram', () => {
    expect(service.prismaQueryDuration).toBeDefined();
  });

  // ─── Named convenience helpers ─────────────────────────────────────────────

  it('incrementHttpRequests() should not throw', () => {
    expect(() => service.incrementHttpRequests('GET', '/test', 200)).not.toThrow();
  });

  it('observeHttpDuration() should not throw', () => {
    expect(() => service.observeHttpDuration('GET', '/test', 0.05)).not.toThrow();
  });

  it('observePrismaQuery() should not throw', () => {
    expect(() => service.observePrismaQuery('User', 'findMany', 0.012)).not.toThrow();
  });

  // ─── Generic helpers ────────────────────────────────────────────────────────

  it('incrementCounter() should increment http_requests_total without throwing', () => {
    expect(() =>
      service.incrementCounter('http_requests_total', {
        method: 'GET',
        route: '/test',
        status: '200',
      }),
    ).not.toThrow();
  });

  it('observeHistogram() should observe http_request_duration_seconds without throwing', () => {
    expect(() =>
      service.observeHistogram('http_request_duration_seconds', 0.123, {
        method: 'GET',
        route: '/test',
      }),
    ).not.toThrow();
  });

  it('incrementCounter() with unknown metric name should not throw', () => {
    expect(() =>
      service.incrementCounter('non_existent_metric', { foo: 'bar' }),
    ).not.toThrow();
  });

  it('observeHistogram() with unknown metric name should not throw', () => {
    expect(() =>
      service.observeHistogram('non_existent_histogram', 1.0, { foo: 'bar' }),
    ).not.toThrow();
  });

  it('getRegistry() should return the prom-client default registry', () => {
    expect(service.getRegistry()).toBe(promClient.register);
  });

  it('getRegistry().metrics() should return a string', async () => {
    const metrics = await service.getRegistry().metrics();
    expect(typeof metrics).toBe('string');
    expect(metrics.length).toBeGreaterThan(0);
  });
});
