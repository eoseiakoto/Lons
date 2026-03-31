import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';

import { AuditEventInterceptor } from '../audit-event.interceptor';

function makeReflector(metadata: { action: string; resource: string } | undefined): Reflector {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'get').mockReturnValue(metadata);
  return reflector;
}

function makeHandler(value: unknown): CallHandler {
  return { handle: () => of(value) } as CallHandler;
}

describe('AuditEventInterceptor', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls auditService.log when metadata is present and service is injected', (done) => {
    const metadata = { action: 'create', resource: 'customer' };
    const auditService = { log: jest.fn().mockResolvedValue(undefined) };
    const reflector = makeReflector(metadata);

    const interceptor = new AuditEventInterceptor(reflector, auditService);

    const user = { id: 'user-1', tenantId: 'tenant-1', type: 'user' };
    const req = { user, headers: { 'x-correlation-id': 'corr-123' }, ip: '10.0.0.1' };
    const context = {
      getHandler: () => ({}),
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => req }),
      getArgs: () => [null, null, { req }],
    } as unknown as ExecutionContext;

    const result$ = interceptor.intercept(context, makeHandler({ id: 'cust-1', name: 'Alice' }));

    result$.subscribe({
      next: (val) => {
        expect(val).toEqual({ id: 'cust-1', name: 'Alice' });
      },
      complete: () => {
        // Allow tap's async callback to execute
        setImmediate(() => {
          expect(auditService.log).toHaveBeenCalledTimes(1);
          const callArg = auditService.log.mock.calls[0][0];
          expect(callArg.action).toBe('create');
          expect(callArg.resourceType).toBe('customer');
          expect(callArg.actorId).toBe('user-1');
          expect(callArg.tenantId).toBe('tenant-1');
          expect(callArg.correlationId).toBe('corr-123');
          done();
        });
      },
    });
  });

  it('passes through without calling log when metadata is absent', (done) => {
    const auditService = { log: jest.fn().mockResolvedValue(undefined) };
    const reflector = makeReflector(undefined);

    const interceptor = new AuditEventInterceptor(reflector, auditService);

    const req = { user: {}, headers: {}, ip: '127.0.0.1' };
    const context = {
      getHandler: () => ({}),
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => req }),
      getArgs: () => [null, null, { req }],
    } as unknown as ExecutionContext;

    const result$ = interceptor.intercept(context, makeHandler({ id: 'x' }));

    result$.subscribe({
      complete: () => {
        setImmediate(() => {
          expect(auditService.log).not.toHaveBeenCalled();
          done();
        });
      },
    });
  });

  it('passes through without throwing when auditService is not provided', (done) => {
    const metadata = { action: 'delete', resource: 'product' };
    const reflector = makeReflector(metadata);

    // No auditService injected (undefined)
    const interceptor = new AuditEventInterceptor(reflector, undefined);

    const req = { user: {}, headers: {}, ip: '127.0.0.1' };
    const context = {
      getHandler: () => ({}),
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => req }),
      getArgs: () => [null, null, { req }],
    } as unknown as ExecutionContext;

    expect(() => {
      const result$ = interceptor.intercept(context, makeHandler({ id: 'prod-1' }));
      result$.subscribe({ complete: () => done() });
    }).not.toThrow();
  });

  it('does not propagate errors thrown by auditService.log', (done) => {
    const metadata = { action: 'update', resource: 'contract' };
    const auditService = { log: jest.fn().mockRejectedValue(new Error('DB error')) };
    const reflector = makeReflector(metadata);

    const interceptor = new AuditEventInterceptor(reflector, auditService);

    const req = { user: { id: 'u1', tenantId: 't1' }, headers: {}, ip: '127.0.0.1' };
    const context = {
      getHandler: () => ({}),
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => req }),
      getArgs: () => [null, null, { req }],
    } as unknown as ExecutionContext;

    const result$ = interceptor.intercept(context, makeHandler({ id: 'contract-1' }));

    result$.subscribe({
      next: (val) => expect(val).toEqual({ id: 'contract-1' }),
      error: () => done.fail('Observable should not error'),
      complete: () => {
        setImmediate(() => {
          expect(auditService.log).toHaveBeenCalledTimes(1);
          done();
        });
      },
    });
  });
});
