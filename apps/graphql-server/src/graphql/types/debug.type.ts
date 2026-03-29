import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';

@ObjectType()
export class DebugApiLog {
  @Field(() => ID)
  id!: string;

  @Field()
  method!: string;

  @Field()
  url!: string;

  @Field(() => Int)
  statusCode!: number;

  @Field()
  responseTimeMs!: number;

  @Field(() => GraphQLJSON, { nullable: true })
  requestBody?: any;

  @Field(() => GraphQLJSON, { nullable: true })
  responseBody?: any;

  @Field()
  timestamp!: Date;
}

@ObjectType()
export class DebugAdapterLog {
  @Field(() => ID)
  id!: string;

  @Field()
  adapterType!: string;

  @Field()
  operation!: string;

  @Field(() => GraphQLJSON, { nullable: true })
  input?: any;

  @Field(() => GraphQLJSON, { nullable: true })
  output?: any;

  @Field()
  latencyMs!: number;

  @Field()
  success!: boolean;

  @Field()
  timestamp!: Date;
}

@ObjectType()
export class DebugEvent {
  @Field(() => ID)
  id!: string;

  @Field()
  eventName!: string;

  @Field(() => GraphQLJSON, { nullable: true })
  payload?: any;

  @Field()
  timestamp!: Date;
}

@ObjectType()
export class DebugStateTransition {
  @Field(() => ID)
  id!: string;

  @Field()
  entityId!: string;

  @Field()
  entityType!: string;

  @Field()
  fromState!: string;

  @Field()
  toState!: string;

  @Field(() => GraphQLJSON, { nullable: true })
  metadata?: any;

  @Field()
  timestamp!: Date;
}
