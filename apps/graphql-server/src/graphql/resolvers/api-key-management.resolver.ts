import { Args, ID, Int, Mutation, ObjectType, Field, Resolver } from '@nestjs/graphql';
import {
  AuditAction,
  AuditActionType,
  AuditResourceType,
} from '@lons/common';
import { ApiKeyService, Roles } from '@lons/entity-service';

/**
 * Sprint 18 (S18-5 / FR-SET-001.1) — `createApiKey` GraphQL mutation.
 *
 * The existing `ApiKeyResolver` (api-key.resolver.ts) covers list /
 * rotate / revoke; this resolver adds the missing creation surface
 * needed by the admin portal API key management page. Kept in a
 * separate file per Sprint 18 carve-out so concurrent edits to
 * `api-key.resolver.ts` (from Track D) don't conflict.
 */

@ObjectType()
export class ApiKeyCreateResult {
  @Field(() => ID)
  id!: string;

  @Field()
  name!: string;

  /**
   * Plaintext API key — shown only once on creation. Format:
   * `lons_<64-hex>`. The integrator stores it in their secret store.
   */
  @Field()
  plaintext!: string;

  /**
   * Plaintext companion secret — also shown only once. Format:
   * `lons_secret_<64-hex>`. Used alongside the key for HMAC-style
   * authentication; see the API spec for the exact handshake.
   */
  @Field()
  plaintextSecret!: string;

  @Field(() => Int)
  rateLimitPerMin!: number;

  @Field(() => String, { nullable: true })
  expiresAt?: string | null;

  @Field()
  createdAt!: string;
}

@Resolver()
export class ApiKeyManagementResolver {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Mutation(() => ApiKeyCreateResult, {
    description: 'Create a new API key. The plaintext key + secret are shown only once.',
  })
  @AuditAction(AuditActionType.API_KEY_CREATED, AuditResourceType.API_KEY)
  @Roles('admin')
  async createApiKey(
    @Args('tenantId', { type: () => ID }) tenantId: string,
    @Args('name') name: string,
    @Args('rateLimitPerMin', { type: () => Int, nullable: true, defaultValue: 60 })
    rateLimitPerMin?: number,
    @Args('expiresAt', { nullable: true }) expiresAt?: Date,
  ): Promise<ApiKeyCreateResult> {
    const result = await this.apiKeyService.createApiKey(tenantId, {
      name,
      rateLimitPerMin: rateLimitPerMin ?? 60,
      expiresAt,
    });
    return {
      id: result.id,
      name: result.name,
      plaintext: result.plaintext,
      plaintextSecret: result.plaintextSecret,
      rateLimitPerMin: result.rateLimitPerMin,
      expiresAt: result.expiresAt,
      createdAt: result.createdAt,
    };
  }
}
