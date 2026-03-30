import { ResponseEnvelopeInterceptor } from '../interceptors/response-envelope.interceptor';
import { of } from 'rxjs';
import { ExecutionContext, CallHandler } from '@nestjs/common';

describe('ResponseEnvelopeInterceptor', () => {
  let interceptor: ResponseEnvelopeInterceptor;

  beforeEach(() => {
    interceptor = new ResponseEnvelopeInterceptor();
  });

  const mockContext = {
    switchToHttp: () => ({
      getRequest: () => ({ headers: { 'x-correlation-id': 'test-123' } }),
      getResponse: () => ({}),
    }),
  } as unknown as ExecutionContext;

  it('should wrap response data', (done) => {
    const handler: CallHandler = { handle: () => of({ id: '1', name: 'Test' }) };
    interceptor.intercept(mockContext, handler).subscribe((result) => {
      expect(result).toBeDefined();
      done();
    });
  });

  it('should handle array responses', (done) => {
    const handler: CallHandler = { handle: () => of([{ id: '1' }, { id: '2' }]) };
    interceptor.intercept(mockContext, handler).subscribe((result) => {
      expect(result).toBeDefined();
      done();
    });
  });

  it('should handle null responses', (done) => {
    const handler: CallHandler = { handle: () => of(null) };
    interceptor.intercept(mockContext, handler).subscribe((result) => {
      expect(result).toBeDefined();
      done();
    });
  });
});
