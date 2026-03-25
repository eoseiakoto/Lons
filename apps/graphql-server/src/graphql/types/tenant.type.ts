import { ObjectType, Field, ID } from '@nestjs/graphql';
import { PageInfo } from './page-info.type';

@ObjectType()
export class TenantType {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field()
  slug!: string;

  @Field({ nullable: true })
  legalName?: string;

  @Field({ nullable: true })
  registrationNumber?: string;

  @Field()
  country!: string;

  @Field()
  schemaName!: string;

  @Field()
  planTier!: string;

  @Field()
  status!: string;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@ObjectType()
export class TenantEdge {
  @Field(() => TenantType)
  node!: TenantType;

  @Field()
  cursor!: string;
}

@ObjectType()
export class TenantConnection {
  @Field(() => [TenantEdge])
  edges!: TenantEdge[];

  @Field(() => PageInfo)
  pageInfo!: PageInfo;

  @Field()
  totalCount!: number;
}
