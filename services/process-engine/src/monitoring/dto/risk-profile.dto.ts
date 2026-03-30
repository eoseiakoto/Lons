import { ObjectType, Field, ID, Int } from '@nestjs/graphql';

@ObjectType()
export class ContractRiskType {
  @Field(() => ID)
  contractId!: string;

  @Field()
  riskLevel!: string;

  @Field(() => Int)
  score!: number;

  @Field(() => [String])
  factors!: string[];
}

@ObjectType()
export class BorrowerRiskProfileType {
  @Field(() => ID)
  customerId!: string;

  @Field(() => [ContractRiskType])
  contracts!: ContractRiskType[];

  @Field()
  overallRiskLevel!: string;

  @Field(() => Int)
  overallRiskScore!: number;

  @Field(() => Int)
  activeContractCount!: number;
}
