import { FieldAuthService } from './field-auth.service';

/**
 * S19-12 — FieldAuthService unit tests.
 *
 * Coverage:
 *   - Platform defaults loaded when no tenant override.
 *   - Tenant overrides take precedence for the same fieldName.
 *   - Redis cache short-circuits the DB lookup.
 *   - Cache write happens after a miss.
 *   - checkFieldAccess: platform admin bypasses; wildcard `*`
 *     bypasses; otherwise requires at least one matching perm.
 *   - Cache write/read errors are non-fatal.
 */

function makeService(opts: {
  platformDefaults?: any[];
  tenantOverrides?: any[];
  cacheGet?: string | null;
  redisThrows?: 'get' | 'set' | null;
}) {
  const prisma: any = {
    fieldAuthConfig: {
      findMany: jest.fn().mockImplementation(({ where }: any) => {
        if (where.tenantId === null) return opts.platformDefaults ?? [];
        return opts.tenantOverrides ?? [];
      }),
    },
  };
  const redis: any = {
    get: opts.redisThrows === 'get'
      ? jest.fn().mockRejectedValue(new Error('redis down'))
      : jest.fn().mockResolvedValue(opts.cacheGet ?? null),
    setex: opts.redisThrows === 'set'
      ? jest.fn().mockRejectedValue(new Error('redis down'))
      : jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn().mockResolvedValue([]),
  };
  const service = new FieldAuthService(prisma, redis);
  return { service, prisma, redis };
}

describe('FieldAuthService.getFieldAuthRules', () => {
  it('loads platform defaults when no tenant overrides exist', async () => {
    const { service } = makeService({
      platformDefaults: [
        { fieldName: 'nationalId', requiredPermissions: ['customer:read_pii'], behavior: 'redact' },
        { fieldName: 'email', requiredPermissions: ['customer:read_pii'], behavior: 'redact' },
      ],
    });
    const rules = await service.getFieldAuthRules('tenant-1', 'customer');
    expect(rules.size).toBe(2);
    expect(rules.get('nationalId')?.requiredPermissions).toEqual(['customer:read_pii']);
  });

  it('tenant override replaces platform default for the same fieldName', async () => {
    const { service } = makeService({
      platformDefaults: [
        { fieldName: 'email', requiredPermissions: ['customer:read_pii'], behavior: 'redact' },
      ],
      tenantOverrides: [
        { fieldName: 'email', requiredPermissions: ['customer:read'], behavior: 'redact' },
      ],
    });
    const rules = await service.getFieldAuthRules('tenant-1', 'customer');
    expect(rules.get('email')?.requiredPermissions).toEqual(['customer:read']);
  });

  it('caches the merged result in Redis after a miss', async () => {
    const { service, redis } = makeService({
      platformDefaults: [
        { fieldName: 'phone', requiredPermissions: ['customer:read_pii'], behavior: 'redact' },
      ],
    });
    await service.getFieldAuthRules('tenant-1', 'customer');
    expect(redis.setex).toHaveBeenCalledWith(
      'field_auth:tenant-1:customer',
      600,
      expect.stringContaining('phone'),
    );
  });

  it('returns cached value on hit, skipping the DB', async () => {
    const cached = JSON.stringify({
      ssn: { requiredPermissions: ['customer:read_pii'], behavior: 'redact' },
    });
    const { service, prisma } = makeService({ cacheGet: cached });
    const rules = await service.getFieldAuthRules('tenant-1', 'customer');
    expect(prisma.fieldAuthConfig.findMany).not.toHaveBeenCalled();
    expect(rules.get('ssn')?.requiredPermissions).toEqual(['customer:read_pii']);
  });

  it('falls through to DB when cache read throws (non-fatal)', async () => {
    const { service, prisma } = makeService({
      platformDefaults: [
        { fieldName: 'x', requiredPermissions: ['p'], behavior: 'redact' },
      ],
      redisThrows: 'get',
    });
    const rules = await service.getFieldAuthRules('tenant-1', 'customer');
    expect(prisma.fieldAuthConfig.findMany).toHaveBeenCalled();
    expect(rules.size).toBe(1);
  });

  it('swallows cache write errors (non-fatal)', async () => {
    const { service } = makeService({
      platformDefaults: [
        { fieldName: 'x', requiredPermissions: ['p'], behavior: 'redact' },
      ],
      redisThrows: 'set',
    });
    // Should NOT throw despite redis.setex failing.
    await expect(service.getFieldAuthRules('tenant-1', 'customer')).resolves.not.toThrow();
  });

  it('works without Redis (optional dependency)', async () => {
    const prisma: any = {
      fieldAuthConfig: {
        findMany: jest.fn().mockImplementation(({ where }: any) =>
          where.tenantId === null
            ? [{ fieldName: 'x', requiredPermissions: ['p'], behavior: 'redact' }]
            : [],
        ),
      },
    };
    const service = new FieldAuthService(prisma); // no redis
    const rules = await service.getFieldAuthRules('tenant-1', 'customer');
    expect(rules.size).toBe(1);
  });
});

describe('FieldAuthService.checkFieldAccess', () => {
  const svc = new FieldAuthService({} as any);
  const rule = { requiredPermissions: ['customer:read_pii'], behavior: 'redact' as const };

  it('platform admin bypasses all checks', () => {
    expect(svc.checkFieldAccess([], true, rule)).toBe(true);
  });

  it('wildcard permission `*` bypasses', () => {
    expect(svc.checkFieldAccess(['*'], false, rule)).toBe(true);
  });

  it('grants access when user has the required permission', () => {
    expect(svc.checkFieldAccess(['customer:read_pii'], false, rule)).toBe(true);
  });

  it('denies access when user lacks the required permission', () => {
    expect(svc.checkFieldAccess(['customer:read'], false, rule)).toBe(false);
  });

  it('grants access if ANY of the required permissions is held', () => {
    const multiRule = {
      requiredPermissions: ['customer:read_pii', 'audit:read'],
      behavior: 'redact' as const,
    };
    expect(svc.checkFieldAccess(['audit:read'], false, multiRule)).toBe(true);
  });
});
