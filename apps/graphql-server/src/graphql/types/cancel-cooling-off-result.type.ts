import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType()
export class CancelCoolingOffResult {
  @Field()
  success!: boolean;

  @Field(() => ID)
  contractId!: string;

  @Field({ nullable: true })
  cancelledAt?: Date;

  @Field({ nullable: true })
  error?: string;
}
