import { ObjectType, Field, ID } from '@nestjs/graphql';
import { PageInfo } from './page-info.type';
import { LenderType } from './lender.type';

@ObjectType()
export class ProductType {
  @Field(() => ID)
  id!: string;

  @Field()
  code!: string;

  @Field()
  name!: string;

  @Field({ nullable: true })
  description?: string;

  @Field()
  type!: string;

  @Field(() => LenderType, { nullable: true })
  lender?: LenderType;

  @Field()
  currency!: string;

  @Field({ nullable: true })
  minAmount?: string;

  @Field({ nullable: true })
  maxAmount?: string;

  @Field({ nullable: true })
  minTenorDays?: number;

  @Field({ nullable: true })
  maxTenorDays?: number;

  @Field()
  interestRateModel!: string;

  @Field({ nullable: true })
  interestRate?: string;

  @Field()
  repaymentMethod!: string;

  @Field()
  gracePeriodDays!: number;

  @Field()
  approvalWorkflow!: string;

  @Field()
  maxActiveLoans!: number;

  @Field()
  version!: number;

  @Field()
  status!: string;

  @Field({ nullable: true })
  activatedAt?: Date;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@ObjectType()
export class ProductEdge {
  @Field(() => ProductType)
  node!: ProductType;

  @Field()
  cursor!: string;
}

@ObjectType()
export class ProductConnection {
  @Field(() => [ProductEdge])
  edges!: ProductEdge[];

  @Field(() => PageInfo)
  pageInfo!: PageInfo;

  @Field()
  totalCount!: number;
}
