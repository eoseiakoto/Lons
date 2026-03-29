import { Resolver, Query, Mutation, Args, ID, Int } from '@nestjs/graphql';
import {
  ApiKeyService,
  ApiKeyRotationService,
  Roles,
} from '@lons/entity-service';
import { AuditAction, AuditActionType, AuditResourceType } from '@lons/common';
import {
  ApiKeyType,
  ApiKeyRotationResult,
  ApiKeyRevokeResult,
} from '../types/api-key.type';

@Resolver(() => ApiKeyType)
export class ApiKeyResolver {
  constructor(
    private apiKeyService: ApiKeyService,
    private apiKeyRotationService: ApiKeyRotationService,
  ) {}

  @Query(() => [ApiKeyType], { description: 'List all API keys for a tenant' })
  @Roles('admin')
  async apiKeys(
    @Args('tenantId', { type: () => ID }) tenantId: string,
  ): Promise<ApiKeyType[]> {
    return this.apiKeyService.listApiKeys(tenantId) as Promise<ApiKeyType[]>;
  }

  @Mutation(() => ApiKeyRotationResult, {
    description:
      'Rotate an API key. Creates a new key and deprecates the old one with a grace period.',
  })
  @AuditAction(AuditActionType.API_KEY_ROTATED, AuditResourceType.API_KEY)
  @Roles('admin')
  async rotateApiKey(
    @Args('tenantId', { type: () => ID }) tenantId: string,
    @Args('apiKeyId', { type: () => ID }) apiKeyId: string,
    @Args('gracePeriodHours', {
      type: () => Int,
      nullable: true,
      defaultValue: 24,
      description: 'Hours to keep old key valid (default: 24)',
    })
    gracePeriodHours?: number,
  ): Promise<ApiKeyRotationResult> {
    const result = await this.apiKeyRotationService.rotateApiKey(
      tenantId,
      apiKeyId,
      gracePeriodHours ?? 24,
    );
    return { ...result, createdAt: result.createdAt.toISOString() };
  }

  @Mutation(() => ApiKeyRevokeResult, {
    description: 'Immediately revoke an API key.',
  })
  @AuditAction(AuditActionType.API_KEY_REVOKED, AuditResourceType.API_KEY)
  @Roles('admin')
  async revokeApiKey(
    @Args('tenantId', { type: () => ID }) tenantId: string,
    @Args('apiKeyId', { type: () => ID }) apiKeyId: string,
  ): Promise<ApiKeyRevokeResult> {
    await this.apiKeyRotationService.revokeApiKey(tenantId, apiKeyId);
    return { success: true, message: 'API key revoked successfully' };
  }
}
