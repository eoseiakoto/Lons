import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';
import { PageInfo } from './page-info.type';

export enum GqlMessageType {
  announcement = 'announcement',
  direct = 'direct',
  system = 'system',
}

export enum GqlMessagePriority {
  low = 'low',
  normal = 'normal',
  high = 'high',
  urgent = 'urgent',
}

registerEnumType(GqlMessageType, { name: 'MessageType' });
registerEnumType(GqlMessagePriority, { name: 'MessagePriority' });

@ObjectType()
export class MessageRecipientType {
  @Field(() => ID)
  id!: string;

  @Field()
  recipientType!: string;

  @Field()
  recipientId!: string;

  @Field({ nullable: true })
  tenantId?: string;

  @Field({ nullable: true })
  readAt?: Date;

  @Field({ nullable: true })
  archivedAt?: Date;

  @Field()
  createdAt!: Date;
}

@ObjectType()
export class PlatformMessageType {
  @Field(() => ID)
  id!: string;

  @Field(() => GqlMessageType)
  type!: GqlMessageType;

  @Field(() => GqlMessagePriority)
  priority!: GqlMessagePriority;

  @Field()
  subject!: string;

  @Field()
  body!: string;

  @Field()
  senderType!: string;

  @Field()
  senderId!: string;

  @Field({ nullable: true })
  senderName?: string;

  @Field({ nullable: true })
  tenantId?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  metadata?: unknown;

  @Field({ nullable: true })
  expiresAt?: Date;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;

  @Field(() => [MessageRecipientType], { nullable: true })
  recipients?: MessageRecipientType[];
}

@ObjectType()
export class MessageEdge {
  @Field(() => PlatformMessageType)
  node!: PlatformMessageType;

  @Field()
  cursor!: string;
}

@ObjectType()
export class MessageConnection {
  @Field(() => [MessageEdge])
  edges!: MessageEdge[];

  @Field(() => PageInfo)
  pageInfo!: PageInfo;

  @Field()
  totalCount!: number;
}
