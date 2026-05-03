import { InputType, Field } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString, IsEmail, MinLength } from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';

@InputType()
export class CreateTenantInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  name!: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  slug!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  legalName?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  country!: string;

  @Field({ nullable: true, defaultValue: 'starter' })
  @IsOptional()
  @IsString()
  planTier?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  platformFeePercent?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  settings?: Record<string, unknown>;

  @Field()
  @IsNotEmpty()
  @IsString()
  adminName!: string;

  @Field()
  @IsNotEmpty()
  @IsEmail()
  adminEmail!: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  @MinLength(12)
  adminPassword!: string;
}
