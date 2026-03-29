import { ObjectType, Field, ID } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';

@ObjectType()
export class AuditLogType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field({ nullable: true })
  actorId?: string;

  @Field()
  actorType!: string;

  @Field({ nullable: true })
  actorIp?: string;

  @Field()
  action!: string;

  @Field()
  resourceType!: string;

  @Field({ nullable: true })
  resourceId?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  beforeValue?: unknown;

  @Field(() => GraphQLJSON, { nullable: true })
  afterValue?: unknown;

  @Field({ nullable: true })
  correlationId?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  metadata?: unknown;

  @Field({ nullable: true })
  entryHash?: string;

  @Field({ nullable: true })
  previousHash?: string;

  @Field({ nullable: true })
  accessType?: string;

  @Field()
  createdAt!: Date;
}

@ObjectType()
export class AuditLogConnection {
  @Field(() => [AuditLogType])
  items!: AuditLogType[];

  @Field()
  hasMore!: boolean;
}
