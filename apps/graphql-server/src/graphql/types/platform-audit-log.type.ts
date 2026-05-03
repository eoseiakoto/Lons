import { ObjectType, Field, ID } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';

@ObjectType()
export class PlatformAuditLogType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  tenantName!: string;

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

  @Field({ nullable: true })
  correlationId?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  metadata?: unknown;

  @Field({ nullable: true })
  entryHash?: string;

  @Field({ nullable: true })
  accessType?: string;

  @Field()
  createdAt!: Date;
}

@ObjectType()
export class PlatformAuditLogConnection {
  @Field(() => [PlatformAuditLogType])
  items!: PlatformAuditLogType[];

  @Field()
  hasMore!: boolean;
}
