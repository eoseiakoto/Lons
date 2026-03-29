import { ObjectType, InputType, Field, ID } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';

@ObjectType()
export class AlertRuleType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field({ nullable: true })
  productId?: string;

  @Field({ nullable: true })
  riskTier?: string;

  @Field()
  name!: string;

  @Field({ nullable: true })
  description?: string;

  @Field()
  conditionType!: string;

  @Field(() => GraphQLJSON)
  conditionConfig!: Record<string, unknown>;

  @Field()
  severity!: string;

  @Field({ nullable: true })
  actionType?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  actionConfig?: Record<string, unknown>;

  @Field()
  isActive!: boolean;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@InputType()
export class CreateAlertRuleInput {
  @Field()
  name!: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  productId?: string;

  @Field({ nullable: true })
  riskTier?: string;

  @Field()
  conditionType!: string;

  @Field(() => GraphQLJSON)
  conditionConfig!: Record<string, unknown>;

  @Field({ nullable: true })
  severity?: string;

  @Field({ nullable: true })
  actionType?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  actionConfig?: Record<string, unknown>;
}

@InputType()
export class UpdateAlertRuleInput {
  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  description?: string;

  @Field({ nullable: true })
  productId?: string;

  @Field({ nullable: true })
  riskTier?: string;

  @Field({ nullable: true })
  conditionType?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  conditionConfig?: Record<string, unknown>;

  @Field({ nullable: true })
  severity?: string;

  @Field({ nullable: true })
  actionType?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  actionConfig?: Record<string, unknown>;

  @Field({ nullable: true })
  isActive?: boolean;
}
