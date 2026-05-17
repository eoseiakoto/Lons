import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';

/**
 * S17-2 / FR-DI-001.2 — public projection of an EMI integration config.
 *
 * Plaintext `credentials` are NEVER returned. Instead `credentialsSet`
 * indicates whether the tenant has stored a credential blob; admins
 * must re-enter credentials on every update.
 */
@ObjectType()
export class EmiIntegrationConfigType {
  @Field(() => ID)
  id!: string;

  @Field()
  tenantId!: string;

  @Field()
  name!: string;

  @Field()
  provider!: string;

  /** True iff encrypted credentials are present in the database. */
  @Field()
  credentialsSet!: boolean;

  @Field({ nullable: true })
  baseUrl?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  fieldMappings?: Record<string, unknown>;

  @Field(() => Int)
  syncFrequencyMin!: number;

  @Field(() => GraphQLJSON, { nullable: true })
  retryPolicy?: Record<string, unknown>;

  @Field()
  isActive!: boolean;

  @Field({ nullable: true })
  lastSyncAt?: Date;

  @Field({ nullable: true })
  lastSyncError?: string;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@ObjectType()
export class EmiConnectionTestResult {
  @Field()
  success!: boolean;

  @Field(() => Int)
  latencyMs!: number;

  @Field({ nullable: true })
  errorMessage?: string;
}
