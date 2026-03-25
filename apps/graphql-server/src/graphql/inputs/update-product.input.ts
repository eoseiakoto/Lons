import { InputType, Field, Float, Int } from '@nestjs/graphql';
import { IsOptional, IsString, IsNumber, IsInt, Min } from 'class-validator';

@InputType()
export class UpdateProductInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  name?: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxAmount?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  minTenorDays?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxTenorDays?: number;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  interestRate?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  gracePeriodDays?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  maxActiveLoans?: number;
}
