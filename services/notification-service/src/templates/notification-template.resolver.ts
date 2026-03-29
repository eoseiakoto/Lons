import { Resolver, Query, Mutation, Args, ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { NotificationTemplateService } from './notification-template.service';
import { CreateNotificationTemplateInput } from './dto/create-template.dto';
import { UpdateNotificationTemplateInput } from './dto/update-template.dto';

@ObjectType('NotificationTemplate')
export class NotificationTemplateType {
  @Field(() => ID)
  id: string;

  @Field()
  tenantId: string;

  @Field({ nullable: true })
  productId: string | null;

  @Field()
  eventType: string;

  @Field()
  channel: string;

  @Field()
  templateBody: string;

  @Field()
  language: string;

  @Field()
  isActive: boolean;

  @Field(() => Int)
  version: number;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;

  @Field({ nullable: true })
  deletedAt: Date | null;
}

@Resolver(() => NotificationTemplateType)
export class NotificationTemplateResolver {
  constructor(private readonly templateService: NotificationTemplateService) {}

  @Query(() => [NotificationTemplateType], { name: 'notificationTemplates' })
  async findAll(
    @Args('tenantId') tenantId: string,
    @Args('productId', { nullable: true }) productId?: string,
    @Args('eventType', { nullable: true }) eventType?: string,
    @Args('channel', { nullable: true }) channel?: string,
  ): Promise<NotificationTemplateType[]> {
    return this.templateService.findByProductAndEvent(tenantId, productId, eventType, channel);
  }

  @Query(() => NotificationTemplateType, { name: 'notificationTemplate', nullable: true })
  async findOne(
    @Args('id') id: string,
    @Args('tenantId') tenantId: string,
  ): Promise<NotificationTemplateType | null> {
    return this.templateService.findById(id, tenantId);
  }

  @Mutation(() => NotificationTemplateType, { name: 'createNotificationTemplate' })
  async create(
    @Args('input') input: CreateNotificationTemplateInput,
    @Args('idempotencyKey', { nullable: true }) idempotencyKey?: string,
  ): Promise<NotificationTemplateType> {
    const { tenantId, ...data } = input;
    return this.templateService.create(tenantId, data, idempotencyKey);
  }

  @Mutation(() => NotificationTemplateType, { name: 'updateNotificationTemplate' })
  async update(
    @Args('id') id: string,
    @Args('input') input: UpdateNotificationTemplateInput,
  ): Promise<NotificationTemplateType> {
    const { tenantId, ...data } = input;
    return this.templateService.update(id, tenantId, data);
  }

  @Mutation(() => NotificationTemplateType, { name: 'deleteNotificationTemplate' })
  async delete(
    @Args('id') id: string,
    @Args('tenantId') tenantId: string,
  ): Promise<NotificationTemplateType> {
    return this.templateService.softDelete(id, tenantId);
  }
}
