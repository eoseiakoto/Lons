import { ObjectType, Field, ID } from '@nestjs/graphql';
import { PageInfo } from './page-info.type';

@ObjectType()
export class CustomerType {
  @Field(() => ID)
  id!: string;

  @Field()
  externalId!: string;

  @Field({ nullable: true })
  externalSource?: string;

  @Field({ nullable: true })
  fullName?: string;

  @Field({ nullable: true })
  gender?: string;

  @Field({ nullable: true })
  country?: string;

  @Field({ nullable: true })
  region?: string;

  @Field({ nullable: true })
  city?: string;

  @Field()
  kycLevel!: string;

  @Field({ nullable: true })
  segment?: string;

  @Field()
  status!: string;

  @Field({ nullable: true })
  blacklistReason?: string;

  @Field()
  watchlist!: boolean;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;

  // PII fields — resolved conditionally based on permissions
  @Field({ nullable: true })
  nationalId?: string;

  @Field({ nullable: true })
  phonePrimary?: string;

  @Field({ nullable: true })
  email?: string;
}

@ObjectType()
export class CustomerEdge {
  @Field(() => CustomerType)
  node!: CustomerType;

  @Field()
  cursor!: string;
}

@ObjectType()
export class CustomerConnection {
  @Field(() => [CustomerEdge])
  edges!: CustomerEdge[];

  @Field(() => PageInfo)
  pageInfo!: PageInfo;

  @Field()
  totalCount!: number;
}
