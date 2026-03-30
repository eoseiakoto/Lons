import { Test, TestingModule } from '@nestjs/testing';
import { IntegrationHealthService } from './health.service';
import { ApiLogService } from './api-log.service';
import { HealthCheckScheduler } from './health-check.scheduler';
import { EventBusService } from '@lons/common';
import { EventType } from '@lons/event-contracts';
import { ProviderMetrics } from './health.types';

describe('IntegrationHealthService', () => {
  let healthService: IntegrationHealthService;
  let apiLogService: jest.Mocked<ApiLogService>;

  const mockMetrics = (total: number, success: number, avgLatency = 100): ProviderMetrics => ({
    totalCount: total,
    successCount: success,
    avgLatencyMs: avgLatency,
    minLatencyMs: 50,
    maxLatencyMs: 200,
  });

  beforeEach(async () => {
    const mockApiLogService = {
      getMetricsByProvider: jest.fn(),
      getLastSuccess: jest.fn().mockResolvedValue(new Date()),
      getLastFailure: jest.fn().mockResolvedValue(null),
      getDistinctProviders: jest.fn().mockResolvedValue(['mtn_momo', 'mpesa']),
      logApiCall: jest.fn(),
      getLogsByProvider: jest.fn(),
      getRecentFailures: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationHealthService,
        { provide: ApiLogService, useValue: mockApiLogService },
      ],
    }).compile();

    healthService = module.get<IntegrationHealthService>(IntegrationHealthService);
    apiLogService = module.get(ApiLogService);
  });

  it('should return healthy when uptime > 95%', async () => {
    const metrics = mockMetrics(100, 98);
    apiLogService.getMetricsByProvider.mockResolvedValue(metrics);

    const report = await healthService.getHealth('tenant-1', 'mtn_momo');

    expect(report.status).toBe('healthy');
    expect(report.provider).toBe('mtn_momo');
    expect(report.uptime1h).toBe(98);
  });

  it('should return degraded when uptime is between 80% and 95%', async () => {
    const metrics = mockMetrics(100, 90);
    apiLogService.getMetricsByProvider.mockResolvedValue(metrics);

    const report = await healthService.getHealth('tenant-1', 'mtn_momo');

    expect(report.status).toBe('degraded');
    expect(report.uptime1h).toBe(90);
  });

  it('should return unhealthy when uptime < 80%', async () => {
    const metrics = mockMetrics(100, 70);
    apiLogService.getMetricsByProvider.mockResolvedValue(metrics);

    const report = await healthService.getHealth('tenant-1', 'mtn_momo');

    expect(report.status).toBe('unhealthy');
    expect(report.uptime1h).toBe(70);
  });

  it('should return unknown when no calls recorded', async () => {
    const metrics = mockMetrics(0, 0, 0);
    apiLogService.getMetricsByProvider.mockResolvedValue(metrics);

    const report = await healthService.getHealth('tenant-1', 'mtn_momo');

    expect(report.status).toBe('unknown');
    expect(report.totalCalls1h).toBe(0);
  });

  it('should calculate error rates correctly', async () => {
    const metrics = mockMetrics(200, 180);
    apiLogService.getMetricsByProvider.mockResolvedValue(metrics);

    const report = await healthService.getHealth('tenant-1', 'mtn_momo');

    expect(report.errorRate1h).toBe(10);
    expect(report.errorRate24h).toBe(10);
  });

  it('should get health for all known providers', async () => {
    const metrics = mockMetrics(100, 99);
    apiLogService.getMetricsByProvider.mockResolvedValue(metrics);

    const reports = await healthService.getAllHealth('tenant-1');

    expect(reports).toHaveLength(2);
    expect(reports[0].provider).toBe('mtn_momo');
    expect(reports[1].provider).toBe('mpesa');
  });
});

describe('ApiLogService', () => {
  let apiLogService: ApiLogService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      integrationApiLog: {
        create: jest.fn(),
        findMany: jest.fn(),
        aggregate: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiLogService,
        { provide: 'PrismaService', useValue: mockPrisma },
      ],
    }).compile();

    // Manually inject because PrismaService token may differ
    apiLogService = new ApiLogService(mockPrisma);
  });

  it('should create an API log entry', async () => {
    const mockRecord = {
      id: 'log-1',
      tenantId: 'tenant-1',
      provider: 'mtn_momo',
      endpoint: '/v1/transfer',
      method: 'POST',
      responseStatus: 200,
      latencyMs: 150,
      success: true,
      errorMessage: null,
      correlationId: 'corr-1',
      circuitBreakerState: 'closed',
      createdAt: new Date(),
    };

    mockPrisma.integrationApiLog.create.mockResolvedValue(mockRecord);

    const result = await apiLogService.logApiCall({
      tenantId: 'tenant-1',
      provider: 'mtn_momo',
      endpoint: '/v1/transfer',
      method: 'POST',
      responseStatus: 200,
      latencyMs: 150,
      success: true,
      correlationId: 'corr-1',
      circuitBreakerState: 'closed',
    });

    expect(result.id).toBe('log-1');
    expect(result.provider).toBe('mtn_momo');
    expect(result.success).toBe(true);
    expect(mockPrisma.integrationApiLog.create).toHaveBeenCalledTimes(1);
  });

  it('should query logs by provider and time range', async () => {
    const now = new Date();
    const from = new Date(now.getTime() - 3600000);

    mockPrisma.integrationApiLog.findMany.mockResolvedValue([
      {
        id: 'log-1',
        tenantId: 'tenant-1',
        provider: 'mtn_momo',
        endpoint: '/v1/transfer',
        method: 'POST',
        responseStatus: 200,
        latencyMs: 100,
        success: true,
        errorMessage: null,
        correlationId: null,
        circuitBreakerState: null,
        createdAt: now,
      },
    ]);

    const logs = await apiLogService.getLogsByProvider('tenant-1', 'mtn_momo', from, now);

    expect(logs).toHaveLength(1);
    expect(logs[0].provider).toBe('mtn_momo');
  });

  it('should get metrics aggregation for provider', async () => {
    mockPrisma.integrationApiLog.aggregate.mockResolvedValue({
      _count: { id: 100 },
      _avg: { latencyMs: 120 },
      _min: { latencyMs: 50 },
      _max: { latencyMs: 500 },
    });
    mockPrisma.integrationApiLog.count.mockResolvedValue(95);

    const metrics = await apiLogService.getMetricsByProvider('tenant-1', 'mtn_momo', 3600000);

    expect(metrics.totalCount).toBe(100);
    expect(metrics.successCount).toBe(95);
    expect(metrics.avgLatencyMs).toBe(120);
  });
});

describe('HealthCheckScheduler', () => {
  let scheduler: HealthCheckScheduler;
  let healthService: jest.Mocked<IntegrationHealthService>;
  let eventBus: jest.Mocked<EventBusService>;

  beforeEach(async () => {
    const mockHealthService = {
      getHealth: jest.fn(),
      getAllHealth: jest.fn(),
      getKnownProviders: jest.fn().mockResolvedValue(['mtn_momo']),
    };

    const mockEventBus = {
      emit: jest.fn(),
      buildEvent: jest.fn(),
      emitAndBuild: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthCheckScheduler,
        { provide: IntegrationHealthService, useValue: mockHealthService },
        { provide: EventBusService, useValue: mockEventBus },
      ],
    }).compile();

    scheduler = module.get<HealthCheckScheduler>(HealthCheckScheduler);
    healthService = module.get(IntegrationHealthService);
    eventBus = module.get(EventBusService);
  });

  it('should detect status transitions and emit events', async () => {
    // Set initial state
    scheduler.getPreviousStates().set('mtn_momo', 'healthy');

    healthService.getHealth.mockResolvedValue({
      provider: 'mtn_momo',
      status: 'degraded',
      uptime1h: 90,
      uptime24h: 95,
      uptime7d: 97,
      avgLatency1h: 200,
      avgLatency24h: 150,
      errorRate1h: 10,
      errorRate24h: 5,
      totalCalls1h: 100,
      totalCalls24h: 2400,
      lastSuccessAt: new Date(),
      lastFailureAt: new Date(),
      circuitBreakerState: 'closed',
      lastCheckedAt: new Date(),
    });

    await scheduler.checkProviderHealth('platform', 'mtn_momo');

    expect(eventBus.emitAndBuild).toHaveBeenCalledWith(
      EventType.INTEGRATION_HEALTH_CHANGED,
      'platform',
      expect.objectContaining({
        provider: 'mtn_momo',
        previousStatus: 'healthy',
        currentStatus: 'degraded',
      }),
    );

    expect(scheduler.getPreviousStates().get('mtn_momo')).toBe('degraded');
  });

  it('should not emit event when status unchanged', async () => {
    scheduler.getPreviousStates().set('mtn_momo', 'healthy');

    healthService.getHealth.mockResolvedValue({
      provider: 'mtn_momo',
      status: 'healthy',
      uptime1h: 99,
      uptime24h: 98,
      uptime7d: 97,
      avgLatency1h: 100,
      avgLatency24h: 120,
      errorRate1h: 1,
      errorRate24h: 2,
      totalCalls1h: 100,
      totalCalls24h: 2400,
      lastSuccessAt: new Date(),
      lastFailureAt: null,
      circuitBreakerState: 'closed',
      lastCheckedAt: new Date(),
    });

    await scheduler.checkProviderHealth('platform', 'mtn_momo');

    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
  });

  it('should set initial state without emitting event on first check', async () => {
    healthService.getHealth.mockResolvedValue({
      provider: 'mtn_momo',
      status: 'healthy',
      uptime1h: 99,
      uptime24h: 98,
      uptime7d: 97,
      avgLatency1h: 100,
      avgLatency24h: 120,
      errorRate1h: 1,
      errorRate24h: 2,
      totalCalls1h: 50,
      totalCalls24h: 1200,
      lastSuccessAt: new Date(),
      lastFailureAt: null,
      circuitBreakerState: 'closed',
      lastCheckedAt: new Date(),
    });

    await scheduler.checkProviderHealth('platform', 'mtn_momo');

    expect(eventBus.emitAndBuild).not.toHaveBeenCalled();
    expect(scheduler.getPreviousStates().get('mtn_momo')).toBe('healthy');
  });
});
