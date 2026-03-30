import { ObjectType, Field, ID, InputType } from '@nestjs/graphql';
import { IsUrl, IsArray, IsString, IsOptional, IsIn } from 'class-validator';

@ObjectType()
export class WebhookEndpointType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  url!: string;

  @Field(() => [String])
  events!: string[];

  @Field()
  authMethod!: string;

  @Field()
  active!: boolean;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@InputType()
export class CreateWebhookEndpointInput {
  @Field()
  @IsUrl({ require_tld: false })
  url!: string;

  @Field(() => [String])
  @IsArray()
  @IsString({ each: true })
  events!: string[];

  @Field({ nullable: true, defaultValue: 'hmac' })
  @IsOptional()
  @IsIn(['hmac', 'bearer', 'basic_auth'])
  authMethod?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  secret?: string;
}

@InputType()
export class UpdateWebhookEndpointInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsUrl({ require_tld: false })
  url?: string;

  @Field(() => [String], { nullable: true })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];

  @Field({ nullable: true })
  @IsOptional()
  active?: boolean;
}
