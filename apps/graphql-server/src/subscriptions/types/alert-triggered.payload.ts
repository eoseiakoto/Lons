import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
export class AlertTriggeredPayload {
  @Field()
  tenantId!: string;

  @Field()
  alertId!: string;

  @Field()
  severity!: string;

  @Field()
  message!: string;

  @Field({ nullable: true })
  resourceId?: string;
}
