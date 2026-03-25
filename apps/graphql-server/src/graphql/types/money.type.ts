import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
export class Money {
  @Field(() => String)
  amount!: string;

  @Field()
  currency!: string;
}
