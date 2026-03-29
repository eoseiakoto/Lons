import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType()
export class NotificationMockLogType {
  @Field(() => ID)
  id!: string;

  @Field()
  channel!: string;

  @Field()
  recipient!: string;

  @Field({ nullable: true })
  templateId?: string;

  @Field()
  renderedContent!: string;

  @Field()
  status!: string;

  @Field({ nullable: true })
  correlationId?: string;

  @Field()
  createdAt!: Date;
}
