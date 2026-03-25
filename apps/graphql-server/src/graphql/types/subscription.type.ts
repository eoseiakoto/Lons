import { ObjectType, Field, ID } from '@nestjs/graphql';
import { CustomerType } from './customer.type';
import { ProductType } from './product.type';

@ObjectType()
export class SubscriptionType {
  @Field(() => ID)
  id!: string;

  @Field(() => CustomerType, { nullable: true })
  customer?: CustomerType;

  @Field(() => ProductType, { nullable: true })
  product?: ProductType;

  @Field({ nullable: true })
  creditLimit?: string;

  @Field({ nullable: true })
  availableLimit?: string;

  @Field()
  status!: string;

  @Field({ nullable: true })
  activatedAt?: Date;

  @Field({ nullable: true })
  deactivatedAt?: Date;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}
