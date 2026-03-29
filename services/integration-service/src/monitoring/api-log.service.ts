import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, Prisma } from '@lons/database';
import { ApiLogEntry, ProviderMetrics } from './health.types';

export interface CreateApiLogInput {
  tenantId: string;
  provider: string;
  endpoint: string;
  method: string;
  responseStatus?: number | null;
  latencyMs: number;
  success: boolean;
  errorMessage?: string | null;
  correlationId?: string | null;
  circuitBreakerState?: string | null;
  requestHeaders?: Record<string, unknown> | null;
  requestBody?: Record<string, unknown> | null;
  responseBody?: Record<string, unknown> | null;
}

@Injectable()
export class ApiLogService {
  private readonly logger = new Logger('ApiLogService');

  constructor(private prisma: PrismaService) {}

  async logApiCall(data: CreateApiLogInput): Promise<ApiLogEntry> {
    try {
      const record = await (this.prisma as any).integrationApiLog.create({
        data: {
          tenantId: data.tenantId,
          provider: data.provider,
          endpoint: data.endpoint,
          method: data.method,
          responseStatus: data.responseStatus ?? null,
          latencyMs: data.latencyMs,
          success: data.success,
          errorMessage: data.errorMessage ?? null,
          correlationId: data.correlationId ?? null,
          circuitBreakerState: data.circuitBreakerState ?? null,
          requestHeaders: (data.requestHeaders ?? undefined) as Prisma.InputJsonValue | undefined,
          requestBody: (data.requestBody ?? undefined) as Prisma.InputJsonValue | undefined,
          responseBody: (data.responseBody ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });

      return this.mapToEntry(record);
    } catch (error) {
      this.logger.error(`Failed to log API call for provider ${data.provider}: ${error}`);
      throw error;
    }
  }

  async getLogsByProvider(
    tenantId: string,
    provider: string,
    from: Date,
    to: Date,
  ): Promise<ApiLogEntry[]> {
    const records = await (this.prisma as any).integrationApiLog.findMany({
      where: {
        tenantId,
        provider,
        createdAt: {
          gte: from,
          lte: to,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r: any) => this.mapToEntry(r));
  }

  async getMetricsByProvider(
    tenantId: string,
    provider: string,
    windowMs: number,
  ): Promise<ProviderMetrics> {
    const since = new Date(Date.now() - windowMs);

    const result = await (this.prisma as any).integrationApiLog.aggregate({
      where: {
        tenantId,
        provider,
        createdAt: { gte: since },
      },
      _count: { id: true },
      _avg: { latencyMs: true },
      _min: { latencyMs: true },
      _max: { latencyMs: true },
    });

    const successCount = await (this.prisma as any).integrationApiLog.count({
      where: {
        tenantId,
        provider,
        createdAt: { gte: since },
        success: true,
      },
    });

    return {
      totalCount: result._count.id,
      successCount,
      avgLatencyMs: result._avg.latencyMs ?? 0,
      minLatencyMs: result._min.latencyMs ?? 0,
      maxLatencyMs: result._max.latencyMs ?? 0,
    };
  }

  async getRecentFailures(
    tenantId: string,
    provider: string,
    limit: number = 10,
  ): Promise<ApiLogEntry[]> {
    const records = await (this.prisma as any).integrationApiLog.findMany({
      where: {
        tenantId,
        provider,
        success: false,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return records.map((r: any) => this.mapToEntry(r));
  }

  async getDistinctProviders(tenantId: string): Promise<string[]> {
    const result = await (this.prisma as any).integrationApiLog.findMany({
      where: { tenantId },
      distinct: ['provider'],
      select: { provider: true },
    });

    return result.map((r: any) => r.provider);
  }

  async getLastSuccess(tenantId: string, provider: string): Promise<Date | null> {
    const record = await (this.prisma as any).integrationApiLog.findFirst({
      where: { tenantId, provider, success: true },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return record?.createdAt ?? null;
  }

  async getLastFailure(tenantId: string, provider: string): Promise<Date | null> {
    const record = await (this.prisma as any).integrationApiLog.findFirst({
      where: { tenantId, provider, success: false },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return record?.createdAt ?? null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapToEntry(record: any): ApiLogEntry {
    return {
      id: record.id,
      tenantId: record.tenantId,
      provider: record.provider,
      endpoint: record.endpoint,
      method: record.method,
      responseStatus: record.responseStatus,
      latencyMs: record.latencyMs,
      success: record.success,
      errorMessage: record.errorMessage,
      correlationId: record.correlationId,
      circuitBreakerState: record.circuitBreakerState,
      createdAt: record.createdAt,
    };
  }
}
