/**
 * E2E integration tests — Security hardening
 *
 * Validates: GraphQL query depth enforcement (QueryComplexityPlugin),
 * XSS sanitization (sanitizeInput), CSRF token middleware, and
 * IP whitelist guard.
 */
import {
  QueryComplexityPlugin,
  calculateDepth,
  sanitizeInput,
  CsrfMiddleware,
  IpWhitelistGuard,
} from '@lons/common';

// ─── QueryComplexityPlugin ───────────────────────────────────────────────────

function makeDocument(depth: number): any {
  // Builds a synthetic AST-like document at the given nesting depth
  function nest(d: number): any {
    if (d === 0) return { kind: 'Field', name: { value: 'leaf' } };
    return {
      kind: 'Field',
      name: { value: `level${d}` },
      selectionSet: { selections: [nest(d - 1)] },
    };
  }

  return {
    kind: 'Document',
    definitions: [
      {
        kind: 'OperationDefinition',
        selectionSet: { selections: [nest(depth)] },
      },
    ],
  };
}

describe('QueryComplexityPlugin — depth analysis', () => {
  it('shallow document (depth 3) is below default limit of 10', () => {
    const doc = makeDocument(3);
    const depth = calculateDepth(doc);
    expect(depth).toBeLessThanOrEqual(10);
  });

  it('deep document (depth 12) exceeds default limit of 10', () => {
    const doc = makeDocument(12);
    const depth = calculateDepth(doc);
    expect(depth).toBeGreaterThan(10);
  });

  it('plugin.requestDidStart resolves to an object with didResolveOperation', async () => {
    const plugin = new QueryComplexityPlugin({ maxDepth: 10, maxCost: 1000 });
    const hooks = await plugin.requestDidStart();
    expect(typeof hooks.didResolveOperation).toBe('function');
  });

  it('plugin throws when document depth exceeds maxDepth', async () => {
    const plugin = new QueryComplexityPlugin({ maxDepth: 5, maxCost: 1000 });
    const hooks = await plugin.requestDidStart();
    const deepDoc = makeDocument(6);

    await expect(
      hooks.didResolveOperation({ document: deepDoc }),
    ).rejects.toThrow(/depth/i);
  });

  it('plugin does not throw for document within maxDepth', async () => {
    const plugin = new QueryComplexityPlugin({ maxDepth: 10, maxCost: 1000 });
    const hooks = await plugin.requestDidStart();
    const shallowDoc = makeDocument(3);

    await expect(
      hooks.didResolveOperation({ document: shallowDoc }),
    ).resolves.not.toThrow();
  });
});

// ─── sanitizeInput ───────────────────────────────────────────────────────────

describe('sanitizeInput — XSS removal', () => {
  it('removes <script> tags', () => {
    const input = 'Hello <script>alert("xss")</script> World';
    expect(sanitizeInput(input)).not.toContain('<script>');
  });

  it('removes inline onclick handlers', () => {
    const input = '<div onclick="evil()">click me</div>';
    expect(sanitizeInput(input)).not.toContain('onclick');
  });

  it('removes javascript: URIs', () => {
    const input = '<a href="javascript:void(0)">link</a>';
    expect(sanitizeInput(input)).not.toContain('javascript:');
  });

  it('leaves harmless HTML untouched', () => {
    const input = '<b>Bold text</b>';
    const result = sanitizeInput(input);
    expect(result).toContain('<b>Bold text</b>');
  });

  it('handles empty string without throwing', () => {
    expect(sanitizeInput('')).toBe('');
  });
});

// ─── CsrfMiddleware ──────────────────────────────────────────────────────────

describe('CsrfMiddleware', () => {
  let middleware: CsrfMiddleware;

  beforeEach(() => {
    middleware = new CsrfMiddleware();
  });

  it('GET request sets XSRF-TOKEN cookie and calls next', () => {
    const cookies: Record<string, any> = {};
    const req = { method: 'GET' };
    const res = {
      cookie: (name: string, value: string, _opts: any) => {
        cookies[name] = value;
      },
    };
    const next = jest.fn();

    middleware.use(req as any, res as any, next);

    expect(next).toHaveBeenCalled();
    expect(cookies['XSRF-TOKEN']).toBeDefined();
    expect(typeof cookies['XSRF-TOKEN']).toBe('string');
    expect(cookies['XSRF-TOKEN']).toHaveLength(64); // 32 bytes = 64 hex chars
  });

  it('POST with matching cookie and header tokens calls next', () => {
    const token = 'a'.repeat(64);
    const req = {
      method: 'POST',
      cookies: { 'XSRF-TOKEN': token },
      headers: { 'x-xsrf-token': token },
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();

    middleware.use(req as any, res as any, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('POST with mismatched tokens returns 403', () => {
    const req = {
      method: 'POST',
      cookies: { 'XSRF-TOKEN': 'a'.repeat(64) },
      headers: { 'x-xsrf-token': 'b'.repeat(64) },
    };
    const jsonMock = jest.fn();
    const res = { status: jest.fn().mockReturnValue({ json: jsonMock }) };
    const next = jest.fn();

    middleware.use(req as any, res as any, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});

// ─── IpWhitelistGuard ────────────────────────────────────────────────────────

describe('IpWhitelistGuard — IP enforcement', () => {
  let guard: IpWhitelistGuard;

  beforeEach(() => {
    guard = new IpWhitelistGuard();
  });

  it('allows all traffic when no whitelist is configured', () => {
    const ctx: any = {
      switchToHttp: () => ({
        getRequest: () => ({ user: { tenantSettings: {} }, ip: '1.2.3.4', headers: {} }),
      }),
    };
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows whitelisted IP', () => {
    const ctx: any = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { tenantSettings: { ipWhitelist: ['10.0.0.1', '10.0.0.2'] } },
          ip: '10.0.0.1',
          headers: {},
        }),
      }),
    };
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('blocks non-whitelisted IP', () => {
    const ctx: any = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { tenantSettings: { ipWhitelist: ['10.0.0.1'] } },
          ip: '192.168.1.100',
          headers: {},
        }),
      }),
    };
    expect(guard.canActivate(ctx)).toBe(false);
  });

  it('respects X-Forwarded-For header over req.ip', () => {
    const ctx: any = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { tenantSettings: { ipWhitelist: ['203.0.113.5'] } },
          ip: '10.0.0.1',
          headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
        }),
      }),
    };
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
