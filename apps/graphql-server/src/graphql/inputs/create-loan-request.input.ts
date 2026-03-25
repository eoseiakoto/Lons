import { InputType, Field, Float, Int } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString, IsNumber, IsInt, Min } from 'class-validator';

@InputType()
export class CreateLoanRequestInput {
  @Field()
  @IsNotEmpty()
  @IsString()
  customerId!: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  productId!: string;

  @Field(() => Float)
  @IsNumber()
  @Min(0)
  requestedAmount!: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  requestedTenor?: number;

  @Field()
  @IsNotEmpty()
  @IsString()
  currency!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  channel?: string;
}
