import { ObjectType, Field, ID, InputType } from '@nestjs/graphql';
import { IsUrl, IsArray, IsString, IsOptional, IsIn, IsBoolean } from 'class-validator';

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
  @IsUrl({ require_tld: false })
  @Field()
  url!: string;

  @IsArray()
  @IsString({ each: true })
  @Field(() => [String])
  events!: string[];

  @IsOptional()
  @IsIn(['hmac', 'bearer', 'basic_auth'])
  @Field({ nullable: true, defaultValue: 'hmac' })
  authMethod?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  secret?: string;
}

@InputType()
export class UpdateWebhookEndpointInput {
  @IsOptional()
  @IsUrl({ require_tld: false })
  @Field({ nullable: true })
  url?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Field(() => [String], { nullable: true })
  events?: string[];

  @IsOptional()
  @IsBoolean()
  @Field({ nullable: true })
  active?: boolean;
}
