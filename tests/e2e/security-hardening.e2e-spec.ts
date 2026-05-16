/**
 * E2E integration tests — Security hardening
 *
 * Validates: GraphQL query depth enforcement (QueryComplexityPlugin),
 * XSS sanitization (sanitizeInput), CSRF token middleware, IP whitelist
 * guard, and Sprint 13B audit-logging + PII-encryption hardening
 * (S13B-3).
 */
import {
  QueryComplexityPlugin,
  calculateDepth,
  sanitizeInput,
  CsrfMiddleware,
  IpWhitelistGuard,
  AuditEventInterceptor,
  AUDIT_ACTION_KEY,
  AuditAction,
  computeEntryHash,
  computeDiff,
  encryptToString,
  decryptFromString,
  generateEncryptionKey,
  computeSearchableHash,
  ENCRYPTED_FIELDS,
  maskPhone,
  maskNationalId,
  maskEmail,
  maskName,
} from '@lons/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';

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

// ─── Sprint 13B (S13B-3) — Audit logging guarantees ─────────────────────────

describe('Sprint 13B (S13B-3) — Audit hash chain integrity', () => {
  it('hashes a sequential chain — each entry links to the previous', () => {
    const t = new Date('2026-05-09T10:00:00Z');
    const e1 = computeEntryHash(
      { id: '11111111-1111-1111-1111-111111111111', createdAt: t, action: 'create.product', resourceId: 'p1' },
      null,
    );
    const e2 = computeEntryHash(
      { id: '22222222-2222-2222-2222-222222222222', createdAt: t, action: 'update.product', resourceId: 'p1' },
      e1,
    );
    const e3 = computeEntryHash(
      { id: '33333333-3333-3333-3333-333333333333', createdAt: t, action: 'approve.loanRequest', resourceId: 'lr1' },
      e2,
    );

    expect(e1).toMatch(/^[a-f0-9]{64}$/);
    expect(e2).toMatch(/^[a-f0-9]{64}$/);
    expect(e3).toMatch(/^[a-f0-9]{64}$/);
    expect(e1).not.toEqual(e2);
    expect(e2).not.toEqual(e3);
  });

  it('detects tampering: changing the previousHash breaks the chain', () => {
    const t = new Date('2026-05-09T10:00:00Z');
    const honest = computeEntryHash(
      { id: 'A', createdAt: t, action: 'a', resourceId: 'r' },
      'genesis-hash',
    );
    const tampered = computeEntryHash(
      { id: 'A', createdAt: t, action: 'a', resourceId: 'r' },
      'forged-hash',
    );
    expect(honest).not.toEqual(tampered);
  });
});

describe('Sprint 13B (S13B-3) — Audit field-level diff', () => {
  it('reports only changed fields — not the entire record', () => {
    const before = { id: '1', name: 'Acme Ltd', country: 'GHA', status: 'active' };
    const after = { id: '1', name: 'Acme Ltd', country: 'GHA', status: 'suspended' };
    const diff = computeDiff(before, after);
    expect(diff.length).toBe(1);
    expect(diff[0]).toMatchObject({ field: 'status' });
  });

  it('reports a Decimal-as-string change as a string diff (no float coercion)', () => {
    const before = { totalExposure: '1000.0000' };
    const after = { totalExposure: '1500.0000' };
    const diff = computeDiff(before, after);
    expect(diff.length).toBe(1);
    expect(typeof diff[0].before).toBe('string');
    expect(typeof diff[0].after).toBe('string');
  });

  it('returns an empty diff when nothing changed', () => {
    const v = { a: 1, b: 'x' };
    expect(computeDiff(v, { ...v })).toEqual([]);
  });
});

describe('Sprint 13B (S13B-3) — AuditEventInterceptor wiring', () => {
  it('passes through unchanged when the handler has no @AuditAction', async () => {
    const reflector = new Reflector();
    const auditService = { log: jest.fn(async () => {}) };
    const interceptor = new AuditEventInterceptor(reflector, auditService);

    class Handler {
      doSomething() {
        return 'noop';
      }
    }
    const handler = new Handler();
    const ctx: any = {
      getHandler: () => handler.doSomething,
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => ({}) }),
    };

    await new Promise<void>((resolve) => {
      interceptor
        .intercept(ctx, { handle: () => of('ok') } as any)
        .subscribe(() => resolve());
    });
    expect(auditService.log).not.toHaveBeenCalled();
  });

  it('writes an audit entry when the handler is decorated with @AuditAction', async () => {
    const reflector = new Reflector();
    const auditService = { log: jest.fn(async () => {}) };
    const interceptor = new AuditEventInterceptor(reflector, auditService);

    class Handler {
      @AuditAction('create.product', 'product')
      doCreate() {
        return { id: 'p-1', name: 'New' };
      }
    }
    const handler = new Handler();
    const tenantId = '11111111-1111-1111-1111-111111111111';
    const ctx: any = {
      getHandler: () => handler.doCreate,
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: 'u-1', tenantId, type: 'user', role: 'sp_operator' },
          headers: {},
          ip: '10.0.0.1',
        }),
      }),
    };

    await new Promise<void>((resolve) => {
      interceptor
        .intercept(ctx, {
          handle: () => of({ id: 'p-1', name: 'New' }),
        } as any)
        .subscribe({ complete: () => resolve(), error: () => resolve() });
    });

    // tap fires synchronously after the handler resolves; allow microtasks to drain.
    await Promise.resolve();
    await Promise.resolve();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        action: 'create.product',
        resourceType: 'product',
        actorId: 'u-1',
        actorType: 'user',
      }),
    );
  });
});

// ─── Sprint 13B (S13B-3) — PII encryption guarantees ────────────────────────

describe('Sprint 13B (S13B-3) — ENCRYPTED_FIELDS configuration', () => {
  it('Customer covers the original Sprint 7 PII set', () => {
    expect(ENCRYPTED_FIELDS.Customer).toEqual(
      expect.arrayContaining([
        'nationalId',
        'phonePrimary',
        'phoneSecondary',
        'email',
        'dateOfBirth',
        'fullName',
      ]),
    );
  });

  it('PlatformUser, User, Debtor, Merchant are all configured (S13B-2)', () => {
    // FIX-12 (Sprint 15 fixes): Sprint 15 added `mfaSecret` to both
    // PlatformUser and User. `mfaBackupCodes` was added in S15-6 but
    // moved to SHA-256 hashes (FIX-6) — it is intentionally NOT in
    // ENCRYPTED_FIELDS anymore. Use arrayContaining so future additions
    // don't break this guardrail.
    expect(ENCRYPTED_FIELDS.PlatformUser).toEqual(
      expect.arrayContaining(['email', 'mfaSecret']),
    );
    expect(ENCRYPTED_FIELDS.PlatformUser).not.toContain('mfaBackupCodes');
    expect(ENCRYPTED_FIELDS.User).toEqual(
      expect.arrayContaining(['email', 'phone', 'mfaSecret']),
    );
    expect(ENCRYPTED_FIELDS.User).not.toContain('mfaBackupCodes');
    expect(ENCRYPTED_FIELDS.Debtor).toEqual(
      expect.arrayContaining([
        'contactEmail',
        'contactPhone',
        'contactName',
        'taxId',
        'registrationNumber',
      ]),
    );
    expect(ENCRYPTED_FIELDS.Merchant).toEqual(
      expect.arrayContaining(['contactEmail', 'contactPhone']),
    );
  });
});

describe('Sprint 13B (S13B-3) — Round-trip encryption', () => {
  it('encrypts → produces a JSON blob, not plaintext', () => {
    const key = generateEncryptionKey();
    const blob = encryptToString('john@example.com', key);
    expect(blob).not.toBe('john@example.com');
    const parsed = JSON.parse(blob);
    expect(parsed).toMatchObject({
      ciphertext: expect.any(String),
      iv: expect.any(String),
      tag: expect.any(String),
    });
  });

  it('decrypts back to the exact plaintext', () => {
    const key = generateEncryptionKey();
    const blob = encryptToString('+233244567890', key);
    expect(decryptFromString(blob, key)).toBe('+233244567890');
  });

  it('produces different ciphertext on each call (random IV)', () => {
    const key = generateEncryptionKey();
    const a = encryptToString('repeat', key);
    const b = encryptToString('repeat', key);
    expect(a).not.toBe(b);
    // Both still decrypt to the same plaintext.
    expect(decryptFromString(a, key)).toBe('repeat');
    expect(decryptFromString(b, key)).toBe('repeat');
  });
});

describe('Sprint 13B (S13B-3) — Searchable hash for encrypted fields', () => {
  it('produces a 64-char hex hash for any non-empty input', () => {
    const h = computeSearchableHash('user@example.com');
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('normalises case and whitespace — login lookups survive user input variations', () => {
    expect(computeSearchableHash('John@Example.com')).toBe(
      computeSearchableHash('  john@example.com  '),
    );
  });

  it('returns null for null/undefined/empty — keeps companion column in lock-step', () => {
    expect(computeSearchableHash(null)).toBeNull();
    expect(computeSearchableHash(undefined)).toBeNull();
    expect(computeSearchableHash('')).toBeNull();
    expect(computeSearchableHash('   ')).toBeNull();
  });

  it('different inputs produce different hashes (collision sanity check)', () => {
    expect(computeSearchableHash('REG-1')).not.toBe(computeSearchableHash('REG-2'));
    expect(computeSearchableHash('TAX-100')).not.toBe(computeSearchableHash('TAX-101'));
  });
});

describe('Sprint 13B (S13B-3) — PII masking utilities', () => {
  it('phone numbers keep prefix + suffix only', () => {
    const masked = maskPhone('+233244567890');
    expect(masked).not.toContain('244567');
    expect(masked.length).toBeGreaterThan(0);
  });

  it('national IDs keep prefix + suffix only', () => {
    const masked = maskNationalId('GHA-123456789-0');
    expect(masked).not.toContain('123456789');
  });

  it('emails preserve domain, mask local-part', () => {
    const masked = maskEmail('john.smith@example.com');
    expect(masked).toContain('@example.com');
    expect(masked).not.toContain('john.smith');
  });

  it('names keep first letter, mask the rest', () => {
    const masked = maskName('John Smith');
    expect(masked).not.toContain('Smith');
  });
});
