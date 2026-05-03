import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
export class ExposureBreakdownType {
  @Field()
  microLoan!: string;

  @Field()
  overdraft!: string;

  @Field()
  bnpl!: string;

  @Field()
  invoiceFactoring!: string;
}

@ObjectType()
export class CustomerExposureType {
  @Field()
  customerId!: string;

  @Field()
  totalExposure!: string;

  @Field(() => ExposureBreakdownType)
  breakdown!: ExposureBreakdownType;

  @Field()
  activeContractCount!: number;

  @Field()
  maxAllowed!: string;

  @Field()
  utilizationPercent!: number;
}

@ObjectType()
export class ExposureLimitCheckType {
  @Field()
  allowed!: boolean;

  @Field()
  currentExposure!: string;

  @Field()
  requestedAmount!: string;

  @Field()
  maxAllowed!: string;

  @Field()
  headroom!: string;

  @Field({ nullable: true })
  reason?: string;
}
