import { MlScoringClient, MlScoringUnavailableError, MlScoringResponse } from '../ml-scoring.client';
import { of, throwError } from 'rxjs';

const mockHttpService = {
  post: jest.fn(),
  get: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('http://localhost:8000'),
};

function createClient(): MlScoringClient {
  return new MlScoringClient(mockHttpService as any, mockConfigService as any);
}

const MOCK_ML_RESPONSE: MlScoringResponse = {
  score: 720,
  probability_of_default: 0.12,
  recommended_limit: '5000.0000',
  confidence: 0.85,
  risk_tier: 'medium',
  contributing_factors: [
    { name: 'payment_history', impact: 0.35 },
    { name: 'account_age', impact: 0.25 },
  ],
  model_version: 'ml-v1.0',
  scoring_method: 'gradient_boosting',
};

describe('MlScoringClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('score', () => {
    it('should return scoring response on success', async () => {
      const client = createClient();
      mockHttpService.post.mockReturnValue(of({ data: MOCK_ML_RESPONSE, status: 200 }));

      const result = await client.score(
        'tenant-1',
        'customer-1',
        { account_age_days: 365 },
        '1000.0000',
      );

      expect(result).toEqual(MOCK_ML_RESPONSE);
      expect(mockHttpService.post).toHaveBeenCalledWith(
        'http://localhost:8000/score',
        expect.objectContaining({
          tenant_id: 'tenant-1',
          customer_id: 'customer-1',
          features: { account_age_days: 365 },
          requested_amount: '1000.0000',
        }),
        { timeout: 5000 },
      );
    });

    it('should pass model_type and scoring_strategy when provided', async () => {
      const client = createClient();
      mockHttpService.post.mockReturnValue(of({ data: MOCK_ML_RESPONSE, status: 200 }));

      await client.score(
        'tenant-1',
        'customer-1',
        {},
        '1000.0000',
        'ml',
        'ml_only' as any,
      );

      expect(mockHttpService.post).toHaveBeenCalledWith(
        'http://localhost:8000/score',
        expect.objectContaining({
          model_type: 'ml',
          scoring_strategy: 'ml_only',
        }),
        { timeout: 5000 },
      );
    });

    it('should retry with exponential backoff on failure', async () => {
      const client = createClient();
      mockHttpService.post
        .mockReturnValueOnce(throwError(() => new Error('timeout')))
        .mockReturnValueOnce(throwError(() => new Error('timeout')))
        .mockReturnValueOnce(of({ data: MOCK_ML_RESPONSE, status: 200 }));

      const result = await client.score('t', 'c', {}, '1000.0000');

      expect(result).toEqual(MOCK_ML_RESPONSE);
      expect(mockHttpService.post).toHaveBeenCalledTimes(3);
    });

    it('should throw MlScoringUnavailableError after all retries exhausted', async () => {
      const client = createClient();
      mockHttpService.post.mockReturnValue(throwError(() => new Error('connection refused')));

      await expect(
        client.score('t', 'c', {}, '1000.0000'),
      ).rejects.toThrow(MlScoringUnavailableError);

      // 1 initial + 2 retries = 3 total
      expect(mockHttpService.post).toHaveBeenCalledTimes(3);
    });
  });

  describe('circuit breaker', () => {
    it('should open after 3 consecutive failures', async () => {
      const client = createClient();
      mockHttpService.post.mockReturnValue(throwError(() => new Error('fail')));

      // First failure (3 attempts each due to retry)
      await expect(client.score('t', 'c', {}, '1000.0000')).rejects.toThrow(MlScoringUnavailableError);

      const state = client._getCircuitBreakerState();
      // After 3 retried attempts fail, onFailure is called once
      // Need 3 total onFailure calls to trip the breaker
      // Each call to score that exhausts retries calls onFailure once
      expect(state.failures).toBe(1);

      // Second and third failures
      mockHttpService.post.mockReturnValue(throwError(() => new Error('fail')));
      await expect(client.score('t', 'c', {}, '1000.0000')).rejects.toThrow(MlScoringUnavailableError);
      mockHttpService.post.mockReturnValue(throwError(() => new Error('fail')));
      await expect(client.score('t', 'c', {}, '1000.0000')).rejects.toThrow(MlScoringUnavailableError);

      const openState = client._getCircuitBreakerState();
      expect(openState.state).toBe('open');
      expect(openState.failures).toBe(3);
    });

    it('should reject immediately when circuit is open', async () => {
      const client = createClient();
      mockHttpService.post.mockReturnValue(throwError(() => new Error('fail')));

      // Trip the breaker
      for (let i = 0; i < 3; i++) {
        await expect(client.score('t', 'c', {}, '1000.0000')).rejects.toThrow();
      }

      // Now the circuit is open — should reject without calling HTTP
      mockHttpService.post.mockClear();
      await expect(client.score('t', 'c', {}, '1000.0000')).rejects.toThrow(
        MlScoringUnavailableError,
      );
      expect(mockHttpService.post).not.toHaveBeenCalled();
    });

    it('should transition to half-open after reset timeout', async () => {
      const client = createClient();
      mockHttpService.post.mockReturnValue(throwError(() => new Error('fail')));

      // Trip the breaker
      for (let i = 0; i < 3; i++) {
        await expect(client.score('t', 'c', {}, '1000.0000')).rejects.toThrow();
      }

      expect(client._getCircuitBreakerState().state).toBe('open');

      // Simulate time passing by manipulating lastFailureTime
      // Access private field through the test helper — we set lastFailureTime to the past
      (client as any).circuitBreaker.lastFailureTime = Date.now() - 31_000;

      // Now a request should be allowed (half-open)
      mockHttpService.post.mockReturnValue(of({ data: MOCK_ML_RESPONSE, status: 200 }));
      const result = await client.score('t', 'c', {}, '1000.0000');
      expect(result).toEqual(MOCK_ML_RESPONSE);
      expect(client._getCircuitBreakerState().state).toBe('closed');
    });

    it('should reset circuit breaker on successful request', async () => {
      const client = createClient();
      mockHttpService.post.mockReturnValue(throwError(() => new Error('fail')));

      // One failure
      await expect(client.score('t', 'c', {}, '1000.0000')).rejects.toThrow();
      expect(client._getCircuitBreakerState().failures).toBe(1);

      // Successful request
      mockHttpService.post.mockReturnValue(of({ data: MOCK_ML_RESPONSE, status: 200 }));
      await client.score('t', 'c', {}, '1000.0000');
      expect(client._getCircuitBreakerState().failures).toBe(0);
      expect(client._getCircuitBreakerState().state).toBe('closed');
    });
  });

  describe('healthCheck', () => {
    it('should return true when service is healthy', async () => {
      const client = createClient();
      mockHttpService.get.mockReturnValue(of({ status: 200 }));

      const result = await client.healthCheck();
      expect(result).toBe(true);
    });

    it('should return false when service is down', async () => {
      const client = createClient();
      mockHttpService.get.mockReturnValue(throwError(() => new Error('connection refused')));

      const result = await client.healthCheck();
      expect(result).toBe(false);
    });
  });
});
