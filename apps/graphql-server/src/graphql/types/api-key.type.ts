import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType()
export class ApiKeyType {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field()
  keyHash!: string;

  @Field()
  rateLimitPerMin!: number;

  @Field(() => String, { nullable: true })
  expiresAt?: string | null;

  @Field(() => String, { nullable: true })
  revokedAt?: string | null;

  @Field(() => String, { nullable: true })
  lastUsedAt?: string | null;

  @Field()
  createdAt!: string;

  @Field(() => String, { nullable: true })
  updatedAt?: string | null;
}

@ObjectType()
export class ApiKeyRotationResult {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  @Field({ description: 'The new plaintext API key. Only shown once.' })
  key!: string;

  @Field(() => String, { nullable: true })
  expiresAt?: string | null;

  @Field()
  createdAt!: string;
}

@ObjectType()
export class ApiKeyRevokeResult {
  @Field()
  success!: boolean;

  @Field()
  message!: string;
}
