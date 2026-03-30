import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
export class ContractStatePayload {
  @Field()
  tenantId!: string;

  @Field()
  contractId!: string;

  @Field()
  status!: string;

  @Field({ nullable: true })
  productId?: string;
}
