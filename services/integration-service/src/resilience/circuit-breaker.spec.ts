import { CircuitBreaker, CircuitState } from './circuit-breaker';

describe('CircuitBreaker', () => {
  it('should start in closed state', () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 1000, halfOpenMaxAttempts: 1 });
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });

  it('should open after failure threshold', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeout: 1000, halfOpenMaxAttempts: 1 });
    const failFn = () => Promise.reject(new Error('fail'));

    try { await cb.execute(failFn); } catch {}
    try { await cb.execute(failFn); } catch {}

    expect(cb.getState()).toBe(CircuitState.OPEN);
    await expect(cb.execute(() => Promise.resolve('ok'))).rejects.toThrow('Circuit breaker is open');
  });

  it('should pass through successful calls when closed', async () => {
    const cb = new CircuitBreaker();
    const result = await cb.execute(() => Promise.resolve('success'));
    expect(result).toBe('success');
  });

  it('should reset after successful call', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeout: 1000, halfOpenMaxAttempts: 1 });
    try { await cb.execute(() => Promise.reject(new Error('fail'))); } catch {}
    await cb.execute(() => Promise.resolve('ok'));
    expect(cb.getState()).toBe(CircuitState.CLOSED);
  });
});
