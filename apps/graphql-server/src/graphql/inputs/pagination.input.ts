import { InputType, Field, Int } from '@nestjs/graphql';
import { IsOptional, IsInt, IsString, Min, Max } from 'class-validator';

@InputType()
export class PaginationInput {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Field(() => Int, { nullable: true, defaultValue: 20 })
  first?: number;

  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  after?: string;
}
