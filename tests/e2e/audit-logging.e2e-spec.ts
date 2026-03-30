/**
 * E2E integration tests — Audit logging
 *
 * Validates: hash-linked chain integrity, tamper detection, field-level diffs,
 * and audit enum values.
 */
import { of, lastValueFrom } from 'rxjs';
import { Reflector } from '@nestjs/core';
import {
  computeEntryHash,
  verifyAuditChain,
  computeDiff,
  AuditActionType,
  AuditResourceType,
  AuditEventInterceptor,
} from '@lons/common';
import type { AuditHashEntry } from '../../packages/common/src/audit/audit-hash.util';

function buildChain(count: number): AuditHashEntry[] {
  const entries: AuditHashEntry[] = [];
  let previousHash: string | null = null;

  for (let i = 0; i < count; i++) {
    const base = {
      id: `entry-${i}`,
      createdAt: new Date(Date.now() + i * 1000),
      action: AuditActionType.CREATE,
      resourceId: `resource-${i}`,
    };
    const hash = computeEntryHash(base, previousHash);
    entries.push({ ...base, entryHash: hash, previousHash });
    previousHash = hash;
  }

  return entries;
}

describe('Audit logging — hash chain integrity', () => {
  it('verifies a clean chain of 3 entries', () => {
    const chain = buildChain(3);
    const result = verifyAuditChain(chain);

    expect(result.valid).toBe(true);
    expect(result.brokenAt).toBeUndefined();
  });

  it('detects a tampered middle entry', () => {
    const chain = buildChain(3);
    // Tamper with entry at index 1 — change the action field
    chain[1] = { ...chain[1], action: 'tampered_action' };

    const result = verifyAuditChain(chain);

    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe('entry-1');
  });

  it('detects tampering with the first entry', () => {
    const chain = buildChain(3);
    chain[0] = { ...chain[0], resourceId: 'injected-resource' };

    const result = verifyAuditChain(chain);

    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe('entry-0');
  });

  it('returns valid for an empty chain', () => {
    const result = verifyAuditChain([]);
    expect(result.valid).toBe(true);
  });

  it('computeEntryHash returns a 64-char hex string', () => {
    const hash = computeEntryHash(
      { id: 'x', createdAt: new Date(), action: 'create', resourceId: 'r' },
      null,
    );
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('different previousHash values produce different hashes', () => {
    const base = { id: 'x', createdAt: new Date('2026-01-01'), action: 'create', resourceId: 'r' };
    const h1 = computeEntryHash(base, null);
    const h2 = computeEntryHash(base, 'some-prior-hash');

    expect(h1).not.toBe(h2);
  });
});

describe('Audit logging — computeDiff', () => {
  it('create diff: before=null produces all fields with before=undefined', () => {
    const after = { name: 'Alice', status: 'ACTIVE' };
    const diffs = computeDiff(null, after);

    expect(diffs).toHaveLength(2);
    diffs.forEach((d) => expect(d.before).toBeUndefined());
    expect(diffs.find((d) => d.field === 'name')?.after).toBe('Alice');
  });

  it('update diff: only changed fields appear', () => {
    const before = { name: 'Alice', status: 'ACTIVE', score: 700 };
    const after = { name: 'Alice', status: 'SUSPENDED', score: 700 };
    const diffs = computeDiff(before, after);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].field).toBe('status');
    expect(diffs[0].before).toBe('ACTIVE');
    expect(diffs[0].after).toBe('SUSPENDED');
  });

  it('delete diff: after=null produces all fields with after=undefined', () => {
    const before = { id: '123', name: 'Bob' };
    const diffs = computeDiff(before, null);

    expect(diffs).toHaveLength(2);
    diffs.forEach((d) => expect(d.after).toBeUndefined());
  });

  it('no-change diff: empty array when objects are identical', () => {
    const obj = { a: 1, b: 'hello' };
    const diffs = computeDiff(obj, { ...obj });

    expect(diffs).toHaveLength(0);
  });
});

describe('Audit enums — expected values', () => {
  it('AuditActionType has core CRUD values', () => {
    expect(AuditActionType.CREATE).toBe('create');
    expect(AuditActionType.UPDATE).toBe('update');
    expect(AuditActionType.DELETE).toBe('delete');
    expect(AuditActionType.LOGIN).toBe('login');
    expect(AuditActionType.DISBURSEMENT).toBe('disbursement');
    expect(AuditActionType.REPAYMENT).toBe('repayment');
  });

  it('AuditResourceType covers key business entities', () => {
    expect(AuditResourceType.CUSTOMER).toBe('customer');
    expect(AuditResourceType.CONTRACT).toBe('contract');
    expect(AuditResourceType.LOAN_REQUEST).toBe('loan_request');
    expect(AuditResourceType.WEBHOOK).toBe('webhook');
  });
});

// Helper to create a mock ExecutionContext for interceptor tests
function createMockExecutionContext(opts: {
  handler: Function;
  user?: Record<string, unknown>;
  headers?: Record<string, string>;
}) {
  return {
    getHandler: () => opts.handler,
    getClass: () => ({}),
    getType: () => 'graphql' as const,
    getArgs: () => [
      {}, // root
      {}, // args
      { req: { user: opts.user ?? {}, headers: opts.headers ?? {} } }, // context
      {}, // info
    ],
    switchToHttp: () => ({
      getRequest: () => ({ user: opts.user ?? {}, headers: opts.headers ?? {} }),
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
  } as any;
}

describe('Audit Flow Integration', () => {
  it('should create audit entry when AuditEventInterceptor fires', async () => {
    const mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const interceptor = new AuditEventInterceptor(
      new Reflector(),
      mockAuditService as any,
    );

    // Simulate a handler decorated with @AuditAction('create', 'customer')
    const mockHandler = jest.fn();
    Reflect.defineMetadata('audit_action', { action: 'create', resource: 'customer' }, mockHandler);

    const mockContext = createMockExecutionContext({
      handler: mockHandler,
      user: { id: 'user-1', tenantId: 'tenant-1', type: 'user', role: 'admin' },
      headers: { 'x-correlation-id': 'corr-123' },
    });

    const mockCallHandler = {
      handle: () => of({ id: 'cust-1', name: 'Test Customer' }),
    };

    const result$ = interceptor.intercept(mockContext, mockCallHandler as any);

    await lastValueFrom(result$);

    // Wait for async tap
    await new Promise((r) => setTimeout(r, 50));

    expect(mockAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        actorId: 'user-1',
        actorType: 'user',
        action: 'create',
        resourceType: 'customer',
        resourceId: 'cust-1',
        correlationId: 'corr-123',
        metadata: expect.objectContaining({
          accessType: 'tenant_scoped',
        }),
      }),
    );
  });

  it('should tag platform admin cross-tenant access', async () => {
    const mockAuditService = { log: jest.fn().mockResolvedValue(undefined) };
    const interceptor = new AuditEventInterceptor(new Reflector(), mockAuditService as any);

    const mockHandler = jest.fn();
    Reflect.defineMetadata('audit_action', { action: 'read', resource: 'customer' }, mockHandler);

    const mockContext = createMockExecutionContext({
      handler: mockHandler,
      user: { id: 'admin-1', tenantId: 'tenant-2', type: 'user', role: 'platform_admin' },
    });

    const mockCallHandler = { handle: () => of({ id: 'cust-2' }) };
    const result$ = interceptor.intercept(mockContext, mockCallHandler as any);
    await lastValueFrom(result$);
    await new Promise((r) => setTimeout(r, 50));

    expect(mockAuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          accessType: 'platform_admin_cross_tenant',
        }),
      }),
    );
  });
});
