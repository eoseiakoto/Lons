import { InputType, Field } from '@nestjs/graphql';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';

@InputType()
export class UpdateLenderInput {
  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  name?: string;

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

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  status?: string;
}
