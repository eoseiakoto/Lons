import { ObjectType, Field, ID, Float, Int } from '@nestjs/graphql';
import { PageInfo } from './page-info.type';

@ObjectType()
export class IntegrationHealthType {
  @Field()
  provider!: string;

  @Field()
  status!: string;

  @Field(() => Float)
  uptime1h!: number;

  @Field(() => Float)
  uptime24h!: number;

  @Field(() => Float)
  uptime7d!: number;

  @Field(() => Float)
  avgLatency1h!: number;

  @Field(() => Float)
  avgLatency24h!: number;

  @Field(() => Float)
  errorRate1h!: number;

  @Field(() => Float)
  errorRate24h!: number;

  @Field(() => Int)
  totalCalls1h!: number;

  @Field(() => Int)
  totalCalls24h!: number;

  @Field({ nullable: true })
  lastSuccessAt?: Date;

  @Field({ nullable: true })
  lastFailureAt?: Date;

  @Field()
  circuitBreakerState!: string;

  @Field()
  lastCheckedAt!: Date;
}

@ObjectType()
export class ApiLogType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  provider!: string;

  @Field()
  endpoint!: string;

  @Field()
  method!: string;

  @Field(() => Int, { nullable: true })
  responseStatus?: number;

  @Field(() => Int)
  latencyMs!: number;

  @Field()
  success!: boolean;

  @Field({ nullable: true })
  errorMessage?: string;

  @Field({ nullable: true })
  correlationId?: string;

  @Field({ nullable: true })
  circuitBreakerState?: string;

  @Field()
  createdAt!: Date;
}

@ObjectType()
export class ApiLogEdge {
  @Field(() => ApiLogType)
  node!: ApiLogType;

  @Field()
  cursor!: string;
}

@ObjectType()
export class ApiLogConnection {
  @Field(() => [ApiLogEdge])
  edges!: ApiLogEdge[];

  @Field(() => PageInfo)
  pageInfo!: PageInfo;

  @Field(() => Int)
  totalCount!: number;
}
