import { InputType, Field } from '@nestjs/graphql';
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';

/**
 * FIX-STAB-1: class-validator decorators placed ABOVE @Field so the
 * global ValidationPipe (whitelist + forbidNonWhitelisted) treats every
 * property as whitelisted. See invoice-verification.input.ts for the
 * canonical pattern.
 */
@InputType()
export class CreateLenderInput {
  @IsNotEmpty()
  @IsString()
  @Field()
  name!: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  licenseNumber?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  country?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  fundingCapacity?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  fundingCurrency?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  minInterestRate?: string;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  maxInterestRate?: string;

  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true })
  settlementAccount?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  @Field(() => GraphQLJSON, { nullable: true })
  riskParameters?: Record<string, unknown>;
}
