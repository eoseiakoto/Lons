import { Field, ID, InputType } from '@nestjs/graphql';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';

@InputType()
export class CreateScorecardConfigInput {
  /**
   * Product to scope this scorecard to. Null = tenant-default scorecard
   * (used when no product-specific scorecard exists at scoring time).
   */
  @Field(() => ID, { nullable: true })
  @IsOptional()
  @IsString()
  productId?: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  name!: string;

  @Field()
  @IsNotEmpty()
  @IsString()
  version!: string;

  /**
   * Full scorecard definition. Shape must match the ScorecardConfig
   * type in scorecard-engine.ts. The service validates and rejects
   * malformed configs.
   */
  @Field(() => GraphQLJSON)
  @IsNotEmpty()
  config!: Record<string, unknown>;

  /**
   * When true the new scorecard is created AND activated, atomically
   * deactivating any previous active scorecard for the same scope.
   */
  @Field({ nullable: true, defaultValue: false })
  @IsOptional()
  @IsBoolean()
  activate?: boolean;
}
