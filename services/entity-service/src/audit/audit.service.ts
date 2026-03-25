import { Injectable } from '@nestjs/common';
import { PrismaService, Prisma, ActorType } from '@lons/database';

export interface AuditLogInput {
  tenantId: string;
  actorId?: string;
  actorType: 'user' | 'system' | 'api_key';
  actorIp?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  beforeValue?: Prisma.InputJsonValue;
  afterValue?: Prisma.InputJsonValue;
  correlationId?: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(input: AuditLogInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorId: input.actorId,
        actorType: input.actorType as ActorType,
        actorIp: input.actorIp,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        beforeValue: input.beforeValue ?? undefined,
        afterValue: input.afterValue ?? undefined,
        correlationId: input.correlationId,
        metadata: input.metadata ?? undefined,
      },
    });
  }

  async findMany(
    tenantId: string,
    filters?: {
      actorId?: string;
      action?: string;
      resourceType?: string;
      resourceId?: string;
      fromDate?: Date;
      toDate?: Date;
    },
    take: number = 50,
    cursor?: string,
  ) {
    const where: Prisma.AuditLogWhereInput = { tenantId };
    if (filters?.actorId) where.actorId = filters.actorId;
    if (filters?.action) where.action = filters.action;
    if (filters?.resourceType) where.resourceType = filters.resourceType;
    if (filters?.resourceId) where.resourceId = filters.resourceId;
    if (filters?.fromDate || filters?.toDate) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (filters?.fromDate) createdAt.gte = filters.fromDate;
      if (filters?.toDate) createdAt.lte = filters.toDate;
      where.createdAt = createdAt;
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    return {
      items: logs.slice(0, take),
      hasMore: logs.length > take,
    };
  }
}
