import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { PageInfo } from './page-info.type';

@ObjectType()
export class ContractType {
  @Field(() => ID)
  id!: string;

  @Field()
  contractNumber!: string;

  @Field()
  customerId!: string;

  @Field()
  productId!: string;

  @Field()
  lenderId!: string;

  @Field()
  principalAmount!: string;

  @Field()
  interestRate!: string;

  @Field({ nullable: true })
  interestAmount?: string;

  @Field({ nullable: true })
  totalFees?: string;

  @Field({ nullable: true })
  totalCostCredit?: string;

  @Field()
  currency!: string;

  @Field(() => Int, { nullable: true })
  tenorDays?: number;

  @Field()
  repaymentMethod!: string;

  @Field()
  startDate!: Date;

  @Field()
  maturityDate!: Date;

  @Field({ nullable: true })
  outstandingPrincipal?: string;

  @Field({ nullable: true })
  outstandingInterest?: string;

  @Field({ nullable: true })
  outstandingFees?: string;

  @Field({ nullable: true })
  outstandingPenalties?: string;

  @Field({ nullable: true })
  totalOutstanding?: string;

  @Field({ nullable: true })
  totalPaid?: string;

  @Field(() => Int)
  daysPastDue!: number;

  @Field()
  status!: string;

  @Field()
  classification!: string;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@ObjectType()
export class ContractEdge {
  @Field(() => ContractType)
  node!: ContractType;

  @Field()
  cursor!: string;
}

@ObjectType()
export class ContractConnection {
  @Field(() => [ContractEdge])
  edges!: ContractEdge[];

  @Field(() => PageInfo)
  pageInfo!: PageInfo;

  @Field()
  totalCount!: number;
}
