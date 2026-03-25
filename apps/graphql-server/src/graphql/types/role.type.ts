import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType()
export class RoleType {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => [String])
  permissions!: string[];

  @Field()
  isSystem!: boolean;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}
