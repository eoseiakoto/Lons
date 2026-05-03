import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import { MessagingService, CurrentUser, CurrentTenant, IAuthenticatedUser } from '@lons/entity-service';
import { AuditAction, AuditActionType, AuditResourceType } from '@lons/common';

import {
  PlatformMessageType,
  MessageConnection,
} from '../types/message.type';
import { SendMessageInput, MessageFilterInput } from '../inputs/send-message.input';
import { PaginationInput } from '../inputs/pagination.input';

@Resolver(() => PlatformMessageType)
export class MessageResolver {
  constructor(private readonly messagingService: MessagingService) {}

  /** Platform admin JWT carries tenantId='platform' which is not a real UUID tenant. */
  private isPlatformAdmin(tenantId: string | undefined): boolean {
    return !tenantId || tenantId === 'platform';
  }

  // ─── Queries ─────────────────────────────────────────────────────────────

  @Query(() => MessageConnection)
  async messages(
    @CurrentUser() user: IAuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Args('filter', { nullable: true }) filter?: MessageFilterInput,
    @Args('pagination', { nullable: true }) pagination?: PaginationInput,
  ): Promise<MessageConnection> {
    const take = pagination?.first || 20;
    const isPlatform = this.isPlatformAdmin(tenantId);
    const recipientId = isPlatform ? user.userId : tenantId;
    const recipientType = isPlatform ? 'user' : 'tenant';

    const result = await this.messagingService.getMessages(
      recipientId,
      recipientType,
      isPlatform ? undefined : tenantId,
      filter ? {
        type: filter.type,
        priority: filter.priority,
        readStatus: filter.readStatus as 'read' | 'unread' | undefined,
      } : undefined,
      take,
      pagination?.after,
    );

    const edges = result.items.map((item: any) => ({
      node: item,
      cursor: item.id,
    }));

    return {
      edges,
      pageInfo: {
        hasNextPage: result.hasNextPage,
        hasPreviousPage: !!pagination?.after,
        startCursor: edges.length > 0 ? edges[0].cursor : undefined,
        endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : undefined,
      },
      totalCount: result.totalCount,
    };
  }

  @Query(() => Int)
  async unreadMessageCount(
    @CurrentUser() user: IAuthenticatedUser,
    @CurrentTenant() tenantId: string,
  ): Promise<number> {
    const isPlatform = this.isPlatformAdmin(tenantId);
    const recipientId = isPlatform ? user.userId : tenantId;
    const recipientType = isPlatform ? 'user' : 'tenant';
    return this.messagingService.getUnreadCount(recipientId, recipientType, isPlatform ? undefined : tenantId);
  }

  // ─── Mutations ────────────────────────────────────────────────────────────

  @Mutation(() => PlatformMessageType)
  @AuditAction(AuditActionType.CREATE, AuditResourceType.TENANT)
  async sendMessage(
    @CurrentUser() user: IAuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Args('input') input: SendMessageInput,
  ): Promise<PlatformMessageType> {
    const isPlatform = this.isPlatformAdmin(tenantId);
    return this.messagingService.sendMessage({
      type: input.type,
      priority: input.priority,
      subject: input.subject,
      body: input.body,
      senderType: isPlatform ? 'platform' : 'tenant',
      senderId: user.userId,
      senderName: (user as any).name || (user as any).email,
      tenantId: input.tenantId || (isPlatform ? undefined : tenantId),
      recipientIds: input.recipientIds,
      metadata: input.metadata,
      expiresAt: input.expiresAt,
    }) as unknown as PlatformMessageType;
  }

  @Mutation(() => PlatformMessageType)
  async markMessageRead(
    @CurrentUser() user: IAuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<PlatformMessageType> {
    const isPlatform = this.isPlatformAdmin(tenantId);
    const recipientId = isPlatform ? user.userId : tenantId;
    return this.messagingService.markRead(id, recipientId) as unknown as PlatformMessageType;
  }

  @Mutation(() => Boolean)
  async markAllMessagesRead(
    @CurrentUser() user: IAuthenticatedUser,
    @CurrentTenant() tenantId: string,
  ): Promise<boolean> {
    const isPlatform = this.isPlatformAdmin(tenantId);
    const recipientId = isPlatform ? user.userId : tenantId;
    return this.messagingService.markAllRead(recipientId, isPlatform ? undefined : tenantId);
  }

  @Mutation(() => Boolean)
  async archiveMessage(
    @CurrentUser() user: IAuthenticatedUser,
    @CurrentTenant() tenantId: string,
    @Args('id', { type: () => ID }) id: string,
  ): Promise<boolean> {
    const isPlatform = this.isPlatformAdmin(tenantId);
    const recipientId = isPlatform ? user.userId : tenantId;
    return this.messagingService.archiveMessage(id, recipientId);
  }
}
