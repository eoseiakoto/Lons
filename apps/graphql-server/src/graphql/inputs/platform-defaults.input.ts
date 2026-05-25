import { InputType, Field, Float } from '@nestjs/graphql';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

@InputType()
export class PlatformDefaultsInput {
  @IsOptional()
  @IsString()
  @Field({ nullable: true })
  maxCustomerExposure?: string;

  @IsOptional()
  @IsBoolean()
  @Field({ nullable: true })
  enableCrossProductCheck?: boolean;

  @IsOptional()
  @IsNumber()
  @Field(() => Float, { nullable: true })
  maxCustomerExposureMultiplier?: number;
}
