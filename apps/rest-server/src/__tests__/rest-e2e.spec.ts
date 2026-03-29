import { IdempotencyInterceptor } from '../interceptors/idempotency.interceptor';
import { of } from 'rxjs';
import { ExecutionContext, CallHandler } from '@nestjs/common';

describe('REST API E2E', () => {
  describe('IdempotencyInterceptor', () => {
    let interceptor: IdempotencyInterceptor;

    beforeEach(() => {
      interceptor = new IdempotencyInterceptor();
    });

    const makeContext = (method: string, idempotencyKey?: string): ExecutionContext => ({
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          headers: idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {},
        }),
      }),
    }) as unknown as ExecutionContext;

    it('should pass through GET requests without caching', (done) => {
      const handler: CallHandler = { handle: () => of({ id: '1' }) };
      interceptor.intercept(makeContext('GET', 'key-1'), handler).subscribe((result: any) => {
        expect(result).toEqual({ id: '1' });
        done();
      });
    });

    it('should cache POST response by idempotency key', (done) => {
      const handler: CallHandler = { handle: () => of({ id: '1', created: true }) };
      interceptor.intercept(makeContext('POST', 'unique-key'), handler).subscribe((result: any) => {
        expect(result).toEqual({ id: '1', created: true });

        const handler2: CallHandler = { handle: () => of({ id: '2', created: true }) };
        interceptor.intercept(makeContext('POST', 'unique-key'), handler2).subscribe((result2: any) => {
          expect(result2).toEqual({ id: '1', created: true });
          done();
        });
      });
    });

    it('should pass through when no idempotency key', (done) => {
      const handler: CallHandler = { handle: () => of({ id: '1' }) };
      interceptor.intercept(makeContext('POST'), handler).subscribe((result: any) => {
        expect(result).toEqual({ id: '1' });
        done();
      });
    });
  });
});
