import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType()
export class AnonymizationError {
  @Field()
  code!: string;

  @Field()
  message!: string;

  @Field({ nullable: true })
  blockingResource?: string;
}

@ObjectType()
export class AnonymizationResult {
  @Field()
  success!: boolean;

  @Field(() => ID)
  customerId!: string;

  @Field({ nullable: true })
  anonymizedAt?: string;

  @Field(() => [AnonymizationError])
  errors!: AnonymizationError[];
}

@ObjectType()
export class AnonymizationEligibility {
  @Field()
  eligible!: boolean;

  @Field(() => [String])
  reasons!: string[];
}
