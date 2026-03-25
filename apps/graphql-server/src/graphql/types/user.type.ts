import { ObjectType, Field, ID } from '@nestjs/graphql';
import { PageInfo } from './page-info.type';
import { RoleType } from './role.type';

@ObjectType()
export class UserType {
  @Field(() => ID)
  id!: string;

  @Field()
  email!: string;

  @Field({ nullable: true })
  name?: string;

  @Field(() => RoleType)
  role!: RoleType;

  @Field()
  mfaEnabled!: boolean;

  @Field()
  status!: string;

  @Field({ nullable: true })
  lastLoginAt?: Date;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@ObjectType()
export class UserEdge {
  @Field(() => UserType)
  node!: UserType;

  @Field()
  cursor!: string;
}

@ObjectType()
export class UserConnection {
  @Field(() => [UserEdge])
  edges!: UserEdge[];

  @Field(() => PageInfo)
  pageInfo!: PageInfo;

  @Field()
  totalCount!: number;
}
