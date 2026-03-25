import { ObjectType, Field, ID } from '@nestjs/graphql';
import { PageInfo } from './page-info.type';

@ObjectType()
export class LenderType {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field({ nullable: true })
  licenseNumber?: string;

  @Field({ nullable: true })
  country?: string;

  @Field({ nullable: true })
  fundingCapacity?: string;

  @Field({ nullable: true })
  fundingCurrency?: string;

  @Field({ nullable: true })
  minInterestRate?: string;

  @Field({ nullable: true })
  maxInterestRate?: string;

  @Field()
  status!: string;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@ObjectType()
export class LenderEdge {
  @Field(() => LenderType)
  node!: LenderType;

  @Field()
  cursor!: string;
}

@ObjectType()
export class LenderConnection {
  @Field(() => [LenderEdge])
  edges!: LenderEdge[];

  @Field(() => PageInfo)
  pageInfo!: PageInfo;

  @Field()
  totalCount!: number;
}
