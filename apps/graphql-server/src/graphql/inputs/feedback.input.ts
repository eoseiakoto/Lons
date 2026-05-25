import { InputType, Field } from '@nestjs/graphql';
import { IsNotEmpty, IsObject, IsString, IsOptional, IsEnum } from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';
import {
  FeedbackCategory,
  FeedbackSeverity,
  FeedbackStatus,
} from '@lons/shared-types';

/**
 * FIX-STAB-1: class-validator decorators placed ABOVE @Field so the
 * global ValidationPipe (whitelist + forbidNonWhitelisted) treats every
 * property as whitelisted.
 */
@InputType()
export class SubmitFeedbackInput {
  @IsNotEmpty()
  @IsString()
  @Field()
  tenantId!: string;

  @IsNotEmpty()
  @IsString()
  @Field()
  userId!: string;

  @IsNotEmpty()
  @IsEnum(FeedbackCategory)
  @Field(() => FeedbackCategory)
  category!: FeedbackCategory;

  @IsNotEmpty()
  @IsEnum(FeedbackSeverity)
  @Field(() => FeedbackSeverity)
  severity!: FeedbackSeverity;

  @IsNotEmpty()
  @IsString()
  @Field()
  description!: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  screenshotUrl?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  pageUrl?: string;

  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true })
  debugContext?: unknown;
}

@InputType()
export class UpdateFeedbackStatusInput {
  @IsNotEmpty()
  @IsString()
  @Field()
  id!: string;

  @IsNotEmpty()
  @IsEnum(FeedbackStatus)
  @Field(() => FeedbackStatus)
  status!: FeedbackStatus;
}
