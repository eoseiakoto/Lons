import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
export class ReconciliationExceptionPayload {
  @Field()
  tenantId!: string;

  @Field()
  reconciliationId!: string;

  @Field()
  status!: string;

  @Field({ nullable: true })
  exceptionType?: string;

  @Field({ nullable: true })
  details?: string;
}
