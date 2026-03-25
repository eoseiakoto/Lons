import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { PageInfo } from './page-info.type';

@ObjectType()
export class RepaymentType {
  @Field(() => ID)
  id!: string;

  @Field()
  contractId!: string;

  @Field()
  customerId!: string;

  @Field()
  amount!: string;

  @Field()
  currency!: string;

  @Field()
  method!: string;

  @Field({ nullable: true })
  source?: string;

  @Field({ nullable: true })
  allocatedPrincipal?: string;

  @Field({ nullable: true })
  allocatedInterest?: string;

  @Field({ nullable: true })
  allocatedFees?: string;

  @Field({ nullable: true })
  allocatedPenalties?: string;

  @Field()
  status!: string;

  @Field({ nullable: true })
  completedAt?: Date;

  @Field()
  createdAt!: Date;
}

@ObjectType()
export class RepaymentEdge {
  @Field(() => RepaymentType)
  node!: RepaymentType;

  @Field()
  cursor!: string;
}

@ObjectType()
export class RepaymentConnection {
  @Field(() => [RepaymentEdge])
  edges!: RepaymentEdge[];

  @Field(() => PageInfo)
  pageInfo!: PageInfo;

  @Field()
  totalCount!: number;
}

@ObjectType()
export class RepaymentScheduleEntryType {
  @Field(() => ID)
  id!: string;

  @Field(() => Int)
  installmentNumber!: number;

  @Field()
  dueDate!: Date;

  @Field({ nullable: true })
  principalAmount?: string;

  @Field({ nullable: true })
  interestAmount?: string;

  @Field({ nullable: true })
  feeAmount?: string;

  @Field()
  totalAmount!: string;

  @Field()
  paidAmount!: string;

  @Field()
  status!: string;

  @Field({ nullable: true })
  paidAt?: Date;
}

@ObjectType()
export class EarlySettlementQuote {
  @Field()
  contractId!: string;

  @Field()
  outstandingPrincipal!: string;

  @Field()
  outstandingInterest!: string;

  @Field()
  outstandingFees!: string;

  @Field()
  outstandingPenalties!: string;

  @Field()
  totalSettlementAmount!: string;

  @Field()
  currency!: string;
}
