import { InputType, Field } from '@nestjs/graphql';
import {
  IsArray,
  IsDate,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';
import { GqlMessageType, GqlMessagePriority } from '../types/message.type';

@InputType()
export class SendMessageInput {
  @IsNotEmpty()
  @IsEnum(GqlMessageType)
  @Field(() => GqlMessageType)
  type!: 'announcement' | 'direct' | 'system';

  @IsOptional()
  @IsEnum(GqlMessagePriority)
  @Field(() => GqlMessagePriority, { nullable: true, defaultValue: 'normal' })
  priority?: 'low' | 'normal' | 'high' | 'urgent';

  @IsNotEmpty()
  @IsString()
  @Field()
  subject!: string;

  @IsNotEmpty()
  @IsString()
  @Field()
  body!: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  tenantId?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @Field(() => [String], { nullable: true })
  recipientIds?: string[];

  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true })
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsDate()
  @Field({ nullable: true })
  expiresAt?: Date;
}

@InputType()
export class MessageFilterInput {
  @IsOptional()
  @IsEnum(GqlMessageType)
  @Field(() => GqlMessageType, { nullable: true })
  type?: 'announcement' | 'direct' | 'system';

  @IsOptional()
  @IsEnum(GqlMessagePriority)
  @Field(() => GqlMessagePriority, { nullable: true })
  priority?: 'low' | 'normal' | 'high' | 'urgent';

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  readStatus?: 'read' | 'unread';
}
