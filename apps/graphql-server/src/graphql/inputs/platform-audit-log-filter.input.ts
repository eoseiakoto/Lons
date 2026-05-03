import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class PlatformAuditLogFilterInput {
  @Field(() => String, { nullable: true })
  tenantId?: string;

  @Field(() => String, { nullable: true })
  actorType?: string;

  @Field(() => String, { nullable: true })
  action?: string;

  @Field(() => String, { nullable: true })
  resourceType?: string;

  @Field(() => Date, { nullable: true })
  dateFrom?: Date;

  @Field(() => Date, { nullable: true })
  dateTo?: Date;

  @Field(() => String, { nullable: true })
  search?: string;
}
