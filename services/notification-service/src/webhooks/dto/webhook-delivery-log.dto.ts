import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import GraphQLJSON from 'graphql-type-json';

@ObjectType()
export class WebhookDeliveryLogType {
  @Field(() => ID)
  id!: string;

  @Field()
  webhookEndpointId!: string;

  @Field()
  event!: string;

  @Field(() => GraphQLJSON)
  payload!: any;

  @Field(() => Int, { nullable: true })
  httpStatus?: number;

  @Field({ nullable: true })
  responseBody?: string;

  @Field(() => Int)
  retryCount!: number;

  @Field()
  status!: string;

  @Field()
  createdAt!: Date;

  @Field({ nullable: true })
  deliveredAt?: Date;
}

@ObjectType()
export class WebhookDeliveryLogConnection {
  @Field(() => [WebhookDeliveryLogType])
  items!: WebhookDeliveryLogType[];

  @Field()
  hasMore!: boolean;
}
