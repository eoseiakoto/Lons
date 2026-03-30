import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import * as crypto from 'crypto';
import { PrismaService } from '@lons/database';
import { AuditAction, AuditActionType, AuditResourceType } from '@lons/common';
import {
  WebhookEndpointType,
  CreateWebhookEndpointInput,
  UpdateWebhookEndpointInput,
  WebhookDeliveryLogType,
  WebhookDeliveryLogConnection,
} from '@lons/notification-service';

@Resolver(() => WebhookEndpointType)
export class WebhookResolver {
  constructor(private prisma: PrismaService) {}

  // ─── Queries ─────────────────────────────────────────────────────────────

  @Query(() => [WebhookEndpointType])
  async webhookEndpoints(
    @Args('tenantId', { type: () => ID }) tenantId: string,
  ): Promise<WebhookEndpointType[]> {
    return (this.prisma as any).webhookEndpoint.findMany({
      where: { tenantId, active: true, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Query(() => WebhookDeliveryLogConnection)
  async webhookDeliveryLogs(
    @Args('endpointId', { type: () => ID }) endpointId: string,
    @Args('status', { type: () => String, nullable: true }) status?: string,
    @Args('event', { type: () => String, nullable: true }) event?: string,
    @Args('fromDate', { type: () => Date, nullable: true }) fromDate?: Date,
    @Args('toDate', { type: () => Date, nullable: true }) toDate?: Date,
    @Args('first', { type: () => Int, nullable: true, defaultValue: 20 }) first?: number,
    @Args('after', { type: () => String, nullable: true }) after?: string,
  ): Promise<WebhookDeliveryLogConnection> {
    const take = Math.min(first ?? 20, 100);
    const where: any = { webhookEndpointId: endpointId };
    if (status) where.status = status;
    if (event) where.event = event;
    if (fromDate || toDate) {
      where.createdAt = {};
      if (fromDate) where.createdAt.gte = fromDate;
      if (toDate) where.createdAt.lte = toDate;
    }

    const items = await (this.prisma as any).webhookDeliveryLog.findMany({
      where,
      take: take + 1,
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
    });

    const hasMore = items.length > take;
    return {
      items: hasMore ? items.slice(0, take) : items,
      hasMore,
    };
  }

  // ─── Mutations ────────────────────────────────────────────────────────────

  @Mutation(() => WebhookEndpointType)
  @AuditAction(AuditActionType.CREATE, AuditResourceType.WEBHOOK)
  async createWebhookEndpoint(
    @Args('tenantId', { type: () => ID }) tenantId: string,
    @Args('input') input: CreateWebhookEndpointInput,
  ): Promise<WebhookEndpointType> {
    const secret =
      input.secret ?? crypto.randomBytes(32).toString('hex');

    return (this.prisma as any).webhookEndpoint.create({
      data: {
        tenantId,
        url: input.url,
        events: input.events,
        authMethod: input.authMethod ?? 'hmac',
        secret,
        active: true,
      },
    });
  }

  @Mutation(() => WebhookEndpointType)
  @AuditAction(AuditActionType.UPDATE, AuditResourceType.WEBHOOK)
  async updateWebhookEndpoint(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: UpdateWebhookEndpointInput,
  ): Promise<WebhookEndpointType> {
    const data: Record<string, any> = {};
    if (input.url !== undefined) data['url'] = input.url;
    if (input.events !== undefined) data['events'] = input.events;
    if (input.active !== undefined) data['active'] = input.active;

    return (this.prisma as any).webhookEndpoint.update({
      where: { id },
      data,
    });
  }

  @Mutation(() => WebhookEndpointType)
  @AuditAction(AuditActionType.DELETE, AuditResourceType.WEBHOOK)
  async deleteWebhookEndpoint(
    @Args('id', { type: () => ID }) id: string,
  ): Promise<WebhookEndpointType> {
    return (this.prisma as any).webhookEndpoint.update({
      where: { id },
      data: { deletedAt: new Date(), active: false },
    });
  }
}
