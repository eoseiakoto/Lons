import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';

@ObjectType()
export class MonitoringAlertType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  contractId!: string;

  @Field()
  customerId!: string;

  @Field({ nullable: true })
  alertRuleId?: string;

  @Field()
  severity!: string;

  @Field()
  status!: string;

  @Field(() => Int)
  riskScore!: number;

  @Field()
  riskLevel!: string;

  @Field(() => GraphQLJSON)
  factors!: unknown;

  @Field({ nullable: true })
  actionTaken?: string;

  @Field({ nullable: true })
  acknowledgedBy?: string;

  @Field({ nullable: true })
  acknowledgedAt?: Date;

  @Field({ nullable: true })
  resolvedAt?: Date;

  @Field()
  createdAt!: Date;

  @Field({ nullable: true })
  ruleName?: string;
}

@ObjectType()
export class MonitoringAlertEdge {
  @Field(() => MonitoringAlertType)
  node!: MonitoringAlertType;

  @Field()
  cursor!: string;
}

@ObjectType()
export class MonitoringAlertConnection {
  @Field(() => [MonitoringAlertEdge])
  edges!: MonitoringAlertEdge[];

  @Field(() => Int)
  totalCount!: number;

  @Field()
  hasNextPage!: boolean;

  @Field({ nullable: true })
  endCursor?: string;
}
