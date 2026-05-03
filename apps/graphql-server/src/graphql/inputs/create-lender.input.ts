import { InputType, Field } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';

@InputType()
export class CreateLenderInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  name!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  country?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  fundingCapacity?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  fundingCurrency?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  minInterestRate?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  maxInterestRate?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  settlementAccount?: Record<string, unknown>;

  @Field(() => GraphQLJSON, { nullable: true })
  @IsOptional()
  riskParameters?: Record<string, unknown>;
}
