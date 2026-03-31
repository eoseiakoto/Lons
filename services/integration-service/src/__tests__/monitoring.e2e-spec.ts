import { ApiLogService, CreateApiLogInput } from '../monitoring/api-log.service';
import { IntegrationHealthService } from '../monitoring/health.service';
import { HealthCheckScheduler } from '../monitoring/health-check.scheduler';
import { EventType } from '@lons/event-contracts';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-e2e-monitoring';
const PROVIDER_MOMO = 'mtn-momo';
const PROVIDER_MPESA = 'm-pesa';

function createMockEventBus() {
  return {
    emitAndBuild: jest.fn(),
    emit: jest.fn(),
    buildEvent: jest.fn(),
  };
}

/**
 * In-memory mock for PrismaService that simulates integrationApiLog table.
 * All aggregations are performed in-memory to test the service layer logic.
 */
function createMockPrismaForMonitoring() {
  const logs: any[] = [];
  let counter = 0;

  return {
    integrationApiLog: {
      create: jest.fn().mockImplementation(({ data }) => {
        counter++;
        const record = {
          id: `log-${counter}`,
          ...data,
          createdAt: new Date(),
        };
        logs.push(record);
        return Promise.resolve(record);
      }),
      findMany: jest.fn().mockImplementation(({ where, orderBy, take, distinct, select }) => {
        let filtered = [...logs];

        if (where?.tenantId) {
          filtered = filtered.filter((l) => l.tenantId === where.tenantId);
        }
        if (where?.provider) {
          filtered = filtered.filter((l) => l.provider === where.provider);
        }
        if (where?.success !== undefined) {
          filtered = filtered.filter((l) => l.success === where.success);
        }
        if (where?.createdAt?.gte) {
          filtered = filtered.filter((l) => l.createdAt >= where.createdAt.gte);
        }
        if (where?.createdAt?.lte) {
          filtered = filtered.filter((l) => l.createdAt <= where.createdAt.lte);
        }

        if (distinct) {
          const seen = new Set<string>();
          const deduped: any[] = [];
          for (const item of filtered) {
            const key = distinct.map((d: string) => item[d]).join('|');
            if (!seen.has(key)) {
              seen.add(key);
              deduped.push(item);
            }
          }
          filtered = deduped;
        }

        if (orderBy?.createdAt === 'desc') {
          filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }

        if (take) {
          filtered = filtered.slice(0, take);
        }

        if (select) {
          return Promise.resolve(filtered.map((item) => {
            const result: any = {};
            for (const key of Object.keys(select)) {
              if (select[key]) result[key] = item[key];
            }
            return result;
          }));
        }

        return Promise.resolve(filtered);
      }),
      findFirst: jest.fn().mockImplementation(({ where, orderBy, select }) => {
        let filtered = [...logs];

        if (where?.tenantId) filtered = filtered.filter((l) => l.tenantId === where.tenantId);
        if (where?.provider) filtered = filtered.filter((l) => l.provider === where.provider);
        if (where?.success !== undefined) filtered = filtered.filter((l) => l.success === where.success);

        if (orderBy?.createdAt === 'desc') {
          filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }

        const found = filtered[0] || null;
        if (found && select) {
          const result: any = {};
          for (const key of Object.keys(select)) {
            if (select[key]) result[key] = found[key];
          }
          return Promise.resolve(result);
        }
        return Promise.resolve(found);
      }),
      aggregate: jest.fn().mockImplementation(({ where }) => {
        let filtered = [...logs];

        if (where?.tenantId) filtered = filtered.filter((l) => l.tenantId === where.tenantId);
        if (where?.provider) filtered = filtered.filter((l) => l.provider === where.provider);
        if (where?.createdAt?.gte) filtered = filtered.filter((l) => l.createdAt >= where.createdAt.gte);

        const latencies = filtered.map((l) => l.latencyMs);
        const count = filtered.length;
        const avg = count > 0 ? latencies.reduce((a, b) => a + b, 0) / count : null;
        const min = count > 0 ? Math.min(...latencies) : null;
        const max = count > 0 ? Math.max(...latencies) : null;

        return Promise.resolve({
          _count: { id: count },
          _avg: { latencyMs: avg },
          _min: { latencyMs: min },
          _max: { latencyMs: max },
        });
      }),
      count: jest.fn().mockImplementation(({ where }) => {
        let filtered = [...logs];

        if (where?.tenantId) filtered = filtered.filter((l) => l.tenantId === where.tenantId);
        if (where?.provider) filtered = filtered.filter((l) => l.provider === where.provider);
        if (where?.success !== undefined) filtered = filtered.filter((l) => l.success === where.success);
        if (where?.createdAt?.gte) filtered = filtered.filter((l) => l.createdAt >= where.createdAt.gte);

        return Promise.resolve(filtered.length);
      }),
    },
    _logs: logs,
  };
}

// ---------------------------------------------------------------------------
// ApiLogService E2E Tests
// ---------------------------------------------------------------------------

describe('ApiLogService (E2E)', () => {
  let service: ApiLogService;
  let mockPrisma: ReturnType<typeof createMockPrismaForMonitoring>;

  beforeEach(() => {
    mockPrisma = createMockPrismaForMonitoring();
    service = new ApiLogService(mockPrisma as any);
  });

  it('should log an API call and return an ApiLogEntry', async () => {
    const input: CreateApiLogInput = {
      tenantId: TENANT_ID,
      provider: PROVIDER_MOMO,
      endpoint: '/disbursement/v1_0/transfer',
      method: 'POST',
      responseStatus: 200,
      latencyMs: 245,
      success: true,
      correlationId: 'corr-001',
    };

    const entry = await service.logApiCall(input);

    expect(entry).toBeDefined();
    expect(entry.id).toBeDefined();
    expect(entry.tenantId).toBe(TENANT_ID);
    expect(entry.provider).toBe(PROVIDER_MOMO);
    expect(entry.success).toBe(true);
    expect(entry.latencyMs).toBe(245);
    expect(entry.createdAt).toBeInstanceOf(Date);
  });

  it('should log a failed API call with error message', async () => {
    const input: CreateApiLogInput = {
      tenantId: TENANT_ID,
      provider: PROVIDER_MOMO,
      endpoint: '/disbursement/v1_0/transfer',
      method: 'POST',
      responseStatus: 500,
      latencyMs: 3200,
      success: false,
      errorMessage: 'Internal Server Error',
      circuitBreakerState: 'closed',
    };

    const entry = await service.logApiCall(input);

    expect(entry.success).toBe(false);
    expect(entry.errorMessage).toBe('Internal Server Error');
  });

  it('should retrieve logs by provider within a time window', async () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // Log several calls
    await service.logApiCall({
      tenantId: TENANT_ID,
      provider: PROVIDER_MOMO,
      endpoint: '/transfer',
      method: 'POST',
      latencyMs: 100,
      success: true,
    });
    await service.logApiCall({
      tenantId: TENANT_ID,
      provider: PROVIDER_MPESA,
      endpoint: '/b2c',
      method: 'POST',
      latencyMs: 200,
      success: true,
    });

    const momoLogs = await service.getLogsByProvider(
      TENANT_ID,
      PROVIDER_MOMO,
      oneHourAgo,
      new Date(),
    );

    expect(momoLogs.length).toBeGreaterThanOrEqual(1);
    for (const log of momoLogs) {
      expect(log.provider).toBe(PROVIDER_MOMO);
    }
  });

  it('should compute metrics by provider', async () => {
    // Add multiple logs for metrics
    for (let i = 0; i < 10; i++) {
      await service.logApiCall({
        tenantId: TENANT_ID,
        provider: PROVIDER_MOMO,
        endpoint: '/transfer',
        method: 'POST',
        latencyMs: 100 + i * 50,
        success: i < 8, // 80% success
      });
    }

    const oneHourMs = 60 * 60 * 1000;
    const metrics = await service.getMetricsByProvider(TENANT_ID, PROVIDER_MOMO, oneHourMs);

    expect(metrics.totalCount).toBeGreaterThanOrEqual(10);
    expect(metrics.successCount).toBeGreaterThanOrEqual(8);
    expect(metrics.avgLatencyMs).toBeGreaterThan(0);
  });

  it('should retrieve recent failures', async () => {
    await service.logApiCall({
      tenantId: TENANT_ID,
      provider: PROVIDER_MPESA,
      endpoint: '/stk-push',
      method: 'POST',
      latencyMs: 5000,
      success: false,
      errorMessage: 'Timeout',
    });

    const failures = await service.getRecentFailures(TENANT_ID, PROVIDER_MPESA, 5);

    expect(failures.length).toBeGreaterThan(0);
    for (const failure of failures) {
      expect(failure.success).toBe(false);
    }
  });

  it('should return distinct providers for a tenant', async () => {
    await service.logApiCall({
      tenantId: TENANT_ID,
      provider: 'new-provider',
      endpoint: '/test',
      method: 'GET',
      latencyMs: 50,
      success: true,
    });

    const providers = await service.getDistinctProviders(TENANT_ID);

    expect(providers.length).toBeGreaterThan(0);
    expect(providers).toContain('new-provider');
  });

  it('should return last success and last failure dates', async () => {
    await service.logApiCall({
      tenantId: TENANT_ID,
      provider: 'date-provider',
      endpoint: '/test',
      method: 'GET',
      latencyMs: 50,
      success: true,
    });
    await service.logApiCall({
      tenantId: TENANT_ID,
      provider: 'date-provider',
      endpoint: '/test',
      method: 'GET',
      latencyMs: 50,
      success: false,
    });

    const lastSuccess = await service.getLastSuccess(TENANT_ID, 'date-provider');
    const lastFailure = await service.getLastFailure(TENANT_ID, 'date-provider');

    expect(lastSuccess).toBeInstanceOf(Date);
    expect(lastFailure).toBeInstanceOf(Date);
  });

  it('should return null for last success when no logs exist', async () => {
    const lastSuccess = await service.getLastSuccess(TENANT_ID, 'non-existent-provider');
    expect(lastSuccess).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// IntegrationHealthService E2E Tests
// ---------------------------------------------------------------------------

describe('IntegrationHealthService (E2E)', () => {
  let healthService: IntegrationHealthService;
  let apiLogService: ApiLogService;
  let mockPrisma: ReturnType<typeof createMockPrismaForMonitoring>;

  beforeEach(() => {
    mockPrisma = createMockPrismaForMonitoring();
    apiLogService = new ApiLogService(mockPrisma as any);
    healthService = new IntegrationHealthService(apiLogService);
  });

  it('should return healthy status when uptime > 95%', async () => {
    // Add 100 calls, 98 successful
    for (let i = 0; i < 100; i++) {
      await apiLogService.logApiCall({
        tenantId: TENANT_ID,
        provider: PROVIDER_MOMO,
        endpoint: '/transfer',
        method: 'POST',
        latencyMs: 150,
        success: i < 98,
      });
    }

    const report = await healthService.getHealth(TENANT_ID, PROVIDER_MOMO);

    expect(report.provider).toBe(PROVIDER_MOMO);
    expect(report.status).toBe('healthy');
    expect(report.uptime1h).toBeGreaterThanOrEqual(95);
    expect(report.totalCalls1h).toBe(100);
    expect(report.lastCheckedAt).toBeInstanceOf(Date);
  });

  it('should return degraded status when uptime is 80-95%', async () => {
    // Add 100 calls, 88 successful (88%)
    for (let i = 0; i < 100; i++) {
      await apiLogService.logApiCall({
        tenantId: TENANT_ID,
        provider: PROVIDER_MPESA,
        endpoint: '/b2c',
        method: 'POST',
        latencyMs: 200,
        success: i < 88,
      });
    }

    const report = await healthService.getHealth(TENANT_ID, PROVIDER_MPESA);

    expect(report.status).toBe('degraded');
    expect(report.uptime1h).toBeGreaterThanOrEqual(80);
    expect(report.uptime1h).toBeLessThan(95);
  });

  it('should return unhealthy status when uptime < 80%', async () => {
    // Add 100 calls, 50 successful (50%)
    for (let i = 0; i < 100; i++) {
      await apiLogService.logApiCall({
        tenantId: TENANT_ID,
        provider: 'bad-provider',
        endpoint: '/test',
        method: 'POST',
        latencyMs: 300,
        success: i < 50,
      });
    }

    const report = await healthService.getHealth(TENANT_ID, 'bad-provider');

    expect(report.status).toBe('unhealthy');
    expect(report.uptime1h).toBeLessThan(80);
    expect(report.errorRate1h).toBeGreaterThan(20);
  });

  it('should return unknown status when no calls exist', async () => {
    const report = await healthService.getHealth(TENANT_ID, 'no-calls-provider');

    expect(report.status).toBe('unknown');
    expect(report.totalCalls1h).toBe(0);
    expect(report.uptime1h).toBe(0);
  });

  it('should compute error rates correctly', async () => {
    for (let i = 0; i < 20; i++) {
      await apiLogService.logApiCall({
        tenantId: TENANT_ID,
        provider: 'error-rate-provider',
        endpoint: '/test',
        method: 'POST',
        latencyMs: 100,
        success: i < 16, // 80% success → 20% error
      });
    }

    const report = await healthService.getHealth(TENANT_ID, 'error-rate-provider');

    expect(report.errorRate1h).toBeCloseTo(20, 0);
  });

  it('should compute latency averages', async () => {
    const latencies = [100, 200, 300, 400, 500];
    for (const latency of latencies) {
      await apiLogService.logApiCall({
        tenantId: TENANT_ID,
        provider: 'latency-provider',
        endpoint: '/test',
        method: 'GET',
        latencyMs: latency,
        success: true,
      });
    }

    const report = await healthService.getHealth(TENANT_ID, 'latency-provider');

    expect(report.avgLatency1h).toBeCloseTo(300, 0);
  });

  it('should get health for all known providers', async () => {
    // Seed two providers
    await apiLogService.logApiCall({
      tenantId: TENANT_ID,
      provider: 'all-health-a',
      endpoint: '/test',
      method: 'GET',
      latencyMs: 50,
      success: true,
    });
    await apiLogService.logApiCall({
      tenantId: TENANT_ID,
      provider: 'all-health-b',
      endpoint: '/test',
      method: 'GET',
      latencyMs: 80,
      success: true,
    });

    const reports = await healthService.getAllHealth(TENANT_ID);

    expect(reports.length).toBeGreaterThanOrEqual(2);
    const providerNames = reports.map((r) => r.provider);
    expect(providerNames).toContain('all-health-a');
    expect(providerNames).toContain('all-health-b');
  });

  describe('multiple providers tracked independently', () => {
    it('should report different statuses for different providers', async () => {
      // Provider A: healthy (100% success)
      for (let i = 0; i < 20; i++) {
        await apiLogService.logApiCall({
          tenantId: TENANT_ID,
          provider: 'indep-healthy',
          endpoint: '/test',
          method: 'POST',
          latencyMs: 100,
          success: true,
        });
      }

      // Provider B: unhealthy (30% success)
      for (let i = 0; i < 20; i++) {
        await apiLogService.logApiCall({
          tenantId: TENANT_ID,
          provider: 'indep-unhealthy',
          endpoint: '/test',
          method: 'POST',
          latencyMs: 500,
          success: i < 6,
        });
      }

      const healthyReport = await healthService.getHealth(TENANT_ID, 'indep-healthy');
      const unhealthyReport = await healthService.getHealth(TENANT_ID, 'indep-unhealthy');

      expect(healthyReport.status).toBe('healthy');
      expect(unhealthyReport.status).toBe('unhealthy');
    });
  });
});

// ---------------------------------------------------------------------------
// HealthCheckScheduler E2E Tests
// ---------------------------------------------------------------------------

describe('HealthCheckScheduler (E2E)', () => {
  let scheduler: HealthCheckScheduler;
  let healthService: IntegrationHealthService;
  let apiLogService: ApiLogService;
  let eventBus: ReturnType<typeof createMockEventBus>;
  let mockPrisma: ReturnType<typeof createMockPrismaForMonitoring>;

  beforeEach(() => {
    mockPrisma = createMockPrismaForMonitoring();
    apiLogService = new ApiLogService(mockPrisma as any);
    healthService = new IntegrationHealthService(apiLogService);
    eventBus = createMockEventBus();
    scheduler = new HealthCheckScheduler(healthService, eventBus as any);
  });

  it('should detect status transition and emit INTEGRATION_HEALTH_CHANGED event', async () => {
    // Seed initial state as healthy
    for (let i = 0; i < 100; i++) {
      await apiLogService.logApiCall({
        tenantId: 'platform',
        provider: 'transition-provider',
        endpoint: '/test',
        method: 'POST',
        latencyMs: 100,
        success: true,
      });
    }

    // Set initial state
    await scheduler.checkProviderHealth('platform', 'transition-provider');
    expect(scheduler.getPreviousStates().get('transition-provider')).toBe('healthy');

    // Now add many failures to make it unhealthy
    for (let i = 0; i < 200; i++) {
      await apiLogService.logApiCall({
        tenantId: 'platform',
        provider: 'transition-provider',
        endpoint: '/test',
        method: 'POST',
        latencyMs: 500,
        success: false,
      });
    }

    // Check again — should detect transition from healthy -> unhealthy
    await scheduler.checkProviderHealth('platform', 'transition-provider');

    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.INTEGRATION_HEALTH_CHANGED,
      'platform',
      expect.objectContaining({
        provider: 'transition-provider',
        previousStatus: 'healthy',
        currentStatus: 'unhealthy',
      }),
    );
  });

  it('should not emit event when status remains the same', async () => {
    // All calls successful
    for (let i = 0; i < 50; i++) {
      await apiLogService.logApiCall({
        tenantId: 'platform',
        provider: 'stable-provider',
        endpoint: '/test',
        method: 'POST',
        latencyMs: 100,
        success: true,
      });
    }

    await scheduler.checkProviderHealth('platform', 'stable-provider');
    eventBus.emitAndBuild.mockClear();

    // Check again — same status
    await scheduler.checkProviderHealth('platform', 'stable-provider');

    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
  });

  it('should track multiple providers independently', async () => {
    // Provider A: healthy
    for (let i = 0; i < 50; i++) {
      await apiLogService.logApiCall({
        tenantId: 'platform',
        provider: 'sched-a',
        endpoint: '/test',
        method: 'POST',
        latencyMs: 100,
        success: true,
      });
    }

    // Provider B: unhealthy
    for (let i = 0; i < 50; i++) {
      await apiLogService.logApiCall({
        tenantId: 'platform',
        provider: 'sched-b',
        endpoint: '/test',
        method: 'POST',
        latencyMs: 500,
        success: i < 10, // 20% success
      });
    }

    await scheduler.checkProviderHealth('platform', 'sched-a');
    await scheduler.checkProviderHealth('platform', 'sched-b');

    const states = scheduler.getPreviousStates();
    expect(states.get('sched-a')).toBe('healthy');
    expect(states.get('sched-b')).toBe('unhealthy');
  });

  it('should detect degraded to healthy transition', async () => {
    // Start degraded: 85% success
    for (let i = 0; i < 100; i++) {
      await apiLogService.logApiCall({
        tenantId: 'platform',
        provider: 'recovery-provider',
        endpoint: '/test',
        method: 'POST',
        latencyMs: 200,
        success: i < 85,
      });
    }

    await scheduler.checkProviderHealth('platform', 'recovery-provider');
    expect(scheduler.getPreviousStates().get('recovery-provider')).toBe('degraded');

    // Now add many successes to push uptime back above 95%
    for (let i = 0; i < 500; i++) {
      await apiLogService.logApiCall({
        tenantId: 'platform',
        provider: 'recovery-provider',
        endpoint: '/test',
        method: 'POST',
        latencyMs: 100,
        success: true,
      });
    }

    eventBus.emitAndBuild.mockClear();
    await scheduler.checkProviderHealth('platform', 'recovery-provider');

    expect(scheduler.getPreviousStates().get('recovery-provider')).toBe('healthy');
    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.INTEGRATION_HEALTH_CHANGED,
      'platform',
      expect.objectContaining({
        provider: 'recovery-provider',
        previousStatus: 'degraded',
        currentStatus: 'healthy',
      }),
    );
  });
});
