import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ScoringStrategy } from '@lons/shared-types';

export interface MlScoringResponse {
  score: number;
  probability_of_default: number;
  recommended_limit: string;
  confidence: number;
  risk_tier: string;
  contributing_factors: Array<{ name: string; impact: number }>;
  model_version: string;
  scoring_method?: string;
}

interface CircuitBreakerState {
  failures: number;
  state: 'closed' | 'open' | 'half-open';
  lastFailureTime: number;
}

const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_RESET_MS = 30_000;
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 200;

@Injectable()
export class MlScoringClient {
  private readonly logger = new Logger(MlScoringClient.name);
  private readonly baseUrl: string;
  private circuitBreaker: CircuitBreakerState = {
    failures: 0,
    state: 'closed',
    lastFailureTime: 0,
  };

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>('SCORING_SERVICE_URL', 'http://localhost:8000');
  }

  async score(
    tenantId: string,
    customerId: string,
    features: Record<string, unknown>,
    requestedAmount: string,
    modelType?: string,
    strategy?: ScoringStrategy,
  ): Promise<MlScoringResponse> {
    this.checkCircuitBreaker();

    const payload = {
      tenant_id: tenantId,
      customer_id: customerId,
      features,
      requested_amount: requestedAmount,
      model_type: modelType ?? null,
      scoring_strategy: strategy ?? null,
    };

    return this.executeWithRetry(async () => {
      const response = await firstValueFrom(
        this.httpService.post<MlScoringResponse>(
          `${this.baseUrl}/score`,
          payload,
          { timeout: REQUEST_TIMEOUT_MS },
        ),
      );
      this.onSuccess();
      return response.data;
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/health`, {
          timeout: REQUEST_TIMEOUT_MS,
        }),
      );
      return response.status === 200;
    } catch {
      return false;
    }
  }

  private checkCircuitBreaker(): void {
    if (this.circuitBreaker.state === 'open') {
      const elapsed = Date.now() - this.circuitBreaker.lastFailureTime;
      if (elapsed >= CIRCUIT_BREAKER_RESET_MS) {
        this.circuitBreaker.state = 'half-open';
        this.logger.log('Circuit breaker transitioning to half-open');
      } else {
        throw new MlScoringUnavailableError(
          'ML scoring service circuit breaker is open',
        );
      }
    }
  }

  private onSuccess(): void {
    if (this.circuitBreaker.state === 'half-open') {
      this.logger.log('Circuit breaker closed after successful request');
    }
    this.circuitBreaker = { failures: 0, state: 'closed', lastFailureTime: 0 };
  }

  private onFailure(): void {
    this.circuitBreaker.failures += 1;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
      this.circuitBreaker.state = 'open';
      this.logger.warn(
        `Circuit breaker opened after ${this.circuitBreaker.failures} failures`,
      );
    }
  }

  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(
          `ML scoring request failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${lastError.message}`,
        );

        if (attempt < MAX_RETRIES) {
          const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
          await this.sleep(backoffMs);
        }
      }
    }

    this.onFailure();
    throw new MlScoringUnavailableError(
      `ML scoring service unavailable after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Exposed for testing only */
  _getCircuitBreakerState(): CircuitBreakerState {
    return { ...this.circuitBreaker };
  }

  /** Exposed for testing only */
  _resetCircuitBreaker(): void {
    this.circuitBreaker = { failures: 0, state: 'closed', lastFailureTime: 0 };
  }
}

export class MlScoringUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MlScoringUnavailableError';
  }
}
