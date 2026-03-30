import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import { CreateNotificationTemplateInput } from './dto/create-template.dto';
import { UpdateNotificationTemplateInput } from './dto/update-template.dto';

@Injectable()
export class NotificationTemplateService {
  private readonly logger = new Logger('NotificationTemplateService');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new notification template with optional idempotency check.
   * If idempotencyKey is provided and a template with the same key already
   * exists for this tenant, the existing record is returned.
   */
  async create(
    tenantId: string,
    data: Omit<CreateNotificationTemplateInput, 'tenantId'>,
    idempotencyKey?: string,
  ) {
    if (idempotencyKey) {
      const existing = await (this.prisma as any).notificationTemplate.findFirst({
        where: {
          tenantId,
          eventType: data.eventType,
          channel: data.channel as any,
          templateBody: data.templateBody,
          deletedAt: null,
        },
      });
      if (existing) {
        this.logger.debug(`Idempotent hit for template creation, key=${idempotencyKey}`);
        return existing;
      }
    }

    return (this.prisma as any).notificationTemplate.create({
      data: {
        tenantId,
        productId: data.productId ?? null,
        eventType: data.eventType,
        channel: data.channel as any,
        templateBody: data.templateBody,
        language: data.language ?? 'en',
        isActive: true,
        version: 1,
      },
    });
  }

  /**
   * Update a template by creating a new version.
   * The old version is soft-deleted and a new record is created
   * with an incremented version number.
   */
  async update(id: string, tenantId: string, data: Omit<UpdateNotificationTemplateInput, 'tenantId'>) {
    const existing = await (this.prisma as any).notificationTemplate.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!existing) {
      throw new Error(`Notification template not found: ${id}`);
    }

    // Soft-delete the old version
    await (this.prisma as any).notificationTemplate.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    // Create new version
    return (this.prisma as any).notificationTemplate.create({
      data: {
        tenantId,
        productId: data.productId !== undefined ? data.productId : existing.productId,
        eventType: data.eventType ?? existing.eventType,
        channel: (data.channel as any) ?? existing.channel,
        templateBody: data.templateBody ?? existing.templateBody,
        language: data.language ?? existing.language,
        isActive: data.isActive !== undefined ? data.isActive : true,
        version: existing.version + 1,
      },
    });
  }

  /**
   * Soft-delete a notification template.
   */
  async softDelete(id: string, tenantId: string) {
    const existing = await (this.prisma as any).notificationTemplate.findFirst({
      where: { id, tenantId, deletedAt: null },
    });

    if (!existing) {
      throw new Error(`Notification template not found: ${id}`);
    }

    return (this.prisma as any).notificationTemplate.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  /**
   * Find templates filtered by tenant, product, event type, and/or channel.
   */
  async findByProductAndEvent(
    tenantId: string,
    productId?: string,
    eventType?: string,
    channel?: string,
  ) {
    return (this.prisma as any).notificationTemplate.findMany({
      where: {
        tenantId,
        ...(productId ? { productId } : {}),
        ...(eventType ? { eventType } : {}),
        ...(channel ? { channel: channel as any } : {}),
        deletedAt: null,
        isActive: true,
      },
      orderBy: [{ eventType: 'asc' }, { version: 'desc' }],
    });
  }

  /**
   * Find a single template by ID within a tenant.
   */
  async findById(id: string, tenantId: string) {
    return (this.prisma as any).notificationTemplate.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
  }

  /**
   * Look up a template from the database by tenant, event type, and channel.
   * Returns the latest active version or null if none exists.
   */
  async findActiveTemplate(tenantId: string, eventType: string, channel: string) {
    return (this.prisma as any).notificationTemplate.findFirst({
      where: {
        tenantId,
        eventType,
        channel: channel as any,
        isActive: true,
        deletedAt: null,
      },
      orderBy: { version: 'desc' },
    });
  }
}
