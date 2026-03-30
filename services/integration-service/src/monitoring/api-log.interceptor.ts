import { Injectable, Logger } from '@nestjs/common';
import { ApiLogService, CreateApiLogInput } from './api-log.service';

export interface ExternalCallResult<T> {
  data: T;
  latencyMs: number;
}

@Injectable()
export class ApiCallLoggerInterceptor {
  private readonly logger = new Logger('ApiCallLoggerInterceptor');

  constructor(private apiLogService: ApiLogService) {}

  /**
   * Wraps an external API call, automatically logging it to the IntegrationApiLog table.
   *
   * @param tenantId - Tenant context
   * @param provider - Integration provider name (e.g. 'mtn_momo', 'mpesa')
   * @param endpoint - External endpoint being called
   * @param method - HTTP method (GET, POST, etc.)
   * @param fn - The async function that performs the external call
   * @param correlationId - Optional correlation ID for tracing
   * @param circuitBreakerState - Optional current circuit breaker state
   * @returns The result of the external call
   */
  async wrapExternalCall<T>(
    tenantId: string,
    provider: string,
    endpoint: string,
    method: string,
    fn: () => Promise<T>,
    correlationId?: string,
    circuitBreakerState?: string,
  ): Promise<T> {
    const startTime = Date.now();
    let success = false;
    let errorMessage: string | null = null;
    let responseStatus: number | null = null;
    let result: T;

    try {
      result = await fn();
      success = true;

      // If the result looks like an HTTP response with a status, capture it
      if (result && typeof result === 'object' && 'status' in result) {
        responseStatus = (result as Record<string, unknown>).status as number;
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errorMessage = err.message;

      // Try to extract HTTP status from error
      if ('status' in err) {
        responseStatus = (err as Record<string, unknown>).status as number;
      } else if ('response' in err && typeof (err as Record<string, unknown>).response === 'object') {
        const response = (err as Record<string, unknown>).response as Record<string, unknown>;
        responseStatus = response?.status as number ?? null;
      }

      throw error;
    } finally {
      const latencyMs = Date.now() - startTime;

      const logData: CreateApiLogInput = {
        tenantId,
        provider,
        endpoint,
        method,
        responseStatus,
        latencyMs,
        success,
        errorMessage,
        correlationId: correlationId ?? null,
        circuitBreakerState: circuitBreakerState ?? null,
      };

      // Log asynchronously — do not block the caller
      this.apiLogService.logApiCall(logData).catch((logError) => {
        this.logger.error(`Failed to log API call for ${provider} ${endpoint}: ${logError}`);
      });
    }

    return result!;
  }
}
