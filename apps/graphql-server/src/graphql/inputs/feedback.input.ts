import { InputType, Field } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsOptional, IsEnum } from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';
import {
  FeedbackCategory,
  FeedbackSeverity,
  FeedbackStatus,
} from '@lons/shared-types';

@InputType()
export class SubmitFeedbackInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  tenantId!: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  userId!: string;

  @Field(() => FeedbackCategory)
  @IsNotEmpty()
  @IsEnum(FeedbackCategory)
  category!: FeedbackCategory;

  @Field(() => FeedbackSeverity)
  @IsNotEmpty()
  @IsEnum(FeedbackSeverity)
  severity!: FeedbackSeverity;

  @Field()
  @IsNotEmpty()
  @IsString()
  description!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  screenshotUrl?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  pageUrl?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  debugContext?: unknown;
}

@InputType()
export class UpdateFeedbackStatusInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  id!: string;

  @Field(() => FeedbackStatus)
  @IsNotEmpty()
  @IsEnum(FeedbackStatus)
  status!: FeedbackStatus;
}
