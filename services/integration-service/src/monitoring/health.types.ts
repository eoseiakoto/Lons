export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface IntegrationHealthReport {
  provider: string;
  status: HealthStatus;
  uptime1h: number;
  uptime24h: number;
  uptime7d: number;
  avgLatency1h: number;
  avgLatency24h: number;
  errorRate1h: number;
  errorRate24h: number;
  totalCalls1h: number;
  totalCalls24h: number;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  circuitBreakerState: string;
  lastCheckedAt: Date;
}

export interface ApiLogEntry {
  id: string;
  tenantId: string;
  provider: string;
  endpoint: string;
  method: string;
  responseStatus: number | null;
  latencyMs: number;
  success: boolean;
  errorMessage: string | null;
  correlationId: string | null;
  circuitBreakerState: string | null;
  createdAt: Date;
}

export interface ProviderMetrics {
  totalCount: number;
  successCount: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
}
