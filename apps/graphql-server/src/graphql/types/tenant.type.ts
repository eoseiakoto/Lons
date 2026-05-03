import { ObjectType, Field, ID } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';
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

  @Field({ nullable: true })
  platformFeePercent?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  settings?: Record<string, unknown>;

  // Convenience fields resolved from settings JSON
  @Field({ nullable: true })
  logoUrl?: string;

  @Field({ nullable: true })
  primaryColor?: string;

  @Field({ nullable: true })
  timezone?: string;

  @Field({ nullable: true })
  defaultCurrency?: string;

  @Field({ nullable: true })
  supportEmail?: string;

  @Field({ nullable: true })
  supportPhone?: string;

  @Field({ nullable: true })
  address?: string;

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
