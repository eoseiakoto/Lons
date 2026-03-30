import { ObjectType, Field, ID, Int } from '@nestjs/graphql';

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
