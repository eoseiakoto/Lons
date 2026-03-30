import {
  getCorrelationId,
  getTenantId,
  requestContext,
} from '../correlation-id.context';
import { CorrelationIdMiddleware } from '../correlation-id.middleware';

function makeReq(headers: Record<string, string> = {}): any {
  return { headers, route: undefined, url: '/test', method: 'GET' };
}

function makeRes(): { headers: Record<string, string>; setHeader: jest.Mock; statusCode: number } {
  const res = { headers: {} as Record<string, string>, statusCode: 200, setHeader: jest.fn() };
  res.setHeader.mockImplementation((key: string, value: string) => {
    res.headers[key] = value;
  });
  return res;
}

describe('CorrelationIdMiddleware', () => {
  let middleware: CorrelationIdMiddleware;

  beforeEach(() => {
    middleware = new CorrelationIdMiddleware();
  });

  it('should be instantiated without errors', () => {
    expect(middleware).toBeDefined();
  });

  it('should set X-Correlation-ID response header', (done) => {
    const req = makeReq();
    const res = makeRes();

    middleware.use(req, res as unknown as Response, () => {
      expect(res.setHeader).toHaveBeenCalledWith(
        'X-Correlation-ID',
        expect.any(String),
      );
      done();
    });
  });

  it('should propagate existing X-Correlation-ID from request', (done) => {
    const correlationId = 'test-correlation-123';
    const req = makeReq({ 'x-correlation-id': correlationId });
    const res = makeRes();

    middleware.use(req, res as unknown as Response, () => {
      expect(res.headers['X-Correlation-ID']).toBe(correlationId);
      done();
    });
  });

  it('should generate a new UUID when X-Correlation-ID header is absent', (done) => {
    const req = makeReq();
    const res = makeRes();

    middleware.use(req, res as unknown as Response, () => {
      const id = res.headers['X-Correlation-ID'];
      // UUID v4 format
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      done();
    });
  });

  it('should make correlation ID accessible via getCorrelationId() inside next()', (done) => {
    const correlationId = 'ctx-test-abc';
    const req = makeReq({ 'x-correlation-id': correlationId });
    const res = makeRes();

    middleware.use(req, res as unknown as Response, () => {
      expect(getCorrelationId()).toBe(correlationId);
      done();
    });
  });

  it('should make tenant ID accessible via getTenantId() when x-tenant-id header is set', (done) => {
    const req = makeReq({ 'x-tenant-id': 'tenant-xyz' });
    const res = makeRes();

    middleware.use(req, res as unknown as Response, () => {
      expect(getTenantId()).toBe('tenant-xyz');
      done();
    });
  });

  it('getTenantId() should be undefined when no x-tenant-id header', (done) => {
    const req = makeReq();
    const res = makeRes();

    middleware.use(req, res as unknown as Response, () => {
      expect(getTenantId()).toBeUndefined();
      done();
    });
  });
});

describe('requestContext / getCorrelationId / getTenantId outside of middleware', () => {
  it('getCorrelationId() should return undefined outside a context', () => {
    expect(getCorrelationId()).toBeUndefined();
  });

  it('getTenantId() should return undefined outside a context', () => {
    expect(getTenantId()).toBeUndefined();
  });

  it('requestContext.run() should expose values inside callback', () => {
    let capturedId: string | undefined;
    requestContext.run({ correlationId: 'test-123', tenantId: 'tenant-1' }, () => {
      capturedId = getCorrelationId();
    });
    expect(capturedId).toBe('test-123');
  });
});
