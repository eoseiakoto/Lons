import { Injectable, Logger } from '@nestjs/common';
import { ApiLogService } from './api-log.service';
import { IntegrationHealthReport, HealthStatus } from './health.types';

const ONE_HOUR_MS = 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * ONE_HOUR_MS;
const SEVEN_DAYS_MS = 7 * TWENTY_FOUR_HOURS_MS;

@Injectable()
export class IntegrationHealthService {
  private readonly logger = new Logger('IntegrationHealthService');

  constructor(private apiLogService: ApiLogService) {}

  async getHealth(tenantId: string, provider: string): Promise<IntegrationHealthReport> {
    const [metrics1h, metrics24h, metrics7d, lastSuccessAt, lastFailureAt] = await Promise.all([
      this.apiLogService.getMetricsByProvider(tenantId, provider, ONE_HOUR_MS),
      this.apiLogService.getMetricsByProvider(tenantId, provider, TWENTY_FOUR_HOURS_MS),
      this.apiLogService.getMetricsByProvider(tenantId, provider, SEVEN_DAYS_MS),
      this.apiLogService.getLastSuccess(tenantId, provider),
      this.apiLogService.getLastFailure(tenantId, provider),
    ]);

    const uptime1h = this.calculateUptime(metrics1h.successCount, metrics1h.totalCount);
    const uptime24h = this.calculateUptime(metrics24h.successCount, metrics24h.totalCount);
    const uptime7d = this.calculateUptime(metrics7d.successCount, metrics7d.totalCount);

    const errorRate1h = metrics1h.totalCount > 0
      ? ((metrics1h.totalCount - metrics1h.successCount) / metrics1h.totalCount) * 100
      : 0;
    const errorRate24h = metrics24h.totalCount > 0
      ? ((metrics24h.totalCount - metrics24h.successCount) / metrics24h.totalCount) * 100
      : 0;

    const status = this.determineStatus(uptime1h, metrics1h.totalCount);

    return {
      provider,
      status,
      uptime1h,
      uptime24h,
      uptime7d,
      avgLatency1h: metrics1h.avgLatencyMs,
      avgLatency24h: metrics24h.avgLatencyMs,
      errorRate1h,
      errorRate24h,
      totalCalls1h: metrics1h.totalCount,
      totalCalls24h: metrics24h.totalCount,
      lastSuccessAt,
      lastFailureAt,
      circuitBreakerState: this.getCircuitBreakerState(provider),
      lastCheckedAt: new Date(),
    };
  }

  async getAllHealth(tenantId: string): Promise<IntegrationHealthReport[]> {
    const providers = await this.getKnownProviders(tenantId);

    const reports = await Promise.all(
      providers.map((provider) => this.getHealth(tenantId, provider)),
    );

    return reports;
  }

  async getKnownProviders(tenantId: string): Promise<string[]> {
    return this.apiLogService.getDistinctProviders(tenantId);
  }

  private calculateUptime(successCount: number, totalCount: number): number {
    if (totalCount === 0) return 0;
    return (successCount / totalCount) * 100;
  }

  private determineStatus(uptime: number, totalCalls: number): HealthStatus {
    if (totalCalls === 0) return 'unknown';
    if (uptime > 95) return 'healthy';
    if (uptime >= 80) return 'degraded';
    return 'unhealthy';
  }

  private getCircuitBreakerState(_provider: string): string {
    // Circuit breaker instances are managed per-adapter.
    // This returns 'unknown' unless a registry is provided.
    // In production, adapters register their circuit breakers with a shared registry.
    return 'unknown';
  }
}
