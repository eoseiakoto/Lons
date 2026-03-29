import { InputType, Field } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';
import {
  FeedbackCategory,
  FeedbackSeverity,
  FeedbackStatus,
} from '@lons/shared-types';

@InputType()
export class SubmitFeedbackInput {
  @Field()
  tenantId!: string;

  @Field()
  userId!: string;

  @Field(() => FeedbackCategory)
  category!: FeedbackCategory;

  @Field(() => FeedbackSeverity)
  severity!: FeedbackSeverity;

  @Field()
  description!: string;

  @Field({ nullable: true })
  screenshotUrl?: string;

  @Field({ nullable: true })
  pageUrl?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  debugContext?: unknown;
}

@InputType()
export class UpdateFeedbackStatusInput {
  @Field()
  id!: string;

  @Field(() => FeedbackStatus)
  status!: FeedbackStatus;
}
