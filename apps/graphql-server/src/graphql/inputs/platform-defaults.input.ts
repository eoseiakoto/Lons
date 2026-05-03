import { InputType, Field, Float } from '@nestjs/graphql';

@InputType()
export class PlatformDefaultsInput {
  @Field({ nullable: true })
  maxCustomerExposure?: string;

  @Field({ nullable: true })
  enableCrossProductCheck?: boolean;

  @Field(() => Float, { nullable: true })
  maxCustomerExposureMultiplier?: number;
}
