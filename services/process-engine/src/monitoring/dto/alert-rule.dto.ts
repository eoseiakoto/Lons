import { ObjectType, InputType, Field, ID } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';
import { IsOptional, IsString, IsBoolean, IsObject, IsIn } from 'class-validator';

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
  @IsString()
  @Field()
  name!: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  description?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  productId?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  riskTier?: string;

  @IsString()
  @Field()
  conditionType!: string;

  @IsObject()
  @Field(() => GraphQLJSON)
  conditionConfig!: Record<string, unknown>;

  @IsOptional()
  @IsIn(['info', 'warning', 'critical'])
  @Field({ nullable: true })
  severity?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  actionType?: string;

  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true })
  actionConfig?: Record<string, unknown>;
}

@InputType()
export class UpdateAlertRuleInput {
  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  name?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  description?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  productId?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  riskTier?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  conditionType?: string;

  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true })
  conditionConfig?: Record<string, unknown>;

  @IsOptional()
  @IsIn(['info', 'warning', 'critical'])
  @Field({ nullable: true })
  severity?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  actionType?: string;

  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true })
  actionConfig?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  @Field({ nullable: true })
  isActive?: boolean;
}
