import { InputType, Field, Float, Int } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString, IsNumber, IsInt, Min } from 'class-validator';

@InputType()
export class CreateProductInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  code!: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  name!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  type!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  lenderId?: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  currency!: string;

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

  @Field()
  @IsNotEmpty()
  @IsString()
  interestRateModel!: string;

  @Field(() => Float, { nullable: true })
  @IsOptional()
  @IsNumber()
  interestRate?: number;

  @Field()
  @IsNotEmpty()
  @IsString()
  repaymentMethod!: string;

  @Field(() => Int, { nullable: true, defaultValue: 0 })
  @IsOptional()
  @IsInt()
  gracePeriodDays?: number;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  approvalWorkflow?: string;

  @Field(() => Int, { nullable: true, defaultValue: 1 })
  @IsOptional()
  @IsInt()
  maxActiveLoans?: number;
}
