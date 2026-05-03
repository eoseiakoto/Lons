import { Injectable, Logger } from '@nestjs/common';
import { PrismaService, Prisma, ActorType } from '@lons/database';
import { computeEntryHash } from '@lons/common';

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

// TODO (Sprint 7): Switch to audit_writer role via SET ROLE before writes
// to enforce INSERT-only at the DB level. See migration 20260328100000.
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async log(input: AuditLogInput): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // 1. Get the previous entry's hash for this tenant
        const previousEntry = await tx.auditLog.findFirst({
          where: { tenantId: input.tenantId },
          orderBy: { createdAt: 'desc' },
          select: { entryHash: true },
        });
        const previousHash = previousEntry?.entryHash ?? null;

        // 2. Create the audit log entry
        const entry = await tx.auditLog.create({
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
            previousHash,
          },
        });

        // 3. Compute the hash and update the entry
        const entryHash = computeEntryHash(
          {
            id: entry.id,
            createdAt: entry.createdAt,
            action: entry.action,
            resourceId: entry.resourceId,
          },
          previousHash,
        );

        await tx.auditLog.update({
          where: { id_createdAt: { id: entry.id, createdAt: entry.createdAt } },
          data: { entryHash },
        });
      });
    } catch (error) {
      // Audit logging must never break the primary operation
      this.logger.error('Failed to write audit log', error);
    }
  }

  async findAllCrossTenant(
    filters?: {
      tenantId?: string;
      actorType?: string;
      action?: string;
      resourceType?: string;
      dateFrom?: Date;
      dateTo?: Date;
      search?: string;
    },
    take: number = 50,
    cursor?: string,
  ) {
    const where: Prisma.AuditLogWhereInput = {};
    if (filters?.tenantId) where.tenantId = filters.tenantId;
    if (filters?.actorType) where.actorType = filters.actorType as ActorType;
    if (filters?.action) where.action = filters.action;
    if (filters?.resourceType) where.resourceType = filters.resourceType;
    if (filters?.dateFrom || filters?.dateTo) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (filters?.dateFrom) createdAt.gte = filters.dateFrom;
      if (filters?.dateTo) createdAt.lte = filters.dateTo;
      where.createdAt = createdAt;
    }
    if (filters?.search) {
      where.OR = [
        { action: { contains: filters.search, mode: 'insensitive' } },
        { resourceType: { contains: filters.search, mode: 'insensitive' } },
        { resourceId: filters.search },
      ];
    }

    let cursorClause = {};
    if (cursor) {
      const cursorEntry = await this.prisma.auditLog.findFirst({
        where: { id: cursor },
        select: { id: true, createdAt: true },
      });
      if (cursorEntry) {
        cursorClause = {
          cursor: { id_createdAt: { id: cursorEntry.id, createdAt: cursorEntry.createdAt } },
          skip: 1,
        };
      }
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      take: take + 1,
      ...cursorClause,
      orderBy: { createdAt: 'desc' },
    });

    // Look up tenant names
    const tenantIds = [...new Set(logs.map((l) => l.tenantId))];
    const tenants = tenantIds.length > 0
      ? await this.prisma.tenant.findMany({
          where: { id: { in: tenantIds } },
          select: { id: true, name: true },
        })
      : [];
    const tenantMap = new Map(tenants.map((t) => [t.id, t.name]));

    const items = logs.slice(0, take).map((log) => ({
      ...log,
      tenantName: tenantMap.get(log.tenantId) ?? 'Unknown',
      // Strip sensitive before/after values for cross-tenant queries
      beforeValue: undefined,
      afterValue: undefined,
    }));

    return {
      items,
      hasMore: logs.length > take,
    };
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

    // AuditLog uses compound PK (id, createdAt) for partitioning.
    // Resolve the cursor entry to get both fields.
    let cursorClause = {};
    if (cursor) {
      const cursorEntry = await this.prisma.auditLog.findFirst({
        where: { id: cursor, tenantId },
        select: { id: true, createdAt: true },
      });
      if (cursorEntry) {
        cursorClause = {
          cursor: { id_createdAt: { id: cursorEntry.id, createdAt: cursorEntry.createdAt } },
          skip: 1,
        };
      }
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      take: take + 1,
      ...cursorClause,
      orderBy: { createdAt: 'desc' },
    });

    return {
      items: logs.slice(0, take),
      hasMore: logs.length > take,
    };
  }
}
