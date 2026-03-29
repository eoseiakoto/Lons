import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
export class LoanRequestStatePayload {
  @Field()
  tenantId!: string;

  @Field()
  loanRequestId!: string;

  @Field()
  status!: string;

  @Field({ nullable: true })
  productId?: string;
}
