import { Field, ID, InputType } from '@nestjs/graphql';
import { IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { GraphQLJSON } from 'graphql-type-json';

@InputType()
export class CreateScorecardConfigInput {
  /**
   * Product to scope this scorecard to. Null = tenant-default scorecard
   * (used when no product-specific scorecard exists at scoring time).
   */
  @IsOptional()
  @IsString()
  @Field(() => ID, { nullable: true })
  productId?: string;

  @IsNotEmpty()
  @IsString()
  @Field()
  name!: string;

  @IsNotEmpty()
  @IsString()
  @Field()
  version!: string;

  /**
   * Full scorecard definition. Shape must match the ScorecardConfig
   * type in scorecard-engine.ts. The service validates and rejects
   * malformed configs.
   */
  @IsNotEmpty()
  @IsObject()
  @Field(() => GraphQLJSON)
  config!: Record<string, unknown>;

  /**
   * When true the new scorecard is created AND activated, atomically
   * deactivating any previous active scorecard for the same scope.
   */
  @IsOptional()
  @IsBoolean()
  @Field({ nullable: true, defaultValue: false })
  activate?: boolean;
}
