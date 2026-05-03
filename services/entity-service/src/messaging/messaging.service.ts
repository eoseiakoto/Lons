import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@lons/database';

export interface SendMessageData {
  type: 'announcement' | 'direct' | 'system';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  subject: string;
  body: string;
  senderType: string;
  senderId: string;
  senderName?: string;
  tenantId?: string;
  recipientIds?: string[];
  metadata?: Record<string, unknown>;
  expiresAt?: Date;
}

export interface MessageFilter {
  type?: 'announcement' | 'direct' | 'system';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  readStatus?: 'read' | 'unread';
}

@Injectable()
export class MessagingService {
  private readonly logger = new Logger('MessagingService');

  constructor(private readonly prisma: PrismaService) {}

  async sendMessage(data: SendMessageData) {
    // Resolve sender name from DB if not provided
    if (!data.senderName && data.senderId) {
      const platformUser = await (this.prisma as any).platformUser.findUnique({
        where: { id: data.senderId },
        select: { name: true, email: true },
      }).catch(() => null);

      if (platformUser) {
        data.senderName = platformUser.name || platformUser.email;
      } else {
        const tenantUser = await (this.prisma as any).user.findUnique({
          where: { id: data.senderId },
          select: { name: true, email: true },
        }).catch(() => null);

        if (tenantUser) {
          data.senderName = tenantUser.name || tenantUser.email;
        }
      }
    }

    const message = await (this.prisma as any).platformMessage.create({
      data: {
        type: data.type,
        priority: data.priority || 'normal',
        subject: data.subject,
        body: data.body,
        senderType: data.senderType,
        senderId: data.senderId,
        senderName: data.senderName,
        tenantId: data.tenantId,
        metadata: data.metadata ?? undefined,
        expiresAt: data.expiresAt,
      },
    });

    // Create recipients
    if (data.type === 'announcement') {
      // For announcements: create recipients for all tenants
      const tenants = await (this.prisma as any).tenant.findMany({
        where: { status: 'active' },
        select: { id: true },
      });

      if (tenants.length > 0) {
        await (this.prisma as any).messageRecipient.createMany({
          data: tenants.map((t: { id: string }) => ({
            messageId: message.id,
            recipientType: 'tenant',
            recipientId: t.id,
            tenantId: t.id,
          })),
        });
      }
    } else if (data.recipientIds && data.recipientIds.length > 0) {
      // For direct/system: create recipients for specified IDs
      await (this.prisma as any).messageRecipient.createMany({
        data: data.recipientIds.map((recipientId: string) => ({
          messageId: message.id,
          recipientType: data.type === 'direct' ? 'tenant' : 'user',
          recipientId,
          tenantId: data.tenantId,
        })),
      });
    } else if (data.senderType === 'tenant' && data.tenantId) {
      // Tenant → platform: deliver to all platform admin users
      const platformAdmins = await (this.prisma as any).platformUser.findMany({
        where: { deletedAt: null, role: { in: ['platform_admin', 'platform_support'] } },
        select: { id: true },
      });

      if (platformAdmins.length > 0) {
        await (this.prisma as any).messageRecipient.createMany({
          data: platformAdmins.map((u: { id: string }) => ({
            messageId: message.id,
            recipientType: 'user',
            recipientId: u.id,
          })),
        });
      }
    } else if (data.tenantId) {
      // Platform → tenant: deliver to the specified tenant
      await (this.prisma as any).messageRecipient.create({
        data: {
          messageId: message.id,
          recipientType: 'tenant',
          recipientId: data.tenantId,
          tenantId: data.tenantId,
        },
      });
    }

    this.logger.log(`Message sent: ${message.id} (${data.type}) - "${data.subject}"`);

    return (this.prisma as any).platformMessage.findUnique({
      where: { id: message.id },
      include: { recipients: true },
    });
  }

  async getMessages(
    recipientId: string,
    recipientType: string,
    tenantId?: string,
    filters?: MessageFilter,
    take = 20,
    cursor?: string,
  ) {
    const where: Record<string, unknown> = {
      recipients: {
        some: {
          recipientId,
          ...(recipientType ? { recipientType } : {}),
          ...(tenantId ? { tenantId } : {}),
          archivedAt: null,
          ...(filters?.readStatus === 'read' ? { readAt: { not: null } } : {}),
          ...(filters?.readStatus === 'unread' ? { readAt: null } : {}),
        },
      },
    };

    if (filters?.type) where.type = filters.type;
    if (filters?.priority) where.priority = filters.priority;

    const totalCount = await (this.prisma as any).platformMessage.count({ where });

    const items = await (this.prisma as any).platformMessage.findMany({
      where,
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      include: {
        recipients: {
          where: {
            recipientId,
            ...(tenantId ? { tenantId } : {}),
          },
        },
      },
    });

    const hasNextPage = items.length > take;
    const nodes = hasNextPage ? items.slice(0, take) : items;

    return {
      items: nodes,
      hasNextPage,
      totalCount,
    };
  }

  async getUnreadCount(
    recipientId: string,
    recipientType: string,
    tenantId?: string,
  ): Promise<number> {
    return (this.prisma as any).messageRecipient.count({
      where: {
        recipientId,
        ...(recipientType ? { recipientType } : {}),
        ...(tenantId ? { tenantId } : {}),
        readAt: null,
        archivedAt: null,
      },
    });
  }

  async markRead(messageId: string, recipientId: string) {
    await (this.prisma as any).messageRecipient.updateMany({
      where: {
        messageId,
        recipientId,
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return (this.prisma as any).platformMessage.findUnique({
      where: { id: messageId },
      include: {
        recipients: {
          where: { recipientId },
        },
      },
    });
  }

  async markAllRead(recipientId: string, tenantId?: string) {
    await (this.prisma as any).messageRecipient.updateMany({
      where: {
        recipientId,
        ...(tenantId ? { tenantId } : {}),
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    return true;
  }

  async archiveMessage(messageId: string, recipientId: string) {
    await (this.prisma as any).messageRecipient.updateMany({
      where: {
        messageId,
        recipientId,
        archivedAt: null,
      },
      data: { archivedAt: new Date() },
    });

    return true;
  }
}
