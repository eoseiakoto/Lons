import { Field, InputType, Int } from '@nestjs/graphql';
import { IsBoolean, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, IsUrl, Min } from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';

/**
 * FIX-STAB-1: class-validator decorators placed ABOVE @Field so the
 * global ValidationPipe (whitelist + forbidNonWhitelisted) treats every
 * property as whitelisted.
 */
@InputType()
export class CreateEmiIntegrationConfigInput {
  @IsNotEmpty()
  @IsString()
  @Field()
  name!: string;

  @IsNotEmpty()
  @IsString()
  @Field()
  provider!: string;

  /**
   * Credentials are plaintext on the wire (TLS protected). The server
   * encrypts before persisting to `emi_integration_configs.credentials`.
   */
  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true })
  credentials?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'baseUrl must be a valid URL' })
  @Field({ nullable: true })
  baseUrl?: string;

  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true })
  fieldMappings?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Field(() => Int, { nullable: true, defaultValue: 360 })
  syncFrequencyMin?: number;

  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true })
  retryPolicy?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  @Field({ nullable: true, defaultValue: true })
  isActive?: boolean;
}

@InputType()
export class UpdateEmiIntegrationConfigInput {
  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  name?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  provider?: string;

  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true })
  credentials?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @IsUrl({}, { message: 'baseUrl must be a valid URL' })
  @Field({ nullable: true })
  baseUrl?: string;

  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true })
  fieldMappings?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Field(() => Int, { nullable: true })
  syncFrequencyMin?: number;

  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true })
  retryPolicy?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  @Field({ nullable: true })
  isActive?: boolean;
}
