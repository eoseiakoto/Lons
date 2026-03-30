import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { ResponseEnvelopeInterceptor } from '../src/interceptors/response-envelope.interceptor';

describe('ResponseEnvelopeInterceptor', () => {
  let interceptor: ResponseEnvelopeInterceptor;

  beforeEach(() => {
    interceptor = new ResponseEnvelopeInterceptor();
  });

  function buildContext(): ExecutionContext {
    return {} as ExecutionContext;
  }

  function buildHandler(value: any): CallHandler {
    return { handle: () => of(value) };
  }

  it('wraps a plain object in the envelope', (done) => {
    const payload = { id: 'abc', name: 'Test' };
    const ctx = buildContext();
    const handler = buildHandler(payload);

    interceptor.intercept(ctx, handler).subscribe((result) => {
      expect(result.data).toEqual(payload);
      expect(result.errors).toBeNull();
      expect(result.meta).toBeDefined();
      expect(typeof result.meta.requestId).toBe('string');
      expect(typeof result.meta.timestamp).toBe('string');
      done();
    });
  });

  it('wraps an array response in the envelope', (done) => {
    const payload = [{ id: '1' }, { id: '2' }];
    interceptor.intercept(buildContext(), buildHandler(payload)).subscribe((result) => {
      expect(result.data).toEqual(payload);
      expect(result.errors).toBeNull();
      expect(result.meta).toBeDefined();
      done();
    });
  });

  it('wraps a null response in the envelope', (done) => {
    interceptor.intercept(buildContext(), buildHandler(null)).subscribe((result) => {
      expect(result.data).toBeNull();
      expect(result.errors).toBeNull();
      expect(result.meta).toBeDefined();
      done();
    });
  });

  it('includes a valid ISO timestamp in meta', (done) => {
    const before = Date.now();
    interceptor.intercept(buildContext(), buildHandler({})).subscribe((result) => {
      const ts = new Date(result.meta.timestamp).getTime();
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(Date.now());
      done();
    });
  });

  it('generates a unique requestId per call', (done) => {
    const ids = new Set<string>();
    let count = 0;
    const total = 5;

    for (let i = 0; i < total; i++) {
      interceptor.intercept(buildContext(), buildHandler({})).subscribe((result) => {
        ids.add(result.meta.requestId);
        count++;
        if (count === total) {
          expect(ids.size).toBe(total);
          done();
        }
      });
    }
  });
});
