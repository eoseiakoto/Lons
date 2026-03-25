import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { PageInfo } from './page-info.type';

@ObjectType()
export class LoanRequestType {
  @Field(() => ID)
  id!: string;

  @Field({ nullable: true })
  idempotencyKey?: string;

  @Field()
  customerId!: string;

  @Field()
  productId!: string;

  @Field({ nullable: true })
  productVersion?: number;

  @Field()
  requestedAmount!: string;

  @Field(() => Int, { nullable: true })
  requestedTenor?: number;

  @Field()
  currency!: string;

  @Field({ nullable: true })
  channel?: string;

  @Field()
  status!: string;

  @Field({ nullable: true })
  approvedAmount?: string;

  @Field(() => Int, { nullable: true })
  approvedTenor?: number;

  @Field({ nullable: true })
  offerExpiresAt?: Date;

  @Field({ nullable: true })
  acceptedAt?: Date;

  @Field({ nullable: true })
  contractId?: string;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@ObjectType()
export class LoanRequestEdge {
  @Field(() => LoanRequestType)
  node!: LoanRequestType;

  @Field()
  cursor!: string;
}

@ObjectType()
export class LoanRequestConnection {
  @Field(() => [LoanRequestEdge])
  edges!: LoanRequestEdge[];

  @Field(() => PageInfo)
  pageInfo!: PageInfo;

  @Field()
  totalCount!: number;
}
