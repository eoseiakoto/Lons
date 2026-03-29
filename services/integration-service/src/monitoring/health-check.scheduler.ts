import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { EventBusService } from '@lons/common';
import { EventType } from '@lons/event-contracts';
import { IntegrationHealthService } from './health.service';
import { HealthStatus, IntegrationHealthReport } from './health.types';

const HEALTH_CHECK_INTERVAL_MS = 300_000; // 5 minutes

/** Tenant ID used for platform-level health checks. */
const PLATFORM_TENANT_ID = 'platform';

@Injectable()
export class HealthCheckScheduler {
  private readonly logger = new Logger('HealthCheckScheduler');
  private previousStates = new Map<string, HealthStatus>();

  constructor(
    private healthService: IntegrationHealthService,
    private eventBus: EventBusService,
  ) {}

  @Interval(HEALTH_CHECK_INTERVAL_MS)
  async checkHealth(): Promise<void> {
    try {
      const providers = await this.healthService.getKnownProviders(PLATFORM_TENANT_ID);

      for (const provider of providers) {
        await this.checkProviderHealth(PLATFORM_TENANT_ID, provider);
      }
    } catch (error) {
      this.logger.error(`Health check failed: ${error}`);
    }
  }

  async checkProviderHealth(tenantId: string, provider: string): Promise<void> {
    const report = await this.healthService.getHealth(tenantId, provider);
    const previousStatus = this.previousStates.get(provider);

    if (previousStatus && previousStatus !== report.status) {
      this.logger.warn(
        `Provider ${provider} status changed: ${previousStatus} -> ${report.status}`,
      );

      this.emitHealthChangedEvent(tenantId, provider, previousStatus, report);
    }

    this.previousStates.set(provider, report.status);
  }

  private emitHealthChangedEvent(
    tenantId: string,
    provider: string,
    previousStatus: HealthStatus,
    report: IntegrationHealthReport,
  ): void {
    this.eventBus.emitAndBuild(
      EventType.INTEGRATION_HEALTH_CHANGED,
      tenantId,
      {
        provider,
        previousStatus,
        currentStatus: report.status,
        uptime1h: report.uptime1h,
        errorRate1h: report.errorRate1h,
        avgLatency1h: report.avgLatency1h,
        circuitBreakerState: report.circuitBreakerState,
        lastSuccessAt: report.lastSuccessAt?.toISOString() ?? null,
        lastFailureAt: report.lastFailureAt?.toISOString() ?? null,
      },
    );
  }

  /** Exposed for testing: get the previous state map. */
  getPreviousStates(): Map<string, HealthStatus> {
    return this.previousStates;
  }
}
