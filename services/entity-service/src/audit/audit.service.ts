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
          where: { id: entry.id },
          data: { entryHash },
        });
      });
    } catch (error) {
      // Audit logging must never break the primary operation
      this.logger.error('Failed to write audit log', error);
    }
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
