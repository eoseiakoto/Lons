import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
export class RepaymentReceivedPayload {
  @Field()
  tenantId!: string;

  @Field()
  repaymentId!: string;

  @Field()
  contractId!: string;

  @Field()
  amount!: string;

  @Field()
  currency!: string;
}
