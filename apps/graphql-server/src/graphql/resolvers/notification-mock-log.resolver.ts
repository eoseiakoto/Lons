import { Resolver, Query, Args } from '@nestjs/graphql';
import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@lons/database';
import { NotificationMockLogType } from '../types/notification-mock-log.type';

@Resolver(() => NotificationMockLogType)
export class NotificationMockLogResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [NotificationMockLogType], { name: 'notificationMockLogs' })
  async getNotificationMockLogs(
    @Args('tenantId') tenantId: string,
    @Args('correlationId', { nullable: true }) correlationId?: string,
    @Args('channel', { nullable: true }) channel?: string,
  ): Promise<NotificationMockLogType[]> {
    if (process.env.ALLOW_MOCK_ADAPTERS !== 'true') {
      throw new ForbiddenException(
        'Notification mock logs are only available in staging environments',
      );
    }

    return this.prisma.notificationMockLog.findMany({
      where: {
        tenantId,
        ...(correlationId ? { correlationId } : {}),
        ...(channel ? { channel } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }) as any;
  }
}
