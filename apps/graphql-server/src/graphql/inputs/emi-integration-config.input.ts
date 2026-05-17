import { Field, InputType, Int } from '@nestjs/graphql';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Min } from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';

@InputType()
export class CreateEmiIntegrationConfigInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  name!: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  provider!: string;

  /**
   * Credentials are plaintext on the wire (TLS protected). The server
   * encrypts before persisting to `emi_integration_configs.credentials`.
   */
  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  credentials?: Record<string, unknown>;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'baseUrl must be a valid URL' })
  baseUrl?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  fieldMappings?: Record<string, unknown>;

  @Field(() => Int, { nullable: true, defaultValue: 360 })
  @IsOptional()
  @IsInt()
  @Min(5)
  syncFrequencyMin?: number;

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  retryPolicy?: Record<string, unknown>;

  @Field({ nullable: true, defaultValue: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@InputType()
export class UpdateEmiIntegrationConfigInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  name?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  provider?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  credentials?: Record<string, unknown>;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'baseUrl must be a valid URL' })
  baseUrl?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  fieldMappings?: Record<string, unknown>;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(5)
  syncFrequencyMin?: number;

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  retryPolicy?: Record<string, unknown>;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
