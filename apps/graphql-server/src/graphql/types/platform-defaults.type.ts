import { ObjectType, Field, Float } from '@nestjs/graphql';

@ObjectType()
export class PlatformDefaultsType {
  @Field()
  maxCustomerExposure!: string;

  @Field()
  enableCrossProductCheck!: boolean;

  @Field(() => Float)
  maxCustomerExposureMultiplier!: number;
}
