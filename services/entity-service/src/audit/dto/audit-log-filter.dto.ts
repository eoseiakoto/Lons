import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class AuditLogFilterInput {
  @Field(() => String, { nullable: true })
  actorId?: string;

  @Field(() => String, { nullable: true })
  action?: string;

  @Field(() => String, { nullable: true })
  resourceType?: string;

  @Field(() => String, { nullable: true })
  resourceId?: string;

  @Field(() => Date, { nullable: true })
  fromDate?: Date;

  @Field(() => Date, { nullable: true })
  toDate?: Date;

  @Field(() => String, { nullable: true })
  accessType?: string;
}
