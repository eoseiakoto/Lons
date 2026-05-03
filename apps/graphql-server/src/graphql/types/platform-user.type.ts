import { ObjectType, Field, ID } from '@nestjs/graphql';
import { PageInfo } from './page-info.type';

@ObjectType()
export class PlatformUserType {
  @Field(() => ID)
  id!: string;

  @Field()
  email!: string;

  @Field({ nullable: true })
  name?: string;

  @Field()
  role!: string;

  @Field()
  mfaEnabled!: boolean;

  @Field({ nullable: true })
  lastLoginAt?: Date;

  @Field()
  status!: string;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@ObjectType()
export class PlatformUserEdge {
  @Field(() => PlatformUserType)
  node!: PlatformUserType;

  @Field()
  cursor!: string;
}

@ObjectType()
export class PlatformUserConnection {
  @Field(() => [PlatformUserEdge])
  edges!: PlatformUserEdge[];

  @Field(() => PageInfo)
  pageInfo!: PageInfo;

  @Field()
  totalCount!: number;
}
