import { InputType, Field } from '@nestjs/graphql';
import { IsNotEmpty, IsObject, IsOptional, IsString, IsEmail, MinLength } from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';

/**
 * FIX-STAB-1: class-validator decorators placed ABOVE @Field so the
 * global ValidationPipe (whitelist + forbidNonWhitelisted) treats every
 * property as whitelisted.
 */
@InputType()
export class CreateTenantInput {
  @IsNotEmpty()
  @IsString()
  @Field()
  name!: string;

  @IsNotEmpty()
  @IsString()
  @Field()
  slug!: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  legalName?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  registrationNumber?: string;

  @IsNotEmpty()
  @IsString()
  @Field()
  country!: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true, defaultValue: 'starter' })
  planTier?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  platformFeePercent?: string;

  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true })
  settings?: Record<string, unknown>;

  @IsNotEmpty()
  @IsString()
  @Field()
  adminName!: string;

  @IsNotEmpty()
  @IsEmail()
  @Field()
  adminEmail!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(12)
  @Field()
  adminPassword!: string;
}
