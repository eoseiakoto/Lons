import { ObjectType, Field, ID, Int } from '@nestjs/graphql';

@ObjectType('SurveyTenant')
export class SurveyTenantRef {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;
}

@ObjectType('SurveyUser')
export class SurveyUserRef {
  @Field(() => ID)
  id!: string;

  @Field({ nullable: true })
  name?: string;

  @Field()
  email!: string;
}

@ObjectType()
export class SurveyResponseType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  userId!: string;

  @Field(() => Int)
  score!: number;

  @Field({ nullable: true })
  comment?: string;

  @Field()
  createdAt!: Date;

  @Field(() => SurveyTenantRef, { nullable: true })
  tenant?: SurveyTenantRef;

  @Field(() => SurveyUserRef, { nullable: true })
  user?: SurveyUserRef;
}

@ObjectType()
export class NpsSummary {
  @Field(() => Int)
  totalResponses!: number;

  @Field()
  npsScore!: number;

  @Field(() => Int)
  promoters!: number;

  @Field(() => Int)
  passives!: number;

  @Field(() => Int)
  detractors!: number;

  @Field()
  promoterPercentage!: number;

  @Field()
  passivePercentage!: number;

  @Field()
  detractorPercentage!: number;
}
