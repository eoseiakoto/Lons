import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';
import {
  FeedbackCategory,
  FeedbackSeverity,
  FeedbackStatus,
} from '@lons/shared-types';

registerEnumType(FeedbackCategory, { name: 'FeedbackCategory' });
registerEnumType(FeedbackSeverity, { name: 'FeedbackSeverity' });
registerEnumType(FeedbackStatus, { name: 'FeedbackStatus' });

@ObjectType()
export class FeedbackType {
  @Field(() => ID)
  id!: string;

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

  @Field(() => FeedbackStatus)
  status!: FeedbackStatus;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@ObjectType()
export class FeedbackEdge {
  @Field(() => FeedbackType)
  node!: FeedbackType;

  @Field()
  cursor!: string;
}

@ObjectType()
export class FeedbackPageInfo {
  @Field()
  hasNextPage!: boolean;

  @Field()
  hasPreviousPage!: boolean;

  @Field({ nullable: true })
  startCursor?: string;

  @Field({ nullable: true })
  endCursor?: string;
}

@ObjectType()
export class FeedbackConnection {
  @Field(() => [FeedbackEdge])
  edges!: FeedbackEdge[];

  @Field(() => FeedbackPageInfo)
  pageInfo!: FeedbackPageInfo;

  @Field()
  totalCount!: number;
}
