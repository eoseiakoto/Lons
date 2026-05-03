import { InputType, Field } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsOptional, IsEnum, IsArray, IsUUID } from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';
import { GqlMessageType, GqlMessagePriority } from '../types/message.type';

@InputType()
export class SendMessageInput {
  @Field(() => GqlMessageType)
  @IsNotEmpty()
  @IsEnum(GqlMessageType)
  type!: 'announcement' | 'direct' | 'system';

  @Field(() => GqlMessagePriority, { nullable: true, defaultValue: 'normal' })
  @IsOptional()
  @IsEnum(GqlMessagePriority)
  priority?: 'low' | 'normal' | 'high' | 'urgent';

  @Field()
  @IsNotEmpty()
  @IsString()
  subject!: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  body!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  recipientIds?: string[];

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  metadata?: Record<string, unknown>;

  @Field({ nullable: true })
  @IsOptional()
  expiresAt?: Date;
}

@InputType()
export class MessageFilterInput {
  @Field(() => GqlMessageType, { nullable: true })
  @IsOptional()
  @IsEnum(GqlMessageType)
  type?: 'announcement' | 'direct' | 'system';

  @Field(() => GqlMessagePriority, { nullable: true })
  @IsOptional()
  @IsEnum(GqlMessagePriority)
  priority?: 'low' | 'normal' | 'high' | 'urgent';

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  readStatus?: 'read' | 'unread';
}
